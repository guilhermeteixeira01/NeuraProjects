import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento } from './ambiente.mjs'
import { Presenca } from '../src/amigos.js'

const a = '76561198000000011', b = '76561198000000012', adm = '76561198000000099'
function preparar() {
  const storage = armazenamento()
  const enviados = []
  const objeto = Object.create(Presenca.prototype)
  Object.assign(objeto, { state: { storage, getWebSockets: () => [{ send: (t) => enviados.push(JSON.parse(t)) }] }, env: ambiente().env, ultimoGlobal: new Map() })
  return { objeto, storage, enviados }
}
const pedir = (o, eu, corpo, admin = false) =>
  o.chatGlobal(new Request('https://presenca/chat-global', { method: corpo ? 'POST' : 'GET', headers: { 'X-Id': eu || '', 'X-Admin': admin ? '1' : '0' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) }))

test('mensagem entra limpa, vai para todas as abas e aparece na leitura', async () => {
  const { objeto, enviados } = preparar()
  await pedir(objeto, a, { acao: 'enviar', texto: '  oi <b>galera</b>\n ' })
  const { mensagens } = await pedir(objeto, null)
  assert.equal(mensagens.length, 1)
  assert.equal(mensagens[0].texto, 'oi b galera /b')
  assert.equal(mensagens[0].de, a)
  assert.equal(enviados[0].tipo, 'chat-global')
})

test('limite de 1 mensagem por segundo e texto vazio recusado', async () => {
  const { objeto } = preparar()
  await pedir(objeto, a, { acao: 'enviar', texto: 'um' })
  await assert.rejects(pedir(objeto, a, { acao: 'enviar', texto: 'dois' }), /devagar/)
  await assert.rejects(pedir(objeto, b, { acao: 'enviar', texto: '   ' }), /mensagem/)
})

test('só admin apaga, silencia e fixa; silenciado não escreve e some do chat', async () => {
  const { objeto } = preparar()
  await pedir(objeto, a, { acao: 'enviar', texto: 'spam' })
  const [m] = (await pedir(objeto, null)).mensagens
  await assert.rejects(pedir(objeto, b, { acao: 'apagar', id: m.id }), /admin/)
  await pedir(objeto, adm, { acao: 'silenciar', id: a, minutos: 5 }, true)
  assert.equal((await pedir(objeto, null)).mensagens.length, 0)
  objeto.ultimoGlobal.clear()
  await assert.rejects(pedir(objeto, a, { acao: 'enviar', texto: 'de novo' }), /silenciado/)
  await pedir(objeto, adm, { acao: 'fixar', texto: 'Torneio sábado!', tom: 'torneio' }, true)
  assert.deepEqual((await pedir(objeto, null)).fixado.texto, 'Torneio sábado!')
  await pedir(objeto, adm, { acao: 'fixar', texto: '' }, true)
  assert.equal((await pedir(objeto, null)).fixado, null)
})
