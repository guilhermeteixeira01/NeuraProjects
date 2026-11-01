import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'

const QUEM = '76561198000000742'

test('a C4 vem pronta, equipada no TR, e só aceita adesivos e chaveiro', async () => {
  const f = ambiente()
  await f.pedir('GET', '/eu', { quem: QUEM })
  const inv = (await f.pedir('GET', '/skins', { quem: QUEM })).dados
  assert.equal(inv.itens.c4.d, 49)
  assert.equal(inv.itens.c4.p, 0)
  assert.equal(inv.equip.tr['49'], 'c4')
  assert.equal(inv.equip.ct['49'], undefined)

  // tentar tirar do TR, pôr no CT e mudar o desgaste: nada disso vale; adesivo e chaveiro não são mudados sem ter o item guardado
  delete inv.equip.tr['49']
  inv.equip.ct['49'] = 'c4'
  inv.itens.c4.f = 0.9
  inv.itens.c4.cadeado = false
  const r = (await f.pedir('POST', '/skins', { quem: QUEM, corpo: inv })).dados
  assert.equal(r.equip.tr['49'], 'c4')
  assert.equal(r.equip.ct['49'], undefined)
  assert.equal(r.itens.c4.f, 0.0001)
  assert.equal(r.itens.c4.cadeado, true)

  // não dá para criar outra C4 nem mandar o item c4 como outra arma
  inv.itens.outro = { t: 'arma', d: 49, p: 0, f: 0.1, s: 0 }
  inv.itens.c4 = { ...inv.itens.c4, d: 7 }
  const r2 = (await f.pedir('POST', '/skins', { quem: QUEM, corpo: inv })).dados
  assert.equal(r2.itens.outro, undefined)
  assert.equal(r2.itens.c4.d, 49)

  // excluir não tira a C4
  await f.pedir('POST', '/skins/excluir', { quem: QUEM, corpo: { id: 'c4' } })
  assert.equal((await f.pedir('GET', '/skins', { quem: QUEM })).dados.itens.c4.d, 49)
})
