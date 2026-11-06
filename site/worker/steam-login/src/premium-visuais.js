// Benefícios permanentes do catálogo; não dependem da configuração do painel.
export const MOLDURA_PREMIUM = 'premium/neura-premium'
export const CARD_PREMIUM = 'premium/neura-premium-anim.webp'
export const VISUAIS_PREMIUM = {
  molduraSub: { [MOLDURA_PREMIUM]: 'subscriber' },
  cardSub: { [CARD_PREMIUM]: 'subscriber' },
}
export const exigePremiumVisual = (tabela, id) => !!VISUAIS_PREMIUM[tabela]?.[id] || (tabela === 'cardSub' && id === 'neura-premium-anim.webp')
