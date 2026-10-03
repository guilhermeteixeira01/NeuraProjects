// Mapas e imagens ficam em comum/mapas.js (o site inteiro usa)
import { ALL_MAPS, getMap, mapIcon, mapImage } from "../../../comum/mapas.js"

export { ALL_MAPS, getMap, mapIcon, mapImage }

// Pool atual do Premier — vem selecionado por padrão no site.
// Quando a Valve mudar o pool, edite só aqui (7 ids iguais aos de ALL_MAPS) e a data.
export const DEFAULT_POOL = ['ancient', 'cache', 'anubis', 'inferno', 'mirage', 'nuke', 'dust2']
export const POOL_UPDATED = '2026-09-28'

export const POOL_SIZE = 7

// Nome do mapa no servidor de CS2 (usado no comando css_serie)
export const serverMap = (id) => `de_${id}`
