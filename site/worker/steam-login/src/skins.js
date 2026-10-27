import { objetoGlobal, pedir } from './objetos.js'
/*
 * Skins: inventário do jogador no site (como o inventário do jogo) e o que ele equipa em cada time.
 * O plugin BaseComp lê o inventário já "resolvido" em /servidor/skins e aplica no servidor de CS2.
 *
 * Guardado no Durable Object do jogador (loja.js, class Loja). O KV MOLDURAS (skins:<SteamID64>) é só o formato antigo, lido uma vez para migrar:
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
import { lerDoc } from './dados.js'
import { ErroConflito, ErroNaoEncontrado, ErroPedido, ErroServico } from './erros.js'
import { exigirBearer, json, lerCorpo } from './http.js'
import { lerJsonKv } from './kv.js'
import { pedirAoJogador } from './objetos.js'
import { valoresDe } from './valor.js'

const ID_STEAM = /^\d{17}$/
const FACAS = new Set([500, 503, 505, 506, 507, 508, 509, 512, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 525, 526]) // defIndex das facas do jogo
const LUVAS = new Set([4725, 5027, 5030, 5031, 5032, 5033, 5034, 5035])
const ITENS_MAX = 2000 // inclui os adesivos e chaveiros guardados (cada um é um item)
const CONSUMIVEIS = new Set(['adesivo', 'chaveiro', 'caixa']) // guardados no inventário; caixa fechada vira skin ao abrir (loja.js)
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
    } else if (CONSUMIVEIS.has(it.t)) {
      // adesivo/chaveiro guardado no inventário: só vale para colar numa arma (e some quando é colado)
      saida.itens[id] = { t: it.t, d, p: 0 }
    } else continue
    saida.criado[id] = inteiro(e.criado?.[id], 0, 9007199254740991)
  }

  for (const lado of LADOS) {
    for (const [chave, id] of Object.entries(e.equip?.[lado] && typeof e.equip[lado] === 'object' ? e.equip[lado] : {})) {
      const it = saida.itens[id]
      if (!it || CONSUMIVEIS.has(it.t) || !timesDoItem(it).includes(lado)) continue // item que não existe nesse time (AK no CT, M4 no TR...) não fica equipado
      // a chave diz onde o item entra: a arma pelo defIndex, o resto pelo tipo
      const certa = it.t === 'arma' ? String(it.d) : it.t
      if (chave === certa) saida.equip[lado][chave] = id
    }
  }
  saida.presentes = (Array.isArray(e.presentes) ? e.presentes : [])
    .filter((p) => p && ID_ITEM.test(String(p.i)) && saida.itens[p.i])
    .map((p) => ({ i: String(p.i), q: inteiro(p.q, 0, 9007199254740991), v: p.v ? 1 : 0, n: inteiro(p.n, 1, 99, 1) }))
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

// KV: formato antigo do inventário (skins:<id>). Só o objeto do jogador lê daqui, na primeira vez (para migrar); ninguém mais grava.
export async function lerSkinsKv(env, id) {
  const bruto = await lerJsonKv(env, `skins:${id}`)
  return bruto ? limparSkins(bruto) : null
}

// Inventário de verdade: no objeto do jogador (loja.js, class Loja), com número de versão. Todo mundo lê e muda por aqui.
// Caixas apagadas da loja (as antigas): as fechadas somem do inventário (a próxima gravação já sai sem elas).
export async function lerSkinsVer(env, id) {
  const [r, removidas] = await Promise.all([pedirAoJogador(env, id, { acao: 'inv-ler' }), lerDoc(env, 'caixas-removidas', [])])
  const inv = r.inv ? limparSkins(r.inv) : null
  if (inv && removidas.length) {
    const fora = new Set(removidas.map(Number))
    for (const [k, it] of Object.entries(inv.itens)) if (it.t === 'caixa' && fora.has(it.d)) delete inv.itens[k]
  }
  return { inv, ver: r.ver || 0 }
}
export const lerSkins = async (env, id) => (await lerSkinsVer(env, id)).inv

/**
 * Lê, muda e grava só se mais ninguém mexeu no meio (compra/abertura da loja, presente do dono, outra aba): senão relê e refaz.
 * @param {(inv: object) => { inv: object, [extra: string]: unknown }} fn  muda o inventário; lança um ErroApi para recusar
 * @returns o que fn devolveu (com o inventário gravado em .inv)
 */
export async function mudarSkins(env, id, fn) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { inv, ver } = await lerSkinsVer(env, id)
    const r = await fn(inv || vazio())
    try {
      await pedirAoJogador(env, id, { acao: 'inv-gravar', inv: r.inv, ver })
      return r
    } catch (e) {
      if (!(e instanceof ErroConflito && e.codigo === 'versao')) throw e
    }
  }
  throw new ErroServico('ocupado', undefined, { indisponivel: true })
}

// Tira o item do inventário, do que está equipado e dos avisos de presente
export function tirarItem(inv, id) {
  delete inv.itens[id]
  delete inv.criado[id]
  for (const lado of LADOS) inv.equip[lado] = Object.fromEntries(Object.entries(inv.equip[lado] || {}).filter(([, v]) => v !== id))
  inv.presentes = (inv.presentes || []).filter((q) => q.i !== id)
}

const novoId = () => (crypto.randomUUID().replace(/-/g, '').slice(0, 10))
export const novoIdItem = novoId

// Quantos adesivos e chaveiros estão colados nas armas: { adesivos: { def: n }, chaveiros: { def: n } }
function contarColados(itens) {
  const adesivos = {}
  const chaveiros = {}
  for (const it of Object.values(itens)) {
    if (it.t !== 'arma') continue
    for (const a of it.a || []) if (a?.i) adesivos[a.i] = (adesivos[a.i] || 0) + 1
    if (it.k?.i) chaveiros[it.k.i] = (chaveiros[it.k.i] || 0) + 1
  }
  return { adesivos, chaveiros }
}

// Colar adesivo/chaveiro numa arma GASTA um do inventário (só dá para colar o que se tem); adesivo tirado da arma se perde (como raspar no CS)
// e o chaveiro tirado (ou trocado) volta para o inventário. Devolve o erro ou null; muda "itens" (gasta e devolve).
function aplicarConsumo(antes, itens) {
  const a = contarColados(antes)
  const d = contarColados(itens)
  const dono = (tipo, def) => Object.entries(itens).filter(([, it]) => it.t === tipo && it.d === Number(def))
  for (const [tipo, chave, nome] of [['adesivo', 'adesivos', 'sem-adesivo'], ['chaveiro', 'chaveiros', 'sem-chaveiro']]) {
    for (const def of new Set([...Object.keys(a[chave]), ...Object.keys(d[chave])])) {
      const precisa = (d[chave][def] || 0) - (a[chave][def] || 0)
      if (precisa > 0) {
        const guardados = dono(tipo, def)
        if (guardados.length < precisa) return nome
        for (const [id] of guardados.slice(0, precisa)) delete itens[id]
      }
    }
  }
  // chaveiro que saiu da arma volta para o inventário
  for (const def of Object.keys(a.chaveiros)) {
    const volta = (a.chaveiros[def] || 0) - (d.chaveiros[def] || 0)
    for (let i = 0; i < volta; i++) itens[novoId()] = { t: 'chaveiro', d: Number(def), p: 0 }
  }
  return null
}

// GET/POST /skins (o próprio jogador logado)
export async function rotaSkins(req, env, quem, cors) {
  if (req.method === 'GET') return json((await lerSkins(env, quem.id)) || vazio(), 200, cors)
  const corpo = await lerCorpo(req)
  const { inv } = await mudarSkins(env, quem.id, (atual) => {
    // O jogador só mexe no que já tem: cria item novo não pode, e tipo/arma/skin de cada item são os de antes
    const proposta = limparSkins(corpo)
    const itens = {}
    for (const [id, it] of Object.entries(proposta.itens)) {
      const orig = atual.itens[id]
      if (!orig) continue
      // desgaste, padrão, StatTrak, nome e modelo antigo não mudam (só o dono/ a caixa define); o jogador só muda adesivos e chaveiro (a, k)
      itens[id] = { ...it, t: orig.t, d: orig.d, p: orig.p, f: orig.f, s: orig.s, st: orig.st, n: orig.n ?? '', l: orig.l, ...(orig.m ? { m: orig.m } : {}) }
    }
    // Item que o jogador não mandou de volta continua com ele: só o dono tira skin (POST /admin/skin { remover })
    for (const [id, orig] of Object.entries(atual.itens)) if (!itens[id]) itens[id] = orig
    const falta = aplicarConsumo(atual.itens, itens)
    if (falta) throw new ErroConflito(falta)
    const criado = { ...atual.criado }
    for (const id of Object.keys(itens)) criado[id] ??= Date.now()
    return { inv: limparSkins({ v: 2, itens, equip: proposta.equip, criado, presentes: atual.presentes }) }
  })
  return json(inv, 200, cors)
}

const idDaUrl = (url) => {
  const id = url.searchParams.get('id') || ''
  if (!ID_STEAM.test(id)) throw new ErroPedido('id')
  return id
}

// GET /skins/publico?id= (sem login): só o que está equipado, para o perfil mostrar a arma com a skin do jogador
// { armas: { ct|tr: { "<defIndex>": paint } }, facas: { ct|tr: { d, p } } }
export async function rotaSkinsPublico(url, env, cors) {
  const inv = await lerSkins(env, idDaUrl(url))
  const r = { armas: { ct: {}, tr: {} }, facas: {} }
  for (const lado of LADOS) {
    for (const itemId of Object.values(inv?.equip?.[lado] || {})) {
      const it = inv.itens[itemId]
      if (!it) continue
      if (it.t === 'arma') r.armas[lado][it.d] = it.p
      else if (it.t === 'faca' && it.p) r.facas[lado] = { d: it.d, p: it.p }
    }
  }
  return json(r, 200, { ...cors, 'Cache-Control': 'public, max-age=30' })
}

// GET /skins/inventario?id= (sem login): o inventário de um jogador para o perfil dele ("Ver inventário"), com o valor em NP de cada item
export async function rotaSkinsInventarioPublico(url, env, cors) {
  const dono = idDaUrl(url)
  const inv = await lerSkins(env, dono)
  if (url.searchParams.get('troca') === '1') {
    const { ids } = await pedir(objetoGlobal(env.TROCAS), { acao: 'reservados', quem: dono })
    const reservados = new Set(ids)
    inv.itens = Object.fromEntries(Object.entries(inv.itens || {}).filter(([id]) => !reservados.has(id)))
  }
  const valores = Object.fromEntries(Object.entries(valoresDe(inv?.itens)).map(([k, x]) => [k, x.v]))
  return json({ itens: inv?.itens || {}, equip: inv?.equip || { ct: {}, tr: {} }, criado: inv?.criado || {}, valores }, 200, { ...cors, 'Cache-Control': 'public, max-age=20' })
}

// POST /skins/presentes { vistos: [id] }: o jogador já viu o aviso das skins novas
export async function rotaSkinsPresentes(req, env, quem, cors) {
  const { vistos } = await lerCorpo(req)
  const lista = new Set(Array.isArray(vistos) ? vistos.map(String) : [])
  await mudarSkins(env, quem.id, (inv) => ({ inv: { ...inv, presentes: inv.presentes.map((p) => (lista.has(p.i) ? { ...p, v: 1 } : p)) } }))
  return json({ ok: true }, 200, cors)
}

// Tira um item (o próprio jogador exclui, ou o dono tira pelo painel)
const excluirItem = (env, dono, id) =>
  mudarSkins(env, dono, (inv) => {
    if (!inv.itens[id]) throw new ErroNaoEncontrado('item')
    tirarItem(inv, id)
    return { inv: limparSkins(inv) }
  })

// POST /skins/excluir { id }: o jogador exclui um item do próprio inventário (skin, adesivo, chaveiro ou caixa). Não tem volta: o site pergunta antes.
export async function rotaSkinsExcluir(req, env, quem, cors) {
  const { id } = await lerCorpo(req)
  if (!ID_ITEM.test(String(id))) throw new ErroPedido('item')
  const { inv } = await excluirItem(env, quem.id, String(id))
  return json(inv, 200, cors)
}

const TIPOS_DO_DONO = ['arma', 'faca', 'luva', 'adesivo', 'chaveiro', 'caixa'] // agente não: bloqueado no servidor

// POST /admin/skin (só o dono): { id, item } ou { id, itens: [..] } dá skins ao jogador (até 60, cada uma com q = quantidade se for
// adesivo/chaveiro); { id, remover: "<id do item>" } tira uma. O jogador recebe um aviso por tipo de item, com "×n".
export async function rotaAdminSkin(req, env, cors, avisar) {
  const corpo = await lerCorpo(req)
  if (!ID_STEAM.test(String(corpo.id))) throw new ErroPedido('id')
  const alvo = String(corpo.id)

  if (corpo.remover) {
    const { inv } = await excluirItem(env, alvo, String(corpo.remover))
    return json({ ok: true, itens: inv.itens }, 200, cors)
  }

  const lista = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 60) : corpo.item ? [corpo.item] : []
  if (!lista.length || lista.some((it) => !it || !TIPOS_DO_DONO.includes(it.t))) throw new ErroPedido('item')
  const quantos = (it) => (CONSUMIVEIS.has(it.t) ? inteiro(it.q, 1, 50, 1) : 1)
  const total = lista.reduce((n, it) => n + quantos(it), 0)
  const { inv, ids } = await mudarSkins(env, alvo, (inv) => {
    if (Object.keys(inv.itens).length + total > ITENS_MAX) throw new ErroConflito('cheio')
    const ids = []
    const agora = Date.now()
    for (const [n, it] of lista.entries()) {
      const qtd = quantos(it)
      for (let k = 0; k < qtd; k++) {
        const id = novoId()
        const limpo = limparSkins({ v: 2, itens: { [id]: it } }).itens[id]
        if (!limpo) throw new ErroPedido('item')
        inv.itens[id] = limpo
        inv.criado[id] = agora + n
        if (k === 0) inv.presentes = [...inv.presentes, { i: id, q: agora + n, v: 0, n: qtd }]
        ids.push(id)
      }
    }
    return { inv: limparSkins(inv), ids }
  })
  await avisar(env, alvo) // quem está com o site aberto vê o aviso na hora
  return json({ ok: true, id: ids[0], ids, itens: inv.itens }, 200, cors)
}

// GET /admin/skins?id= (só o dono): o que o jogador tem
export async function rotaAdminSkins(url, env, cors) {
  const inv = (await lerSkins(env, idDaUrl(url))) || vazio()
  return json({ itens: inv.itens, equip: inv.equip }, 200, cors)
}

// POST /servidor/skins: o plugin pede o que está equipado de quem está no servidor
export async function rotaServidorSkins(req, env) {
  exigirBearer(req, env.SERVIDOR_TOKEN)
  const { ids } = await lerCorpo(req)
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
