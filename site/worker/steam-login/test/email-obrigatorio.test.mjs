import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { chamarContas } from '../src/contas.js'

const id = '76561198000000931'
async function cadastrar(env) {
  await chamarContas(env, { acao: 'nick', steam: id, nick: 'Email931' })
  await chamarContas(env, { acao: 'senha', steam: id, senha: 'SenhaSegura42' })
}

test('novos cadastros exigem email depois da senha; contas existentes continuam opcionais', async () => {
  const novo = ambiente()
  novo.env.EMAIL_PRONTO = '1'
  await cadastrar(novo.env)
  let estado = await chamarContas(novo.env, { acao: 'estado', steam: id })
  assert.equal(estado.emailObrigatorio, true)
  assert.equal(estado.email, null)
  // Não depende da disponibilidade futura do provedor nem de campos enviados pelo cliente.
  novo.env.EMAIL_PRONTO = '0'
  estado = await chamarContas(novo.env, { acao: 'estado', steam: id, emailObrigatorio: false, email: 'falso@example.com' })
  assert.equal(estado.emailObrigatorio, true)
  assert.equal(estado.email, null)
  const antigo = ambiente()
  await cadastrar(antigo.env)
  antigo.env.EMAIL_PRONTO = '1'
  assert.equal((await chamarContas(antigo.env, { acao: 'estado', steam: id })).emailObrigatorio, false)
})

test('sessão antiga recebe um lembrete por dia e confirmação real remove avisos inclusive de cópia antiga', async () => {
  const { env, pedir } = ambiente()
  await cadastrar(env)
  env.EMAIL_PRONTO = '1'
  env.RESEND_API_KEY = 'teste-sem-envio-real'
  let r = await pedir('GET', '/notificacoes', { quem: id })
  assert.equal(r.status, 200)
  const avisos = r.dados.doc.lista.filter(n => n.id.startsWith('conta:email-pendente:'))
  assert.equal(avisos.length, 1)
  const copiaAntiga = r.dados.doc
  r = await pedir('POST', '/notificacoes', { quem: id, corpo: { doc: copiaAntiga } })
  assert.equal(r.dados.doc.lista.filter(n => n.id.startsWith('conta:email-pendente:')).length, 1)
  let codigo
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.resend.com/emails') {
      codigo = JSON.parse(init.body).html.match(/>(\d{6})<\/div>/)?.[1]
      return new Response('{}')
    }
    return original(url, init)
  }
  try {
    assert.equal((await pedir('POST', '/conta/email', { quem: id, corpo: { email: 'jogador@example.com' } })).status, 200)
  } finally { globalThis.fetch = original }
  assert.match(codigo, /^\d{6}$/)
  const errado = codigo === '000000' ? '111111' : '000000'
  assert.notEqual((await pedir('POST', '/conta/email/verificar', { quem: id, corpo: { codigo: errado } })).status, 200)
  assert.equal((await chamarContas(env, { acao: 'estado', steam: id })).email, null)
  assert.equal((await pedir('POST', '/conta/email/verificar', { quem: id, corpo: { codigo } })).status, 200)
  r = await pedir('POST', '/notificacoes', { quem: id, corpo: { doc: copiaAntiga } })
  assert.equal(r.dados.doc.lista.some(n => n.id.startsWith('conta:email-pendente:')), false)
  assert.ok(r.dados.doc.removidas[avisos[0].id])
  r = await pedir('POST', '/notificacoes', { quem: id, corpo: { doc: copiaAntiga } })
  assert.equal(r.dados.doc.lista.some(n => n.id.startsWith('conta:email-pendente:')), false)
})
