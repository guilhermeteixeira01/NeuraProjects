import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { pedirAoJogador } from '../src/objetos.js'
import { limparCatalogo } from '../src/loja-oficial.js'

const A = '76561198000000961', B = '76561198000000962'
const MOLDURA = 'times/furia', CARD = 'neura/neura-ouro.svg'
const catalogo = { consumiveis: { boost: 300, freeze: 200 }, itens: [{ tipo: 'moldura', id: MOLDURA, preco: 500 }], kits: [{ id: 'kit-neura', nome: 'Kit Neura', moldura: 'times/navi', card: CARD, fundo: 'nuke', preco: 900 }] }
const darNp = (env, id, valor) => pedirAoJogador(env, id, { acao: 'creditar', valor })

test('catálogo descarta preço zero, id que não existe e item repetido', () => {
  const c = limparCatalogo({ consumiveis: { boost: 0 }, itens: [{ tipo: 'moldura', id: MOLDURA, preco: 10 }, { tipo: 'moldura', id: MOLDURA, preco: 20 }, { tipo: 'moldura', id: 'nao/existe', preco: 5 }, { tipo: 'fundo', id: 'nuke', preco: 0 }], kits: [{ nome: 'vazio', preco: 10 }] })
  assert.deepEqual(c.consumiveis, { boost: 0, freeze: 1500 })
  assert.deepEqual(c.itens, [{ tipo: 'moldura', id: MOLDURA, preco: 10 }])
  assert.deepEqual(c.kits, [])
})

test('comprar Boost cobra NP e põe o item no lobby', async () => {
  const { pedir, env } = ambiente()
  assert.equal((await pedir('POST', '/admin/loja-oficial', { quem: A, corpo: catalogo })).status, 403)
  assert.equal((await pedir('POST', '/admin/loja-oficial', { quem: env.DONO, corpo: catalogo })).status, 200)
  assert.equal((await pedir('POST', '/loja/oficial/comprar', { quem: A, corpo: { tipo: 'boost', qtd: 2 } })).status, 409) // sem saldo
  await darNp(env, A, 1000)
  const r = await pedir('POST', '/loja/oficial/comprar', { quem: A, corpo: { tipo: 'boost', qtd: 2 } })
  assert.equal(r.status, 200)
  assert.equal(r.dados.consumiveis.boost, 2)
  assert.equal(r.dados.saldo, 400)
  assert.equal((await pedir('GET', '/loja/consumiveis', { quem: A })).dados.boost, 2)
})

test('enfeite à venda fica travado no perfil até comprar; kit libera os três', async () => {
  const { pedir, env } = ambiente()
  await pedir('POST', '/admin/loja-oficial', { quem: env.DONO, corpo: catalogo })
  assert.equal((await pedir('POST', '/perfil', { quem: B, corpo: { moldura: MOLDURA } })).status, 403)
  assert.equal((await pedir('POST', '/perfil', { quem: B, corpo: { fundoPerfil: 'nuke' } })).status, 403)
  await darNp(env, B, 2000)
  assert.equal((await pedir('POST', '/loja/oficial/comprar', { quem: B, corpo: { tipo: 'moldura', id: MOLDURA } })).status, 200)
  assert.equal((await pedir('POST', '/loja/oficial/comprar', { quem: B, corpo: { tipo: 'moldura', id: MOLDURA } })).status, 409) // já tem
  assert.equal((await pedir('POST', '/perfil', { quem: B, corpo: { moldura: MOLDURA } })).status, 200)
  const kit = await pedir('POST', '/loja/oficial/comprar', { quem: B, corpo: { tipo: 'kit', id: 'kit-neura' } })
  assert.equal(kit.status, 200)
  assert.equal(kit.dados.saldo, 600)
  assert.deepEqual(kit.dados.possui, { moldura: [MOLDURA, 'times/navi'], card: [CARD], fundo: ['nuke'] })
  assert.equal((await pedir('POST', '/perfil', { quem: B, corpo: { fundoPerfil: 'nuke', card: CARD } })).status, 200)
  const ler = await pedir('GET', '/loja/oficial', { quem: B })
  assert.equal(ler.dados.catalogo.kits[0].id, 'kit-neura')
})
