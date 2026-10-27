import { registrarMissoesPartida } from './missoes.js'
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
// A lista fica no doc "partidas-recentes" (objeto Dados); cada partida, no KV "partida:<caminho>" (some sozinha depois de 30 dias).
import { lerDoc, mudarDoc } from './dados.js'
import { ErroNaoEncontrado, ErroPedido } from './erros.js'
import { exigirBearer, json } from './http.js'
import { gravarKv, lerTextoKv } from './kv.js'

const MAX_RECENTES = 60
const VALIDADE_S = 30 * 24 * 3600
const MAX_CORPO = 2_000_000 // um partida.json tem algumas dezenas de KB
const CAMINHO = /^[A-Za-z0-9._ -]{1,80}(\/[A-Za-z0-9._ -]{1,120}){1,3}$/ // "pasta/md1/nome": sem "..", sem barra no começo
const publicoCurto = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=5' }

const caminhoOk = (c) => typeof c === 'string' && CAMINHO.test(c) && !c.split('/').some((p) => p === '.' || p === '..')

// POST /servidor/partida
export async function rotaPartidaServidor(req, env) {
  exigirBearer(req, env.SERVIDOR_TOKEN)
  const texto = await req.text()
  if (texto.length > MAX_CORPO) throw new ErroPedido('grande')
  let c
  try {
    c = JSON.parse(texto)
  } catch {
    throw new ErroPedido('json')
  }
  if (!caminhoOk(c?.caminho) || !c.partida || typeof c.partida !== 'object' || !c.item || typeof c.item !== 'object') throw new ErroPedido('dados')
  await gravarKv(env, `partida:${c.caminho}`, c.partida, { expirationTtl: VALIDADE_S })
  const item = { ...c.item, caminho: c.caminho } // o link da página é sempre /partidas/<caminho>/
  await mudarDoc(env, 'partidas-recentes', (lista) => [item, ...lista.filter((p) => p.caminho !== c.caminho)].slice(0, MAX_RECENTES), [])
  await registrarMissoesPartida(env,c.caminho,c.partida)
  return json({ ok: true })
}

// GET /partidas/recentes e /partidas/dados?c=<caminho>
export async function rotaPartidasPublico(url, env) {
  if (url.pathname === '/partidas/recentes') return json(await lerDoc(env, 'partidas-recentes', []), 200, publicoCurto)
  const c = url.searchParams.get('c') || ''
  if (!caminhoOk(c)) throw new ErroPedido('caminho')
  const dados = await lerTextoKv(env, `partida:${c}`)
  if (!dados) throw new ErroNaoEncontrado('nao-encontrada')
  return new Response(dados, { headers: { 'Content-Type': 'application/json; charset=utf-8', ...publicoCurto } })
}
