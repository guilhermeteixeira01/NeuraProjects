// Padrões raros por seed (worker: valor dos itens em loja.js; site: selo nos cartões). Fica fora do loja-core.js porque o site importa o
// loja-core em todas as páginas (insignias.js) e a tabela (padroes-raros.json) só precisa ir para as páginas que mostram skins.
import PADROES from './padroes-raros.json' with { type: 'json' }

// ── Padrões raros (Blue Gem, Fade 97%+, Fire & Ice): a pintura (paint seed) de certas skins vale muito mais que a mesma skin com outro padrão ──
// padroes-raros.json: por "<def>:<pintura>", os seeds de cada tier (1 a 4; "mesmasSeeds" usa os de outra chave) e o multiplicador de cada
// tier (o da arma, se tiver, senão o geral; as facas têm o próprio, menor). Devolve null se o item não tem padrão raro.
// { tier, rotulo, mult, nome, curto }: o valor de venda e o de referência do mercado são multiplicados por "mult", e a tela mostra o selo
// (curto: o texto do selo, ex. "Blue Gem T1", "Fade 99%").
export function padraoRaro(item) {
  if (!item || (item.t && item.t !== 'arma' && item.t !== 'faca')) return null
  const reg = PADROES.padroes[`${item.d}:${item.p}`]
  if (!reg || item.s == null) return null
  const tiers = reg.tiers || PADROES.padroes[reg.mesmasSeeds]?.tiers || {}
  const seed = Number(item.s)
  for (const tier of ['1', '2', '3', '4']) {
    if (tiers[tier]?.includes(seed)) {
      const mult = reg.destaque?.[seed] ?? reg.multiplicador?.[tier] ?? PADROES.multiplicador[tier]
      const curto = reg.nomes?.[tier] || `${reg.rotulo} T${tier}`
      return { tier: Number(tier), rotulo: reg.rotulo, mult, nome: reg.nomes?.[tier] || `${reg.rotulo} Tier ${tier}`, curto, arma: reg.arma, seed }
    }
  }
  return null
}
