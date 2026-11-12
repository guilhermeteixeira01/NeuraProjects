// As páginas usam as mesmas imagens de mapas do Pick & Ban. Os resultados usam o mapa da partida.

const W = '/assets/neura-v2/web/v2/'
const mapa = (nome) => ({ src: `/neurapick/maps/${nome}.jpg`, w: 1280, h: 720 })

export const RESULTADOS = {
  de_cache: mapa('cache'),
  de_dust2: mapa('dust2'),
  de_nuke: mapa('nuke'),
  de_mirage: mapa('mirage'),
  de_overpass: mapa('overpass'),
  de_vertigo: mapa('vertigo'),
  de_ancient: mapa('ancient'),
  de_anubis: mapa('anubis'),
  de_inferno: mapa('inferno'),
  de_train: mapa('train'),
}

export const FUNDOS = {
  inicio: RESULTADOS.de_dust2,
  lobby: RESULTADOS.de_mirage,
  ranking: RESULTADOS.de_inferno,
  inventario: RESULTADOS.de_nuke,
  loja: RESULTADOS.de_nuke,
  vitrineLoja: { src: '/assets/neura-agentes/vitrine-neura-cenario.webp', w: 1800, h: 600 },
  perfil: RESULTADOS.de_mirage,
  time: RESULTADOS.de_inferno,
  partidas: RESULTADOS.de_dust2,
  admin: RESULTADOS.de_nuke,
  diretorioTimes: RESULTADOS.de_inferno,
  pickBan: RESULTADOS.de_mirage,
  global: RESULTADOS.de_dust2,
}

export const fundoDoResultado = (mapa) => RESULTADOS[String(mapa || '').toLowerCase().replace(/^(?!de_)/, 'de_')] || null

const agente = (nome, w, h) => ({ src: `/assets/neura-agentes/${nome}.webp`, w, h })
const ct = agente('retrato-ct', 640, 640)
const tr = agente('retrato-tr', 640, 640)

export const PERSONAGENS = {
  ct,
  tr,
  lojaArlequim: agente('vitrine-neura-arlequim', 850, 850),
  grupoCT: agente('grupo-ct', 1100, 760),
  grupoTR: agente('grupo-tr', 1100, 760),
  podio: ['gold', 'silver', 'bronze'].map((metal, i) => ({
    src: W + `podium-${metal}.webp`,
    video: `/assets/neura-v2/ranking/${i + 1}-lugar.webm`,
    w: 900,
    h: 900,
  })),
  lobby: ['street', 'safecracker', 'gorro', 'lenco', 'mascara'].map((nome) => agente(`lobby-${nome}`, 560, 780)),
}

export const CAIXA_DIARIA_V3 = { src: '/assets/caixas/web/caixa-diaria.webp', w: 720, h: 720 }

// Fundo de um bloco como variável CSS (--np-fundo): sem a arte, o CSS fica com o gradiente liso de reserva
export const fundoCss = (chave) => (FUNDOS[chave] ? { '--np-fundo': `url("${FUNDOS[chave].src}")` } : undefined)

// Ramos do top 3 (PNG transparente 1254×1254 com o número dentro; derivados de 320 px): ouro, prata e bronze.
// Pódio e tabela do ranking. Original em neura-v2/ranking/top-N-ramos-*.png.
export const RAMOS = [
  { src: W + 'ramo-1.webp', w: 320, h: 320, nome: 'ouro' },
  { src: W + 'ramo-2.webp', w: 320, h: 320, nome: 'prata' },
  { src: W + 'ramo-3.webp', w: 320, h: 320, nome: 'bronze' },
]
