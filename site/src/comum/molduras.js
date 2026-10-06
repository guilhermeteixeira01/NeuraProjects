// Molduras de avatar (personalização do perfil). Arquivos em public/assets/molduras/<coleção>/<nome>:
//   .png  = moldura animada (APNG; o avatar ocupa o círculo central, a moldura é 120% dele)
//   .webp = imagem parada (tamanho original): miniatura da tela de escolha e moldura do modo "Melhorar desempenho"
// Para adicionar: coloque os dois arquivos na pasta e uma linha aqui (o id é "<coleção>/<nome>").
// fonte: 'neura' = feitas por nós (ferramentas/molduras/neura.mjs); 'steam' = Loja de Pontos da Steam;
// 'decor' = Decor (comunidade). Steam e Decor: ferramentas/molduras/baixar.mjs.
// forma: 'quadrada' = moldura feita para avatar quadrado (as da Steam); com ela o avatar fica quadrado em todas as
// páginas. Sem forma = redonda.
// escala: tamanho da moldura em relação ao avatar (padrão 1.2 = 120%). As quadradas têm a borda de dentro em lugares
// diferentes: a escala de cada uma põe a borda um pouco por cima da foto (na frente dela, sem vão).

export const COLECOES = [
  'Neura',
  'Steam Neon & Elementos',
  'Steam Lendas',
  'Decor',
]

export const MOLDURAS = [
  { id: 'neura/pulso-neon', nome: 'Pulso Neon', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/plasma', nome: 'Plasma', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/inferno', nome: 'Inferno', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/tempestade', nome: 'Tempestade', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/radar', nome: 'Radar', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/mira', nome: 'Mira', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/glitch', nome: 'Glitch', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/orbita', nome: 'Órbita', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/hexa', nome: 'Hexa', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/coroa', nome: 'Coroa', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/c4', nome: 'C4', colecao: 'Neura', fonte: 'neura' },
  { id: 'neura/aurora', nome: 'Aurora', colecao: 'Neura', fonte: 'neura' },
  { id: 'steam-neon-cyber/neon-vermelho', nome: "Neon (vermelho)", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.19 },
  { id: 'steam-neon-cyber/neon-classic', nome: "Neon Classic", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.19 },
  { id: 'steam-neon-cyber/sea-wave-neon', nome: "Sea Wave Neon", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.20 },
  { id: 'steam-neon-cyber/glitched-frame', nome: "Glitched Frame", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.18 },
  { id: 'steam-neon-cyber/pixel-glitch', nome: "Pixel Glitch", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.17 },
  { id: 'steam-elementos/cyan-fire', nome: "Cyan Fire", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.21 },
  { id: 'steam-elementos/fire-aura', nome: "Fire Aura", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.32 },
  { id: 'steam-elementos/burning-frame', nome: "Burning Frame", colecao: 'Steam Neon & Elementos', fonte: 'steam', forma: 'quadrada', escala: 1.10 },
  { id: 'steam-lendas/cosmic-planets', nome: "Cosmic Planets", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.16 },
  { id: 'steam-lendas/shimmering-stars', nome: "Shimmering Stars", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.09 },
  { id: 'steam-lendas/space-moon', nome: "Space Moon", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.04 },
  { id: 'steam-lendas/luxury-gold', nome: "Luxury Gold", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.09 },
  { id: 'steam-lendas/legendary-border', nome: "Legendary Border", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.13 },
  { id: 'steam-lendas/skulls', nome: "Skulls", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.20 },
  { id: 'steam-lendas/ninja-dragon-fire', nome: "Ninja Dragon Fire", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.20 },
  { id: 'steam-lendas/necrohell', nome: "NecroHell", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.06 },
  { id: 'steam-lendas/guns-frame', nome: "Guns Frame", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.22 },
  { id: 'steam-lendas/assault-rifle', nome: "Assault Rifle", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.25 },
  { id: 'steam-lendas/gunmetal', nome: "Gunmetal", colecao: 'Steam Lendas', fonte: 'steam', forma: 'quadrada', escala: 1.21 },
  { id: 'fantasy/boiling-potion', nome: "Boiling Potion", colecao: 'Decor', fonte: 'decor' },
  { id: 'fantasy/popping-hearts', nome: "Popping Hearts", colecao: 'Decor', fonte: 'decor' },
  { id: 'fantasy/juryoku', nome: "Jūryoku", colecao: 'Decor', fonte: 'decor' },
  { id: 'fantasy/kokusen-juryoku', nome: "Kokusen Jūryoku", colecao: 'Decor', fonte: 'decor' },
  { id: 'fantasy/party-ball', nome: "Party Ball", colecao: 'Decor', fonte: 'decor' },
  { id: 'fantasy/midori-juryoku', nome: "Midori Jūryoku", colecao: 'Decor', fonte: 'decor' },
  { id: 'decor/blue-soul', nome: "Blue Soul", colecao: 'Decor', fonte: 'decor' },
  { id: 'decor/red-soul', nome: "Red Soul", colecao: 'Decor', fonte: 'decor' },
  { id: 'decor/menacing', nome: "Menacing", colecao: 'Decor', fonte: 'decor' },
  { id: 'decor/string-lights', nome: "String Lights", colecao: 'Decor', fonte: 'decor' },
]

const PORID = new Map(MOLDURAS.map((m) => [m.id, m]))
export const molduraPorId = (id) => (id ? PORID.get(id) || null : null)
export const urlMoldura = (id) => `/assets/molduras/${id}.png`
export const urlMiniatura = (id) => `/assets/molduras/${id}.webp`
// Moldura parada ("Melhorar desempenho"): a mesma imagem estática da miniatura, no tamanho original da moldura
export const urlParada = urlMiniatura
// Classe da caixa do avatar para a forma da moldura ('' = redonda)
export const classeForma = (id) => (molduraPorId(id)?.forma === 'quadrada' ? ' quadrada' : '')
