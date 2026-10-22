// Aviso de mensagem nova no chat do time (vale em qualquer página do site):
//  - com o som ligado: toca um "plim" quando alguém do time escreve;
//  - silenciado (botão do sino no chat do time): sem som, mas o ícone "Times" do menu fica com uma bolinha "!" piscando
//    até a pessoa abrir o chat do time.
// As mensagens chegam pelo evento np-equipe-chat (comum/amigos.js, ao vivo pela presença).
import { useEffect, useState } from 'react'

const CHAVE_MUDO = 'np_eq_mudo'
const EVENTO = 'np-eq-aviso'

const lerMudo = () => {
  try {
    return localStorage.getItem(CHAVE_MUDO) === '1'
  } catch {
    return false
  }
}

let mudo = lerMudo()
let pendente = false
let vendoChat = false // o chat do time está na tela (página /equipes/, aba Chat): nada a avisar
let iniciado = false
let ctx = null

const avisar = () => window.dispatchEvent(new Event(EVENTO))

// "plim" curto gerado no navegador (sem arquivo de som)
function tocar() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const t0 = ctx.currentTime
    ;[[880, 0], [1320, 0.11]].forEach(([freq, atraso]) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0 + atraso)
      g.gain.exponentialRampToValueAtTime(0.22, t0 + atraso + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.28)
      o.connect(g).connect(ctx.destination)
      o.start(t0 + atraso)
      o.stop(t0 + atraso + 0.3)
    })
  } catch {
    // sem áudio: segue sem som
  }
}

// Liga a escuta (chamado uma vez pelo menu, em todas as páginas)
export function iniciarAvisoEquipe() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  window.addEventListener('np-equipe-chat', (e) => {
    if (!e.detail?.msg) return // só mensagem nova (apagar não avisa)
    if (vendoChat && document.visibilityState === 'visible') return
    if (mudo) {
      pendente = true
      avisar()
    } else tocar()
  })
}

// O chat do time está (ou deixou de estar) aberto na tela
export function definirVendoChatEquipe(sim) {
  vendoChat = !!sim
  if (sim && pendente) {
    pendente = false
    avisar()
  }
}

export function definirMudoEquipe(valor) {
  mudo = !!valor
  try {
    localStorage.setItem(CHAVE_MUDO, mudo ? '1' : '0')
  } catch {
    // sem localStorage: vale só até recarregar
  }
  if (!mudo) pendente = false
  avisar()
}

// { mudo, pendente } sempre atualizado
export function useAvisoEquipe() {
  const [, forcar] = useState(0)
  useEffect(() => {
    const f = () => forcar((n) => n + 1)
    window.addEventListener(EVENTO, f)
    return () => window.removeEventListener(EVENTO, f)
  }, [])
  return { mudo, pendente: pendente && mudo }
}
