// Mapas do CS2 usados no site inteiro (NeuraPick, partidas, ranking).
// Imagens oficiais extraídas do CS2 (fonte: github.com/MurkyYT/cs2-map-icons):
//   public/neurapick/maps/<id>.jpg        → thumbnail do mapa
//   public/neurapick/maps/icons/<id>.png  → ícone/emblema do mapa
// Sem imagem, o card usa o gradiente definido em `colors`.
export const ALL_MAPS = [
  { id: 'ancient', name: 'Ancient', colors: ['#1f4d3a', '#0b1f18'] },
  { id: 'anubis', name: 'Anubis', colors: ['#8a6a2c', '#2a1d08'] },
  { id: 'cache', name: 'Cache', colors: ['#5f6f6a', '#1a201e'] },
  { id: 'dust2', name: 'Dust II', colors: ['#a67c3d', '#3a2710'] },
  { id: 'inferno', name: 'Inferno', colors: ['#8c3b25', '#2b0f08'] },
  { id: 'mirage', name: 'Mirage', colors: ['#b0894f', '#3b2a14'] },
  { id: 'nuke', name: 'Nuke', colors: ['#2f5f7a', '#0b1c26'] },
  { id: 'train', name: 'Train', colors: ['#4d5a63', '#15191c'] },
  { id: 'overpass', name: 'Overpass', colors: ['#4f6b3a', '#161f10'] },
  { id: 'vertigo', name: 'Vertigo', colors: ['#5d7185', '#161d25'] },
]

const PASTA = '/neurapick/maps'

// "de_mirage" -> "mirage"
export const idMapa = (m) => String(m || '').replace(/^de_/, '')
export const getMap = (id) => ALL_MAPS.find((m) => m.id === idMapa(id))
export const nomeMapa = (m) => getMap(m)?.name ?? idMapa(m)
export const mapImage = (id) => `${PASTA}/${idMapa(id)}.jpg`
export const mapIcon = (id) => `${PASTA}/icons/${idMapa(id)}.png`

// Fundo do card do mapa (imagem + gradiente, que aparece se a imagem não carregar)
export function fundoMapa(m) {
  const mapa = getMap(m)
  return mapa
    ? { '--img': `url('${mapImage(mapa.id)}')`, '--c1': mapa.colors[0], '--c2': mapa.colors[1] }
    : { '--c1': '#2a2f3a', '--c2': '#0e0f13' }
}
