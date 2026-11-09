// Notificações do sino: a junção entre aparelhos nunca perde nada e o "Limpar" vale em todos.   node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { docVazio, juntar } from '../src/notif-core.js'

const n = (id, quando, extra = {}) => ({ id, titulo: id, quando, lida: false, ...extra })
test('junta aparelhos: soma as novas e a leitura de qualquer um vale', () => {
  const a = { lista: [n('x', 100), n('y', 200, { lida: true })], vistos: ['x', 'y'], limpoEm: 0 }
  const b = { lista: [n('x', 100, { lida: true }), n('z', 300, { nivel: 4 })], vistos: ['z'], limpoEm: 0 }
  const m = juntar(a, b)
  assert.deepEqual(m.lista.map((i) => i.id), ['z', 'y', 'x'])
  assert.equal(m.lista.find((i) => i.id === 'x').lida, true)
  assert.equal(m.lista.find((i) => i.id === 'z').nivel, 4)
  assert.deepEqual(m.vistos.sort(), ['x', 'y', 'z'])
})
test('Limpar vale em todos os aparelhos e um aparelho atrasado não traz as velhas de volta', () => {
  const a = { lista: [n('x', 100), n('y', 200)], vistos: ['x', 'y'], limpoEm: 0 }
  const limpo = juntar(a, { ...docVazio(), limpoEm: 250 })
  assert.equal(limpo.lista.length, 0)
  assert.equal(juntar(limpo, a).lista.length, 0)
  assert.equal(juntar(limpo, { lista: [n('novo', 400)], vistos: [], limpoEm: 0 }).lista.length, 1) // o que chega depois do limpar aparece
})
test('limite de 30 e lixo é descartado', () => {
  const lista = Array.from({ length: 50 }, (_, i) => n('i' + i, i + 1))
  assert.equal(juntar(docVazio(), { lista, vistos: [], limpoEm: 0 }).lista.length, 30)
  assert.equal(juntar(docVazio(), { lista: [null, { titulo: 'sem id' }, 5], vistos: [3], limpoEm: 'x' }).lista.length, 0)
})
test('aviso já limpo em um aparelho não volta quando outro aparelho o recria depois', () => {
  const servidor = juntar(docVazio(), { lista: [n('pontos:x', 100)], vistos: ['pontos:x'], limpoEm: 0 })
  const limpo = juntar(servidor, { ...docVazio(), limpoEm: 150 })
  // o celular ainda não tinha sincronizado e recriou o mesmo aviso com a hora de agora
  const celular = { lista: [n('pontos:x', 900)], vistos: ['pontos:x'], limpoEm: 0 }
  assert.equal(juntar(limpo, celular).lista.length, 0)
  assert.equal(juntar(celular, limpo).lista.length, 0) // a cópia do celular também some ao receber a da conta
  // aviso realmente novo continua entrando
  assert.equal(juntar(limpo, { lista: [n('pontos:y', 900)], vistos: ['pontos:y'], limpoEm: 0 }).lista.length, 1)
})
test('lida em um aparelho vale no outro mesmo com a cópia recriada', () => {
  const servidor = { lista: [n('pontos:x', 100, { lida: true })], vistos: ['pontos:x'], limpoEm: 0 }
  const celular = { lista: [n('pontos:x', 900)], vistos: ['pontos:x'], limpoEm: 0 }
  const m = juntar(servidor, celular)
  assert.equal(m.lista.length, 1)
  assert.equal(m.lista[0].lida, true)
})
