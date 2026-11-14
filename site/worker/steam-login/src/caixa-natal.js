// Caixa "Presente da Neura" (Natal na Neura 2026): recompensa do evento, fora do catálogo editável (como a Caixa Premium).
// Só dá facas e luvas: os itens são os das caixas de fábrica de facas e de luvas (caixas-iniciais.json), com os mesmos pesos e
// desgastes. Arquivada = não aparece à venda na loja; abre normalmente quem tem uma no inventário (sorteio de loja-core.js).
import CAIXAS_INICIAIS from './caixas-iniciais.json'
import { CAIXA_NATAL_ID, CAIXA_NATAL_SLUG } from './natal-2026-core.js'

const itensDe = (slug) => CAIXAS_INICIAIS.find((c) => c.slug === slug)?.itens || []
const itens = [...itensDe('caixa-extras-facas'), ...itensDe('caixa-extras-luvas')].filter((i) => i.t === 'faca' || i.t === 'luva')
// Sem facas e luvas a caixa não pode existir (sairia outra coisa ou nada): falha logo, no deploy, em vez de entregar caixa vazia
if (!itens.some((i) => i.t === 'faca') || !itens.some((i) => i.t === 'luva')) throw new Error('caixa-natal: faltam as facas ou as luvas das caixas de fábrica')

export const CAIXA_NATAL = {
  id: CAIXA_NATAL_ID, slug: CAIXA_NATAL_SLUG, nome: 'Presente da Neura',
  img: '/assets/caixas/web/presente-da-neura.webp', cor: '#b3262d',
  ativa: true, arquivada: true, evento: 'natal-2026', tier: 'premium', preco: 2150,
  itens, facas: [],
}
export const ehCaixaNatal = (item) => item?.t === 'caixa' && item.d === CAIXA_NATAL_ID
