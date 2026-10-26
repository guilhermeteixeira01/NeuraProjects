import test from 'node:test'
import assert from 'node:assert/strict'
import { criarAtualizador } from '../../../src/comum/atualizador.js'
const adiar = () => { let resolver; const promessa = new Promise((r) => { resolver = r }); return { promessa, resolver } }
test('leituras simultâneas usam um pedido; eventos durante ele refazem imediatamente sem aplicar resposta antiga', async () => {
  const primeira = adiar(), segunda = adiar(), aplicadas = []
  let chamadas = 0
  const a = criarAtualizador({ ler: () => (++chamadas === 1 ? primeira.promessa : segunda.promessa), aplicar: (d) => aplicadas.push(d) })
  const p = a.carregar()
  assert.equal(a.carregar(), p)
  a.atualizar(); a.atualizar(); a.atualizar()
  primeira.resolver('antigo')
  await new Promise(setImmediate)
  assert.equal(chamadas, 2)
  assert.deepEqual(aplicadas, [])
  segunda.resolver('novo'); await p
  assert.deepEqual(aplicadas, ['novo'])
})
test('ação confirmada ou logout invalida resposta em andamento', async () => {
  const consulta = adiar(), aplicadas = []
  const a = criarAtualizador({ ler: () => consulta.promessa, aplicar: (d) => aplicadas.push(d) })
  const p = a.carregar(); a.descartar(); consulta.resolver('conta anterior'); await p
  assert.deepEqual(aplicadas, [])
})
test('falha não prende as próximas consultas', async () => {
  const erros = [], aplicadas = []; let n = 0
  const a = criarAtualizador({ ler: async () => { if (!n++) throw new Error('rede'); return 'recuperou' }, aplicar: (d) => aplicadas.push(d), aoErro: (e) => erros.push(e.message) })
  await a.carregar(); await a.atualizar()
  assert.deepEqual(erros, ['rede']); assert.deepEqual(aplicadas, ['recuperou'])
})
