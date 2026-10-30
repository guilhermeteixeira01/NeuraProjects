import { somMudo as siteMudo } from '../../comum/som.js'
// Música de fundo do Ranking (evento sazonal): toca em loop quando a página abre.
// Preferências (mudo e volume) ficam no navegador: localStorage np_ranking_som = { mudo, vol }.
const ARQUIVO = '/assets/Ranking/La Valse Des Monstres - José Borja del Pozo González.mp3'
const CHAVE = 'np_ranking_som'

export function lerPreferencia() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return { mudo: !!p.mudo, vol: Number.isFinite(p.vol) ? Math.min(1, Math.max(0, p.vol)) : 0.5 }
  } catch {
    return { mudo: false, vol: 0.5 }
  }
}

let audio = null
function instancia() {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio(ARQUIVO)
    audio.loop = true
    audio.preload = 'auto'
  }
  return audio
}

// Navegadores bloqueiam autoplay com som antes de um gesto do usuário: tenta tocar e,
// se for recusado, fica esperando o primeiro clique/tecla na página para tentar de novo.
export function iniciar(pref) {
  const a = instancia()
  if (!a) return
  const mudo = pref.mudo || siteMudo()
  a.volume = mudo ? 0 : pref.vol
  if (mudo) return
  const tentar = () => a.play().catch(() => {})
  tentar()
  const liberar = () => {
    tentar()
    document.removeEventListener('pointerdown', liberar)
    document.removeEventListener('keydown', liberar)
  }
  document.addEventListener('pointerdown', liberar, { once: true })
  document.addEventListener('keydown', liberar, { once: true })
}

export function parar() {
  audio?.pause()
}

export function definirPreferencia(nova, atual) {
  const novo = { ...atual, ...nova }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novo))
  } catch {
    // sem armazenamento: vale só nesta visita
  }
  const a = instancia()
  if (a) {
    a.volume = novo.mudo ? 0 : novo.vol
    if (novo.mudo) a.pause()
    else a.play().catch(() => {})
  }
  return novo
}
