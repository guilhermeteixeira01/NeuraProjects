import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { pedirAoJogador } from '../src/objetos.js'
import { limparCatalogo, lerCatalogo } from '../src/loja-oficial.js'
import { mudarPerfil, lerPerfil } from '../src/perfis.js'

const A = '76561198000000961', B = '76561198000000962'
const MOLDURA = 'times/furia', CARD = 'neura/neura-ouro.svg'
const catalogo = { consumiveis: { boost: 300, freeze: 200 }, itens: [{ tipo: 'moldura', id: MOLDURA, preco: 500 }], kits: [{ id: 'kit-neura', nome: 'Kit Neura', moldura: 'times/navi', card: CARD, fundo: 'nuke', preco: 900 }] }
const darNp = (env, id, valor) => pedirAoJogador(env, id, { acao: 'creditar', valor })

test('catálogo vê publicação de outro worker mesmo com a leitura anterior em cache', async () => {
  const { pedir, env } = ambiente()
  await pedir('POST', '/admin/loja-oficial', { quem: env.DONO, corpo: catalogo })
  assert.equal((await lerCatalogo(env)).itens[0].preco, 500)
  // Grava diretamente no objeto compartilhado, sem invalidar a memória deste worker.
  const dados = env.DADOS.instancia('global')
  const { itens } = await dados.ler('docs', ['loja-oficial'])
  const novo = { ...catalogo, itens: [{ tipo: 'moldura', id: MOLDURA, preco: 750 }] }
  await dados.gravar('docs', [{ id: 'loja-oficial', ver: itens[0][1], dados: JSON.stringify(novo) }])
  assert.equal((await lerCatalogo(env)).itens[0].preco, 750)
})

test('publicar catálogo retira enfeites sem compra, inclusive kits, e preserva os comprados', async () => {
  const { pedir, env } = ambiente()
  await mudarPerfil(env, A, { moldura: MOLDURA, molduraLivre: true, card: CARD, fundoPerfil: 'nuke', tema: 'escuro' })
  await mudarPerfil(env, B, { moldura: MOLDURA })
  await pedir('POST', '/admin/loja-oficial', { quem: env.DONO, corpo: catalogo })
  await darNp(env, B, 1000)
  await pedir('POST', '/loja/oficial/comprar', { quem: B, corpo: { tipo: 'moldura', id: MOLDURA } })
  await mudarPerfil(env, A, { moldura: MOLDURA, molduraLivre: true, card: CARD, fundoPerfil: 'nuke' })
  await mudarPerfil(env, B, { moldura: MOLDURA })
  const r = await pedir('POST', '/admin/loja-oficial', { quem: env.DONO, corpo: catalogo })
  assert.equal(r.status, 200)
  assert.deepEqual(await lerPerfil(env, A), { tema: 'escuro' })
  assert.equal((await lerPerfil(env, B)).moldura, MOLDURA)
  // Contas antigas também são corrigidas no próximo acesso.
  await mudarPerfil(env, A, { card: CARD })
  assert.equal((await pedir('GET', '/eu', { quem: A })).status, 200)
  assert.equal((await lerPerfil(env, A)).card, undefined)
})

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
