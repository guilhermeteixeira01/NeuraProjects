import test from 'node:test'
import assert from 'node:assert/strict'
import { montarConexaoCs2 } from '../src/comum/conexaoCs2.js'

test('o botão seleciona o CS2 e conecta ao mesmo endereço usado no console', () => {
  const c = montarConexaoCs2(' 185.219.189.45:27015 ')
  assert.equal(c.comando, 'connect 185.219.189.45:27015')
  assert.equal(decodeURIComponent(c.url), 'steam://run/730//+connect 185.219.189.45:27015/')
  assert.ok(!c.url.startsWith('steam://connect/'))
})

test('aplica a senha antes de conectar e preserva caracteres especiais na URL', () => {
  const senha = 'teste com espaço &/#%'
  const c = montarConexaoCs2('servidor.example:27015', senha)
  assert.equal(c.comando, `password ${JSON.stringify(senha)}; connect servidor.example:27015`)
  assert.equal(decodeURIComponent(c.url), `steam://run/730//+password ${JSON.stringify(senha)} +connect servidor.example:27015/`)
  assert.ok(!c.url.includes(' '))
  assert.ok(!c.url.includes('#'))
})

test('não gera comandos sem endereço ou com comandos extras no endereço', () => {
  for (const endereco of ['', null, '   ', '127.0.0.1:27015; quit', '127.0.0.1\nquit']) assert.equal(montarConexaoCs2(endereco), null)
})
