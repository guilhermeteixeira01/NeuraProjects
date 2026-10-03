// Sons do veto. Cada som usa o arquivo em public/neurapick/sounds/ se existir;
// senão toca uma versão gerada no navegador (Web Audio), sem arquivo nenhum.
// ban/pick/lado são os sons do pick/ban do Premier do CS2 (sounds/ui/panorama/ no pak01 do jogo):
//   ban.wav  = premier_nextmapgroup   pick.wav = premier_selectmap   lado.wav = premier_teamselect
//   concluido.wav = mm_success_lets_roll   timer.wav = counter_beep (sounds/ui/)
const FILES = {
  ban: 'ban.wav',
  pick: 'pick.wav',
  lado: 'lado.wav',
  concluido: 'concluido.wav',
  timer: 'timer.wav',
}

// 0 a 1 (1 = volume original do arquivo)
const VOLUME = 0.9

// Carrega os arquivos já na abertura da página: só os que carregarem de verdade são usados.
// (Na geração do HTML no build não existe Audio: pula.)
const loaded = {}
for (const [name, file] of typeof Audio === 'undefined' ? [] : Object.entries(FILES)) {
  const audio = new Audio(`/neurapick/sounds/${file}`)
  audio.preload = 'auto'
  audio.addEventListener('canplaythrough', () => (loaded[name] = audio), { once: true })
  audio.load()
}

let ctx = null
const audioContext = () => {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Nota com ataque rápido e queda exponencial; freq pode deslizar até freqEnd
function tone(ac, { type, freq, freqEnd = freq, start = 0, dur, gain = 0.3, filter }) {
  const t = ac.currentTime + start
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain * VOLUME, t + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  let out = osc
  if (filter) {
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = filter
    osc.connect(lp)
    out = lp
  }
  out.connect(amp).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const SYNTH = {
  // Batida grave descendo: "negado"
  ban: (ac) => {
    tone(ac, { type: 'sawtooth', freq: 240, freqEnd: 70, dur: 0.32, gain: 0.35, filter: 900 })
    tone(ac, { type: 'square', freq: 120, freqEnd: 50, dur: 0.22, gain: 0.2, filter: 500 })
  },
  // Duas notas subindo: "confirmado"
  pick: (ac) => {
    tone(ac, { type: 'triangle', freq: 660, dur: 0.12, gain: 0.35 })
    tone(ac, { type: 'triangle', freq: 990, start: 0.09, dur: 0.22, gain: 0.35 })
  },
  // Clique curto
  lado: (ac) => tone(ac, { type: 'triangle', freq: 880, freqEnd: 1320, dur: 0.08, gain: 0.3 }),
  // Bipe do timer
  timer: (ac) => tone(ac, { type: 'square', freq: 1000, dur: 0.1, gain: 0.15, filter: 3000 }),
  // Reserva se o mp3 não carregar: arpejo subindo
  concluido: (ac) =>
    [523, 659, 784, 1047].forEach((freq, i) =>
      tone(ac, { type: 'triangle', freq, start: i * 0.09, dur: 0.3, gain: 0.3 }),
    ),
}

export function playSound(name) {
  try {
    const audio = loaded[name]
    if (audio) {
      const clone = audio.cloneNode()
      clone.volume = VOLUME
      clone.play().catch(() => {})
      return
    }
    SYNTH[name]?.(audioContext())
  } catch {
    // sem áudio no navegador: segue sem som
  }
}
