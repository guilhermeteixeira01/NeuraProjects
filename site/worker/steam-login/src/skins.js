/*
 * Skins (inventário do jogador no site; o plugin BaseComp aplica no servidor de CS2).
 *
 * KV MOLDURAS, uma chave por jogador:  skins:<SteamID64>
 *   { armas:   { "<defIndex>": { p: paint, f: desgaste 0..1, s: seed 0..1000, st: 0|1 (StatTrak), a: [adesivo x4, 0 = vazio], l: 0|1 (modelo antigo) } },
 *     facas:   { ct|tr: { d: defIndex da faca, p: paint (0 = faca lisa), f, s, st, l } },
 *     luvas:   { ct|tr: { d: defIndex da luva, p: paint, f, s, l } },
 *     agentes: { ct|tr: { d: defIndex do agente, m: "agents/models/.../x.vmdl" } } }
 *
 *   GET  /skins            (login)  -> o inventário do próprio jogador
 *   POST /skins            (login)  -> salva (o corpo é o inventário inteiro; o worker limpa e confere os números)
 *   POST /servidor/skins   (token do servidor) { ids: ["<SteamID64>", ...] } -> { "<SteamID64>": inventário } (só quem tem algo salvo)
 */

const ID_STEAM = /^\d{17}$/
const FACAS = new Set([500, 503, 505, 506, 507, 508, 509, 512, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 525, 526]) // defIndex das facas do jogo
const LUVAS = new Set([4725, 5027, 5030, 5031, 5032, 5033, 5034, 5035])
const ARMAS_MAX = 80
const MODELO_AGENTE = /^agents\/models\/[a-z0-9_/]{1,120}\.vmdl$/
const ID_MAX = 100000 // paint kit / adesivo / agente: limite folgado só para barrar lixo

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const inteiro = (v, min, max, padrao = 0) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao
}
const desgaste = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000 : 0.0001
}

// Deixa só o que o plugin entende, com os números dentro dos limites
export function limparSkins(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  const saida = { armas: {}, facas: {}, luvas: {}, agentes: {} }

  for (const [def, a] of Object.entries(e.armas && typeof e.armas === 'object' ? e.armas : {}).slice(0, ARMAS_MAX)) {
    if (!/^\d{1,4}$/.test(def) || !a || typeof a !== 'object') continue
    const paint = inteiro(a.p, 0, ID_MAX)
    if (!paint) continue // sem skin: não precisa guardar
    const adesivos = Array.isArray(a.a) ? a.a.slice(0, 4).map((x) => inteiro(x, 0, ID_MAX)) : []
    while (adesivos.length < 4) adesivos.push(0)
    saida.armas[def] = { p: paint, f: desgaste(a.f), s: inteiro(a.s, 0, 1000), st: a.st ? 1 : 0, a: adesivos, l: a.l ? 1 : 0 }
  }

  for (const lado of ['ct', 'tr']) {
    const f = e.facas?.[lado]
    if (f && FACAS.has(Number(f.d))) saida.facas[lado] = { d: Number(f.d), p: inteiro(f.p, 0, ID_MAX), f: desgaste(f.f), s: inteiro(f.s, 0, 1000), st: f.st ? 1 : 0, l: f.l ? 1 : 0 }
    const l = e.luvas?.[lado]
    if (l && LUVAS.has(Number(l.d)) && inteiro(l.p, 0, ID_MAX)) saida.luvas[lado] = { d: Number(l.d), p: inteiro(l.p, 0, ID_MAX), f: desgaste(l.f), s: inteiro(l.s, 0, 1000), l: l.l ? 1 : 0 }
    const ag = e.agentes?.[lado]
    if (ag && inteiro(ag.d, 1, ID_MAX) && MODELO_AGENTE.test(String(ag.m))) saida.agentes[lado] = { d: inteiro(ag.d, 1, ID_MAX), m: String(ag.m) }
  }
  return saida
}

const chave = (id) => `skins:${id}`
const lerSkins = async (env, id) => (await env.MOLDURAS.get(chave(id), 'json').catch(() => null)) || null

// GET/POST /skins (o próprio jogador logado)
export async function rotaSkins(req, env, quem, cors) {
  if (req.method === 'GET') return json((await lerSkins(env, quem.id)) || limparSkins({}), 200, cors)
  const corpo = await req.json().catch(() => null)
  if (!corpo || typeof corpo !== 'object') return json({ erro: 'corpo' }, 400, cors)
  const limpo = limparSkins(corpo)
  const vazio = !Object.keys(limpo.armas).length && !Object.keys(limpo.facas).length && !Object.keys(limpo.luvas).length && !Object.keys(limpo.agentes).length
  if (vazio) await env.MOLDURAS.delete(chave(quem.id))
  else await env.MOLDURAS.put(chave(quem.id), JSON.stringify(limpo))
  return json(limpo, 200, cors)
}

// POST /servidor/skins: o plugin pede o inventário de quem está no servidor
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
      const s = await lerSkins(env, id)
      if (s) resposta[id] = s
    }),
  )
  return json(resposta)
}
