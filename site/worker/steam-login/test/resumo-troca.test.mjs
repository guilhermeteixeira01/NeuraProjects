import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularResumoTroca } from '../../../src/comum/resumoTroca.js'

test('resume valores da troca na perspectiva de cada jogador', () => {
  assert.deepEqual(calcularResumoTroca([100, 50], [300]), { oferecido: 150, recebido: 300, diferenca: 150 })
  assert.deepEqual(calcularResumoTroca([300], [100, 50]), { oferecido: 300, recebido: 150, diferenca: -150 })
  assert.equal(calcularResumoTroca([100, 50], [150]).diferenca, 0)
})
test('presentes e propostas vazias são calculados sem alterar saldo', () => {
  assert.equal(calcularResumoTroca([350], []).diferenca, -350)
  assert.equal(calcularResumoTroca([], [350]).diferenca, 350)
  assert.equal(calcularResumoTroca([], []).diferenca, 0)
})
test('cotação ausente ou inválida não vira zero nem produz lucro falso', () => {
  for (const valor of [null, undefined, NaN, Infinity, -1, '100']) {
    assert.deepEqual(calcularResumoTroca([valor], [100]), { oferecido: null, recebido: 100, diferenca: null })
  }
  assert.equal(calcularResumoTroca([0], [0]).diferenca, 0)
})
