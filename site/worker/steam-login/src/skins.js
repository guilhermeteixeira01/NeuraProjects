/*
 * Skins: inventário do jogador no site (como o inventário do jogo) e o que ele equipa em cada time.
 * O plugin BaseComp lê o inventário já "resolvido" em /servidor/skins e aplica no servidor de CS2.
 *
 * KV MOLDURAS, uma chave por jogador:  skins:<SteamID64>
 *   { v: 2,
 *     itens: { "<id>": { t: 'arma'|'faca'|'luva'|'agente', d: defIndex, p: paint (0 = sem pintura: faca lisa, agente), f: desgaste 0..1,
 *                        s: seed 0..1000, st: 0|1 (StatTrak), n: nome (name tag), l: 0|1 (modelo antigo), m: modelo do agente,
 *                        a: [ { i: adesivo (id do jogo), s: posição-modelo na arma (schema), x, y: deslocamento (só se mexeu), r: rotação, w: desgaste } | null x5 ],
 *                        k: { i: chaveiro (id do jogo), s: seed, x, y, z: posição (só se mexeu) } | null } },
 *     equip: { ct|tr: { "<defIndex da arma>" | "faca" | "luva" | "agente": "<id do item>" } },
 *     criado: { "<id>": ms } }   (ordem de criação, para ordenar)
 *
 *     presentes: [ { i: id do item, q: quando recebeu (ms), v: 1 se já viu o aviso } ]   (skins que o dono deu; o jogador não cria itens)
 *
 *   Quem cria e quem tira itens é só o DONO (POST /admin/skin). O jogador só personaliza e equipa o que recebeu (não exclui):
 *   tipo, arma e skin de cada item não mudam; item novo mandado pelo jogador é ignorado. Agentes não são aplicados no servidor.
 *
 *   GET  /skins            (login)  -> o inventário do próprio jogador
 *   POST /skins            (login)  -> salva a personalização e o que está equipado
 *   POST /skins/presentes  (login)  -> { vistos: [id do item] } marca os avisos de skin nova como vistos
 *   POST /admin/skin       (dono)   -> { id, item } dá uma skin; { id, remover } tira uma
 *   GET  /admin/skins?id=  (dono)   -> itens de um jogador
 *   POST /servidor/skins   (token do servidor) { ids: ["<SteamID64>", ...] } -> { "<SteamID64>": equipado } só de quem tem algo equipado:
 *       { armas: { ct|tr: { "<defIndex>": { p, f, s, st, n, l, a: [{i,x,y,r,w}] } } },
 *         facas: { ct|tr: { d, p, f, s, st, n, l } }, luvas: { ct|tr: { d, p, f, s, l } }, agentes: { ct|tr: { d, m } } }
 *   Inventário no formato antigo (v1: armas/facas/luvas/agentes soltos) é convertido ao ler.
 */

const ID_STEAM = /^\d{17}$/
const FACAS = new Set([500, 503, 505, 506, 507, 508, 509, 512, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 525, 526]) // defIndex das facas do jogo
const LUVAS = new Set([4725, 5027, 5030, 5031, 5032, 5033, 5034, 5035])
const ITENS_MAX = 400
const ID_MAX = 100000 // paint kit / adesivo / agente: limite folgado só para barrar lixo
const ID_ITEM = /^[a-z0-9]{4,16}$/
const MODELO_AGENTE = /^agents\/models\/[a-z0-9_/]{1,120}\.vmdl$/
const NOME_ITEM = /[\u0000-\u001f<>]/g
const LADOS = ['ct', 'tr']
// Armas que só existem em um time no jogo (defIndex): o resto vale para os dois. Igual ao que o jogo vende/permite no CT e no TR.
const SO_CT = new Set([3, 8, 10, 16, 27, 32, 34, 38, 60, 61]) // Five-SeveN, AUG, FAMAS, M4A4, MAG-7, P2000, MP9, SCAR-20, M4A1-S, USP-S
const SO_TR = new Set([4, 7, 11, 13, 17, 29, 30, 39]) // Glock-18, AK-47, G3SG1, Galil AR, MAC-10, Sawed-Off, Tec-9, SG 553
const timesDoItem = (it) => {
  if (it.t === 'arma') return SO_CT.has(it.d) ? ['ct'] : SO_TR.has(it.d) ? ['tr'] : LADOS
  if (it.t === 'agente') return /\/ctm_/.test(it.m) ? ['ct'] : /\/tm_/.test(it.m) ? ['tr'] : LADOS // agents/models/ctm_... = CT, tm_... = TR
  return LADOS
}

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const inteiro = (v, min, max, padrao = 0) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao
}
const real = (v, min, max, padrao = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n)) * 10000) / 10000 : padrao
}
const desgaste = (v) => real(v, 0, 1, 0.0001)

const vazio = () => ({ v: 2, itens: {}, equip: { ct: {}, tr: {} }, criado: {}, presentes: [] })

// Formato antigo (um item por arma, igual nos dois times) -> inventário novo
function converterV1(e) {
  const novo = vazio()
  let n = 0
  const criar = (item, equipar) => {
    const id = `m${(n++).toString(36).padStart(3, '0')}`
    novo.itens[id] = item
    novo.criado[id] = n
    for (const lado of equipar) novo.equip[lado][item.t === 'arma' ? String(item.d) : item.t] = id
  }
  for (const [def, a] of Object.entries(e.armas || {}))
    criar({ t: 'arma', d: Number(def), p: a.p, f: a.f, s: a.s, st: a.st, l: a.l, a: (a.a || []).map((i) => (i ? { i, x: 0, y: 0, r: 0, w: 0 } : null)) }, LADOS)
  for (const lado of LADOS) {
    if (e.facas?.[lado]) criar({ t: 'faca', ...e.facas[lado] }, [lado])
    if (e.luvas?.[lado]) criar({ t: 'luva', ...e.luvas[lado] }, [lado])
    if (e.agentes?.[lado]) criar({ t: 'agente', d: e.agentes[lado].d, p: 0, m: e.agentes[lado].m }, [lado])
  }
  return novo
}

const opcional = (v, min, max) => (v === null || v === undefined ? undefined : real(v, min, max))

function limparChaveiro(k) {
  if (!k || !inteiro(k.i, 1, ID_MAX)) return null
  const r = { i: inteiro(k.i, 1, ID_MAX), s: inteiro(k.s, 0, 100000) }
  for (const eixo of ['x', 'y', 'z']) if (opcional(k[eixo], -60, 60) !== undefined) r[eixo] = opcional(k[eixo], -60, 60)
  return r
}

function limparAdesivos(lista) {
  const a = Array.isArray(lista) ? lista.slice(0, 5) : []
  while (a.length < 5) a.push(null)
  return a.map((s) => {
    const id = typeof s === 'number' ? s : s?.i
    if (!inteiro(id, 1, ID_MAX)) return null
    const r = { i: inteiro(id, 1, ID_MAX), s: inteiro(s?.s, 0, 9), r: real(s?.r, 0, 360), w: real(s?.w, 0, 1) }
    for (const eixo of ['x', 'y']) if (opcional(s?.[eixo], -6, 6) !== undefined) r[eixo] = opcional(s[eixo], -6, 6)
    return r
  })
}

// Deixa só o que o plugin entende, com os números dentro dos limites
export function limparSkins(entrada) {
  let e = entrada && typeof entrada === 'object' ? entrada : {}
  if (e.v !== 2 && (e.armas || e.facas || e.luvas || e.agentes)) e = converterV1(e)
  const saida = vazio()

  for (const [id, it] of Object.entries(e.itens && typeof e.itens === 'object' ? e.itens : {}).slice(0, ITENS_MAX)) {
    if (!ID_ITEM.test(id) || !it || typeof it !== 'object') continue
    const d = inteiro(it.d, 1, ID_MAX)
    if (!d) continue
    const base = { t: it.t, d, p: inteiro(it.p, 0, ID_MAX), f: desgaste(it.f), s: inteiro(it.s, 0, 1000), st: it.st ? 1 : 0, l: it.l ? 1 : 0 }
    const nome = typeof it.n === 'string' ? it.n.replace(NOME_ITEM, '').trim().slice(0, 20) : ''
    if (it.t === 'arma') {
      if (!base.p) continue // arma sem skin não precisa existir
      saida.itens[id] = { ...base, n: nome, a: limparAdesivos(it.a), k: limparChaveiro(it.k) }
    } else if (it.t === 'faca') {
      if (!FACAS.has(d)) continue
      saida.itens[id] = { ...base, n: nome }
    } else if (it.t === 'luva') {
      if (!LUVAS.has(d) || !base.p) continue
      saida.itens[id] = base
    } else if (it.t === 'agente') {
      if (!MODELO_AGENTE.test(String(it.m))) continue
      saida.itens[id] = { t: 'agente', d, p: 0, m: String(it.m) }
    } else continue
    saida.criado[id] = inteiro(e.criado?.[id], 0, 9007199254740991)
  }

  for (const lado of LADOS) {
    for (const [chave, id] of Object.entries(e.equip?.[lado] && typeof e.equip[lado] === 'object' ? e.equip[lado] : {})) {
      const it = saida.itens[id]
      if (!it || !timesDoItem(it).includes(lado)) continue // item que não existe nesse time (AK no CT, M4 no TR...) não fica equipado
      // a chave diz onde o item entra: a arma pelo defIndex, o resto pelo tipo
      const certa = it.t === 'arma' ? String(it.d) : it.t
      if (chave === certa) saida.equip[lado][chave] = id
    }
  }
  saida.presentes = (Array.isArray(e.presentes) ? e.presentes : [])
    .filter((p) => p && ID_ITEM.test(String(p.i)) && saida.itens[p.i])
    .map((p) => ({ i: String(p.i), q: inteiro(p.q, 0, 9007199254740991), v: p.v ? 1 : 0 }))
    .slice(-50)
  return saida
}

// O que o plugin precisa: só o que está equipado, por time
export function resolverEquipado(inv) {
  const r = { armas: { ct: {}, tr: {} }, facas: {}, luvas: {}, agentes: {} }
  let algo = false
  for (const lado of LADOS) {
    for (const [chave, id] of Object.entries(inv.equip?.[lado] || {})) {
      const it = inv.itens?.[id]
      if (!it) continue
      algo = true
      if (it.t === 'arma') r.armas[lado][chave] = { p: it.p, f: it.f, s: it.s, st: it.st, n: it.n || '', l: it.l, a: it.a || [], k: it.k || null }
      else if (it.t === 'faca') r.facas[lado] = { d: it.d, p: it.p, f: it.f, s: it.s, st: it.st, n: it.n || '', l: it.l }
      else if (it.t === 'luva') r.luvas[lado] = { d: it.d, p: it.p, f: it.f, s: it.s, l: it.l }
      // agentes não são aplicados no servidor (bloqueado): o item pode existir no inventário, mas não vai para o plugin
    }
  }
  return algo ? r : null
}

const chave = (id) => `skins:${id}`
const lerSkins = async (env, id) => {
  const bruto = await env.MOLDURAS.get(chave(id), 'json').catch(() => null)
  return bruto ? limparSkins(bruto) : null
}

const gravarSkins = (env, id, inv) =>
  Object.keys(inv.itens).length ? env.MOLDURAS.put(chave(id), JSON.stringify(inv)) : env.MOLDURAS.delete(chave(id))

const novoId = () => (crypto.randomUUID().replace(/-/g, '').slice(0, 10))

// GET/POST /skins (o próprio jogador logado)
export async function rotaSkins(req, env, quem, cors) {
  const atual = (await lerSkins(env, quem.id)) || vazio()
  if (req.method === 'GET') return json(atual, 200, cors)
  const corpo = await req.json().catch(() => null)
  if (!corpo || typeof corpo !== 'object') return json({ erro: 'corpo' }, 400, cors)

  // O jogador só mexe no que já tem: cria item novo não pode, e tipo/arma/skin de cada item são os de antes
  const proposta = limparSkins(corpo)
  const itens = {}
  for (const [id, it] of Object.entries(proposta.itens)) {
    const orig = atual.itens[id]
    if (!orig) continue
    itens[id] = { ...it, t: orig.t, d: orig.d, p: orig.p, ...(orig.m ? { m: orig.m } : {}) }
  }
  // Item que o jogador não mandou de volta continua com ele: só o dono tira skin (POST /admin/skin { remover })
  for (const [id, orig] of Object.entries(atual.itens)) if (!itens[id]) itens[id] = orig
  const limpo = limparSkins({ v: 2, itens, equip: proposta.equip, criado: atual.criado, presentes: atual.presentes })
  await gravarSkins(env, quem.id, limpo)
  return json(limpo, 200, cors)
}

// GET /skins/publico?id= (sem login): só o que está equipado, para o perfil mostrar a arma com a skin do jogador
// { armas: { ct|tr: { "<defIndex>": paint } }, facas: { ct|tr: { d, p } } }
export async function rotaSkinsPublico(url, env) {
  const id = url.searchParams.get('id') || ''
  const cab = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=30' }
  if (!ID_STEAM.test(id)) return json({ erro: 'id' }, 400, cab)
  const inv = await lerSkins(env, id)
  const r = { armas: { ct: {}, tr: {} }, facas: {} }
  for (const lado of LADOS) {
    for (const itemId of Object.values(inv?.equip?.[lado] || {})) {
      const it = inv.itens[itemId]
      if (!it) continue
      if (it.t === 'arma') r.armas[lado][it.d] = it.p
      else if (it.t === 'faca' && it.p) r.facas[lado] = { d: it.d, p: it.p }
    }
  }
  return json(r, 200, cab)
}

// POST /skins/presentes { vistos: [id] }: o jogador já viu o aviso das skins novas
export async function rotaSkinsPresentes(req, env, quem, cors) {
  const { vistos } = (await req.json().catch(() => null)) || {}
  const lista = new Set(Array.isArray(vistos) ? vistos.map(String) : [])
  const inv = (await lerSkins(env, quem.id)) || vazio()
  inv.presentes = inv.presentes.map((p) => (lista.has(p.i) ? { ...p, v: 1 } : p))
  await gravarSkins(env, quem.id, inv)
  return json({ ok: true }, 200, cors)
}

// POST /admin/skin (só o dono): { id, item } dá uma skin ao jogador; { id, remover: "<id do item>" } tira
export async function rotaAdminSkin(req, env, cors, avisar) {
  const corpo = await req.json().catch(() => null)
  if (!corpo || !ID_STEAM.test(String(corpo.id))) return json({ erro: 'id' }, 400, cors)
  const alvo = String(corpo.id)
  const inv = (await lerSkins(env, alvo)) || vazio()

  if (corpo.remover) {
    const id = String(corpo.remover)
    if (!inv.itens[id]) return json({ erro: 'item' }, 404, cors)
    delete inv.itens[id]
    delete inv.criado[id]
    for (const lado of LADOS) inv.equip[lado] = Object.fromEntries(Object.entries(inv.equip[lado]).filter(([, v]) => v !== id))
    const limpo = limparSkins(inv)
    await gravarSkins(env, alvo, limpo)
    return json({ ok: true, itens: limpo.itens }, 200, cors)
  }

  // { item } ou { itens: [..] }: dá uma ou várias de uma vez (até 40); o jogador recebe um aviso para cada skin
  const lista = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 40) : corpo.item ? [corpo.item] : []
  if (!lista.length || lista.some((it) => !it || !['arma', 'faca', 'luva'].includes(it.t))) return json({ erro: 'item' }, 400, cors) // agente não: bloqueado no servidor
  if (Object.keys(inv.itens).length + lista.length > ITENS_MAX) return json({ erro: 'cheio' }, 400, cors)
  const ids = []
  const agora = Date.now()
  for (const [n, it] of lista.entries()) {
    const id = novoId()
    const teste = limparSkins({ v: 2, itens: { [id]: it } })
    if (!teste.itens[id]) return json({ erro: 'item' }, 400, cors)
    inv.itens[id] = teste.itens[id]
    inv.criado[id] = agora + n
    inv.presentes = [...inv.presentes, { i: id, q: agora + n, v: 0 }]
    ids.push(id)
  }
  const limpo = limparSkins(inv)
  await gravarSkins(env, alvo, limpo)
  await avisar?.(env, alvo) // quem está com o site aberto vê o aviso na hora
  return json({ ok: true, id: ids[0], ids, itens: limpo.itens }, 200, cors)
}

// GET /admin/skins?id= (só o dono): o que o jogador tem
export async function rotaAdminSkins(url, env, cors) {
  const id = url.searchParams.get('id') || ''
  if (!ID_STEAM.test(id)) return json({ erro: 'id' }, 400, cors)
  const inv = (await lerSkins(env, id)) || vazio()
  return json({ itens: inv.itens, equip: inv.equip }, 200, cors)
}

// POST /servidor/skins: o plugin pede o que está equipado de quem está no servidor
export async function rotaServidorSkins(req, env) {
  const cab = req.headers.get('Authorization') || ''
  const dado = new TextEncoder().encode(cab.startsWith('Bearer ') ? cab.slice(7).trim() : '')
  const certo = new TextEncoder().encode(env.SERVIDOR_TOKEN || '')
  let dif = dado.length ^ certo.length // compara tudo, sem parar no primeiro byte diferente
  for (let i = 0; i < certo.length; i++) dif |= (dado[i] ?? 0) ^ certo[i]
  if (!env.SERVIDOR_TOKEN || dif !== 0) return json({ erro: 'token' }, 401)

  const { ids } = (await req.json().catch(() => null)) || {}
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((i) => ID_STEAM.test(i)))].slice(0, 40)
  const resposta = {}
  await Promise.all(
    lista.map(async (id) => {
      const inv = await lerSkins(env, id)
      const r = inv && resolverEquipado(inv)
      if (r) resposta[id] = r
    }),
  )
  return json(resposta)
}
