// Categorias das caixas da loja por franquia/tema, pelo slug (caixa-anime-kakashi → Naruto, caixa-anime-ichigo → Bleach...).
// Caixa nova de um anime: põe o personagem na lista da franquia. O que não casar com nenhum tema cai na categoria pelo conteúdo (armas, facas...).
export const TEMAS_CAIXA = [
  ['naruto', 'Naruto', 'Naruto, Sasuke, Kakashi e a Vila da Folha.', /^caixa-anime-(naruto|sasuke|kakashi|sakura|itachi|madara|obito|minato|jiraiya|gaara|hinata|shikamaru|pain|akatsuki)\b/],
  ['bleach', 'Bleach', 'Ichigo, os Hollows e a Soul Society.', /^caixa-anime-(ichigo|hollow|rukia|aizen|byakuya|kenpachi|toshiro|urahara|grimmjow|ulquiorra)\b/],
  ['anime', 'Anime', 'Skins com tema de anime.', /^caixa-anime-/],
  ['cs', 'Counter-Strike', 'Os mapas e os momentos clássicos do CS.', /^caixa-cs-/],
  ['criaturas', 'Criaturas', 'Monstros, pesadelos e bichos estranhos.', /^caixa-criaturas-/],
  ['halloween', 'Halloween', 'Abóboras, bruxas, fantasmas e vampiros.', /^caixa-halloween-/],
  ['desenhos', 'Desenhos', 'Visual de desenho animado.', /^caixa-desenhos-/],
  ['personalizadas', 'Personalizadas', 'Caixas feitas para a comunidade.', /^caixa-personalizadas-/],
  ['armas', 'Caixas de arma', 'Só skins de uma arma (e as facas raras).', /^caixa-arma-/],
  ['adesivos', 'Adesivos', 'Só adesivos, para colar nas suas armas.', /^caixa-adesivos-/],
  ['amuletos', 'Amuletos', 'Só chaveiros, para pendurar nas suas armas.', /^caixa-chaveiros-/],
]

// sem tema pelo slug (caixas criadas no painel): pelo que tem dentro
const POR_CONTEUDO = [
  ['tematicas', 'Caixas temáticas', 'Skins de várias armas, com facas raras.'],
  ['facas', 'Facas', 'Só facas: as mais valiosas saem com chance menor.'],
  ['luvas', 'Luvas', 'Só luvas, sem item raro especial: a caixa de luxo.'],
  ['misto', 'Amuletos e adesivos', 'Chaveiros e adesivos juntos.'],
]

export const CATEGORIAS_CAIXA = [...TEMAS_CAIXA.map(([id, nome, dica]) => [id, nome, dica]), ...POR_CONTEUDO]

export function categoriaDaCaixa(c) {
  const tema = TEMAS_CAIXA.find(([, , , re]) => re.test(c.slug || ''))
  if (tema) return tema[0]
  const t = new Set((c.itens || []).map((i) => i.t || 'arma'))
  if (!t.size) return 'tematicas'
  if (t.size === 1 && t.has('faca')) return 'facas'
  if (t.size === 1 && t.has('luva')) return 'luvas'
  if (t.size === 1 && t.has('chaveiro')) return 'amuletos'
  if (t.size === 1 && t.has('adesivo')) return 'adesivos'
  if (t.has('chaveiro') || t.has('adesivo')) return 'misto'
  return new Set(c.itens.map((i) => i.d)).size <= 2 ? 'armas' : 'tematicas' // uma ou duas armas (M4A1-S + M4A4) = caixa de arma
}
