import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'
import { cotaHall } from '../src/hall-cota.js'
import { mudarDoc } from '../src/dados.js'
import { readFileSync } from 'node:fs'
const { foto, referencia, simularAI } = await import('./hall-fixture.mjs')
const { decodificarHall, reduzirHall, recortarHall, pngHall, detalheMarcaHall } = await import('../src/hall-codec.js')

test('cota global limita concorrência, reserva idempotente e renova em UTC', async () => {
  const { env } = ambiente(), agora = Date.parse('2026-10-27T12:00:00Z')
  const tentativas = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => cotaHall(env, `pedido-${i}`, agora)))
  // Contenção de CAS pode pedir repetição, mas nunca permite ultrapassar dez.
  for (let i = 0; i < tentativas.length; i++) if (tentativas[i].status === 'rejected') tentativas[i] = { status: 'fulfilled', value: await cotaHall(env, `pedido-${i}`, agora) }
  assert.equal(tentativas.filter(r => r.value.permitido).length, 10)
  assert.equal((await cotaHall(env, null, agora)).usadas, 10)
  const primeiro = tentativas.findIndex(r => r.value.permitido)
  assert.equal((await cotaHall(env, `pedido-${primeiro}`, agora)).permitido, true)
  assert.equal((await cotaHall(env, 'extra', agora)).permitido, false)
  assert.equal((await cotaHall(env, 'novo-dia', agora + 86400000)).usadas, 1)
})

test('quota esgotada mantém pedido aprovado na fila sem chamada AI e retoma amanhã', async () => {
  const { env, pedir } = ambiente(), id = '76561198000000955', chamadas = []
  env.AI = simularAI(chamadas)
  const pedido = (await pedir('POST', '/hall', { quem: id, corpo: { foto, camisa: 'escura' } })).dados.pedido
  await pedir('POST', '/hall/revisao', { quem: DONO, corpo: { id, pedido, acao: 'aprovar' } })
  for (let i = 0; i < 10; i++) await cotaHall(env, `outro-${i}`)
  const ator = env.HALL_RETRATOS.instancia(id)
  await ator.alarm()
  let estado = (await pedir('GET', '/hall', { quem: id })).dados
  assert.equal(estado.estado, 'fila'); assert.equal(estado.aguardaCota, true); assert.equal(chamadas.length, 0)
  assert.ok(await ator.ctx.storage.getAlarm() > Date.now())
  await mudarDoc(env, 'hall-cota', () => ({ dia: 'ontem', chaves: [] }), {})
  const anterior = globalThis.fetch
  globalThis.fetch = async () => new Response(referencia)
  try { await ator.alarm() } finally { globalThis.fetch = anterior }
  estado = (await pedir('GET', '/hall', { quem: id })).dados
  assert.equal(estado.estado, 'aprovada'); assert.equal(chamadas.length, 1); assert.equal(estado.tentativasGeracao, 1)
})

test('codec decodifica ambas as camisas WebP reais e reduz referências abaixo de 512', async () => {
  for (const cor of ['escura', 'clara']) {
    const imagem = await decodificarHall(readFileSync(new URL(`../../../public/assets/hall/jogador-${cor}.webp`, import.meta.url)))
    const marca = reduzirHall(detalheMarcaHall(imagem), 480, true)
    assert.ok(Math.min(marca.width, marca.height) >= 64)
    assert.ok(Math.max(marca.width, marca.height) <= 480)
    assert.equal(marca.data.length, marca.width * marca.height * 4)
    const pequena = reduzirHall(imagem)
    assert.ok(Math.max(pequena.width, pequena.height) <= 480)
    assert.equal((await decodificarHall(pngHall(pequena))).width, pequena.width)
  }
})

test('franquia Cloudflare esgotada agenda amanhã sem fallback nem perder a aprovação', async () => {
  const { env, pedir } = ambiente(), id = '76561198000000956'
  let chamadas = 0
  env.AI = { run: async () => { chamadas++; throw Object.assign(new Error('3036: daily free allocation'), { code: 3036 }) } }
  const pedido = (await pedir('POST', '/hall', { quem: id, corpo: { foto, camisa: 'clara' } })).dados.pedido
  await pedir('POST', '/hall/revisao', { quem: DONO, corpo: { id, pedido, acao: 'aprovar' } })
  const anterior = globalThis.fetch
  globalThis.fetch = async url => { assert.match(String(url), /\/assets\/hall\//); return new Response(referencia) }
  try { await env.HALL_RETRATOS.instancia(id).alarm() } finally { globalThis.fetch = anterior }
  const d = (await pedir('GET', '/hall', { quem: id })).dados
  assert.equal(d.estado, 'fila'); assert.equal(d.aguardaCota, true); assert.equal(chamadas, 1)
  assert.ok(d.retomarEm > Date.now()); assert.equal(d.tentativasGeracao, 1)
})

test('recorte rejeita fundo incorreto e preserva verde interno separado da borda', () => {
  const width = 20, height = 20, data = new Uint8Array(1600)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    data[i + 3] = 255
    if (x < 4 || x > 15 || y < 4 || y > 15 || (x === 10 && y === 10)) data[i + 1] = 255
    else data[i] = 180
  }
  const r = recortarHall({ width, height, data })
  assert.equal(r.data[3], 0); assert.equal(r.data[(10 * width + 10) * 4 + 3], 255)
  assert.throws(() => recortarHall({ width, height, data: new Uint8Array(1600) }), /hall-recorte/)
})
