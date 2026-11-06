import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { linkFaceitPerfil, linkSteamPerfil } from '../../../src/comum/linksPerfil.js'

const A = '76561198000000981', B = '76561198000000982'

test('Steam aponta para o jogador certo e recusa identificador inválido', () => {
  assert.equal(linkSteamPerfil(A), `https://steamcommunity.com/profiles/${A}`)
  for (const id of ['', undefined, '../outro', 'https://outro.site']) assert.equal(linkSteamPerfil(id), '')
})

test('FACEIT aceita perfil de jogador e normaliza idioma, aba e parâmetros', () => {
  assert.equal(linkFaceitPerfil('https://www.faceit.com/pt/players/Meu-Nick_1'), 'https://www.faceit.com/players/Meu-Nick_1')
  assert.equal(linkFaceitPerfil('https://faceit.com/en/players/teste/stats/cs2?ref=x#stats'), 'https://www.faceit.com/players/teste')
  assert.equal(linkFaceitPerfil('https://www.faceit.com/players/teste/'), 'https://www.faceit.com/players/teste')
})

test('FACEIT sem conta, rota vazia, domínio falso e protocolos inválidos não habilitam link', () => {
  for (const url of ['', null, 'teste', 'https://www.faceit.com', 'https://faceit.com/pt/players/', 'https://faceit.com/pt/teams/time', 'http://faceit.com/players/teste', 'javascript:alert(1)', 'https://faceit.com.evil.test/players/teste', 'https://faceit.com@evil.test/players/teste', 'https://evil.test@faceit.com/players/teste', 'https://faceit.com:8080/players/teste', 'https://faceit.com/players/%2Foutro']) assert.equal(linkFaceitPerfil(url), '', String(url))
})

test('link salvo aparece no perfil do alvo; remover o link desativa a vinculação', async () => {
  const f = ambiente()
  const salvar = faceit => f.pedir('POST', '/conta/dados', { quem: A, corpo: { faceit } })
  assert.equal((await salvar('https://faceit.com/pt/players/MeuNick/stats/cs2?ref=teste')).status, 200)
  assert.equal((await f.pedir('GET', `/perfil/publico?id=${A}`, { quem: B })).dados.faceit, 'https://www.faceit.com/players/MeuNick')
  assert.equal((await salvar('https://faceit.com/pt/players/')).status, 400)
  assert.equal((await salvar('https://example.com/players/falso')).status, 400)
  assert.equal((await salvar('')).status, 200)
  assert.equal((await f.pedir('GET', `/perfil/publico?id=${A}`, { quem: B })).dados.faceit, '')
})
