// Mapas disponíveis. Imagens oficiais extraídas do CS2
// (fonte: github.com/MurkyYT/cs2-map-icons):
//   public/maps/<id>.jpg        → thumbnail do mapa
//   public/maps/icons/<id>.png  → ícone/emblema do mapa
// Sem imagem, o card usa o gradiente definido em `colors`.
export const ALL_MAPS = [
  { id: 'ancient', name: 'Ancient', colors: ['#1f4d3a', '#0b1f18'] },
  { id: 'anubis', name: 'Anubis', colors: ['#8a6a2c', '#2a1d08'] },
  { id: 'dust2', name: 'Dust II', colors: ['#a67c3d', '#3a2710'] },
  { id: 'inferno', name: 'Inferno', colors: ['#8c3b25', '#2b0f08'] },
  { id: 'mirage', name: 'Mirage', colors: ['#b0894f', '#3b2a14'] },
  { id: 'nuke', name: 'Nuke', colors: ['#2f5f7a', '#0b1c26'] },
  { id: 'train', name: 'Train', colors: ['#4d5a63', '#15191c'] },
  { id: 'overpass', name: 'Overpass', colors: ['#4f6b3a', '#161f10'] },
  { id: 'vertigo', name: 'Vertigo', colors: ['#5d7185', '#161d25'] },
]

// Map pool padrão (Active Duty)
export const DEFAULT_POOL = ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'train']

export const POOL_SIZE = 7

export const getMap = (id) => ALL_MAPS.find((m) => m.id === id)

export const mapImage = (id) => `${import.meta.env.BASE_URL}maps/${id}.jpg`
export const mapIcon = (id) => `${import.meta.env.BASE_URL}maps/icons/${id}.png`

// Nome do mapa no servidor de CS2 (usado no comando css_serie)
export const serverMap = (id) => `de_${id}`
