// Preço das caixas da loja: o que se espera ganhar ao abrir (valor de venda médio, simulado com a mesma dificuldade por valor que o sorteio de verdade usa)
// vezes uma margem da casa, e nunca abaixo de um piso (as caixas de adesivo/amuleto têm valor esperado minúsculo e ficariam de graça).
// Usado por gerar-precos.mjs e por recalcular-preco-caixas.mjs.
import { CONFIG_PADRAO, definirValorador, precoDeMercado, rndSeguro, sortearAbertura } from '../worker/steam-login/src/loja-core.js'

export const MARGEM = 1.6 // em média o jogador recebe ~62% do que gasta, em valor de venda
export const PISO_POR_TIER = { barata: 150, media: 250, premium: 400 }
export const PISO_AMULETOS = 100 // Fliperama, Kawaii, Terror, Espacial e Lendas (só adesivos/amuletos)
const SO_AMULETOS = new Set(['caixa-fliperama', 'caixa-kawaii', 'caixa-terror', 'caixa-espacial', 'caixa-lendas'])

export function precoDasCaixas(caixasIniciais, skins, adesivos, chaveiros, simulacoes = 60000) {
  const valor = (it) => (it.t === 'adesivo' ? adesivos[it.d] : it.t === 'chaveiro' ? chaveiros[it.d] : precoDeMercado(it, skins)) || 0
  // a mesma dificuldade do sorteio de verdade (loja.js: definirValorador)
  definirValorador((x) => {
    if (x.t === 'adesivo') return adesivos[x.d] || 0
    if (x.t === 'chaveiro') return chaveiros[x.d] || 0
    const f = Math.min(0.45, ((Number.isFinite(x.min) ? x.min : 0) + (Number.isFinite(x.max) ? x.max : 1)) / 2)
    return precoDeMercado({ ...x, f, st: 0 }, skins) || 0
  })
  const precos = {}
  const tabela = []
  for (const cx of caixasIniciais) {
    let soma = 0
    for (let i = 0; i < simulacoes; i++) soma += valor(sortearAbertura(cx, CONFIG_PADRAO, rndSeguro).item)
    const esperado = soma / simulacoes
    const piso = SO_AMULETOS.has(cx.slug) ? PISO_AMULETOS : PISO_POR_TIER[cx.tier] || 150
    const bruto = Math.max(piso, esperado * MARGEM)
    const passo = bruto < 1000 ? 10 : 50
    precos[cx.slug] = Math.max(10, Math.round(bruto / passo) * passo)
    tabela.push({ nome: cx.nome, antes: cx.preco, depois: precos[cx.slug], esperado })
  }
  return { precos, tabela }
}
