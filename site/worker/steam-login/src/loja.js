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
 *   GET  /loja/saldo             (login)    -> { saldo } (menu da conta)
 *   GET  /loja                   (login)    -> saldo, caixas com itens e chances, caixas fechadas, insígnias e últimas aberturas
 *   POST /loja/comprar {caixa, qtd}         -> desconta e põe as caixas fechadas no inventário
 *   POST /loja/abrir {caixa, qtd, origem: 'direto'|'inventario'}  -> sorteia (já grava o item no inventário) e devolve o necessário p/ animar
 *   GET  /loja/historico         (login)    -> últimas 100 aberturas
 *   POST /admin/caixas {caixas}  (dono)     -> troca a lista de caixas
 *   POST /admin/loja-config {taxas?, desgaste?, maxQtd?} (dono)
 *   POST /admin/loja-creditar {id, valor} (dono)  -> dá (ou tira, valor negativo) NP de um jogador
 *   POST /admin/loja-retro       (dono)     -> reconfere as insígnias de todos que já abriram caixa
 */
import { avisarPerfil } from './amigos.js'
import { CONFIG_PADRAO, calcularStats, chancesDaCaixa, gerarFaixa, gerarFaixaFacas, ehInsigniaLoja, insigniasNovas, INSIGNIAS_LOJA, progressoInsignias, rndSeguro, sortearAbertura } from './loja-core.js'
import { lerSkins, gravarSkins, limparSkins, novoIdItem } from './skins.js'
import CAIXAS_INICIAIS from './caixas-iniciais.json'

const ID_STEAM = /^\d{17}$/
const ITENS_MAX = 2000

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })
const num = (v, min, max, padrao) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}

// ── caixas e configuração (KV) ──
export async function lerCaixas(env) {
  const salvas = await env.MOLDURAS.get('caixas', 'json').catch(() => null)
  return Array.isArray(salvas) && salvas.length ? salvas : CAIXAS_INICIAIS
}
export async function lerConfigLoja(env) {
  const c = await env.MOLDURAS.get('loja-config', 'json').catch(() => null)
  return {
    taxas: Array.isArray(c?.taxas) && c.taxas.length === 6 ? c.taxas.map((t) => num(t, 0, 100, 0)) : CONFIG_PADRAO.taxas,
    desgaste: Array.isArray(c?.desgaste) && c.desgaste.length === 5 ? c.desgaste : CONFIG_PADRAO.desgaste,
    maxQtd: num(c?.maxQtd, 1, 10, CONFIG_PADRAO.maxQtd),
  }
}

async function pontosGanhos(env, id) {
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
  const itens = (Array.isArray(c.itens) ? c.itens : []).slice(0, 300).map((x) => ({ ...skin(x), r: Math.round(num(x?.r, 0, 4, 0)) })).filter((x) => x.d && x.p)
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
export class Loja {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS aberturas (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, caixa TEXT, t TEXT, d INTEGER, p INTEGER, r INTEGER, f REAL, q INTEGER)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS movimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, valor INTEGER, motivo TEXT)')
    this.fila = Promise.resolve()
  }

  // uma coisa de cada vez (compra, abertura, leitura)
  exclusivo(fn) {
    const r = this.fila.then(fn)
    this.fila = r.then(() => {}, () => {})
    return r
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

  async acao({ acao, id, caixas, cfg, pontos, ...p }) {
    switch (acao) {
      case 'saldo':
        return { saldo: pontos - this.gastos() }
      case 'estado':
        return this.estado(id, caixas, cfg, pontos)
      case 'comprar':
        return this.comprar(id, caixas, cfg, pontos, p)
      case 'abrir':
        return this.abrir(id, caixas, cfg, pontos, p)
      case 'historico':
        return { aberturas: this.sql.exec('SELECT ts, caixa, t, d, p, r, f FROM aberturas ORDER BY id DESC LIMIT 100').toArray() }
      case 'creditar':
        this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', Date.now(), -Math.round(num(p.valor, -1e7, 1e7, 0)), 'ajuste do dono')
        return { saldo: pontos - this.gastos() }
      case 'retro':
        return { novas: await this.conferirInsignias(id, caixas, await this.fechadas(id)) }
      default:
        throw new Error('acao')
    }
  }

  async fechadas(id) {
    const inv = await lerSkins(this.env, id)
    const por = {}
    for (const it of Object.values(inv?.itens || {})) if (it.t === 'caixa') por[it.d] = (por[it.d] || 0) + 1
    return por
  }

  // Dá as insígnias que o histórico já cumpre e o jogador ainda não tem (idempotente). Devolve os ids novos.
  async conferirInsignias(id, caixas, fechadasPor) {
    const stats = calcularStats(this.linhas(), Object.values(fechadasPor).reduce((a, b) => a + b, 0))
    const progresso = progressoInsignias(stats, caixas)
    const perfis = (await this.env.MOLDURAS.get('perfis', 'json').catch(() => null)) || {}
    const tem = perfis[id]?.insignias || {}
    const agora = Date.now()
    const novas = insigniasNovas(progresso, tem)
    if (!novas.length) return []
    perfis[id] = { ...perfis[id], insignias: { ...tem, ...Object.fromEntries(novas.map((n) => [n, agora])) } }
    await this.env.MOLDURAS.put('perfis', JSON.stringify(perfis))
    await avisarPerfil(this.env, id, perfis[id]) // o site só mostra o aviso depois da roleta terminar
    return novas
  }

  async estado(id, caixas, cfg, pontos) {
    const fechadasPor = await this.fechadas(id)
    const linhas = this.linhas()
    const stats = calcularStats(linhas, Object.values(fechadasPor).reduce((a, b) => a + b, 0))
    const perfis = (await this.env.MOLDURAS.get('perfis', 'json').catch(() => null)) || {}
    const ganhas = perfis[id]?.insignias || {}
    const ativas = caixas.filter((c) => c.ativa)
    return {
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
      await gravarSkins(this.env, id, inv)
    } catch {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM movimentos WHERE id > ?', marca.mov)
        this.sql.exec('DELETE FROM aberturas WHERE id > ?', marca.ab)
      })
      throw new Error('falhou')
    }
  }

  quantidade(p, cfg) {
    return Math.trunc(num(p.qtd, 1, cfg.maxQtd, 1))
  }

  async comprar(id, caixas, cfg, pontos, p) {
    const caixa = caixas.find((c) => c.id === Number(p.caixa) && c.ativa)
    if (!caixa) throw new Error('caixa')
    const qtd = this.quantidade(p, cfg)
    const custo = caixa.preco * qtd
    if (pontos - this.gastos() < custo) throw new Error('saldo')
    const inv = (await lerSkins(this.env, id)) || limparSkins({})
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
    return { saldo: pontos - this.gastos(), ids, insignias: novas }
  }

  async abrir(id, caixas, cfg, pontos, p) {
    const caixa = caixas.find((c) => c.id === Number(p.caixa) && c.ativa)
    if (!caixa) throw new Error('caixa')
    if (!caixa.itens.length) throw new Error('caixa')
    const qtd = this.quantidade(p, cfg)
    const inv = (await lerSkins(this.env, id)) || limparSkins({})
    const direto = p.origem !== 'inventario'
    const custo = direto ? caixa.preco * qtd : 0
    if (direto) {
      if (pontos - this.gastos() < custo) throw new Error('saldo')
    } else {
      // abre as que já tem no inventário (as mais antigas primeiro)
      const minhas = Object.entries(inv.itens).filter(([, it]) => it.t === 'caixa' && it.d === caixa.id).map(([k]) => k)
      if (minhas.length < qtd) throw new Error('sem-caixa')
      for (const k of minhas.slice(0, qtd)) {
        delete inv.itens[k]
        delete inv.criado[k]
      }
    }
    if (Object.keys(inv.itens).length + qtd > ITENS_MAX) throw new Error('cheio')
    const agora = Date.now()
    const resultados = []
    const linhas = []
    for (let k = 0; k < qtd; k++) {
      const ganhou = sortearAbertura(caixa, cfg, rndSeguro)
      const faixa = gerarFaixa(caixa, cfg, ganhou, rndSeguro)
      const item = novoIdItem()
      const { faixa: nomeFaixa, ...base } = ganhou.item
      inv.itens[item] = { ...base, st: 0, n: '', a: [null, null, null, null, null], k: null }
      inv.criado[item] = agora + k
      linhas.push([agora + k, caixa.slug, base.t, base.d, base.p, ganhou.raridade, base.f, faixa.quase ? 1 : 0])
      resultados.push({
        id: item,
        raridade: ganhou.raridade,
        indice: ganhou.indice,
        item: { ...base, desgaste: nomeFaixa },
        faixa: faixa.itens,
        alvo: faixa.alvo,
        quase: faixa.quase,
        facas: ganhou.raridade === 5 ? gerarFaixaFacas(caixa, ganhou, rndSeguro) : null,
      })
    }
    const limpo = limparSkins(inv)
    await this.gravarTudo(id, limpo, () => {
      if (custo) this.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (?, ?, ?)', agora, custo, `abertura direta ${qtd}x ${caixa.slug}`)
      for (const l of linhas) this.sql.exec('INSERT INTO aberturas (ts, caixa, t, d, p, r, f, q) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...l)
    })
    // lista de quem já abriu (para o /admin/loja-retro)
    const lista = (await this.env.MOLDURAS.get('loja-jogadores', 'json').catch(() => null)) || []
    if (!lista.includes(id)) await this.env.MOLDURAS.put('loja-jogadores', JSON.stringify([...lista, id].slice(-5000))).catch(() => {})
    const novas = await this.conferirInsignias(id, caixas, await this.fechadas(id))
    return { saldo: pontos - this.gastos(), resultados, insignias: novas }
  }
}

const objeto = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))
const chamar = (env, id, corpo) => objeto(env, id).fetch('https://loja/', { method: 'POST', body: JSON.stringify({ id, ...corpo }) })

// ── rotas ──
export async function rotaLojaPublica(env, cors) {
  const caixas = (await lerCaixas(env)).filter((c) => c.ativa).map(publicaDaCaixa)
  return json(caixas, 200, { ...cors, 'Cache-Control': 'public, max-age=60' })
}

export async function rotaLoja(req, env, quem, cors, rota) {
  const [caixas, cfg, pontos] = await Promise.all([lerCaixas(env), lerConfigLoja(env), pontosGanhos(env, quem.id)])
  let corpo = {}
  let acao
  if (rota === '/loja' && req.method === 'GET') acao = 'estado'
  else if (rota === '/loja/saldo' && req.method === 'GET') acao = 'saldo'
  else if (rota === '/loja/historico' && req.method === 'GET') acao = 'historico'
  else if (rota === '/loja/comprar' && req.method === 'POST') acao = 'comprar'
  else if (rota === '/loja/abrir' && req.method === 'POST') acao = 'abrir'
  else return json({ erro: 'rota' }, 404, cors)
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}))
  const r = await chamar(env, quem.id, { acao, caixas, cfg, pontos, caixa: corpo.caixa, qtd: corpo.qtd, origem: corpo.origem })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
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
  if (rota === '/admin/loja-creditar') {
    if (!ID_STEAM.test(corpo.id || '')) return json({ erro: 'id' }, 400, cors)
    const pontos = await pontosGanhos(env, corpo.id)
    const r = await chamar(env, corpo.id, { acao: 'creditar', pontos, valor: corpo.valor })
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
  }
  if (rota === '/admin/loja-retro') {
    const [caixas, ids] = await Promise.all([lerCaixas(env), env.MOLDURAS.get('loja-jogadores', 'json').then((l) => l || [])])
    const feito = {}
    for (const id of ids) {
      const r = await (await chamar(env, id, { acao: 'retro', caixas })).json().catch(() => null)
      if (r?.novas?.length) feito[id] = r.novas
    }
    return json({ jogadores: ids.length, novas: feito }, 200, cors)
  }
  return json({ erro: 'rota' }, 404, cors)
}

export { INSIGNIAS_LOJA, ehInsigniaLoja }
