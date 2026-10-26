import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento, ranking } from './ambiente.mjs'
const { Loja, lerCaixas } = await import('../src/loja.js')
const { sortearEspecial, CONFIG_PADRAO, rndSeguro, gerarFaixa, gerarFaixaFacas } = await import('../src/loja-core.js')
const ID = '76561198000000011'
ranking.jogadores = [{ steamId: ID, pontos: 1000000, mapas: 1 }]
const { env } = ambiente()
const caixas = await lerCaixas(env)

test('toda caixa elegível tem garantia válida e animação aponta para o item premiado', () => {
  for (const c of caixas.filter((c) => c.itens.some((it) => !['adesivo', 'chaveiro'].includes(it.t)))) {
    for (let i = 0; i < 10; i++) {
      const ganhou = sortearEspecial(c, CONFIG_PADRAO, rndSeguro)
      assert.ok(['faca', 'luva'].includes(ganhou.item.t), c.slug)
      const faixa = gerarFaixa(c, CONFIG_PADRAO, ganhou, rndSeguro)
      if (ganhou.raridade === 5) {
        assert.equal(faixa.itens[faixa.alvo].r, 5)
        const especial = gerarFaixaFacas(c, ganhou, rndSeguro)
        assert.equal(c.facas[especial.itens[especial.alvo]].d, ganhou.item.d)
      } else assert.equal(c.itens[faixa.itens[faixa.alvo].i].d, ganhou.item.d)
    }
  }
})

test('aberturas individuais atravessando 100/200 garantem o item no lugar exato e gravam o contador junto com o inventário', async () => {
  const caixa = caixas.find((c) => c.slug === 'caixa-armas-ak-47')
  for (const [antes, qtd, indice, modo] of [[98, 3, 1, null], [99, 2, 0, 'jester'], [199, 1, 0, 'boost']]) {
    const storage = armazenamento()
    const loja = new Loja({ storage }, env)
    for (let i = 0; i < antes; i++) loja.registrarAbertura([i, caixa.slug, 'arma', 7, 44, 0, .1, 0])
    const resultados=[]
    let dados
    for(let k=0;k<qtd;k++) {
      dados=await loja.acao({acao:'abrir',id:ID,caixa:caixa.id,qtd:1,origem:'direto',modo})
      assert.equal(dados.resultados.length,1)
      resultados.push(...dados.resultados)
    }
    assert.equal(dados.aberturasEspecial, antes + qtd)
    assert.equal(resultados.filter((r) => r.especial).length, 1)
    const premio = resultados[indice]
    assert.ok(premio.especial && ['faca', 'luva'].includes(premio.item.t))
    const inv = (await loja.invLer(ID)).inv
    assert.equal(inv.itens[premio.id].d, premio.item.d)
    assert.equal(inv.itens[premio.id].t, premio.item.t)
    new Loja({ storage }, env)
    assert.equal(loja.abertasParaEspecial(), antes + qtd)
  }
})

test('adesivos/chaveiros não gastam o marco reservado à próxima caixa de arma', async () => {
  const storage = armazenamento()
  const loja = new Loja({ storage }, env)
  const arma = caixas.find((c) => c.slug === 'caixa-armas-ak-47')
  const adesivos = caixas.find((c) => c.slug === 'caixa-stickers-stickers-classicos')
  for (let i = 0; i < 99; i++) loja.registrarAbertura([i, arma.slug, 'arma', 7, 44, 0, .1, 0])
  const enfeites = await loja.acao({ acao: 'abrir', id: ID, caixa: adesivos.id, qtd: 3, origem: 'direto' })
  assert.equal(enfeites.aberturasEspecial, 99)
  assert.ok(enfeites.resultados.every((r) => !r.especial))
  const r = await loja.acao({ acao: 'abrir', id: ID, caixa: arma.id, qtd: 1, origem: 'direto' })
  assert.ok(r.resultados[0].especial)
  assert.ok(['faca', 'luva'].includes(r.resultados[0].item.t))
  assert.equal(r.aberturasEspecial, 100)
})
