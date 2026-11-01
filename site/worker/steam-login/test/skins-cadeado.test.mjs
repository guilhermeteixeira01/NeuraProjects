import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'

const QUEM = '76561198000000741', senha = 'senha-segura-123'
async function fixture() {
  const f = ambiente()
  await f.pedir('GET', '/eu', { quem: QUEM })
  await f.pedir('POST', '/conta/senha', { quem: QUEM, corpo: { senha } })
  const criar = async () => (await f.pedir('POST', '/admin/skin', { quem: DONO, corpo: { id: QUEM, item: { t: 'arma', d: 7, p: 44, f: .1, s: 40 } } })).dados.id
  const livre = await criar(), protegido = await criar()
  const ler = async () => (await f.pedir('GET', '/skins', { quem: QUEM })).dados
  const inv = await ler()
  inv.itens[protegido].cadeado = true
  assert.equal((await f.pedir('POST', '/skins', { quem: QUEM, corpo: inv })).status, 200)
  return { ...f, livre, protegido, ler }
}

test('cadeado persiste e permite equipar a skin', async () => {
  const f = await fixture(), inv = await f.ler()
  assert.equal(inv.itens[f.protegido].cadeado, true)
  inv.equip.tr['7'] = f.protegido
  const r = await f.pedir('POST', '/skins', { quem: QUEM, corpo: inv })
  assert.equal(r.status, 200)
  assert.equal(r.dados.equip.tr['7'], f.protegido)
  assert.equal(r.dados.itens[f.protegido].cadeado, true)
})

test('cadeado impede venda rápida em lote sem remover itens nem alterar saldo', async () => {
  const f = await fixture()
  const saldo = (await f.pedir('GET', '/loja/saldo', { quem: QUEM })).dados.saldo
  const r = await f.pedir('POST', '/loja/vender', { quem: QUEM, corpo: { ids: [f.livre, f.protegido], senha } })
  assert.equal(r.status, 409)
  assert.equal(r.dados.erro, 'item-trancado')
  const inv = await f.ler()
  assert.ok(inv.itens[f.livre]); assert.ok(inv.itens[f.protegido])
  assert.equal((await f.pedir('GET', '/loja/saldo', { quem: QUEM })).dados.saldo, saldo)
})

test('cadeado impede anúncio; remover cadeado libera venda', async () => {
  const f = await fixture()
  const r = await f.pedir('POST', '/mercado/anunciar', { quem: QUEM, corpo: { id: f.protegido, preco: 150, nome: 'AK-47', senha } })
  assert.equal(r.status, 409)
  assert.equal(r.dados.erro, 'item-trancado')
  const inv = await f.ler()
  delete inv.itens[f.protegido].cadeado
  assert.equal((await f.pedir('POST', '/skins', { quem: QUEM, corpo: inv })).status, 200)
  const venda = await f.pedir('POST', '/loja/vender', { quem: QUEM, corpo: { ids: [f.protegido], senha } })
  assert.equal(venda.status, 200)
  assert.equal(venda.dados.inv.itens[f.protegido], undefined)
})
