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
