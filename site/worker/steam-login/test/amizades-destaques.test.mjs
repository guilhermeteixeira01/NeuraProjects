import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { progressoMissoes, resumoMissao } from '../src/missoes-core.js'
import { lerPerfil } from '../src/perfis.js'
import { sincronizarMissoes } from '../src/missoes.js'
import { mudar, gravarDoc } from '../src/dados.js'

const A = '76561198000000961', B = '76561198000000962'
const amigos = Array.from({ length: 10 }, (_, n) => String(76561198000000962n + BigInt(n)))
const missao = (partidas, ids, nome) => progressoMissoes(partidas, { amigos: ids }).lista.find(m => m.id === `amizade-${nome}`)
const partida = (chave, companheiros = [B], extra = {}) => ({ chave, modo: '5v5', presenteFinal: true, companheiros, validada: true, ...extra })

test('primeira amizade e círculo exigem amizades aceitas distintas', () => {
  assert.equal(missao([], [], 'primeira').concluida, false)
  assert.equal(missao([], [B, B], 'primeira').atual, 1)
  assert.equal(missao([], amigos.slice(0, 9), 'circulo').concluida, false)
  assert.equal(missao([], amigos, 'circulo').concluida, true)
})

test('dupla conta dez partidas distintas com o mesmo amigo; squad exige os quatro no mesmo mapa', () => {
  const partidas = Array.from({ length: 10 }, (_, n) => partida(`mapa-${n}`))
  assert.equal(missao([...partidas, partidas[0]], [B], 'dupla-inseparavel').atual, 10)
  assert.equal(missao(partidas.slice(0, 9), [B], 'dupla-inseparavel').concluida, false)
  assert.equal(missao(partidas, [], 'dupla-inseparavel').atual, 0)
  assert.equal(missao(partidas.map(p => ({ ...p, modo: 'wingman' })), [B], 'dupla-inseparavel').atual, 0)
  assert.equal(missao(partidas.map(p => ({ ...p, presenteFinal: false })), [B], 'dupla-inseparavel').atual, 0)
  assert.equal(missao([partida('squad', amigos.slice(0, 4))], amigos, 'squad-unido').concluida, true)
  assert.equal(missao([partida('squad', amigos.slice(0, 3))], amigos, 'squad-unido').concluida, false)
  assert.equal(missao([partida('squad', [B, B, B, B])], amigos, 'squad-unido').concluida, false)
  assert.equal(missao([partida('antiga', undefined)], amigos, 'squad-unido').concluida, false)
})

test('coletor inclui apenas aliados humanos participantes no elenco final e no time correto', () => {
  const jogadores = [A, ...amigos.slice(0, 5)].map(steamId => ({ steamId, time: 'A', missoes: { participou: true, roundsValidos: 10 } }))
  jogadores[2].bot = true
  jogadores[3].time = 'B'
  jogadores[4].missoes.participou = false
  const p = { mapa: 'de_mirage', placarA: 13, placarB: 7, jogadores, missoes: { versao: 1, concluida: true, validada: true, modo: '5v5', elencoFinal: jogadores.slice(0, 5).map(j => j.steamId) } }
  assert.deepEqual(resumoMissao(p, A, 'mapa').companheiros, [B])
})

test('aceite real entrega a conquista para ambos uma única vez; pedido pendente não entrega', async () => {
  const f = ambiente({ 'missoes-config': { ativa: true }, usuarios: { [A]: { nome: 'A' }, [B]: { nome: 'B' } } })
  await mudar(f.env, 'perfis', [A, B], p => { p[A] = {}; p[B] = {} })
  assert.equal((await f.pedir('POST', '/amigos', { quem: A, corpo: { acao: 'pedir', id: B } })).status, 200)
  assert.equal((await lerPerfil(f.env, A))?.insignias?.['amizade-primeira'], undefined)
  assert.equal((await f.pedir('POST', '/amigos', { quem: B, corpo: { acao: 'aceitar', id: A } })).status, 200)
  for (const id of [A, B]) {
    const antes = (await lerPerfil(f.env, id)).insignias['amizade-primeira']
    assert.ok(antes)
    await f.pedir('GET', '/missoes', { quem: id })
    assert.equal((await lerPerfil(f.env, id)).insignias['amizade-primeira'], antes)
    const avisos = (await f.env.LOJA.instancia(id).ctx.storage.get('notifs')).lista
    assert.equal(avisos.filter(n => n.insignia === 'amizade-primeira').length, 1)
  }
})

test('histórico confirmado entrega dupla e squad e enriquece resumos antigos sem recontar partidas', async () => {
  const f = ambiente({ 'missoes-config': { ativa: true }, amigos: { [A]: { amigos: amigos.slice(0, 4), recebidos: [], enviados: [] } } })
  await mudar(f.env, 'perfis', [A], p => { p[A] = {} })
  const obj = f.env.LOJA.instancia(A)
  obj.sql.exec('INSERT INTO missoes_partidas (chave,dados) VALUES (?,?)', 'mapa-0', JSON.stringify({ chave: 'mapa-0', modo: '5v5', presenteFinal: true, validada: true }))
  const partidas = Array.from({ length: 10 }, (_, n) => partida(`mapa-${n}`, amigos.slice(0, 4)))
  await sincronizarMissoes(obj, A, partidas)
  let perfil = await lerPerfil(f.env, A)
  assert.ok(perfil.insignias['amizade-dupla-inseparavel'])
  assert.ok(perfil.insignias['amizade-squad-unido'])
  const antes = perfil.insignias['amizade-dupla-inseparavel']
  await sincronizarMissoes(obj, A, partidas)
  perfil = await lerPerfil(f.env, A)
  assert.equal(perfil.insignias['amizade-dupla-inseparavel'], antes)
  assert.equal(obj.sql.exec('SELECT COUNT(*) AS n FROM missoes_partidas').one().n, 10)
})

test('destaques persistem em ordem; rejeitam quatro, duplicatas e insígnia não conquistada', async () => {
  const f = ambiente()
  const ids = ['staff', 'designer', 'embaixador']
  await mudar(f.env, 'perfis', [A, B], p => { p[A] = { insignias: Object.fromEntries(ids.map(id => [id, 1])) }; p[B] = {} })
  const salvar = (insigniasDestacadas, quem = A) => f.pedir('POST', '/perfil', { quem, corpo: { insigniasDestacadas } })
  assert.equal((await salvar([...ids].reverse())).status, 200)
  assert.deepEqual((await lerPerfil(f.env, A)).insigniasDestacadas, [...ids].reverse())
  assert.equal((await salvar([...ids, 'missao-headshot'])).status, 400)
  assert.equal((await salvar(['staff', 'staff'])).status, 400)
  assert.equal((await salvar(['missao-headshot'])).status, 403)
  assert.equal((await salvar(['staff'], B)).status, 403)
  assert.equal((await salvar('staff')).status, 400)
  assert.equal((await salvar([])).status, 200)
  assert.deepEqual((await lerPerfil(f.env, A)).insigniasDestacadas, [])
  assert.deepEqual((await f.pedir('GET', '/perfis', { quem: A })).dados[A].insigniasDestacadas, [])
})

test('privacidade das conquistas também oculta os destaques de visitantes', async () => {
  const f = ambiente()
  await gravarDoc(f.env, 'conta-visibilidades', { [A]: { conquistas: 'ninguem' } })
  await mudar(f.env, 'perfis', [A], p => { p[A] = { insignias: { staff: 1 }, insigniasDestacadas: ['staff'] } })
  const publico = (await f.pedir('GET', '/perfis')).dados[A]
  assert.equal(publico.insignias, undefined)
  assert.equal(publico.insigniasDestacadas, undefined)
  assert.deepEqual((await f.pedir('GET', '/perfis', { quem: A })).dados[A].insigniasDestacadas, ['staff'])
})
