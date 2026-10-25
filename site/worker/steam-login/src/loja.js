/*
 * Loja: o jogador gasta Neura Pontos (NP) para comprar e abrir caixas de skins.
 *
 *   Saldo = pontos ganhos (ranking.json do site: 100 por vitória, 50 por derrota) - o que já gastou (Durable Object "Loja", um por jogador).
 *   Caixa fechada = item { t: 'caixa', d: <id da caixa> } no inventário de skins; ao abrir sai da lista e entra a skin ganha.
 *
 * Por que um Durable Object por jogador: ele roda um pedido de cada vez (Fila) e guarda em SQLite o histórico de aberturas, os movimentos do
 * saldo e os depósitos; compra/abertura grava tudo junto e, se o inventário não gravar, desfaz. Sem meio-termo (descontou sem dar o item) e sem
 * clique duplo furando o saldo. O resultado do sorteio sai SEMPRE daqui, antes da animação (src/loja-core.js, crypto.getRandomValues).
 * O objeto busca sozinho o que precisa para o saldo e as caixas (ranking, bônus, assinatura, lista de caixas, configuração): quem chama só diz a ação.
 * As insígnias das caixas saem do histórico (acumulado em memória: só as aberturas novas entram na conta) e são conferidas a cada compra/abertura.
 *
 * Docs (objeto Dados): caixas (vazia = caixas-iniciais.json), loja-config ({ taxas, desgaste, maxQtd }), loja-bonus, loja-jogadores ([ids que já abriram])
 *
 *   GET  /loja/caixas            (público)  -> caixas ativas, sem a lista de itens (nome, imagem, preço)
 *   GET  /loja/drops             (público)  -> carrossel de drops ao vivo: { recentes, bons, top } (src/mercado.js)
 *   GET  /loja/perfil?id=        (público)  -> caixa favorita e melhor queda de um jogador
 *   GET  /loja/valores           (login)    -> { valores: { <id do item>: { r: raridade 0..6, v: valor de venda em NP } } }
 *   POST /loja/vender {ids}      (login)    -> vende itens (skin/faca/luva) por NP: { saldo, total, vendidos, inv }
 *   GET  /loja/saldo             (login)    -> { saldo } (menu da conta)
 *   GET  /loja                   (login)    -> saldo, caixas com itens e chances, caixas fechadas, insígnias e últimas aberturas
 *   POST /loja/comprar {caixa, qtd}         -> desconta e põe as caixas fechadas no inventário
 *   GET  /loja/caixa?id=         (login)    -> página da caixa: { itens, facas: [[{ nome, p, v }] por desgaste], modos: { jester|boost: { preco, chances } } }
 *   POST /loja/abrir {caixa, qtd, origem: 'direto'|'inventario'|'auto', modo?: 'jester'|'boost'}  -> sorteia (já grava o item no inventário) e devolve o necessário p/ animar
 *   GET  /loja/historico         (login)    -> últimas 100 aberturas
 *   POST /admin/caixas {caixas}  (dono)     -> troca a lista de caixas
 *   POST /admin/loja-config {taxas?, desgaste?, maxQtd?} (dono)
 *   POST /admin/loja-pontos {alvo: 'todos'|<SteamID64>, acao: 'adicionar'|'remover'|'definir', valor, motivo?} (dono)
 *   GET  /admin/loja-saldo?id= (dono)  -> { saldo, ganhos, gastos, movimentos } de um jogador
 */
import { avisarTodos } from './amigos.js'
import CAIXAS_INICIAIS from './caixas-iniciais.json'
import CAIXAS_REMOVIDAS from './caixas-removidas.json'
import CAIXAS_RETIRADAS_IDS from './caixas-retiradas-ids.json'
import { gravarDoc, lerColecao, lerDoc, lerItem, mudar, mudarDoc } from './dados.js'
import { removerCaixasAntigas } from './caixas-inventario.js'
import { listarKv } from './kv.js'
import { ErroConflito, ErroLimite, ErroNaoEncontrado, ErroPedido, ErroServico } from './erros.js'
import { migrarEsquema } from './esquema.js'
import { json, lerCorpo } from './http.js'
import { BONUS_PREMIUM_PARTIDA, CONFIG_PADRAO, MODOS, acumular, aplicarModo, chancesDaCaixa, ehEspecial, faixasDeDesgaste, gerarFaixa, gerarFaixaFacas, insigniasNovas, novoAcumulado, progressoInsignias, rndSeguro, sortearAbertura, sortearEspecial, statsDoAcumulado } from './loja-core.js'
import { registrarDrops } from './mercado.js'
import { docVazio, juntar } from './notif-core.js'
import { Fila, pedirAoJogador, responder } from './objetos.js'
import { darInsignias } from './perfis.js'
import { enderecoDoSite, pontosGanhos } from './ranking.js'
import { registrar } from './registro.js'
import { lerSkinsKv, limparSkins, novoIdItem, tirarItem } from './skins.js'
import { valorDe, valoresDe } from './valor.js'

const ID_STEAM = /^\d{17}$/
const ITENS_MAX = 2000
const MAX_POR_VEZ = 3 // caixas por compra/abertura (as 3 roletas da página da caixa)

const num = (v, min, max, padrao) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}

// ── Caixas e configuração ──
// Revisão das caixas de fábrica: quando sobe, as caixas salvas recebem o conteúdo novo de caixas-iniciais.json (o que o dono mudou fica):
//   2: Kawaii e Terror só com adesivos; Lendas e Espacial só com amuletos · 6: itens e facas novos em todas e taxas de volta ao padrão
//   8: antigas arquivadas · 10: tier especial com luvas · 11: primeiras 31 retiradas · 12: coleção nova e retirada definitiva sem reembolso
const REVISAO_CAIXAS = 12
const ATUALIZAR_CAIXAS = ['caixa-kawaii', 'caixa-terror', 'caixa-lendas', 'caixa-espacial']
const DOCS_CAIXAS = ['caixas', 'caixas-revisao', 'caixas-vistas', 'caixas-removidas', 'loja-config', 'loja-bonus']

export async function lerCaixas(env) {
  const [salvas, revisao, vistas] = await Promise.all([lerDoc(env, 'caixas'), lerDoc(env, 'caixas-revisao', 0), lerDoc(env, 'caixas-vistas', [])])
  if (!Array.isArray(salvas) || !salvas.length) {
    if (Number(revisao) >= REVISAO_CAIXAS) return CAIXAS_INICIAIS
    return atualizarCaixas(env)
  }
  const novas = CAIXAS_INICIAIS.some((c) => !vistas.includes(c.slug) && !salvas.some((x) => x.slug === c.slug))
  if (Number(revisao) >= REVISAO_CAIXAS && !novas && vistas.length) return salvas
  return atualizarCaixas(env)
}

// Aplica a revisão de fábrica e acrescenta as caixas de fábrica novas (uma vez; as que o dono apagar não voltam), tudo numa gravação só
async function atualizarCaixas(env) {
  const { mapa } = await mudar(env, 'docs', DOCS_CAIXAS, (d) => {
    const salvas = Array.isArray(d.caixas) ? d.caixas : []
    d.caixas = salvas
    const revisao = Number(d['caixas-revisao']) || 0
    const deFabrica = (slug) => CAIXAS_INICIAIS.find((c) => c.slug === slug)
    if (revisao < REVISAO_CAIXAS) {
      for (const [i, c] of salvas.entries()) {
        const nova = deFabrica(c.slug)
        if (!nova) continue
        if (revisao < 6 || (revisao < 2 && ATUALIZAR_CAIXAS.includes(c.slug))) salvas[i] = { ...c, itens: nova.itens, facas: nova.facas }
        else if (revisao < 10 && !nova.arquivada) salvas[i] = { ...c, facas: nova.facas } // só o tier especial
        if (revisao < 8 && nova.arquivada) salvas[i].arquivada = true
      }
      if (revisao < 6 && d['loja-config']) d['loja-config'] = { ...d['loja-config'], taxas: CONFIG_PADRAO.taxas }
      if (revisao < 12) {
        const fora = salvas.filter((c) => c.arquivada || CAIXAS_REMOVIDAS.includes(c.slug))
        d['caixas-removidas'] = [...new Set([...(d['caixas-removidas'] || []), ...fora.map((c) => c.id), ...(!salvas.length ? CAIXAS_RETIRADAS_IDS : [])])]
        d.caixas = salvas.filter((c) => !fora.includes(c))
        const removidas = new Set(d['caixas-removidas'].map(Number))
        if (Array.isArray(d['loja-bonus'])) d['loja-bonus'] = d['loja-bonus'].map((b) => b.caixa && removidas.has(Number(b.caixa)) ? { ...b, apagado: true, qtd: 0 } : b)
      }
      d['caixas-revisao'] = REVISAO_CAIXAS
    }
    const vistas = d['caixas-vistas'] || []
    // IDs retirados nunca são reutilizados, inclusive se o dono tinha caixas personalizadas.
    let id = Math.max(999, ...salvas.map((c) => c.id), ...(d['caixas-removidas'] || []).map(Number), ...CAIXAS_INICIAIS.map((c) => c.id))
    const novas = CAIXAS_INICIAIS.filter((c) => !vistas.includes(c.slug) && !d.caixas.some((x) => x.slug === c.slug)).map((c) => ({ ...c, id: ++id }))
    d.caixas = [...d.caixas, ...novas]
    d['caixas-vistas'] = CAIXAS_INICIAIS.map((c) => c.slug)
  })
  return mapa.caixas
}

export async function lerConfigLoja(env) {
  const c = await lerDoc(env, 'loja-config')
  return {
    taxas: Array.isArray(c?.taxas) && c.taxas.length === 6 ? c.taxas.map((t) => num(t, 0, 100, 0)) : CONFIG_PADRAO.taxas,
    desgaste: Array.isArray(c?.desgaste) && c.desgaste.length === 5 ? c.desgaste : CONFIG_PADRAO.desgaste,
    maxQtd: num(c?.maxQtd, 1, 10, CONFIG_PADRAO.maxQtd),
  }
}

// Varre também quem está offline. A conclusão é gravada e falhas são tentadas no próximo cron.
export async function limparInventariosCaixasAntigas(env) {
  if ((await lerDoc(env, 'caixas-limpeza-revisao', 0)) >= REVISAO_CAIXAS) return
  await lerCaixas(env)
  const [usuarios, perfis, jogadores, chaves] = await Promise.all([
    lerColecao(env, 'usuarios'), lerColecao(env, 'perfis'), lerDoc(env, 'loja-jogadores', []), listarKv(env, 'skins:'),
  ])
  const ids = [...new Set([...Object.keys(usuarios), ...Object.keys(perfis), ...jogadores, ...chaves.map((k) => k.slice(6))])].filter((id) => ID_STEAM.test(id))
  const fila = [...ids]
  const falhas = []
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let id = fila.shift(); id; id = fila.shift()) {
      try { await pedirAoJogador(env, id, { acao: 'inv-ler' }) }
      catch { falhas.push(id) }
    }
  }))
  await gravarDoc(env, 'caixas-limpeza-resultado', { revisao: REVISAO_CAIXAS, jogadores: ids.length, falhas, em: Date.now() })
  if (!falhas.length) await gravarDoc(env, 'caixas-limpeza-revisao', REVISAO_CAIXAS)
}

// A imagem da caixa vai com ?v=<revisão>: se o navegador guardou uma imagem quebrada ou antiga, ele busca de novo quando a revisão muda
const comVersao = (c) => (typeof c.img === 'string' && c.img.startsWith('/assets/caixas/') && !c.img.includes('?') ? { ...c, img: `${c.img}?v=${REVISAO_CAIXAS}` } : c)
const publicaDaCaixa = ({ itens, facas, ...resto }) => comVersao(resto)
// imagem do aviso de bônus de caixa (a da última caixa do lote): a salva no bônus ou, nos bônus antigos, a da caixa na lista atual
async function imagemBonus(env, lote) {
  const b = lote[lote.length - 1]
  return b.img || comVersao((await lerCaixas(env)).find((c) => c.id === Number(b.caixa)) || {}).img || ''
}
const pesoOk = (v) => Math.max(1, Math.round(num(v, 1, 100000, 100)))
function limparCaixa(c, n) {
  const slug = String(c?.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
  if (!slug) return null
  const skin = (x) => ({ d: Math.round(num(x?.d, 1, 100000, 0)), p: Math.round(num(x?.p, 1, 100000, 0)), w: pesoOk(x?.w), min: num(x?.min, 0, 1, 0), max: num(x?.max, 0, 1, 1), l: x?.l ? 1 : 0 })
  // itens: skin de arma (padrão), faca (t: 'faca'), adesivo ou chaveiro (t: 'adesivo'|'chaveiro', sem pintura; n = nome e i = imagem da Steam para mostrar)
  const item = (x) => {
    const t = ['faca', 'luva', 'adesivo', 'chaveiro'].includes(x?.t) ? x.t : undefined
    const base = { ...skin(x), r: Math.round(num(x?.r, 0, 4, 0)) }
    if (t === 'adesivo' || t === 'chaveiro') return { ...base, t, p: 0, n: String(x.n || '').slice(0, 80), i: /^[A-Za-z0-9_-]{1,400}$/.test(x.i || '') ? x.i : '' }
    return t ? { ...base, t } : base
  }
  const itens = (Array.isArray(c.itens) ? c.itens : []).slice(0, 300).map(item).filter((x) => x.d && (x.p || x.t === 'adesivo' || x.t === 'chaveiro'))
  // tier especial (card dourado): faca, ou luva quando vier com t: 'luva'
  const facas = (Array.isArray(c.facas) ? c.facas : []).slice(0, 300).map((x) => (x?.t === 'luva' ? { ...skin(x), t: 'luva' } : skin(x))).filter((x) => x.d && x.p)
  return {
    id: Math.round(num(c.id, 1, 100000, n + 1)),
    slug,
    nome: String(c.nome || slug).slice(0, 40),
    img: /^\/assets\/caixas\/[A-Za-z0-9/_.-]{1,80}$/.test(c.img || '') ? c.img : `/assets/caixas/web/${slug}.webp`,
    preco: Math.round(num(c.preco, 1, 1000000, 500)),
    tier: ['barata', 'media', 'premium'].includes(c.tier) ? c.tier : 'media',
    ativa: c.ativa !== false,
    ...(c.arquivada ? { arquivada: true } : {}), // fora da loja; só abre quem já tem uma fechada
    cor: /^#[0-9a-f]{6}$/i.test(c.cor || '') ? c.cor : '#8aa0c0',
    itens,
    facas,
  }
}

// Página de uma caixa: valor (NP) e chance de cada desgaste de cada item, e os modos Jester/Boost com preço e chances.
// O preço do modo = preço da caixa × (valor esperado no modo ÷ valor esperado normal): a margem que o dono escolheu continua a mesma.
export function detalhesDaCaixa(caixa, cfg) {
  const desgastes = (x, tipo) => {
    if (x.t === 'adesivo' || x.t === 'chaveiro') return [{ nome: null, p: 1, v: valorDe({ t: x.t, d: x.d })?.v ?? 0 }]
    return faixasDeDesgaste(cfg, x.min, x.max).map((fx) => ({ nome: fx.nome, p: fx.p, v: valorDe({ t: x.t || tipo, d: x.d, p: x.p, f: fx.f, st: 0 })?.v ?? 0 }))
  }
  const itens = caixa.itens.map((x) => desgastes(x, 'arma'))
  const facas = caixa.facas.map((x) => desgastes(x, 'faca'))
  const medio = (l) => l.reduce((a, x) => a + x.p * x.v, 0)
  const esperado = (cx, cf) => {
    const ch = chancesDaCaixa(cx, cf)
    return ch.itens.reduce((a, c, i) => a + (c / 100) * medio(itens[i]), 0) + ch.facas.reduce((a, c, i) => a + (c / 100) * medio(facas[i]), 0)
  }
  const base = esperado(caixa, cfg)
  const modos = {}
  for (const m of MODOS) {
    const x = aplicarModo(caixa, cfg, m)
    const bruto = base > 0 ? (caixa.preco * esperado(x.caixa, x.cfg)) / base : caixa.preco
    const passo = bruto < 100 ? 5 : bruto < 1000 ? 10 : 50
    modos[m] = { preco: Math.max(caixa.preco, Math.round(bruto / passo) * passo), chances: chancesDaCaixa(x.caixa, x.cfg) }
  }
  return { itens, facas, modos }
}

// Partidas jogadas com o Premium valendo (para o bônus de partida): o histórico do jogador publicado no site, só as que começaram dentro do
// período da assinatura. Sem assinatura: lista vazia. O horário das partidas é o do servidor (Brasília).
async function partidasPremium(env, id) {
  const sub = (await lerItem(env, 'perfis', id))?.sub
  if (!sub) return []
  const de = Number(sub.periodo || sub.inicio) || 0
  const ate = sub.expira == null ? Infinity : Number(sub.expira)
  let r
  try {
    r = await fetch(`${enderecoDoSite(env)}/perfil/historico/${id}.json`, { cf: { cacheTtl: 60 } })
  } catch (e) {
    throw new ErroServico('historico', undefined, { indisponivel: true, causa: e })
  }
  if (r.status === 404) return [] // jogador sem partidas publicadas
  if (!r.ok) throw new ErroServico('historico', { status: r.status }, { indisponivel: true })
  const h = await r.json()
  return (Array.isArray(h) ? h : [])
    .map((m) => ({ k: String(m.caminho || ''), ts: Date.parse(String(m.data || '').replace(' ', 'T') + '-03:00') }))
    .filter((m) => m.k && m.ts >= de && m.ts <= ate)
    .slice(0, 300)
}

// Ações que mexem no saldo ou mostram o saldo: antes delas entram os bônus para todos e o bônus Premium de partida
const COM_SALDO = new Set(['saldo', 'estado', 'comprar', 'abrir', 'creditar', 'definir', 'vender', 'mercado-comprar', 'dep-creditar', 'cobrar'])
const COM_CAIXAS = new Set(['estado', 'comprar', 'abrir'])
const novaNotif = (id, titulo, texto, link, extra = {}) => ({ id, titulo, texto, link, quando: Date.now(), lida: false, ...extra })

// ── Durable Object do jogador ──
export class Loja {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS aberturas (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, caixa TEXT, t TEXT, d INTEGER, p INTEGER, r INTEGER, f REAL, q INTEGER)')
    // depósitos com dinheiro (Asaas): um por cobrança; estado = pendente | pago | estornado. É daqui que sai a garantia de creditar uma vez só.
    // Também guardam assinaturas pagas: tipo ('deposito' | 'sub'), dados (JSON, ex.: { meses }) e entregue (a assinatura já foi dada?)
    this.sql.exec("CREATE TABLE IF NOT EXISTS depositos (pid TEXT PRIMARY KEY, ts INTEGER, centavos INTEGER, np INTEGER, metodo TEXT, estado TEXT, tipo TEXT DEFAULT 'deposito', dados TEXT, entregue INTEGER DEFAULT 1)")
    this.sql.exec('CREATE TABLE IF NOT EXISTS movimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, valor INTEGER, motivo TEXT)')
    // Totais mantidos na mesma transação de cada movimento/abertura (saldo e contador da abertura especial sem percorrer o histórico)
    this.sql.exec('CREATE TABLE IF NOT EXISTS resumo (chave TEXT PRIMARY KEY, valor INTEGER NOT NULL)')
    migrarEsquema(ctx, [
      // 1: colunas de assinatura em "depositos" (objetos criados antes delas)
      (sql) => {
        const colunas = new Set(sql.exec('PRAGMA table_info(depositos)').toArray().map((c) => c.name))
        for (const [nome, tipo] of [['tipo', "TEXT DEFAULT 'deposito'"], ['dados', 'TEXT'], ['entregue', 'INTEGER DEFAULT 1']]) if (!colunas.has(nome)) sql.exec(`ALTER TABLE depositos ADD COLUMN ${nome} ${tipo}`)
      },
      // 2: totais da tabela "resumo" a partir do histórico que já existia
      () => this.recalcularResumo(),
      // 3: aberturas de arma eram gravadas sem tipo (t NULL): a melhor queda do perfil não as via
      (sql) => sql.exec("UPDATE aberturas SET t = 'arma' WHERE t IS NULL"),
    ])
    this.fila = new Fila()
    this.acumulado = null // estatísticas das aberturas até o id "acumuladoAte" (memória: refeito do SQL quando o objeto acorda)
    this.acumuladoAte = 0
    this.melhor = null // melhor queda (maior valor) entre as aberturas acumuladas
  }

  recalcularResumo() {
    const gasto = this.sql.exec('SELECT COALESCE(SUM(valor), 0) AS s FROM movimentos').one().s
    const especial = this.sql.exec("SELECT COUNT(*) AS n FROM aberturas WHERE t NOT IN ('adesivo', 'chaveiro')").one().n
    this.sql.exec('INSERT OR REPLACE INTO resumo (chave, valor) VALUES (?, ?), (?, ?)', 'gasto', gasto, 'especial', especial)
    this.acumulado = null
    this.melhor = null
  }

  total(chave) {
    return this.sql.exec('SELECT valor FROM resumo WHERE chave = ?', chave).one().valor
  }
  gastos() {
    return this.total('gasto')
  }
  // aberturas que contam para a abertura especial: as que deram arma/faca/luva (caixa de adesivo/chaveiro só dá adesivo/chaveiro)
  abertasParaEspecial() {
    return this.total('especial')
  }

  // Movimento do saldo (valor > 0 = gastou, < 0 = recebeu). Chame dentro de transactionSync: o total muda junto com a linha
  movimentar(ts, valor, motivo) {
    this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', ts, valor, String(motivo).slice(0, 60))
    this.sql.exec("UPDATE resumo SET valor = valor + ? WHERE chave = 'gasto'", valor)
  }
  registrarAbertura(linha) {
    this.sql.exec('INSERT INTO aberturas (ts, caixa, t, d, p, r, f, q) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...linha)
    if (linha[2] !== 'adesivo' && linha[2] !== 'chaveiro') this.sql.exec("UPDATE resumo SET valor = valor + 1 WHERE chave = 'especial'")
  }

  // Estatísticas das aberturas e melhor queda: soma só as linhas novas ao acumulado da memória
  stats(fechadas = 0) {
    if (!this.acumulado) {
      this.acumulado = novoAcumulado()
      this.acumuladoAte = 0
      this.melhor = null
    }
    for (const l of this.sql.exec('SELECT id, ts, caixa, t, d, p, r, f, q FROM aberturas WHERE id > ? ORDER BY id', this.acumuladoAte)) {
      acumular(this.acumulado, l)
      this.acumuladoAte = l.id
      if (!['arma', 'faca', 'luva'].includes(l.t)) continue
      const v = valorDe({ t: l.t, d: l.d, p: l.p, f: l.f, st: 0 })?.v ?? 0
      if (!this.melhor || v > this.melhor.v) this.melhor = { t: l.t, d: l.d, p: l.p, f: l.f, r: l.r, v, caixa: l.caixa, ts: l.ts }
    }
    return statsDoAcumulado(this.acumulado, fechadas)
  }

  // Inventário de skins do jogador: a versão de verdade fica só aqui (o plugin do servidor e o perfil público também leem daqui).
  // Na primeira vez traz o que estava no KV (skins:<id>, formato antigo). "ver" barra quem está no meio de uma mudança se mexeram antes.
  async invLer(id) {
    await lerCaixas(this.env) // aplica a revisão antes de consultar os IDs removidos
    const [inv, ver] = await Promise.all([this.ctx.storage.get('inv'), this.ctx.storage.get('invv')])
    const atual = inv || (await lerSkinsKv(this.env, id))
    const removidas = await lerDoc(this.env, 'caixas-removidas', [])
    if (removerCaixasAntigas(atual, removidas)) return { inv: atual, ver: await this.invGravar(atual) }
    return { inv: atual, ver: ver || 0 }
  }
  async invGravar(inv) {
    removerCaixasAntigas(inv, await lerDoc(this.env, 'caixas-removidas', []))
    const ver = ((await this.ctx.storage.get('invv')) || 0) + 1
    await this.ctx.storage.put({ inv, invv: ver })
    return ver
  }
  async invOuVazio(id) {
    return (await this.invLer(id)).inv || limparSkins({})
  }
  async fechadas(id) {
    const inv = await this.invOuVazio(id)
    const por = {}
    for (const it of Object.values(inv.itens)) if (it.t === 'caixa') por[it.d] = (por[it.d] || 0) + 1
    return por
  }

  async notificar(n) {
    const atual = (await this.ctx.storage.get('notifs')) || docVazio()
    await this.ctx.storage.put('notifs', juntar(atual, { lista: [n], vistos: [n.id], limpoEm: 0 }))
  }

  // últimas movimentações do saldo (delta > 0 = recebeu, < 0 = gastou)
  movimentos() {
    return this.sql.exec('SELECT ts, valor, motivo FROM movimentos ORDER BY id DESC LIMIT 8').toArray().map((m) => ({ ts: m.ts, delta: -m.valor, motivo: m.motivo }))
  }

  fetch(req) {
    return responder(async () => {
      const corpo = await lerCorpo(req)
      if (!ID_STEAM.test(String(corpo.id))) throw new ErroPedido('id')
      return this.fila.rodar(() => this.acao(corpo))
    })
  }

  // Bônus para todos (doc "loja-bonus": [{ id, ts, valor, motivo }] de NP ou [{ id, ts, caixa, qtd, nome, img, motivo }] de caixa fechada):
  // cada jogador recebe cada bônus uma vez, na próxima vez que mexe na loja
  async aplicarBonus(id, bonus) {
    const visto = (await this.ctx.storage.get('bonusVisto')) || 0
    const novos = bonus.filter((b) => b.id > visto)
    if (!novos.length) return
    // bônus apagado pelo dono (apagado: true) ou zerado não entra: só o contador avança, para os próximos bônus funcionarem
    const valem = novos.filter((b) => !b.apagado && !b.caixa && Math.round(b.valor) !== 0)
    const removidas = new Set((await lerDoc(this.env, 'caixas-removidas', [])).map(Number))
    const caixasBonus = novos.filter((b) => !b.apagado && b.caixa && !removidas.has(Number(b.caixa)) && Math.round(b.qtd) > 0)
    this.ctx.storage.transactionSync(() => {
      for (const b of valem) this.movimentar(b.ts, -Math.round(b.valor), `bônus: ${b.motivo || 'para todos'}`)
    })
    // caixas fechadas entram no inventário (até o limite de itens); o contador só avança depois de gravar
    let recebidas = 0
    if (caixasBonus.length) {
      const inv = await this.invOuVazio(id)
      const agora = Date.now()
      for (const b of caixasBonus) {
        for (let k = 0; k < Math.round(b.qtd) && Object.keys(inv.itens).length < ITENS_MAX; k++) {
          const item = novoIdItem()
          inv.itens[item] = { t: 'caixa', d: Number(b.caixa), p: 0 }
          inv.criado[item] = agora + recebidas++
        }
      }
      if (recebidas) await this.invGravar(inv)
    }
    await this.ctx.storage.put('bonusVisto', Math.max(...novos.map((b) => b.id)))
    const motivos = (lote) => [...new Set(lote.map((b) => String(b.motivo || '').trim()).filter(Boolean))]
    if (recebidas) {
      const nomes = [...new Set(caixasBonus.map((b) => String(b.nome || '').trim()).filter(Boolean))]
      const qual = nomes.length === 1 ? `: ${nomes[0]}` : ''
      const m = motivos(caixasBonus)
      await this.notificar(novaNotif(`bonus-caixa:${Math.max(...caixasBonus.map((b) => b.id))}`, recebidas === 1 ? `Você recebeu 1 caixa${qual}` : `Você recebeu ${recebidas} caixas${qual}`, m.length ? `Motivo: ${m.join(' · ')}` : 'Bônus para todos os jogadores. Está no seu inventário.', '/inventario/', { imagem: await imagemBonus(this.env, caixasBonus) }))
    }
    // vários de uma vez (quem entra agora e recebe os bônus antigos) viram um aviso só, com os motivos
    if (valem.length) {
      const total = valem.reduce((a, b) => a + Math.round(b.valor), 0)
      const m = motivos(valem)
      await this.notificar(novaNotif(`bonus:${Math.max(...valem.map((b) => b.id))}`, total >= 0 ? `Você recebeu ${total.toLocaleString('pt-BR')} NP` : `Foram retirados ${Math.abs(total).toLocaleString('pt-BR')} NP da sua conta`, m.length ? `Motivo: ${m.join(' · ')}` : 'Bônus para todos os jogadores.', '/loja/'))
    }
  }

  // Premium: BONUS_PREMIUM_PARTIDA a mais por partida jogada com a assinatura valendo; cada partida só rende uma vez (premiumFeitas)
  async aplicarPremium(partidas) {
    if (!partidas.length) return
    const feitas = new Set((await this.ctx.storage.get('premiumFeitas')) || [])
    const novas = partidas.filter((m) => !feitas.has(m.k))
    if (!novas.length) return
    this.ctx.storage.transactionSync(() => {
      for (const m of novas) this.movimentar(Number(m.ts) || Date.now(), -BONUS_PREMIUM_PARTIDA, 'Premium: bônus de partida')
    })
    await this.ctx.storage.put('premiumFeitas', [...feitas, ...novas.map((m) => m.k)].slice(-1500))
    const total = novas.length * BONUS_PREMIUM_PARTIDA
    await this.notificar(novaNotif(`premium:${Date.now()}`, `Premium: +${total.toLocaleString('pt-BR')} NP`, novas.length === 1 ? 'Bônus Premium de 1 partida jogada.' : `Bônus Premium de ${novas.length} partidas jogadas.`, '/loja/'))
  }

  // O que o saldo precisa: pontos das partidas (ranking), bônus e Premium já aplicados. Devolve os pontos ganhos
  async prepararSaldo(id) {
    const [pontos, bonus, premium] = await Promise.all([pontosGanhos(this.env, id), lerDoc(this.env, 'loja-bonus', []), partidasPremium(this.env, id)])
    await this.aplicarBonus(id, bonus)
    await this.aplicarPremium(premium)
    return pontos
  }

  async acao(p) {
    const { acao, id } = p
    const [caixas, cfg] = COM_CAIXAS.has(acao) ? await Promise.all([lerCaixas(this.env), lerConfigLoja(this.env)]) : []
    const pontos = COM_SALDO.has(acao) ? await this.prepararSaldo(id) : 0
    const saldo = () => pontos - this.gastos()
    switch (acao) {
      case 'inv-ler':
        return this.invLer(id)
      case 'inv-gravar': {
        if ((await this.invLer(id)).ver !== p.ver) throw new ErroConflito('versao')
        await this.invGravar(limparSkins(p.inv))
        return { ok: true }
      }
      case 'notif-sync': { // junta o que o aparelho mandou com o que a conta já tem e devolve o resultado
        const atual = (await this.ctx.storage.get('notifs')) || docVazio()
        if (!p.doc) return { doc: atual }
        const novo = juntar(atual, p.doc)
        await this.ctx.storage.put('notifs', novo)
        return { doc: novo }
      }
      case 'perfil-publico':
        return this.perfilPublico()
      case 'valores':
        return { valores: valoresDe((await this.invOuVazio(id)).itens) }
      case 'vender':
        return this.vender(id, saldo, p)
      case 'mercado-comprar':
        return this.comprarDoMercado(id, saldo, p)
      case 'dep-pode':
      case 'dep-recorrencia':
      case 'dep-cliente':
      case 'dep-registrar':
      case 'dep-ler':
      case 'dep-creditar':
      case 'dep-entregue':
      case 'dep-estornar':
        return this.deposito(acao, saldo, p)
      case 'zerar':
        return this.zerar(p.bonusMax)
      case 'saldo':
        return { saldo: saldo(), ganhos: pontos, gastos: this.gastos(), movimentos: p.movimentos ? this.movimentos() : undefined }
      case 'estado':
        return this.estado(id, caixas, cfg, pontos)
      case 'comprar':
        return this.comprar(id, caixas, cfg, saldo, p)
      case 'abrir':
        return this.abrir(id, caixas, cfg, saldo, p)
      case 'historico':
        return { aberturas: this.sql.exec('SELECT ts, caixa, t, d, p, r, f FROM aberturas ORDER BY id DESC LIMIT 100').toArray() }
      case 'creditar': { // valor > 0 dá NP, valor < 0 tira
        const v = Math.round(num(p.valor, -1e7, 1e7, 0))
        this.ctx.storage.transactionSync(() => this.movimentar(Date.now(), -v, p.motivo || 'ajuste do dono'))
        // ajuste feito pelo dono no painel: avisa o jogador no sino, com o motivo (se tiver)
        if (p.aviso && v !== 0) await this.notificar(novaNotif(`ajuste:${Date.now()}`, v > 0 ? `Você recebeu ${v.toLocaleString('pt-BR')} NP` : `Foram retirados ${Math.abs(v).toLocaleString('pt-BR')} NP da sua conta`, p.motivo ? `Motivo: ${String(p.motivo).slice(0, 60)}` : 'Ajuste feito pela administração.', '/loja/'))
        return { saldo: saldo() }
      }
      case 'cobrar': { // gasta NP de verdade (ex.: criar um time): só se o saldo cobrir
        const v = Math.round(num(p.valor, 1, 1e7, 0))
        if (!v) throw new ErroPedido('valor')
        if (saldo() < v) throw new ErroConflito('saldo')
        this.ctx.storage.transactionSync(() => this.movimentar(Date.now(), v, p.motivo || 'compra'))
        return { saldo: saldo() }
      }
      case 'definir': { // deixa o saldo exatamente em "valor"
        const alvo = Math.round(num(p.valor, -1e7, 1e7, 0))
        const atual = saldo()
        if (alvo !== atual) this.ctx.storage.transactionSync(() => this.movimentar(Date.now(), atual - alvo, p.motivo || 'saldo definido pelo dono'))
        return { saldo: alvo }
      }
      default:
        throw new ErroPedido('acao')
    }
  }

  // Depósitos e assinaturas pagas (src/pagamentos.js). "amb" separa sandbox e produção (o cliente de um não existe no outro)
  async deposito(acao, saldo, p) {
    const amb = p.amb || 'sandbox'
    const pid = String(p.pid || '')
    const linha = (colunas) => this.sql.exec(`SELECT ${colunas} FROM depositos WHERE pid = ?`, pid).toArray()[0]
    switch (acao) {
      case 'dep-pode': { // antes de criar uma cobrança: no máximo 5 pendentes por hora
        if (this.sql.exec("SELECT COUNT(*) AS n FROM depositos WHERE estado = 'pendente' AND ts > ?", Date.now() - 3600 * 1000).one().n >= 5) throw new ErroLimite('muitos-pagamentos')
        return { ok: true, cliente: (await this.ctx.storage.get(`asaasCliente:${amb}`)) || null }
      }
      case 'dep-recorrencia': // id da assinatura recorrente do Asaas (set = gravar; '' apaga)
        if (p.set) await this.ctx.storage.put(`asaasAssinatura:${amb}`, String(p.set))
        else if (p.set === '') await this.ctx.storage.delete(`asaasAssinatura:${amb}`)
        return { id: (await this.ctx.storage.get(`asaasAssinatura:${amb}`)) || null }
      case 'dep-cliente':
        await this.ctx.storage.put(`asaasCliente:${amb}`, String(p.cliente || ''))
        return { ok: true }
      case 'dep-registrar':
        this.sql.exec('INSERT OR IGNORE INTO depositos (pid, ts, centavos, np, metodo, estado, tipo, dados, entregue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', pid, Date.now(), Math.round(p.centavos), Math.round(p.np), String(p.metodo), 'pendente', p.tipo === 'sub' ? 'sub' : 'deposito', p.dados ? JSON.stringify(p.dados) : null, p.tipo === 'sub' ? 0 : 1)
        return { ok: true }
      case 'dep-ler':
        return { deposito: linha('pid, ts, centavos, np, metodo, estado') || null }
      case 'dep-creditar': { // cobrança paga: credita os NP uma única vez (por mais que o aviso chegue várias vezes)
        const l = linha('centavos, np, estado, tipo, dados, entregue')
        if (!l) throw new ErroNaoEncontrado('desconhecido')
        if (l.centavos !== Math.round(p.centavos)) throw new ErroConflito('valor')
        if (l.tipo === 'sub') {
          // assinatura: não mexe nos NP; marca como paga e o worker entrega os meses (dep-entregue confirma)
          const dados = l.dados ? JSON.parse(l.dados) : {}
          if (l.estado !== 'pendente') return { novo: false, tipo: 'sub', dados, entregue: l.estado === 'pago' ? l.entregue : 1, estado: l.estado }
          this.sql.exec("UPDATE depositos SET estado = 'pago' WHERE pid = ?", pid)
          return { novo: true, tipo: 'sub', dados, entregue: 0, estado: 'pago' }
        }
        if (l.estado !== 'pendente') return { novo: false, estado: l.estado, saldo: saldo() }
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE depositos SET estado = 'pago' WHERE pid = ?", pid)
          this.movimentar(Date.now(), -l.np, `depósito R$ ${(l.centavos / 100).toFixed(2).replace('.', ',')}`)
        })
        return { novo: true, np: l.np, estado: 'pago', saldo: saldo() }
      }
      case 'dep-entregue':
        this.sql.exec('UPDATE depositos SET entregue = 1 WHERE pid = ?', pid)
        return { ok: true }
      case 'dep-estornar': { // devolução/chargeback: tira os NP de volta (o saldo pode ficar negativo; aí não dá para comprar até regularizar)
        const l = linha('np, estado, tipo, dados')
        if (!l || l.estado !== 'pago') return { novo: false }
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE depositos SET estado = 'estornado' WHERE pid = ?", pid)
          if (l.tipo !== 'sub') this.movimentar(Date.now(), l.np, 'depósito estornado')
        })
        return { novo: true, tipo: l.tipo, dados: l.dados ? JSON.parse(l.dados) : null }
      }
    }
  }

  // Resumo das aberturas para o perfil: as caixas mais abertas (a rota escolhe a primeira que ainda existe) e a melhor queda (maior valor)
  perfilPublico() {
    const { abertas } = this.stats()
    const ordem = this.sql.exec('SELECT caixa, COUNT(*) AS n FROM aberturas GROUP BY caixa ORDER BY n DESC LIMIT 60').toArray().map((x) => [x.caixa, x.n])
    return { abertas, ordem, melhor: this.melhor }
  }

  // Insígnias que o histórico já cumpre e o jogador ainda não ganhou (o objeto lembra o que já deu, com a data, e nunca dá de novo).
  // Devolve { ids, ts }: a rota grava no perfil e o site só mostra o aviso depois que a roleta termina.
  async conferirInsignias(caixas, fechadasPor) {
    const progresso = progressoInsignias(this.stats(Object.values(fechadasPor).reduce((a, b) => a + b, 0)), caixas)
    const ganhas = (await this.ctx.storage.get('ganhas')) || {}
    const novas = insigniasNovas(progresso, ganhas)
    if (!novas.length) return { ids: [], ts: {}, ganhas, progresso }
    const ts = Object.fromEntries(novas.map((n) => [n, Date.now()]))
    await this.ctx.storage.put('ganhas', { ...ganhas, ...ts })
    return { ids: novas, ts, ganhas: { ...ganhas, ...ts }, progresso }
  }

  async estado(id, caixas, cfg, pontos) {
    const fechadasPor = await this.fechadas(id)
    // confere agora (cura insígnia que ficou sem gravar por falha antes) e devolve as ganhas; a rota grava no perfil o que faltar
    const { ganhas, progresso } = await this.conferirInsignias(caixas, fechadasPor)
    // à venda: ativas e não arquivadas; as arquivadas aparecem (marcadas foraDeVenda) só para quem tem uma fechada, para poder abrir
    const ativas = caixas.filter((c) => c.ativa && (!c.arquivada || fechadasPor[c.id] > 0)).map((c) => (c.arquivada ? { ...c, foraDeVenda: true } : c))
    return {
      ganhas,
      saldo: pontos - this.gastos(),
      pontos,
      cfg,
      caixas: ativas.map((c) => ({ ...comVersao(c), chances: chancesDaCaixa(c, cfg) })),
      fechadas: fechadasPor,
      insignias: progresso.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, cor: i.cor, secreta: !!i.secreta, grupo: i.grupo || null, nivel: i.nivel || null, meta: i.meta, atual: i.atual, ganhou: ganhas[i.id] || 0 })),
      aberturas: this.acumulado.abertas,
      aberturasEspecial: this.abertasParaEspecial(),
      recentes: this.sql.exec('SELECT ts, caixa, t, d, p, r, f FROM aberturas ORDER BY id DESC LIMIT 12').toArray(),
    }
  }

  // Grava as linhas/movimentos (sql) e o inventário; se o inventário não gravar, desfaz o que entrou no SQL
  async gravarTudo(inv, sql) {
    const marca = { mov: this.sql.exec('SELECT COALESCE(MAX(id), 0) AS m FROM movimentos').one().m, ab: this.sql.exec('SELECT COALESCE(MAX(id), 0) AS m FROM aberturas').one().m }
    this.ctx.storage.transactionSync(sql)
    try {
      await this.invGravar(inv)
    } catch (e) {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM movimentos WHERE id > ?', marca.mov)
        this.sql.exec('DELETE FROM aberturas WHERE id > ?', marca.ab)
        this.recalcularResumo()
      })
      throw e
    }
  }

  quantidade(p, cfg) {
    return Math.trunc(num(p.qtd, 1, Math.min(cfg.maxQtd, MAX_POR_VEZ), 1))
  }

  async comprar(id, caixas, cfg, saldo, p) {
    const caixa = caixas.find((c) => c.id === Number(p.caixa) && c.ativa && !c.arquivada)
    if (!caixa) throw new ErroNaoEncontrado('caixa')
    const qtd = this.quantidade(p, cfg)
    const custo = caixa.preco * qtd
    if (saldo() < custo) throw new ErroConflito('saldo')
    const inv = await this.invOuVazio(id)
    if (Object.keys(inv.itens).length + qtd > ITENS_MAX) throw new ErroConflito('cheio')
    const agora = Date.now()
    const ids = []
    for (let k = 0; k < qtd; k++) {
      const item = novoIdItem()
      inv.itens[item] = { t: 'caixa', d: caixa.id, p: 0 }
      inv.criado[item] = agora + k
      ids.push(item)
    }
    await this.gravarTudo(inv, () => this.movimentar(agora, custo, `compra ${qtd}x ${caixa.slug}`))
    const novas = await this.conferirInsignias(caixas, await this.fechadas(id))
    return { saldo: saldo(), ids, insignias: novas.ids, insigniasTs: novas.ts }
  }

  // Vende itens do inventário: tira os itens (e do equipamento) e credita o valor em NP, tudo junto (se o inventário não gravar, nada muda)
  async vender(id, saldo, p) {
    const ids = [...new Set(Array.isArray(p.ids) ? p.ids.map(String) : [])].slice(0, 100)
    if (!ids.length) throw new ErroPedido('item')
    const inv = await this.invOuVazio(id)
    let total = 0
    for (const k of ids) {
      const x = inv.itens[k] && valorDe(inv.itens[k])
      if (!x) throw new ErroConflito('item')
      total += x.v
      tirarItem(inv, k)
    }
    const limpo = limparSkins(inv)
    await this.gravarTudo(limpo, () => this.movimentar(Date.now(), -total, `venda de ${ids.length} item(ns)`))
    return { saldo: saldo(), total, vendidos: ids.length, inv: limpo }
  }

  // src/zerar.js: o jogador volta para o começo (NP, aberturas, insígnias da loja e inventário; o KV antigo não é lido de novo)
  async zerar(bonusMax) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM movimentos')
      this.sql.exec('DELETE FROM aberturas')
      this.recalcularResumo()
    })
    await this.ctx.storage.delete('ganhas')
    const ver = ((await this.ctx.storage.get('invv')) || 0) + 1
    const visto = Math.max(Number(bonusMax) || 0, (await this.ctx.storage.get('bonusVisto')) || 0)
    await this.ctx.storage.put({ inv: limparSkins({}), invv: ver, bonusVisto: visto })
    return { ok: true }
  }

  // Compra de um anúncio do mercado (src/mercado.js chama no objeto de quem compra): desconta o preço e põe o item no inventário, tudo junto
  async comprarDoMercado(id, saldo, p) {
    const preco = Math.round(num(p.preco, 0, 1e7, 0))
    if (!preco || !p.item) throw new ErroPedido('anuncio')
    if (saldo() < preco) throw new ErroConflito('saldo')
    const inv = await this.invOuVazio(id)
    if (Object.keys(inv.itens).length + 1 > ITENS_MAX) throw new ErroConflito('cheio')
    const novo = novoIdItem()
    inv.itens[novo] = structuredClone(p.item)
    inv.criado[novo] = Date.now()
    const limpo = limparSkins(inv)
    if (!limpo.itens[novo]) throw new ErroPedido('anuncio')
    await this.gravarTudo(limpo, () => this.movimentar(Date.now(), preco, 'mercado: compra'))
    return { saldo: saldo(), id: novo }
  }

  async abrir(id, caixas, cfg, saldo, p) {
    let caixa = caixas.find((c) => c.id === Number(p.caixa) && c.ativa)
    if (!caixa?.itens.length) throw new ErroNaoEncontrado('caixa')
    let origem = ['inventario', 'auto'].includes(p.origem) ? p.origem : 'direto'
    // caixa arquivada (fora da loja): só abre a que já está no inventário, sem pagar e sem Jester/Boost
    if (caixa.arquivada) {
      if (p.modo) throw new ErroPedido('caixa')
      origem = 'inventario'
    }
    // Jester/Boost: chances e preço do modo (calculado aqui, nunca vindo do site); paga sempre na hora (não usa as caixas fechadas do inventário)
    if (p.modo) {
      if (!MODOS.includes(p.modo)) throw new ErroPedido('caixa')
      const preco = detalhesDaCaixa(caixa, cfg).modos[p.modo].preco
      const m = aplicarModo(caixa, cfg, p.modo)
      caixa = { ...m.caixa, preco }
      cfg = m.cfg
      origem = 'direto'
    }
    const qtd = this.quantidade(p, cfg)
    const inv = await this.invOuVazio(id)
    // origem: 'inventario' = só as que já tem; 'direto' = paga todas; 'auto' = usa primeiro as do inventário e paga só as que faltam ("Abrir outra")
    const minhas = Object.entries(inv.itens).filter(([, it]) => it.t === 'caixa' && it.d === caixa.id).map(([k]) => k)
    if (origem === 'inventario' && minhas.length < qtd) throw new ErroConflito('sem-caixa')
    const usar = origem === 'inventario' ? qtd : origem === 'auto' ? Math.min(qtd, minhas.length) : 0
    const pagar = qtd - usar
    const custo = caixa.preco * pagar
    if (custo && saldo() < custo) throw new ErroConflito('saldo')
    for (const k of minhas.slice(0, usar)) tirarItem(inv, k) // as do inventário saem (as mais antigas primeiro)
    if (Object.keys(inv.itens).length + qtd > ITENS_MAX) throw new ErroConflito('cheio')
    const agora = Date.now()
    const resultados = []
    const linhas = []
    // abertura especial (loja-core.js: ESPECIAL): a 100ª, 200ª... caixa aberta pelo jogador sai entre as skins mais caras da caixa.
    // Caixas só de adesivos/chaveiros não contam nem dão especial
    const soEnfeites = caixa.itens.every((it) => it.t === 'adesivo' || it.t === 'chaveiro')
    const jaAbertas = this.abertasParaEspecial()
    for (let k = 0; k < qtd; k++) {
      const especial = !soEnfeites && ehEspecial(jaAbertas + k + 1)
      const ganhou = especial ? sortearEspecial(caixa, cfg, rndSeguro) : sortearAbertura(caixa, cfg, rndSeguro)
      const faixa = gerarFaixa(caixa, cfg, ganhou, rndSeguro)
      const item = novoIdItem()
      const { faixa: nomeFaixa, n: nomeItem, i: imgItem, ...base } = ganhou.item
      const enfeite = base.t === 'adesivo' || base.t === 'chaveiro' // amuletos e adesivos vão guardados no inventário (como os que o dono dá)
      inv.itens[item] = enfeite ? { t: base.t, d: base.d, p: 0 } : { ...base, st: 0, n: '', a: [null, null, null, null, null], k: null }
      inv.criado[item] = agora + k
      linhas.push([agora + k, caixa.slug, base.t || 'arma', base.d, base.p, ganhou.raridade, base.f, faixa.quase ? 1 : 0])
      resultados.push({
        id: item,
        raridade: ganhou.raridade,
        indice: ganhou.indice,
        item: { ...base, desgaste: nomeFaixa, n: nomeItem, i: imgItem },
        faixa: faixa.itens,
        alvo: faixa.alvo,
        quase: faixa.quase,
        especial,
        facas: ganhou.raridade === 5 ? gerarFaixaFacas(caixa, ganhou, rndSeguro) : null,
        v: valorDe(inv.itens[item])?.v ?? 0, // por quanto vende (botões "Vender por X" do resultado)
      })
    }
    const limpo = limparSkins(inv)
    await this.gravarTudo(limpo, () => {
      if (custo) this.movimentar(agora, custo, `abertura direta ${pagar}x ${caixa.slug}${p.modo ? ` (${p.modo})` : ''}`)
      for (const l of linhas) this.registrarAbertura(l)
    })
    const novas = await this.conferirInsignias(caixas, await this.fechadas(id))
    // quantas dessa caixa ainda sobram no inventário (a tela "Abrir outra" usa para contar o que já tem antes de cobrar)
    const restantes = Object.values(limpo.itens).filter((it) => it.t === 'caixa' && it.d === caixa.id).length
    return { saldo: saldo(), resultados, restantes, aberturasEspecial: this.abertasParaEspecial(), insignias: novas.ids, insigniasTs: novas.ts }
  }
}

// ── Rotas ──
const idDaUrl = (url) => {
  const id = url.searchParams.get('id') || ''
  if (!ID_STEAM.test(id)) throw new ErroPedido('id')
  return id
}

// GET /loja/perfil?id= (público): caixa favorita (a mais aberta que ainda existe) e melhor queda do jogador, para o perfil dele
export async function rotaLojaPerfil(url, env, cors) {
  const [d, caixas] = await Promise.all([pedirAoJogador(env, idDaUrl(url), { acao: 'perfil-publico' }), lerCaixas(env)])
  const porSlug = new Map(caixas.map((c) => [c.slug, c]))
  const [slug, vezes] = d.ordem.find(([s]) => porSlug.has(s)) || []
  const c = slug && porSlug.get(slug)
  const favorita = c ? { ...publicaDaCaixa({ id: c.id, slug: c.slug, nome: c.nome, img: c.img, cor: c.cor, tier: c.tier, preco: c.preco, ativa: c.ativa, arquivada: c.arquivada }), vezes } : null
  return json({ abertas: d.abertas, favorita, melhor: d.melhor }, 200, { ...cors, 'Cache-Control': 'public, max-age=30' })
}

export async function rotaLojaPublica(env, cors, ctx) {
  const caixas = await lerCaixas(env)
  if (ctx) ctx.waitUntil(limparInventariosCaixasAntigas(env))
  return json(caixas.filter((c) => c.ativa).map(publicaDaCaixa), 200, { ...cors, 'Cache-Control': 'public, max-age=60' })
}

const ROTAS_LOJA = { 'GET /loja': 'estado', 'GET /loja/saldo': 'saldo', 'GET /loja/valores': 'valores', 'POST /loja/vender': 'vender', 'GET /loja/historico': 'historico', 'POST /loja/comprar': 'comprar', 'POST /loja/abrir': 'abrir' }

export async function rotaLoja(req, env, quem, cors, rota) {
  // Página de uma caixa (não precisa do objeto do jogador): desgastes com valor e chance, e os modos Jester/Boost
  if (rota === '/loja/caixa' && req.method === 'GET') {
    const [lista, config] = await Promise.all([lerCaixas(env), lerConfigLoja(env)])
    const c = lista.find((x) => x.id === Number(new URL(req.url).searchParams.get('id')) && x.ativa)
    if (!c) throw new ErroNaoEncontrado('caixa')
    return json(detalhesDaCaixa(c, config), 200, cors)
  }
  const acao = ROTAS_LOJA[`${req.method} ${rota}`]
  if (!acao) throw new ErroNaoEncontrado('rota')
  const corpo = req.method === 'POST' ? await lerCorpo(req) : {}
  const dados = await pedirAoJogador(env, quem.id, { acao, caixa: corpo.caixa, qtd: corpo.qtd, ids: corpo.ids, origem: corpo.origem, modo: MODOS.includes(corpo.modo) ? corpo.modo : undefined })
  if (acao === 'vender' && dados.total > 0) await registrar(env, { tipo: 'venda', quem: quem.id, texto: `vendeu ${dados.vendidos} item(ns) para a loja por ${Number(dados.total).toLocaleString('pt-BR')} NP` })
  if (acao === 'abrir') {
    // o que saiu da caixa entra no carrossel de drops ao vivo (aparece depois que a roleta termina) e quem abriu entra na lista do /admin/loja-retro
    await registrarDrops(env, quem, (await lerCaixas(env)).find((c) => c.id === Number(corpo.caixa)), dados.resultados)
    if (!(await lerDoc(env, 'loja-jogadores', [])).includes(quem.id)) await mudarDoc(env, 'loja-jogadores', (l) => (l.includes(quem.id) ? l : [...l, quem.id].slice(-5000)), [])
  }
  // insígnias novas + as que o perfil ainda não tem (cura sozinha); darInsignias só grava se faltar algo
  const { insigniasTs, ganhas, ...resposta } = dados
  const dar = { ...ganhas, ...insigniasTs }
  if (Object.keys(dar).length) await darInsignias(env, { [quem.id]: dar })
  return json(resposta, 200, cors)
}

// Bônus "para todos" (doc loja-bonus): cada um recebe um id novo (um contador só para NP e caixas: um id já visto nunca é reaproveitado)
const novoBonus = (env, bonus) => mudarDoc(env, 'loja-bonus', (lista) => [...lista, { id: Math.max(0, ...lista.map((b) => b.id)) + 1, ts: Date.now(), ...bonus }].slice(-200), [])

export async function rotaAdminLoja(req, env, rota, cors) {
  if (rota === '/admin/loja-saldo') return json(await pedirAoJogador(env, idDaUrl(new URL(req.url)), { acao: 'saldo', movimentos: true }), 200, cors)
  if (rota === '/admin/caixas-lista') return json(await lerCaixas(env), 200, cors)
  if (rota === '/admin/loja-bonus' && req.method === 'GET') {
    const lista = await lerDoc(env, 'loja-bonus', [])
    return json({ bonus: lista.filter((b) => !b.apagado && (b.caixa ? Math.round(b.qtd) > 0 : Math.round(b.valor) !== 0)).map((b) => ({ id: b.id, ts: b.ts, valor: b.valor, motivo: b.motivo || '', ...(b.caixa ? { caixa: b.caixa, qtd: b.qtd, nome: b.nome || '' } : {}) })) }, 200, cors)
  }
  const corpo = await lerCorpo(req)
  if (rota === '/admin/caixas') {
    const lista = (Array.isArray(corpo.caixas) ? corpo.caixas : []).slice(0, 150).map(limparCaixa).filter(Boolean)
    if (!lista.length || new Set(lista.map((c) => c.id)).size !== lista.length || new Set(lista.map((c) => c.slug)).size !== lista.length) throw new ErroPedido('caixas')
    await gravarDoc(env, 'caixas', lista)
    return json({ ok: true, n: lista.length }, 200, cors)
  }
  if (rota === '/admin/loja-config') {
    const atual = await lerConfigLoja(env)
    const taxas = Array.isArray(corpo.taxas) && corpo.taxas.length === 6 ? corpo.taxas.map((t) => num(t, 0, 100, 0)) : atual.taxas
    if (taxas.reduce((a, b) => a + b, 0) <= 0) throw new ErroPedido('taxas')
    const desgaste = Array.isArray(corpo.desgaste) && corpo.desgaste.length === 5 ? corpo.desgaste.map((f, i) => ({ nome: atual.desgaste[i].nome, min: atual.desgaste[i].min, max: atual.desgaste[i].max, chance: num(f.chance, 0, 100, atual.desgaste[i].chance) })) : atual.desgaste
    const nova = { taxas, desgaste, maxQtd: Math.round(num(corpo.maxQtd, 1, 10, atual.maxQtd)) }
    await gravarDoc(env, 'loja-config', nova)
    return json(nova, 200, cors)
  }
  // Pontos: alvo = 'todos' ou SteamID64; acao = 'adicionar' | 'remover' | 'definir' (definir só para um jogador)
  if (rota === '/admin/loja-pontos') {
    const valor = Math.round(num(corpo.valor, 0, 1e7, -1))
    if (valor < 0 || !['adicionar', 'remover', 'definir'].includes(corpo.acao)) throw new ErroPedido('valor')
    const motivo = String(corpo.motivo || '').slice(0, 60)
    const assinado = corpo.acao === 'remover' ? -valor : valor
    if (corpo.alvo === 'todos') {
      if (corpo.acao === 'definir' || !valor) throw new ErroPedido('valor')
      await novoBonus(env, { valor: assinado, motivo })
      await avisarTodos(env, { tipo: 'bonus' }) // quem está com o site aberto busca o saldo (recebe o bônus) e depois as notificações
      return json({ ok: true, todos: true }, 200, cors)
    }
    if (!ID_STEAM.test(corpo.alvo || '')) throw new ErroPedido('id')
    return json(await pedirAoJogador(env, corpo.alvo, { acao: corpo.acao === 'definir' ? 'definir' : 'creditar', valor: assinado, motivo, aviso: corpo.acao !== 'definir' }), 200, cors)
  }
  // Bônus de caixa fechada para todos: { caixa (id), qtd 1..ITENS_MAX, motivo }
  if (rota === '/admin/loja-bonus-caixa') {
    const caixa = (await lerCaixas(env)).find((c) => c.id === Number(corpo.caixa) && !c.arquivada)
    const qtd = Math.round(num(corpo.qtd, 1, ITENS_MAX, 0))
    if (!caixa) throw new ErroPedido('caixa')
    if (!qtd) throw new ErroPedido('valor')
    await novoBonus(env, { valor: 0, caixa: caixa.id, qtd, nome: String(caixa.nome || caixa.slug).slice(0, 60), img: comVersao(caixa).img || '', motivo: String(corpo.motivo || '').slice(0, 60) })
    await avisarTodos(env, { tipo: 'bonus' })
    return json({ ok: true, todos: true }, 200, cors)
  }
  // Apagar um bônus: ninguém mais recebe (quem já recebeu fica com os pontos); o id continua na lista marcado como apagado
  if (rota === '/admin/loja-bonus') {
    const id = Number(corpo.apagar)
    let achou = false
    await mudarDoc(
      env,
      'loja-bonus',
      (lista) =>
        lista.map((b) => {
          if (b.id !== id) return b
          achou = true
          return { ...b, apagado: true }
        }),
      [],
    )
    if (!achou) throw new ErroNaoEncontrado('bonus')
    return json({ ok: true }, 200, cors)
  }
  throw new ErroNaoEncontrado('rota')
}

