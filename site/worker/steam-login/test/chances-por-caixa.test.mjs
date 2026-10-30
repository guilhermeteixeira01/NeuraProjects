import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_PADRAO, definirValorador, chancesDaCaixa, sortearAbertura, aplicarModo } from '../src/loja-core.js'

test('chances próprias variam com a caixa e correspondem ao sorteio, inclusive nos modos', () => {
  definirValorador(it => it.d === 1 ? 10 : 1000)
  try {
    const cfg = { ...CONFIG_PADRAO, porCaixa: true }
    const barata = { preco: 20, itens: [{ d: 1, p: 0, r: 0, w: 1 }, { d: 2, p: 0, r: 4, w: 1 }], facas: [] }
    const cara = { ...barata, preco: 1000 }
    const chances = chancesDaCaixa(barata, cfg)
    assert.ok(chances.itens[1] < chancesDaCaixa(cara, cfg).itens[1])
    for (const modo of [undefined, 'jester', 'boost']) {
      const { caixa, cfg: config } = aplicarModo(cara, cfg, modo)
      const publicadas = chancesDaCaixa(caixa, config)
      assert.ok(Math.abs(publicadas.itens.reduce((a, b) => a + b, 0) - 100) < 0.00001)
      let contador = 0
      for (let k = 0; k < 10000; k++) {
        let chamada = 0
        const rnd = () => chamada++ === 0 ? (k + 0.5) / 10000 : 0.5
        if (sortearAbertura(caixa, config, rnd).indice === 1) contador++
      }
      assert.ok(Math.abs(contador / 100 - publicadas.itens[1]) < 0.011)
      if (modo === 'jester') assert.deepEqual(publicadas.itens, [50, 50])
    }
  } finally { definirValorador(null) }
})
