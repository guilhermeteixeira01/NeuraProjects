/*
 * Loja: o jogador gasta Neura Pontos (NP) para comprar e abrir caixas de skins. Sem dinheiro de verdade.
 *
 *   Saldo = pontos ganhos (ranking.json do site: 100 por vitória, 50 por derrota) - o que já gastou (Durable Object "Loja", um por jogador).
 *   Caixa fechada = item { t: 'caixa', d: <id da caixa> } no inventário de skins (skins:<id>); ao abrir sai da lista e entra a skin ganha.
 *
 * Por que um Durable Object: o KV não tem transação. O objeto do jogador roda um pedido de cada vez (fila `exclusivo`) e guarda em SQLite o
 * histórico de aberturas e os gastos; compra/abertura grava tudo junto e, se o inventário (KV) não gravar, desfaz. Assim não existe meio-termo
 * (descontou sem dar o item) nem clique duplo/compras simultâneas furando o saldo.
 * O resultado do sorteio sai SEMPRE daqui, antes da animação (o site só anima até o item já definido): src/loja-core.js (crypto.getRandomValues).
 * As insígnias das caixas saem do histórico (calcularStats) e são conferidas logo depois de cada compra/abertura; por serem calculadas do
 * histórico, o /admin/loja-retro refaz tudo para quem já tinha aberturas.
 *
 * KV MOLDURAS:  caixas (lista de caixas; vazia = caixas-iniciais.json), loja-config ({ taxas, desgaste, maxQtd } ou o padrão), loja-jogadores ([ids que já abriram])
 *
 *   GET  /loja/caixas            (público)  -> caixas ativas, sem a lista de itens (nome, imagem, preço)
 *   GET  /loja/drops             (público)  -> carrossel de drops ao vivo: { recentes, bons, top } (src/mercado.js)
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
import { avisarPerfil } from './amigos.js'
import { CONFIG_PADRAO, MODOS, definirValorador, aplicarModo, faixasDeDesgaste, precoDeMercado, valorDaFaca, valorDoItem, calcularStats, chancesDaCaixa, gerarFaixa, gerarFaixaFacas, ehInsigniaLoja, insigniasNovas, INSIGNIAS_LOJA, progressoInsignias, rndSeguro, sortearAbertura } from './loja-core.js'
import { lerSkinsKv, limparSkins, novoIdItem } from './skins.js'
import CAIXAS_INICIAIS from './caixas-iniciais.json'
import RARIDADE_SKIN from './skins-raridade.json'
import { docVazio, juntar } from './notif-core.js'
import { registrarDrops } from './mercado.js'
import FACAS_VALOR from './facas-valor.json'
import ENFEITES_VALOR from './valor-enfeites.json'
import PRECOS from './precos.json'
import { registrar } from './registro.js'

const ID_STEAM = /^\d{17}$/
const ITENS_MAX = 2000
const MAX_POR_VEZ = 3 // caixas por compra/abertura

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })
const num = (v, min, max, padrao) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}

// ── caixas e configuração (KV) ──
// Revisão 2: Kawaii e Terror só com adesivos; Lendas e Espacial só com amuletos (chaveiros)
// Revisão 3: preço das caixas = valor de mercado esperado do que sai nelas + margem (precos.json, scripts/gerar-precos.mjs); depois disso o dono ajusta à vontade
// Revisão 4: preços das caixas refeitos depois que as skins caras (facas, luvas, Dopplers, acima de US$ 2.000) passaram a ter o preço real do mercado
// Revisão 5: refeitos de novo com o preço do mercado de terceiros (CSFloat/Buff), o que os sites de caixa usam
// Revisão 6: caixas rebalanceadas (skin cara sai menos, temas pela cor das skins) e chances de raridade novas: TODAS as caixas de fábrica
//            recebem os itens e as facas novos, e as taxas salvas no painel voltam para o padrão (vermelho 2%, faca 0,5%)
const REVISAO_CAIXAS = 6 // (a caixa de luvas é nova: entra pela lista de fábrica, sem precisar de revisão)
const ATUALIZAR_CAIXAS = ['caixa-kawaii', 'caixa-terror', 'caixa-lendas', 'caixa-espacial']
export async function lerCaixas(env) {
  const salvas = await env.MOLDURAS.get('caixas', 'json').catch(() => null)
  if (!Array.isArray(salvas) || !salvas.length) return CAIXAS_INICIAIS
  // caixas de fábrica novas (incluídas depois que o dono já tinha salvo a lista): entram uma vez; as que ele apagar não voltam
  // revisão do conteúdo de fábrica: quando sobe, as caixas listadas recebem os itens novos (preço, nome e imagem que o dono mudou ficam)
  const revisao = Number(await env.MOLDURAS.get('caixas-revisao').catch(() => 0)) || 0
  if (revisao < REVISAO_CAIXAS) {
    for (const slug of ATUALIZAR_CAIXAS) {
      const nova = CAIXAS_INICIAIS.find((c) => c.slug === slug)
      const i = salvas.findIndex((c) => c.slug === slug)
      if (nova && i >= 0 && revisao < 2) salvas[i] = { ...salvas[i], itens: nova.itens, facas: nova.facas }
    }
    if (revisao < 6) {
      for (const [i, c] of salvas.entries()) {
        const nova = CAIXAS_INICIAIS.find((x) => x.slug === c.slug)
        if (nova) salvas[i] = { ...c, itens: nova.itens, facas: nova.facas }
      }
      const cfg = await env.MOLDURAS.get('loja-config', 'json').catch(() => null)
      if (cfg) await env.MOLDURAS.put('loja-config', JSON.stringify({ ...cfg, taxas: CONFIG_PADRAO.taxas })).catch(() => {})
    }
    for (const c of salvas) if (PRECOS.caixas?.[c.slug]) c.preco = PRECOS.caixas[c.slug]
    await env.MOLDURAS.put('caixas', JSON.stringify(salvas)).catch(() => {})
    await env.MOLDURAS.put('caixas-revisao', String(REVISAO_CAIXAS)).catch(() => {})
  }
  const vistas = (await env.MOLDURAS.get('caixas-vistas', 'json').catch(() => null)) || []
  const novas = CAIXAS_INICIAIS.filter((c) => !vistas.includes(c.slug) && !salvas.some((x) => x.slug === c.slug))
  if (!novas.length && vistas.length) return salvas
  let id = Math.max(0, ...salvas.map((c) => c.id))
  const lista = [...salvas, ...novas.map((c) => ({ ...c, id: ++id }))]
  await env.MOLDURAS.put('caixas', JSON.stringify(lista)).catch(() => {})
  await env.MOLDURAS.put('caixas-vistas', JSON.stringify(CAIXAS_INICIAIS.map((c) => c.slug))).catch(() => {})
  return lista
}
export async function lerConfigLoja(env) {
  const c = await env.MOLDURAS.get('loja-config', 'json').catch(() => null)
  return {
    taxas: Array.isArray(c?.taxas) && c.taxas.length === 6 ? c.taxas.map((t) => num(t, 0, 100, 0)) : CONFIG_PADRAO.taxas,
    desgaste: Array.isArray(c?.desgaste) && c.desgaste.length === 5 ? c.desgaste : CONFIG_PADRAO.desgaste,
    maxQtd: num(c?.maxQtd, 1, 10, CONFIG_PADRAO.maxQtd),
  }
}

export async function pontosGanhos(env, id) {
  const site = (env.SITE || 'https://neuraproject.com.br').replace(/\/$/, '')
  try {
    const r = await fetch(`${site}/ranking/ranking.json`, { cf: { cacheTtl: 60 } })
    const j = r.ok ? await r.json() : null
    return Math.max(0, Math.floor(j?.jogadores?.find((x) => x.steamId === id)?.pontos || 0))
  } catch {
    return 0
  }
}

const publicaDaCaixa = ({ itens, facas, ...resto }) => resto
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
  const facas = (Array.isArray(c.facas) ? c.facas : []).slice(0, 300).map(skin).filter((x) => x.d && x.p)
  return {
    id: Math.round(num(c.id, 1, 100000, n + 1)),
    slug,
    nome: String(c.nome || slug).slice(0, 40),
    img: /^\/assets\/caixas\/[A-Za-z0-9/_.-]{1,80}$/.test(c.img || '') ? c.img : `/assets/caixas/web/${slug}.webp`,
    preco: Math.round(num(c.preco, 1, 1000000, 500)),
    tier: ['barata', 'media', 'premium'].includes(c.tier) ? c.tier : 'media',
    ativa: c.ativa !== false,
    cor: /^#[0-9a-f]{6}$/i.test(c.cor || '') ? c.cor : '#8aa0c0',
    itens,
    facas,
  }
}

// ── Durable Object do jogador ──
// Valor de venda (NP) de adesivos (por acabamento: papel, glitter, holo, foil, gold, campeão) e de chaveiros (por raridade: azul, roxo, rosa, vermelho)
const VALOR_ADESIVO = [4, 8, 15, 40, 100, 250]
const VALOR_CHAVEIRO = [25, 70, 180, 450]

// Raridade (0..6) e valor de venda (NP) de um item do inventário; null se não pode vender (caixa, agente). O mercado usa como preço sugerido.
export function valorDe(it) {
  if (it.t === 'adesivo' && PRECOS.a[it.d]) return { r: Math.min(5, (ENFEITES_VALOR.a[it.d] ?? 0) + 1), v: Math.max(1, Math.round(PRECOS.a[it.d])) }
  if (it.t === 'chaveiro' && PRECOS.c[it.d]) return { r: ENFEITES_VALOR.c[it.d] ?? 2, v: Math.max(1, Math.round(PRECOS.c[it.d])) }
  if (it.t === 'adesivo') {
    const nivel = ENFEITES_VALOR.a[it.d] ?? 0 // papel 0 … gold/campeão 4-5
    return { r: Math.min(5, nivel + 1), v: VALOR_ADESIVO[nivel] }
  }
  if (it.t === 'chaveiro') {
    const r = ENFEITES_VALOR.c[it.d] ?? 2
    return { r, v: VALOR_CHAVEIRO[r - 2] ?? VALOR_CHAVEIRO[0] }
  }
  if (!['arma', 'faca', 'luva'].includes(it.t)) return null
  const mercado = precoDeMercado(it, PRECOS.skins) // preço de mercado em R$ (1 NP = R$ 1)
  if (it.t === 'faca') return { r: 6, v: mercado ?? valorDaFaca(it, FACAS_VALOR) } // facas: valor por modelo e acabamento (facas-valor.json)
  const r = it.t === 'arma' ? RARIDADE_SKIN[`${it.d}:${it.p}`] ?? 2 : 6
  return { r, v: mercado ?? valorDoItem(it, r) }
}

// Dificuldade pelo valor (loja-core.js: DIFICULDADE): as caixas sorteiam com o valor de mercado do item (no desgaste do meio da faixa dele)
definirValorador((x) => {
  if (x.t === 'adesivo' || x.t === 'chaveiro') return valorDe({ t: x.t, d: x.d })?.v ?? 0
  const f = Math.min(0.45, ((Number.isFinite(x.min) ? x.min : 0) + (Number.isFinite(x.max) ? x.max : 1)) / 2)
  return valorDe({ t: x.t, d: x.d, p: x.p, f, st: 0 })?.v ?? 0
})

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

export class Loja {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS aberturas (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, caixa TEXT, t TEXT, d INTEGER, p INTEGER, r INTEGER, f REAL, q INTEGER)')
    // depósitos com dinheiro (Asaas): um por cobrança; "estado" = pendente | pago | estornado. É daqui que sai a garantia de creditar uma vez só
    this.sql.exec('CREATE TABLE IF NOT EXISTS depositos (pid TEXT PRIMARY KEY, ts INTEGER, centavos INTEGER, np INTEGER, metodo TEXT, estado TEXT)')
    // depósitos também guardam assinaturas pagas: tipo ('deposito' | 'sub'), dados (JSON, ex.: { meses }) e entregue (a assinatura já foi dada?)
    for (const coluna of ["tipo TEXT DEFAULT 'deposito'", 'dados TEXT', 'entregue INTEGER DEFAULT 1']) {
      try {
        this.sql.exec(`ALTER TABLE depositos ADD COLUMN ${coluna}`)
      } catch {
        // a coluna já existe
      }
    }
    this.sql.exec('CREATE TABLE IF NOT EXISTS movimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, valor INTEGER, motivo TEXT)')
    this.fila = Promise.resolve()
  }

  // uma coisa de cada vez (compra, abertura, leitura)
  exclusivo(fn) {
    const r = this.fila.then(fn)
    this.fila = r.then(() => {}, () => {})
    return r
  }

  // Inventário de skins do jogador: a versão de verdade fica só aqui (o plugin do servidor e o perfil público também leem daqui).
  // O KV (skins:<id>) não é mais espelhado a cada mudança: o plano grátis só permite 1.000 gravações no KV por dia e o inventário muda o tempo todo.
  // Ele só é lido na primeira vez, para trazer o inventário de quem é anterior a este objeto. Quem está no meio de uma mudança (ver) é barrado se mexeram antes.
  async invLer(id) {
    let inv = (await this.ctx.storage.get('inv')) || null
    const ver = (await this.ctx.storage.get('invv')) || 0
    if (!inv) inv = await lerSkinsKv(this.env, id) // primeira vez: traz o que já estava no KV
    return { inv, ver }
  }
  async invGravar(id, inv) {
    const ver = ((await this.ctx.storage.get('invv')) || 0) + 1
    await this.ctx.storage.put({ inv, invv: ver })
    return ver
  }

  // últimas movimentações do saldo (delta > 0 = recebeu, < 0 = gastou)
  movimentos() {
    return this.sql.exec('SELECT ts, valor, motivo FROM movimentos ORDER BY id DESC LIMIT 8').toArray().map((m) => ({ ts: m.ts, delta: -m.valor, motivo: m.motivo }))
  }

  gastos() {
    return Number(this.sql.exec('SELECT COALESCE(SUM(valor),0) AS s FROM movimentos').one().s) || 0
  }
  linhas() {
    return this.sql.exec('SELECT ts, caixa, t, d, p, r, f, q FROM aberturas ORDER BY id').toArray()
  }

  async fetch(req) {
    const corpo = await req.json().catch(() => ({}))
    return this.exclusivo(async () => {
      try {
        const r = await this.acao(corpo)
        return json(r)
      } catch (e) {
        return json({ erro: e?.message && /^[a-z-]{2,30}$/.test(e.message) ? e.message : 'falhou' }, e?.message && /^[a-z-]{2,30}$/.test(e.message) ? 400 : 500)
      }
    })
  }

  // Bônus de NP para todos (KV "loja-bonus": [{ id, ts, valor, motivo }], POST /admin/loja-bonus): cada jogador recebe cada bônus uma vez, na próxima vez que mexe na loja
  async aplicarBonus(bonus) {
    if (!Array.isArray(bonus) || !bonus.length) return
    const visto = (await this.ctx.storage.get('bonusVisto')) || 0
    const novos = bonus.filter((b) => b.id > visto)
    if (!novos.length) return
    this.ctx.storage.transactionSync(() => {
      for (const b of novos) this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', b.ts, -Math.round(b.valor), `bônus: ${b.motivo || 'para todos'}`)
    })
    await this.ctx.storage.put('bonusVisto', Math.max(...novos.map((b) => b.id)))
  }

  async acao({ acao, id, caixas, cfg, pontos, bonus, ...p }) {
    if (['saldo', 'estado', 'comprar', 'abrir', 'creditar', 'definir', 'vender', 'mercado-comprar', 'dep-creditar'].includes(acao)) await this.aplicarBonus(bonus)
    switch (acao) {
      case 'inv-ler':
        return this.invLer(id)
      case 'inv-gravar': {
        const atual = await this.invLer(id)
        if (atual.ver !== p.ver) return { ok: false }
        await this.invGravar(id, limparSkins(p.inv))
        return { ok: true }
      }
      case 'notif-sync': { // junta o que o aparelho mandou com o que a conta já tem e devolve o resultado
        const atual = (await this.ctx.storage.get('notifs')) || docVazio()
        const novo = p.doc ? juntar(atual, p.doc) : atual
        if (p.doc) await this.ctx.storage.put('notifs', novo)
        return { doc: novo }
      }
      case 'valores':
        return this.valores(id)
      case 'vender':
        return this.vender(id, pontos, p)
      case 'mercado-comprar':
        return this.comprarDoMercado(id, pontos, p)
      case 'dep-pode': { // antes de criar uma cobrança: no máximo 5 por hora
        const n = Number(this.sql.exec("SELECT COUNT(*) AS n FROM depositos WHERE estado = 'pendente' AND ts > ?", Date.now() - 3600 * 1000).one().n)
        if (n >= 5) throw new Error('muitos-pagamentos')
        return { ok: true, cliente: (await this.ctx.storage.get(`asaasCliente:${p.amb || 'sandbox'}`)) || null } // um cliente por ambiente (o do sandbox não existe na produção)
      }
      case 'dep-cliente':
        await this.ctx.storage.put(`asaasCliente:${p.amb || 'sandbox'}`, String(p.cliente || ''))
        return { ok: true }
      case 'dep-registrar':
        this.sql.exec('INSERT OR IGNORE INTO depositos (pid, ts, centavos, np, metodo, estado, tipo, dados, entregue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', String(p.pid), Date.now(), Math.round(p.centavos), Math.round(p.np), String(p.metodo), 'pendente', p.tipo === 'sub' ? 'sub' : 'deposito', p.dados ? JSON.stringify(p.dados) : null, p.tipo === 'sub' ? 0 : 1)
        return { ok: true }
      case 'dep-ler': {
        const l = this.sql.exec('SELECT pid, ts, centavos, np, metodo, estado FROM depositos WHERE pid = ?', String(p.pid)).toArray()[0]
        return { deposito: l || null }
      }
      case 'dep-creditar': { // cobrança paga: credita os NP uma única vez (por mais que o aviso chegue várias vezes)
        const l = this.sql.exec('SELECT centavos, np, estado, tipo, dados, entregue FROM depositos WHERE pid = ?', String(p.pid)).toArray()[0]
        if (!l) throw new Error('desconhecido')
        if (l.centavos !== Math.round(p.centavos)) throw new Error('valor')
        if (l.tipo === 'sub') {
          // assinatura: não mexe nos NP; marca como paga e o worker entrega os meses (dep-entregue confirma)
          const dados = l.dados ? JSON.parse(l.dados) : {}
          if (l.estado === 'pendente') {
            this.sql.exec("UPDATE depositos SET estado = 'pago' WHERE pid = ?", String(p.pid))
            return { novo: true, tipo: 'sub', dados, entregue: 0, estado: 'pago' }
          }
          return { novo: false, tipo: 'sub', dados, entregue: l.estado === 'pago' ? l.entregue : 1, estado: l.estado }
        }
        if (l.estado !== 'pendente') return { novo: false, estado: l.estado, saldo: pontos - this.gastos() }
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE depositos SET estado = 'pago' WHERE pid = ?", String(p.pid))
          this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), -l.np, `depósito R$ ${(l.centavos / 100).toFixed(2).replace('.', ',')}`)
        })
        return { novo: true, np: l.np, estado: 'pago', saldo: pontos - this.gastos() }
      }
      case 'dep-entregue':
        this.sql.exec('UPDATE depositos SET entregue = 1 WHERE pid = ?', String(p.pid))
        return { ok: true }
      case 'dep-estornar': { // devolução/chargeback: tira os NP de volta (o saldo pode ficar negativo; aí não dá para comprar até regularizar)
        const l = this.sql.exec('SELECT np, estado, tipo, dados FROM depositos WHERE pid = ?', String(p.pid)).toArray()[0]
        if (!l || l.estado !== 'pago') return { novo: false }
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE depositos SET estado = 'estornado' WHERE pid = ?", String(p.pid))
          if (l.tipo !== 'sub') this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), l.np, 'depósito estornado')
        })
        return { novo: true, tipo: l.tipo, dados: l.dados ? JSON.parse(l.dados) : null }
      }
      case 'zerar': // src/zerar.js: o jogador volta para o começo (NP, aberturas, insígnias da loja e inventário)
        return this.zerar(p.bonusMax)
      case 'saldo':
        return { saldo: pontos - this.gastos(), ganhos: pontos, gastos: this.gastos(), movimentos: p.movimentos ? this.movimentos() : undefined }
      case 'estado':
        return this.estado(id, caixas, cfg, pontos)
      case 'comprar':
        return this.comprar(id, caixas, cfg, pontos, p)
      case 'abrir':
        return this.abrir(id, caixas, cfg, pontos, p)
      case 'historico':
        return { aberturas: this.sql.exec('SELECT ts, caixa, t, d, p, r, f FROM aberturas ORDER BY id DESC LIMIT 100').toArray() }
      case 'creditar': // valor > 0 dá NP, valor < 0 tira
        this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), -Math.round(num(p.valor, -1e7, 1e7, 0)), String(p.motivo || 'ajuste do dono').slice(0, 60))
        return { saldo: pontos - this.gastos() }
      case 'definir': { // deixa o saldo exatamente em "valor"
        const atual = pontos - this.gastos()
        const alvo = Math.round(num(p.valor, -1e7, 1e7, 0))
        if (alvo !== atual) this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), atual - alvo, String(p.motivo || 'saldo definido pelo dono').slice(0, 60))
        return { saldo: alvo }
      }
      default:
        throw new Error('acao')
    }
  }

  async fechadas(id) {
    const { inv } = await this.invLer(id)
    const por = {}
    for (const it of Object.values(inv?.itens || {})) if (it.t === 'caixa') por[it.d] = (por[it.d] || 0) + 1
    return por
  }

  // Insígnias que o histórico já cumpre e o jogador ainda não ganhou (idempotente: o objeto lembra o que já deu, com a data de quando deu, e nunca dá de novo).
  // Devolve { ids, ts }: a rota grava no perfil (rotaLoja → aplicarInsignias) e o site só mostra o aviso depois que a roleta termina.
  async conferirInsignias(id, caixas, fechadasPor) {
    const stats = calcularStats(this.linhas(), Object.values(fechadasPor).reduce((a, b) => a + b, 0))
    const progresso = progressoInsignias(stats, caixas)
    const ganhas = (await this.ctx.storage.get('ganhas')) || {}
    const novas = insigniasNovas(progresso, ganhas)
    if (!novas.length) return { ids: [], ts: {} }
    const agora = Date.now()
    const ts = Object.fromEntries(novas.map((n) => [n, agora]))
    await this.ctx.storage.put('ganhas', { ...ganhas, ...ts })
    return { ids: novas, ts }
  }

  async estado(id, caixas, cfg, pontos) {
    const fechadasPor = await this.fechadas(id)
    const linhas = this.linhas()
    const stats = calcularStats(linhas, Object.values(fechadasPor).reduce((a, b) => a + b, 0))
    // confere agora (cura insígnia que ficou sem gravar por falha antes) e devolve as ganhas; a rota grava no perfil o que faltar
    await this.conferirInsignias(id, caixas, fechadasPor)
    const ganhas = (await this.ctx.storage.get('ganhas')) || {}
    const ativas = caixas.filter((c) => c.ativa)
    return {
      ganhas,
      saldo: pontos - this.gastos(),
      pontos,
      cfg,
      caixas: ativas.map((c) => ({ ...c, chances: chancesDaCaixa(c, cfg) })),
      fechadas: fechadasPor,
      insignias: progressoInsignias(stats, caixas).map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, cor: i.cor, secreta: !!i.secreta, grupo: i.grupo || null, nivel: i.nivel || null, meta: i.meta, atual: i.atual, ganhou: ganhas[i.id] || 0 })),
      aberturas: linhas.length,
      recentes: this.sql.exec('SELECT ts, caixa, t, d, p, r, f FROM aberturas ORDER BY id DESC LIMIT 12').toArray(),
    }
  }

  // grava as linhas/movimentos e o inventário; se o inventário não gravar, desfaz o que entrou no SQL
  async gravarTudo(id, inv, sql) {
    const marca = { mov: Number(this.sql.exec('SELECT COALESCE(MAX(id),0) AS m FROM movimentos').one().m), ab: Number(this.sql.exec('SELECT COALESCE(MAX(id),0) AS m FROM aberturas').one().m) }
    this.ctx.storage.transactionSync(sql)
    try {
      await this.invGravar(id, inv)
    } catch {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM movimentos WHERE id > ?', marca.mov)
        this.sql.exec('DELETE FROM aberturas WHERE id > ?', marca.ab)
      })
      throw new Error('falhou')
    }
  }

  // no máximo 3 caixas por vez (as 3 roletas da página da caixa), mesmo que a configuração permita mais
  quantidade(p, cfg) {
    return Math.trunc(num(p.qtd, 1, Math.min(cfg.maxQtd, MAX_POR_VEZ), 1))
  }

  async comprar(id, caixas, cfg, pontos, p) {
    const caixa = caixas.find((c) => c.id === Number(p.caixa) && c.ativa)
    if (!caixa) throw new Error('caixa')
    const qtd = this.quantidade(p, cfg)
    const custo = caixa.preco * qtd
    if (pontos - this.gastos() < custo) throw new Error('saldo')
    const inv = (await this.invLer(id)).inv || limparSkins({})
    if (Object.keys(inv.itens).length + qtd > ITENS_MAX) throw new Error('cheio')
    const agora = Date.now()
    const ids = []
    for (let k = 0; k < qtd; k++) {
      const item = novoIdItem()
      inv.itens[item] = { t: 'caixa', d: caixa.id, p: 0 }
      inv.criado[item] = agora + k
      ids.push(item)
    }
    await this.gravarTudo(id, inv, () => this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', agora, custo, `compra ${qtd}x ${caixa.slug}`))
    const novas = await this.conferirInsignias(id, caixas, await this.fechadas(id))
    return { saldo: pontos - this.gastos(), ids, insignias: novas.ids, insigniasTs: novas.ts }
  }

  async valores(id) {
    const { inv } = await this.invLer(id)
    const m = {}
    for (const [k, it] of Object.entries(inv?.itens || {})) {
      const x = valorDe(it)
      if (x) m[k] = x
    }
    return { valores: m }
  }

  // Vende itens do inventário: tira os itens (e do equipamento) e credita o valor em NP, tudo junto (se o inventário não gravar, nada muda)
  async vender(id, pontos, p) {
    const ids = [...new Set(Array.isArray(p.ids) ? p.ids.map(String) : [])].slice(0, 100)
    if (!ids.length) throw new Error('item')
    const { inv } = await this.invLer(id)
    if (!inv) throw new Error('item')
    let total = 0
    for (const k of ids) {
      const it = inv.itens[k]
      const x = it && valorDe(it)
      if (!x) throw new Error('item')
      total += x.v
      delete inv.itens[k]
      delete inv.criado[k]
      for (const lado of ['ct', 'tr']) inv.equip[lado] = Object.fromEntries(Object.entries(inv.equip[lado]).filter(([, v]) => v !== k))
      inv.presentes = inv.presentes.filter((q) => q.i !== k)
    }
    const limpo = limparSkins(inv)
    await this.gravarTudo(id, limpo, () => this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), -total, `venda de ${ids.length} item(ns)`))
    return { saldo: pontos - this.gastos(), total, vendidos: ids.length, inv: limpo }
  }

  async zerar(bonusMax) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM movimentos')
      this.sql.exec('DELETE FROM aberturas')
    })
    await this.ctx.storage.delete('ganhas')
    const ver = ((await this.ctx.storage.get('invv')) || 0) + 1
    const visto = Math.max(Number(bonusMax) || 0, (await this.ctx.storage.get('bonusVisto')) || 0)
    await this.ctx.storage.put({ inv: limparSkins({}), invv: ver, bonusVisto: visto }) // inventário vazio (não volta a ler o KV antigo)
    return { ok: true }
  }

  // Compra de um anúncio do mercado (src/mercado.js chama no objeto de quem compra): desconta o preço e põe o item no inventário, tudo junto
  async comprarDoMercado(id, pontos, p) {
    const preco = Math.round(num(p.preco, 0, 1e7, 0))
    if (!preco || !p.item) throw new Error('anuncio')
    if (pontos - this.gastos() < preco) throw new Error('saldo')
    const inv = (await this.invLer(id)).inv || limparSkins({})
    if (Object.keys(inv.itens).length + 1 > ITENS_MAX) throw new Error('cheio')
    const novo = novoIdItem()
    inv.itens[novo] = JSON.parse(JSON.stringify(p.item))
    inv.criado[novo] = Date.now()
    const limpo = limparSkins(inv)
    if (!limpo.itens[novo]) throw new Error('anuncio')
    await this.gravarTudo(id, limpo, () => this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), preco, 'mercado: compra'))
    return { saldo: pontos - this.gastos(), id: novo }
  }

  async abrir(id, caixas, cfg, pontos, p) {
    let caixa = caixas.find((c) => c.id === Number(p.caixa) && c.ativa)
    if (!caixa) throw new Error('caixa')
    if (!caixa.itens.length) throw new Error('caixa')
    // Jester/Boost: chances do modo e o preço dele (calculado na rota); paga sempre na hora (não usa as caixas fechadas do inventário)
    if (p.modo) {
      if (!MODOS.includes(p.modo) || !(p.precoModo > 0)) throw new Error('caixa')
      const m = aplicarModo(caixa, cfg, p.modo)
      caixa = { ...m.caixa, preco: p.precoModo }
      cfg = m.cfg
      p = { ...p, origem: 'direto' }
    }
    const qtd = this.quantidade(p, cfg)
    const inv = (await this.invLer(id)).inv || limparSkins({})
    // origem: 'inventario' = só as que já tem; 'direto' = paga todas; 'auto' = usa primeiro as do inventário e paga só as que faltam ("Abrir outra")
    const minhas = Object.entries(inv.itens).filter(([, it]) => it.t === 'caixa' && it.d === caixa.id).map(([k]) => k)
    const usar = p.origem === 'inventario' ? qtd : p.origem === 'auto' ? Math.min(qtd, minhas.length) : 0
    if (p.origem === 'inventario' && minhas.length < qtd) throw new Error('sem-caixa')
    const pagar = qtd - usar
    const custo = caixa.preco * pagar
    if (custo && pontos - this.gastos() < custo) throw new Error('saldo')
    // as do inventário saem (as mais antigas primeiro)
    for (const k of minhas.slice(0, usar)) {
      delete inv.itens[k]
      delete inv.criado[k]
    }
    if (Object.keys(inv.itens).length + qtd > ITENS_MAX) throw new Error('cheio')
    const agora = Date.now()
    const resultados = []
    const linhas = []
    for (let k = 0; k < qtd; k++) {
      const ganhou = sortearAbertura(caixa, cfg, rndSeguro)
      const faixa = gerarFaixa(caixa, cfg, ganhou, rndSeguro)
      const item = novoIdItem()
      const { faixa: nomeFaixa, n: nomeItem, i: imgItem, ...base } = ganhou.item
      const enfeite = base.t === 'adesivo' || base.t === 'chaveiro' // amuletos e adesivos vão guardados no inventário (como os que o dono dá)
      inv.itens[item] = enfeite ? { t: base.t, d: base.d, p: 0 } : { ...base, st: 0, n: '', a: [null, null, null, null, null], k: null }
      inv.criado[item] = agora + k
      linhas.push([agora + k, caixa.slug, base.t, base.d, base.p, ganhou.raridade, base.f, faixa.quase ? 1 : 0])
      resultados.push({
        id: item,
        raridade: ganhou.raridade,
        indice: ganhou.indice,
        item: { ...base, desgaste: nomeFaixa, n: nomeItem, i: imgItem },
        faixa: faixa.itens,
        alvo: faixa.alvo,
        quase: faixa.quase,
        facas: ganhou.raridade === 5 ? gerarFaixaFacas(caixa, ganhou, rndSeguro) : null,
        v: valorDe(inv.itens[item])?.v ?? 0, // por quanto vende (botões "Vender por X" do resultado)
      })
    }
    const limpo = limparSkins(inv)
    await this.gravarTudo(id, limpo, () => {
      if (custo) this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', agora, custo, `abertura direta ${pagar}x ${caixa.slug}${p.modo ? ` (${p.modo})` : ''}`)
      for (const l of linhas) this.sql.exec('INSERT INTO aberturas (ts, caixa, t, d, p, r, f, q) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...l)
    })
    // lista de quem já abriu (para o /admin/loja-retro)
    const lista = (await this.env.MOLDURAS.get('loja-jogadores', 'json').catch(() => null)) || []
    if (!lista.includes(id)) await this.env.MOLDURAS.put('loja-jogadores', JSON.stringify([...lista, id].slice(-5000))).catch(() => {})
    const novas = await this.conferirInsignias(id, caixas, await this.fechadas(id))
    // quantas dessa caixa ainda sobram no inventário (a tela "Abrir outra" usa para contar o que já tem antes de cobrar)
    const restantes = Object.values(limpo.itens).filter((it) => it.t === 'caixa' && it.d === caixa.id).length
    return { saldo: pontos - this.gastos(), resultados, restantes, insignias: novas.ids, insigniasTs: novas.ts }
  }
}

const objeto = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))
const chamar = (env, id, corpo) => objeto(env, id).fetch('https://loja/', { method: 'POST', body: JSON.stringify({ id, ...corpo }) })

// ── rotas ──
export async function rotaLojaPublica(env, cors) {
  const caixas = (await lerCaixas(env)).filter((c) => c.ativa).map(publicaDaCaixa)
  return json(caixas, 200, { ...cors, 'Cache-Control': 'public, max-age=60' })
}

// Grava as insígnias no perfil (perfis[id].insignias) sem mexer em mais nada e sem repetir as que o perfil já tem (a data de quem já tinha fica).
// Roda na rota (mesma região do jogador): é de lá que ele grava o resto do perfil, então a leitura aqui não vem velha.
async function aplicarInsignias(env, porJogador) {
  const perfis = (await env.MOLDURAS.get('perfis', 'json').catch(() => null)) || {}
  const mudou = []
  for (const [id, ts] of Object.entries(porJogador)) {
    const tem = perfis[id]?.insignias || {}
    const novas = Object.fromEntries(Object.entries(ts).filter(([k]) => !tem[k]))
    if (!Object.keys(novas).length) continue
    perfis[id] = { ...perfis[id], insignias: { ...tem, ...novas } }
    mudou.push(id)
  }
  if (!mudou.length) return
  await env.MOLDURAS.put('perfis', JSON.stringify(perfis))
  for (const id of mudou) await avisarPerfil(env, id, perfis[id])
}

// GET/POST /notificacoes (login): notificações do sino guardadas na conta (valem em todos os aparelhos). POST { doc } junta e devolve { doc }.
export async function rotaNotificacoes(req, env, quem, cors) {
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const r = await chamar(env, quem.id, { acao: 'notif-sync', doc: req.method === 'POST' ? corpo.doc : null })
  return json(await r.json().catch(() => ({ erro: 'falhou' })), r.status, cors)
}

export async function rotaLoja(req, env, quem, cors, rota) {
  // Página de uma caixa (não precisa do objeto do jogador): desgastes com valor e chance, e os modos Jester/Boost
  if (rota === '/loja/caixa' && req.method === 'GET') {
    const [lista, config] = await Promise.all([lerCaixas(env), lerConfigLoja(env)])
    const c = lista.find((x) => x.id === Number(new URL(req.url).searchParams.get('id')) && x.ativa)
    return c ? json(detalhesDaCaixa(c, config), 200, cors) : json({ erro: 'caixa' }, 404, cors)
  }
  const [caixas, cfg, pontos] = await Promise.all([lerCaixas(env), lerConfigLoja(env), pontosGanhos(env, quem.id)])
  let corpo = {}
  let acao
  if (rota === '/loja' && req.method === 'GET') acao = 'estado'
  else if (rota === '/loja/saldo' && req.method === 'GET') acao = 'saldo'
  else if (rota === '/loja/valores' && req.method === 'GET') acao = 'valores'
  else if (rota === '/loja/vender' && req.method === 'POST') acao = 'vender'
  else if (rota === '/loja/historico' && req.method === 'GET') acao = 'historico'
  else if (rota === '/loja/comprar' && req.method === 'POST') acao = 'comprar'
  else if (rota === '/loja/abrir' && req.method === 'POST') acao = 'abrir'
  else return json({ erro: 'rota' }, 404, cors)
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}))
  const bonus = (await env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)) || []
  // modo Jester/Boost: o preço sai daqui (do servidor), nunca do site
  const modo = acao === 'abrir' && MODOS.includes(corpo.modo) ? corpo.modo : null
  const caixaModo = modo && caixas.find((c) => c.id === Number(corpo.caixa) && c.ativa)
  const precoModo = caixaModo ? detalhesDaCaixa(caixaModo, cfg).modos[modo].preco : undefined
  const r = await chamar(env, quem.id, { acao, caixas, cfg, pontos, bonus, caixa: corpo.caixa, qtd: corpo.qtd, ids: corpo.ids, origem: corpo.origem === 'inventario' || corpo.origem === 'auto' ? corpo.origem : 'direto', ...(modo ? { modo, precoModo } : {}) })
  const dados = await r.json().catch(() => ({ erro: 'falhou' }))
  if (acao === 'vender' && r.ok && dados.total > 0) await registrar(env, { tipo: 'venda', quem: quem.id, texto: `vendeu ${dados.vendidos} item(ns) para a loja por ${Number(dados.total).toLocaleString('pt-BR')} NP` })
  // o que saiu da caixa entra no carrossel de drops ao vivo do topo da loja (aparece depois que a roleta termina)
  if (acao === 'abrir' && r.ok && Array.isArray(dados.resultados)) await registrarDrops(env, quem, caixas.find((c) => c.id === Number(corpo.caixa)), dados.resultados)
  // insígnias novas + as que o perfil ainda não tem (cura sozinha: nada de botão "reconferir"); aplicarInsignias só grava se faltar algo
  const dar = { ...(dados.ganhas || {}), ...(dados.insigniasTs || {}) }
  if (Object.keys(dar).length) await aplicarInsignias(env, { [quem.id]: dar })
  delete dados.insigniasTs
  delete dados.ganhas
  return json(dados, r.status, cors)
}

export async function rotaAdminLoja(req, env, rota, cors) {
  const corpo = await req.json().catch(() => ({}))
  if (rota === '/admin/caixas') {
    const lista = (Array.isArray(corpo.caixas) ? corpo.caixas : []).slice(0, 60).map(limparCaixa).filter(Boolean)
    if (!lista.length || new Set(lista.map((c) => c.id)).size !== lista.length || new Set(lista.map((c) => c.slug)).size !== lista.length) return json({ erro: 'caixas' }, 400, cors)
    await env.MOLDURAS.put('caixas', JSON.stringify(lista))
    return json({ ok: true, n: lista.length }, 200, cors)
  }
  if (rota === '/admin/caixas-lista') return json(await lerCaixas(env), 200, cors)
  if (rota === '/admin/loja-config') {
    const atual = await lerConfigLoja(env)
    const taxas = Array.isArray(corpo.taxas) && corpo.taxas.length === 6 ? corpo.taxas.map((t) => num(t, 0, 100, 0)) : atual.taxas
    if (taxas.reduce((a, b) => a + b, 0) <= 0) return json({ erro: 'taxas' }, 400, cors)
    const desgaste = Array.isArray(corpo.desgaste) && corpo.desgaste.length === 5 ? corpo.desgaste.map((f, i) => ({ nome: atual.desgaste[i].nome, min: atual.desgaste[i].min, max: atual.desgaste[i].max, chance: num(f.chance, 0, 100, atual.desgaste[i].chance) })) : atual.desgaste
    const nova = { taxas, desgaste, maxQtd: Math.round(num(corpo.maxQtd, 1, 10, atual.maxQtd)) }
    await env.MOLDURAS.put('loja-config', JSON.stringify(nova))
    return json(nova, 200, cors)
  }
  // Pontos: uma rota só. alvo = 'todos' ou SteamID64; acao = 'adicionar' | 'remover' | 'definir' (definir só para um jogador)
  if (rota === '/admin/loja-pontos') {
    const valor = Math.round(num(corpo.valor, 0, 1e7, -1))
    if (valor < 0 || !['adicionar', 'remover', 'definir'].includes(corpo.acao)) return json({ erro: 'valor' }, 400, cors)
    const motivo = String(corpo.motivo || '').slice(0, 60)
    if (corpo.alvo === 'todos') {
      if (corpo.acao === 'definir' || !valor) return json({ erro: 'valor' }, 400, cors)
      const lista = (await env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)) || []
      const nova = { id: Math.max(0, ...lista.map((b) => b.id)) + 1, ts: Date.now(), valor: corpo.acao === 'remover' ? -valor : valor, motivo }
      await env.MOLDURAS.put('loja-bonus', JSON.stringify([...lista, nova].slice(-200)))
      return json({ ok: true, todos: true }, 200, cors)
    }
    if (!ID_STEAM.test(corpo.alvo || '')) return json({ erro: 'id' }, 400, cors)
    const pontos = await pontosGanhos(env, corpo.alvo)
    const bonus = (await env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)) || []
    const r = await chamar(env, corpo.alvo, { acao: corpo.acao === 'definir' ? 'definir' : 'creditar', pontos, bonus, valor: corpo.acao === 'remover' ? -valor : valor, motivo })
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
  }
  // Saldo de um jogador (o painel consulta de poucos em poucos segundos: "tempo real")
  if (rota === '/admin/loja-saldo') {
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!ID_STEAM.test(id)) return json({ erro: 'id' }, 400, cors)
    const pontos = await pontosGanhos(env, id)
    const bonus = (await env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)) || []
    const r = await chamar(env, id, { acao: 'saldo', pontos, bonus, movimentos: true })
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
  }
  return json({ erro: 'rota' }, 404, cors)
}

export { INSIGNIAS_LOJA, ehInsigniaLoja }
