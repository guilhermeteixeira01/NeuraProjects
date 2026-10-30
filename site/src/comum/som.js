// Sons da interface do site inteiro (gerados no navegador com Web Audio, sem arquivo): passar o mouse, clicar, trocar de aba,
// abrir/fechar janela, sucesso, erro e item raro. Um botão no topo (BotaoSom) liga/desliga TODOS os sons do site: este e os
// sons próprios de cada página (inventário, loja, veto do lobby, ranking, aviso do time), que consultam somMudo() antes de tocar.
// A escolha fica no navegador (localStorage) e vale em todas as abas (evento np-som).
import { useEffect, useState } from 'react'

const CHAVE = 'np_som_site'
export const EVENTO_SOM = 'np-som'
const VOLUME = 0.6

let mudo = null
export function somMudo() {
  if (mudo === null) {
    try {
      mudo = localStorage.getItem(CHAVE) === 'mudo'
    } catch {
      mudo = false
    }
  }
  return mudo
}
export function definirMudo(valor) {
  mudo = !!valor
  try {
    localStorage.setItem(CHAVE, mudo ? 'mudo' : 'ligado')
  } catch {
    // sem localStorage: vale só nesta página
  }
  window.dispatchEvent(new CustomEvent(EVENTO_SOM, { detail: mudo }))
}
export function useSomMudo() {
  const [m, setM] = useState(false) // igual ao HTML gerado; o efeito lê o de verdade
  useEffect(() => {
    const ler = () => setM(somMudo())
    const outraAba = (e) => {
      if (e.key !== CHAVE) return
      mudo = null
      ler()
    }
    ler()
    window.addEventListener(EVENTO_SOM, ler)
    window.addEventListener('storage', outraAba)
    return () => {
      window.removeEventListener(EVENTO_SOM, ler)
      window.removeEventListener('storage', outraAba)
    }
  }, [])
  return m
}

let ctx = null
const contexto = () => {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Nota curta: ataque rápido e queda exponencial; a frequência pode deslizar até "ate"
function nota(ac, { tipo = 'sine', freq, ate, inicio = 0, dur, vol }) {
  const t = ac.currentTime + inicio
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(freq, t)
  if (ate) osc.frequency.exponentialRampToValueAtTime(ate, t + dur)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(vol * VOLUME, t + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const SONS = {
  hover: (ac) => nota(ac, { freq: 1250, dur: 0.03, vol: 0.025 }),
  clique: (ac) => nota(ac, { tipo: 'triangle', freq: 540, ate: 280, dur: 0.07, vol: 0.07 }),
  aba: (ac) => nota(ac, { tipo: 'triangle', freq: 740, ate: 1060, dur: 0.06, vol: 0.055 }),
  tick: (ac) => nota(ac, { tipo: 'square', freq: 1500, dur: 0.02, vol: 0.03 }),
  abrir: (ac) => nota(ac, { freq: 480, ate: 900, dur: 0.1, vol: 0.06 }),
  fechar: (ac) => nota(ac, { freq: 820, ate: 420, dur: 0.1, vol: 0.05 }),
  sucesso: (ac) => [660, 880, 1320].forEach((freq, i) => nota(ac, { tipo: 'triangle', freq, inicio: i * 0.07, dur: 0.18, vol: 0.07 })),
  erro: (ac) => {
    nota(ac, { tipo: 'square', freq: 220, ate: 160, dur: 0.12, vol: 0.04 })
    nota(ac, { tipo: 'square', freq: 200, ate: 140, inicio: 0.12, dur: 0.14, vol: 0.04 })
  },
  compra: (ac) => {
    nota(ac, { tipo: 'triangle', freq: 990, dur: 0.08, vol: 0.06 })
    nota(ac, { tipo: 'triangle', freq: 1480, inicio: 0.07, dur: 0.22, vol: 0.06 })
  },
  raro: (ac) => nota(ac, { tipo: 'sawtooth', freq: 400, ate: 1900, dur: 0.6, vol: 0.06 }),
}

let ultimoHover = 0
export function tocarSom(nome) {
  if (typeof window === 'undefined' || somMudo()) return
  if (nome === 'hover') {
    const agora = performance.now()
    if (agora - ultimoHover < 70) return
    ultimoHover = agora
  }
  try {
    SONS[nome]?.(contexto())
  } catch {
    // navegador sem áudio: segue sem som
  }
}

// Sons automáticos em todo o site: hover e clique em botões, links e abas. Quem tem som próprio (inventário, loja, veto...)
// marca o elemento (ou um pai) com data-som="nao"; data-som="<nome>" troca o som do clique (ex.: "compra").
const ALVO = 'button, a[href], [role="tab"], [role="button"], summary, .np-som'
const naoToca = (el) => !el || el.closest('[data-som="nao"]') || el.disabled || el.getAttribute('aria-disabled') === 'true'
let ligado = false
export function ligarSonsDoSite() {
  if (ligado || typeof document === 'undefined') return
  ligado = true
  let ultimo = null
  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse') return
      const el = e.target.closest?.(ALVO)
      if (el === ultimo) return
      ultimo = el
      if (!naoToca(el)) tocarSom('hover')
    },
    { passive: true },
  )
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest?.(ALVO)
      if (naoToca(el)) return
      const proprio = el.closest('[data-som]')?.dataset.som
      const aba = el.getAttribute('role') === 'tab' || el.closest('[role="tablist"]')
      tocarSom(proprio && SONS[proprio] ? proprio : aba ? 'aba' : 'clique')
    },
    { capture: true, passive: true },
  )
}
