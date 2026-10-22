// Partidas recém-jogadas, servidas direto pelo worker (sem esperar o deploy do site).
//
// O plugin do servidor (BaseComp) manda a partida para cá assim que o mapa termina, além de continuar enviando para o
// repositório (o próximo deploy passa a ter a partida como página pronta e ela deixa de depender do worker).
//
//   POST /servidor/partida   (Authorization: Bearer <SERVIDOR_TOKEN>, o mesmo do plugin em /servidor/*)
//        corpo: { "caminho": "<pasta>/<md1|md3|md5>/<nome>", "item": { ...linha do partidas.json }, "partida": { ...partida.json } }
//   GET  /partidas/recentes  -> [ ...linhas do partidas.json, da mais nova para a mais antiga ] (público)
//   GET  /partidas/dados?c=<caminho>  -> o partida.json dessa partida (público)
//
// Guardado no KV MOLDURAS: "partidas-recentes" (lista) e "partida:<caminho>" (cada partida, some depois de 30 dias).

const MAX_RECENTES = 60
const VALIDADE_S = 30 * 24 * 3600
const MAX_CORPO = 2_000_000 // um partida.json tem algumas dezenas de KB
const CAMINHO = /^[A-Za-z0-9._ -]{1,80}(\/[A-Za-z0-9._ -]{1,120}){1,3}$/ // "pasta/md1/nome": sem "..", sem barra no começo

const cabJson = { 'Content-Type': 'application/json; charset=utf-8' }
const resp = (dados, status = 200, extra = {}) => new Response(JSON.stringify(dados), { status, headers: { ...cabJson, ...extra } })
const publicoCurto = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=5' }

const caminhoOk = (c) => typeof c === 'string' && CAMINHO.test(c) && !c.split('/').some((p) => p === '.' || p === '..')

function tokenOk(req, env) {
  const cab = req.headers.get('Authorization') || ''
  const dado = new TextEncoder().encode(cab.startsWith('Bearer ') ? cab.slice(7).trim() : '')
  const certo = new TextEncoder().encode(env.SERVIDOR_TOKEN || '')
  let dif = dado.length ^ certo.length // compara tudo, sem parar no primeiro byte diferente
  for (let i = 0; i < certo.length; i++) dif |= (dado[i] ?? 0) ^ certo[i]
  return !!env.SERVIDOR_TOKEN && dif === 0
}

async function lerLista(env) {
  try {
    const l = await env.MOLDURAS.get('partidas-recentes', 'json')
    return Array.isArray(l) ? l : []
  } catch {
    return []
  }
}

// POST /servidor/partida
export async function rotaPartidaServidor(req, env) {
  if (!tokenOk(req, env)) return resp({ erro: 'token' }, 401)
  const texto = await req.text()
  if (texto.length > MAX_CORPO) return resp({ erro: 'grande' }, 413)
  let c
  try {
    c = JSON.parse(texto)
  } catch {
    return resp({ erro: 'json' }, 400)
  }
  if (!caminhoOk(c?.caminho) || !c.partida || typeof c.partida !== 'object' || !c.item || typeof c.item !== 'object') return resp({ erro: 'dados' }, 400)
  const item = { ...c.item, caminho: c.caminho } // o link da página é sempre /partidas/<caminho>/
  await env.MOLDURAS.put(`partida:${c.caminho}`, JSON.stringify(c.partida), { expirationTtl: VALIDADE_S })
  const lista = (await lerLista(env)).filter((p) => p.caminho !== c.caminho)
  lista.unshift(item)
  await env.MOLDURAS.put('partidas-recentes', JSON.stringify(lista.slice(0, MAX_RECENTES)))
  return resp({ ok: true })
}

// GET /partidas/recentes e /partidas/dados?c=<caminho>
export async function rotaPartidasPublico(url, env) {
  if (url.pathname === '/partidas/recentes') return resp(await lerLista(env), 200, publicoCurto)
  const c = url.searchParams.get('c') || ''
  if (!caminhoOk(c)) return resp({ erro: 'caminho' }, 400, publicoCurto)
  const dados = await env.MOLDURAS.get(`partida:${c}`, 'text')
  if (!dados) return resp({ erro: 'nao-encontrada' }, 404, publicoCurto)
  return new Response(dados, { status: 200, headers: { ...cabJson, ...publicoCurto } })
}
