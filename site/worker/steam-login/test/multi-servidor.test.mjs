import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento } from './ambiente.mjs'
import { Presenca } from '../src/amigos.js'
import { DEFAULT_POOL } from '../../../src/paginas/neurapick/data/maps.js'

const ids = Array.from({ length: 30 }, (_, i) => String(76561198000001000n + BigInt(i)))
const cab = { Authorization: 'Bearer token-servidor' }

async function cenario({ exigir = '1' } = {}) {
  const usuarios = Object.fromEntries(ids.map((id, i) => [id, { nome: 'Jogador ' + i, avatar: '' }]))
  const { env, pedir } = ambiente({ usuarios })
  env.SERVIDOR_CONECTAR = 'padrao.test:27015'
  env.EXIGIR_SERVIDOR_LIVRE = exigir
  const storage = armazenamento()
  const objeto = new Presenca({ storage, setWebSocketAutoResponse() {}, getWebSockets: () => [], getWebSocketAutoResponseTimestamp: () => null }, env)
  env.PRESENCA = { idFromName: () => 'global', get: () => ({ fetch: (url, init) => objeto.fetch(new Request(url, init)) }) }
  const sv = (id, conectar) => ({ id, conectar })
  const proxima = (id, conectar) => pedir('POST', '/servidor/proxima', { corpo: { servidor: sv(id, conectar) }, cabecalhos: cab })
  const estado = (id, conectar, partidaId, e) => pedir('POST', '/servidor/estado', { corpo: { partidaId, estado: e, servidor: sv(id, conectar) }, cabecalhos: cab })
  const partidaPronta = (n, membros) => ({
    id: 'p' + n, fase: 'pronto', prazo: Date.now() + 600000,
    times: { A: { lider: membros[0], membros: membros.slice(0, 5) }, B: { lider: membros[5], membros: membros.slice(5, 10) } },
    aceitos: [], formato: 'bo1', pool: [...DEFAULT_POOL], primeiro: 'A',
    historico: [{ type: 'ban', team: 'A', map: 'dust2' }], servidor: { estado: 'fila', desde: Date.now() - n },
  })
  const buscando = (grupo) => Object.fromEntries(grupo.map((g) => [g[0], { membros: g.slice(1), convites: [], publico: false, busca: Date.now(), formato: 'bo1' }]))
  return { env, pedir, storage, proxima, estado, partidaPronta, buscando }
}

test('dois servidores: cada um pega uma partida e o endereço mostrado é o do servidor da partida', async () => {
  const c = await cenario({ exigir: '0' })
  await c.storage.put('partidas', { p1: c.partidaPronta(1, ids.slice(0, 10)), p2: c.partidaPronta(2, ids.slice(10, 20)) })
  const a = (await c.proxima('s1', '1.1.1.1:27015')).dados
  const b = (await c.proxima('s2', '1.1.1.1:27016')).dados
  assert.ok(a.partidaId && b.partidaId && a.partidaId !== b.partidaId)
  assert.equal((await c.estado('s1', '1.1.1.1:27015', a.partidaId, 'carregada')).status, 200)
  assert.equal((await c.estado('s2', '1.1.1.1:27016', b.partidaId, 'carregada')).status, 200)
  const dono = (pid) => (pid === 'p1' ? ids[0] : ids[10])
  assert.equal((await c.pedir('GET', '/lobby', { quem: dono(a.partidaId) })).dados.partida.servidor.conectar, '1.1.1.1:27015')
  assert.equal((await c.pedir('GET', '/lobby', { quem: dono(b.partidaId) })).dados.partida.servidor.conectar, '1.1.1.1:27016')
})

test('servidor livre perguntando não derruba a partida do servidor ocupado', async () => {
  const c = await cenario({ exigir: '0' })
  await c.storage.put('partidas', { p1: c.partidaPronta(1, ids.slice(0, 10)) })
  const a = (await c.proxima('s1', '1.1.1.1:27015')).dados
  await c.estado('s1', '1.1.1.1:27015', a.partidaId, 'jogando')
  const partidas = await c.storage.get('partidas')
  partidas.p1.servidor.entregueEm = Date.now() - 120000 // já passou dos 30 s: antes, qualquer pergunta a marcava como encerrada
  await c.storage.put('partidas', partidas)
  assert.equal((await c.proxima('s2', '1.1.1.1:27016')).dados.nenhuma, true)
  assert.equal((await c.pedir('GET', '/lobby', { quem: ids[0] })).dados.partida.servidor.estado, 'jogando')
  // o próprio s1 voltando a perguntar significa que a série dele acabou: aí sim encerra
  await c.proxima('s1', '1.1.1.1:27015')
  assert.equal((await c.pedir('GET', '/lobby', { quem: ids[0] })).dados.partida.servidor.estado, 'encerrada')
})

test('o pick & ban só abre com servidor livre', async () => {
  const c = await cenario()
  await c.storage.put('partidas', {})
  await c.storage.put('lobbies', c.buscando([ids.slice(0, 5), ids.slice(5, 10), ids.slice(10, 15), ids.slice(15, 20)]))
  // nenhum servidor apareceu ainda: nada de partida
  assert.equal(Object.keys((await c.storage.get('partidas')) || {}).length, 0)
  // s1 livre pergunta: forma UMA partida (não duas)
  assert.equal((await c.proxima('s1', '1.1.1.1:27015')).dados.nenhuma, true)
  assert.equal(Object.keys(await c.storage.get('partidas')).length, 1)
  // s1 pergunta de novo: já há uma partida esperando servidor, não abre outra
  await c.proxima('s1', '1.1.1.1:27015')
  assert.equal(Object.keys(await c.storage.get('partidas')).length, 1)
  // s2 aparece livre: abre a segunda
  await c.proxima('s2', '1.1.1.1:27016')
  assert.equal(Object.keys(await c.storage.get('partidas')).length, 2)
  const r = (await c.pedir('GET', '/lobby', { quem: ids[0] })).dados
  assert.equal(r.servidores.total, 2)
})
