// Sons da loja (feitos na hora com Web Audio, sem arquivo): tick da roleta, abertura, parada e revelação por raridade.
// Se um dia quiser os sons do jogo, ponha os .wav em public/loja/sounds/ com os nomes de ARQUIVOS abaixo e liste-os em SONS_COM_ARQUIVO:
// eles têm preferência (são pré-carregados) e o som sintetizado só entra quando não há arquivo.
// Preferências (mudo e volume) ficam no navegador: localStorage np_loja_som = { mudo, vol }.
const ARQUIVOS = {
  tick: 'tick.wav',
  abrir: 'abrir.wav',
  parar: 'parar.wav',
  r0: 'revelar-comum.wav',
  r1: 'revelar-incomum.wav',
  r2: 'revelar-raro.wav',
  r3: 'revelar-epico.wav',
  r4: 'revelar-lendario.wav',
  r5: 'revelar-faca.wav',
}
const CHAVE = 'np_loja_som'

const carregados = {}
let ctx = null
let mestre = null

export function lerPreferencia() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return { mudo: !!p.mudo, vol: Number.isFinite(p.vol) ? Math.min(1, Math.max(0, p.vol)) : 0.7 }
  } catch {
    return { mudo: false, vol: 0.7 }
  }
}
let pref = typeof window === 'undefined' ? { mudo: false, vol: 0.7 } : lerPreferencia()
export const preferenciaAtual = () => pref
export function definirPreferencia(nova) {
  pref = { ...pref, ...nova }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(pref))
  } catch {
    // sem armazenamento: vale só nesta visita
  }
  if (mestre) mestre.gain.value = pref.mudo ? 0 : pref.vol
}

// Arquivos de som de verdade (opcional): ponha os .wav em public/loja/sounds/ e liste aqui os nomes que existem (ex.: ['tick', 'abrir', 'r5']).
// Só o que está nesta lista é pré-carregado; o resto usa o som sintetizado. (Antes a página tentava baixar uma lista.json e dava 404 no console.)
const SONS_COM_ARQUIVO = []
let preparado = false
export function prepararSons() {
  if (preparado || typeof Audio === 'undefined') return
  preparado = true
  for (const nome of SONS_COM_ARQUIVO) {
    if (!ARQUIVOS[nome]) continue
    const a = new Audio(`/loja/sounds/${ARQUIVOS[nome]}`)
    a.preload = 'auto'
    a.addEventListener('canplaythrough', () => (carregados[nome] = a), { once: true })
    a.load()
  }
}

function contexto() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    mestre = ctx.createGain()
    mestre.gain.value = pref.mudo ? 0 : pref.vol
    mestre.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function nota(ac, { tipo = 'sine', freq, fim = freq, inicio = 0, dur, ganho = 0.2, ataque = 0.01 }) {
  const t = ac.currentTime + inicio
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(freq, t)
  if (fim !== freq) osc.frequency.exponentialRampToValueAtTime(fim, t + dur)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(ganho, t + ataque)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(mestre)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}
function ruido(ac, { inicio = 0, dur = 0.3, de = 4000, ate = 400, ganho = 0.15 }) {
  const t = ac.currentTime + inicio
  const n = Math.floor(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, n, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = ac.createBufferSource()
  src.buffer = buf
  const filtro = ac.createBiquadFilter()
  filtro.type = 'bandpass'
  filtro.frequency.setValueAtTime(de, t)
  filtro.frequency.exponentialRampToValueAtTime(ate, t + dur)
  const amp = ac.createGain()
  amp.gain.setValueAtTime(ganho, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filtro).connect(amp).connect(mestre)
  src.start(t)
}
const acorde = (ac, freqs, { inicio = 0, dur = 1, tipo = 'triangle', ganho = 0.12, passo = 0.06 } = {}) => freqs.forEach((f, i) => nota(ac, { tipo, freq: f, inicio: inicio + i * passo, dur, ganho }))

const SINTESE = {
  // tick: mais agudo quanto mais rápido (rate 0..1)
  tick: (ac, rate = 1) => nota(ac, { tipo: 'square', freq: 900 + rate * 500, fim: 600 + rate * 300, dur: 0.035, ganho: 0.05 + rate * 0.03, ataque: 0.002 }),
  abrir: (ac) => {
    ruido(ac, { dur: 0.45, de: 600, ate: 3500, ganho: 0.12 })
    nota(ac, { freq: 140, fim: 60, dur: 0.4, ganho: 0.3 })
    nota(ac, { tipo: 'triangle', freq: 330, fim: 880, dur: 0.35, ganho: 0.08 })
  },
  parar: (ac) => {
    nota(ac, { freq: 180, fim: 70, dur: 0.22, ganho: 0.32 })
    nota(ac, { tipo: 'triangle', freq: 1400, fim: 900, dur: 0.08, ganho: 0.1 })
  },
  // revelação: cada raridade soa maior que a anterior
  r0: (ac) => acorde(ac, [440, 554], { dur: 0.5, ganho: 0.1 }),
  r1: (ac) => acorde(ac, [523, 659, 784], { dur: 0.7, ganho: 0.11 }),
  r2: (ac) => {
    acorde(ac, [392, 494, 587, 784], { dur: 0.9, ganho: 0.12, passo: 0.07 })
    nota(ac, { freq: 98, dur: 0.8, ganho: 0.18 })
  },
  r3: (ac) => {
    acorde(ac, [330, 415, 494, 659, 830], { dur: 1.2, ganho: 0.12, passo: 0.08, tipo: 'sawtooth' })
    acorde(ac, [1318, 1661, 1975], { inicio: 0.35, dur: 1.2, ganho: 0.06, tipo: 'sine', passo: 0.09 })
    nota(ac, { freq: 82, dur: 1, ganho: 0.22 })
  },
  r4: (ac) => {
    ruido(ac, { dur: 0.7, de: 300, ate: 5000, ganho: 0.1 })
    acorde(ac, [294, 370, 440, 587, 740], { dur: 1.6, ganho: 0.13, passo: 0.09, tipo: 'sawtooth' })
    acorde(ac, [1175, 1480, 1760, 2349], { inicio: 0.45, dur: 1.5, ganho: 0.07, tipo: 'sine', passo: 0.1 })
    nota(ac, { freq: 73, fim: 55, dur: 1.5, ganho: 0.3 })
  },
  // faca: subida épica + acorde grande + brilho
  r5: (ac) => {
    ruido(ac, { dur: 1.1, de: 200, ate: 7000, ganho: 0.14 })
    nota(ac, { tipo: 'sawtooth', freq: 110, fim: 440, dur: 1, ganho: 0.14, ataque: 0.5 })
    acorde(ac, [262, 330, 392, 523, 659, 784], { inicio: 1, dur: 2.4, ganho: 0.13, passo: 0.06, tipo: 'sawtooth' })
    acorde(ac, [1047, 1319, 1568, 2093, 2637, 3136], { inicio: 1.1, dur: 2.2, ganho: 0.07, passo: 0.07, tipo: 'sine' })
    nota(ac, { freq: 65, fim: 49, inicio: 1, dur: 2.2, ganho: 0.35 })
  },
}

export function som(nome, arg) {
  if (typeof window === 'undefined' || pref.mudo || pref.vol <= 0) return
  try {
    const a = carregados[nome]
    if (a) {
      const c = a.cloneNode()
      c.volume = pref.vol
      c.play().catch(() => {})
      return
    }
    SINTESE[nome]?.(contexto(), arg)
  } catch {
    // o navegador ainda não liberou o som (sem toque na página): sem som
  }
}
export const somDaRaridade = (r) => som(`r${Math.min(5, Math.max(0, r))}`)
