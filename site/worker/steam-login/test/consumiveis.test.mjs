import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { pedirAoJogador } from '../src/objetos.js'
import { lerPerfil } from '../src/perfis.js'
import { inicioDaPartida, xpPorJogador } from '../src/consumiveis.js'

const A = '76561198000000951', B = '76561198000000952', C = '76561198000000953', D = '76561198000000954'
const jogador = (steamId, time, rating) => ({ steamId, time, rating, rounds: 20, kills: 10, mortes: 10 })
// partida que começou "agora" (minuto cheio, horário de Brasília): A vence, B perde
function partida(inicioMs, a = A, b = B, mapa = 'de_nuke') {
  const d = new Date(inicioMs - 3 * 3600000).toISOString()
  return { inicio: `${d.slice(0, 10)} ${d.slice(11, 16)}`, mapa, placarA: 13, placarB: 6, jogadores: [jogador(a, 'A', 1.3), jogador(b, 'B', 0.8)] }
}
const enviar = (pedir, caminho, p) => pedir('POST', '/servidor/partida', { corpo: { caminho, item: { nome: caminho }, partida: p }, cabecalhos: { Authorization: 'Bearer token-servidor' } })
test('início da partida no horário de Brasília', () => {
  assert.equal(inicioDaPartida({ inicio: '2026-10-28 23:32' }), Date.parse('2026-10-29T02:32:00Z'))
  assert.ok(Number.isNaN(inicioDaPartida({})))
  assert.equal(inicioDaPartida({ inicio: '2026-10-28 23:32:45' }), Date.parse('2026-10-29T02:32:45Z'))
})

test('mapa é publicado com Boost de 160 para 320 XP e Freeze de vitória zerado', async () => {
  const { pedir, env } = ambiente()
  await darItens(env, A, { boost: 1 })
  await darItens(env, B, { freeze: 1 })
  await pedirAoJogador(env, A, { acao: 'consumivel-ativar', tipo: 'boost' })
  await pedirAoJogador(env, B, { acao: 'consumivel-ativar', tipo: 'freeze' })
  const p = partida(Math.ceil((Date.now() + 60000) / 60000) * 60000)
  p.jogadores[0].rating = 1.6
  p.jogadores[1].time = 'A'
  assert.equal((await enviar(pedir, 'org/md1/dobro', p)).status, 200)
  const dados = (await pedir('GET', '/partidas/dados?c=org/md1/dobro')).dados
  assert.equal(dados.xp[A].ganho + dados.efeitos[A].delta, 320)
  assert.equal(dados.xp[B].ganho + dados.efeitos[B].delta, 0)
  const efeitos = await pedir('GET', '/partidas/efeitos?c=org/md1/dobro')
  assert.equal(efeitos.dados[A].delta, 160)
  const resumo = (await pedir('GET', '/loja/premium-partidas', { quem: A })).dados.recentes[0]
  assert.equal(resumo.xp, 320)
  await enviar(pedir, 'org/md1/dobro', p)
  assert.equal((await lerPerfil(env, A)).xp, 160)
})

test('reenvio recupera ajuste de XP após falha entre consumo do item e gravação do perfil', async () => {
  const { pedir, env } = ambiente()
  await darItens(env, A, { boost: 1 })
  await pedirAoJogador(env, A, { acao: 'consumivel-ativar', tipo: 'boost' })
  const p = partida(Math.ceil((Date.now() + 60000) / 60000) * 60000)
  const dados = env.DADOS.instancia('global')
  const gravar = dados.gravar.bind(dados)
  let falhar = true
  dados.gravar = (colecao, mudancas) => {
    if (colecao === 'perfis' && falhar) { falhar = false; throw Error('falha simulada no perfil') }
    return gravar(colecao, mudancas)
  }
  assert.equal((await enviar(pedir, 'org/md1/retomar', p)).status, 500)
  assert.equal((await enviar(pedir, 'org/md1/retomar', p)).status, 200)
  assert.equal((await lerPerfil(env, A)).xp, xpPorJogador(p).get(A))
  await enviar(pedir, 'org/md1/retomar', p)
  assert.equal((await lerPerfil(env, A)).xp, xpPorJogador(p).get(A))
})

test('ativar exige ter o item, só um por vez, e cancelar devolve', async () => {
  const { pedir, env } = ambiente()
  assert.equal((await pedir('POST', '/loja/consumiveis/ativar', { quem: A, corpo: { tipo: 'boost' } })).status, 409)
  assert.equal((await pedir('POST', '/loja/consumiveis/ativar', { quem: A, corpo: { tipo: 'xyz' } })).status, 400)
  await darItens(env, A, { boost: 2, freeze: 1 })
  const at = await pedir('POST', '/loja/consumiveis/ativar', { quem: A, corpo: { tipo: 'boost' } })
  assert.equal(at.status, 200)
  assert.equal(at.dados.boost, 1)
  assert.equal(at.dados.ativo.tipo, 'boost')
  assert.equal((await pedir('POST', '/loja/consumiveis/ativar', { quem: A, corpo: { tipo: 'freeze' } })).status, 409)
  const c = await pedir('POST', '/loja/consumiveis/cancelar', { quem: A, corpo: {} })
  assert.deepEqual(c.dados, { boost: 2, freeze: 1, ativo: null })
  assert.equal((await pedir('POST', '/loja/consumiveis/ativar', { corpo: { tipo: 'boost' } })).status, 401)
})

test('Boost dobra o XP da vitória e Freeze anula a derrota, uma vez por partida', async () => {
  const { pedir, env } = ambiente()
  await darItens(env, A, { boost: 1 })
  await darItens(env, B, { freeze: 1 })
  await pedir('POST', '/loja/consumiveis/ativar', { quem: A, corpo: { tipo: 'boost' } })
  await pedir('POST', '/loja/consumiveis/ativar', { quem: B, corpo: { tipo: 'freeze' } })
  const inicio = Math.ceil((Date.now() + 60000) / 60000) * 60000 // começa depois da ativação
  const p = partida(inicio)
  const xp = xpPorJogador(p)
  assert.ok(xp.get(A) > 0 && xp.get(B) < 0)
  assert.equal((await enviar(pedir, 'org/md1/p1', p)).status, 200)
  assert.equal((await lerPerfil(env, A))?.xp, xp.get(A))
  assert.equal((await lerPerfil(env, B))?.xp, -xp.get(B))
  // o plugin mandou de novo: nada muda e o item não é gasto outra vez
  await enviar(pedir, 'org/md1/p1', p)
  assert.equal((await lerPerfil(env, A))?.xp, xp.get(A))
  assert.deepEqual(await pedirAoJogador(env, A, { acao: 'consumiveis' }), { boost: 0, freeze: 0, ativo: null })
})

test('item ativado depois do início não vale para essa partida, só para a próxima', async () => {
  const { pedir, env } = ambiente()
  await darItens(env, C, { freeze: 1 })
  const comecou = Math.floor((Date.now() - 120000) / 60000) * 60000
  await pedir('POST', '/loja/consumiveis/ativar', { quem: C, corpo: { tipo: 'freeze' } })
  await enviar(pedir, 'org/md1/antes', partida(comecou, A, C))
  assert.equal((await lerPerfil(env, C))?.xp, undefined)
  assert.equal((await pedirAoJogador(env, C, { acao: 'consumiveis' })).ativo.tipo, 'freeze')
})

test('Boost na derrota é gasto sem bônus', async () => {
  const { pedir, env } = ambiente()
  await darItens(env, D, { boost: 1 })
  await pedir('POST', '/loja/consumiveis/ativar', { quem: D, corpo: { tipo: 'boost' } })
  await enviar(pedir, 'org/md1/p2', partida(Math.ceil((Date.now() + 60000) / 60000) * 60000, A, D))
  assert.equal((await lerPerfil(env, D))?.xp, undefined)
  assert.equal((await pedirAoJogador(env, D, { acao: 'consumiveis' })).boost, 0)
})

async function darItens(env, id, qtds) {
  for (const [tipo, qtd] of Object.entries(qtds)) await pedirAoJogador(env, id, { acao: 'consumivel-dar', tipo, qtd })
}

test('admin dá e tira Boost/Freeze de um jogador (nunca abaixo de 0)', async () => {
  const { pedir, env } = ambiente()
  const E = '76561198000000955'
  assert.equal((await pedir('POST', '/admin/consumiveis', { quem: E, corpo: { alvo: E, tipo: 'boost', qtd: 3 } })).status, 403)
  const deu = await pedir('POST', '/admin/consumiveis', { quem: env.DONO, corpo: { alvo: E, tipo: 'boost', qtd: 3 } })
  assert.equal(deu.status, 200)
  assert.equal(deu.dados.boost, 3)
  assert.equal((await pedir('POST', '/admin/consumiveis', { quem: env.DONO, corpo: { alvo: E, tipo: 'boost', qtd: -10 } })).dados.boost, 0)
  assert.equal((await pedir('POST', '/admin/consumiveis', { quem: env.DONO, corpo: { alvo: E, tipo: 'nada', qtd: 1 } })).status, 400)
  assert.equal((await pedir('GET', `/admin/consumiveis?id=${E}`, { quem: env.DONO })).dados.freeze, 0)
})
