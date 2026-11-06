// ID reservado: esta caixa é um benefício da conta, fora do catálogo editável.
export const CAIXA_PREMIUM = {
  id: 90001, slug: 'caixa-premium', nome: 'Caixa Premium',
  img: '/assets/caixas/web/caixa-premium.webp?v=20261106', cor: '#6ab8ff',
  ativa: true, arquivada: true, premium: true, preco: 0, facas: [],
  itens: [
    { id: 'awp-printstream', nome: 'AWP | Printstream', d: 9, p: 1206, l: 0, r: 4, w: 1, min: 0, max: 1 },
    { id: 'm4a1s-printstream', nome: 'M4A1-S | Printstream', d: 60, p: 984, l: 1, r: 4, w: 1, min: 0, max: 0.8 },
    { id: 'ak-bloodsport', nome: 'AK-47 | Bloodsport', d: 7, p: 639, l: 1, r: 4, w: 1, min: 0, max: 0.45 },
  ],
}
export const ehCaixaPremium = item => item?.t === 'caixa' && item.d === CAIXA_PREMIUM.id
