import test from 'node:test'
import assert from 'node:assert/strict'
import { criarConsultaStatusCs2 } from '../src/status-cs2.js'
const base = { consultarNota: async () => null, agora: () => 100000 }

test('sinal recente do plugin confirma online sem agente da VPS', async () => {
  const ler = criarConsultaStatusCs2({ ...base, consultarSinal: async () => 99000 })
  const { servidor } = await ler({})
  assert.equal(servidor.online, true)
  assert.equal(servidor.fonte, 'plugin')
  assert.equal(servidor.atualizando, false)
})

test('sinal ausente, antigo ou futuro não inventa parada nem manutenção', async () => {
  for (const visto of [0, 1000, 55000, 100001]) {
    const ler = criarConsultaStatusCs2({ ...base, consultarSinal: async () => visto })
    const { servidor } = await ler({})
    assert.equal(servidor.online, null)
    assert.equal(servidor.atualizando, false)
  }
})

test('notícias lentas não atrasam status e consultas concorrentes compartilham notícias', async () => {
  let liberar, chamadas = 0
  const noticia = new Promise(r => { liberar = r })
  const ler = criarConsultaStatusCs2({ ...base, consultarSinal: async () => 99000, consultarNota: () => { chamadas++; return noticia } })
  const tarefas = [], ctx = { waitUntil: p => tarefas.push(p) }
  const [a, b] = await Promise.all([ler({}, ctx), ler({}, ctx)])
  assert.equal(a.servidor.online, true)
  assert.equal(b.servidor.online, true)
  assert.equal(chamadas, 1)
  liberar(null)
  await Promise.all(tarefas)
})

test('ausência ou falha do plugin mantém status desconhecido', async () => {
  const ler = criarConsultaStatusCs2(base)
  assert.equal((await ler({})).servidor.online, null)
  const env = { PRESENCA: { idFromName: () => 'global', get: () => ({ fetch: async () => { throw Error('indisponível') } }) } }
  assert.equal((await ler(env)).servidor.online, null)
})
