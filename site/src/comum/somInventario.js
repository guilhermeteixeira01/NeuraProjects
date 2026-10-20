// Sons do inventário de skins (/inventario/). Cada som usa o arquivo de public/inventario/sounds/ se existir; senão toca uma versão
// gerada no navegador (Web Audio), sem arquivo nenhum. Os nomes dos arquivos são os do jogo (sounds/ui/panorama/ no pak01 do CS2):
// para ter os sons originais, extraia estes .wav do jogo e coloque na pasta public/inventario/sounds/.
const ARQUIVOS = {
  hover: 'itemtile_plastic_rollover_15.wav', // passar o mouse num item
  item: 'itemtile_click_02.wav', // clicar num item
  aba: 'sidemenu_click_01.wav', // trocar de aba
  abrir: 'inventory_item_select_01.wav', // abrir uma janela
  fechar: 'inventory_item_close_01.wav', // fechar uma janela
  criado: 'inventory_new_item_accept_01.wav', // item criado / adesivo colado / chaveiro preso
  equipar: 'inventory_item_pickup_01.wav', // equipar / tirar
  botao: 'generic_press_01.wav', // botões em geral
  selecionar: 'submenu_dropdown_select_01.wav', // caixa de seleção
}
const VOLUME = 0.55
const CHAVE_MUDO = 'np_som_inventario'

const carregados = {}
if (typeof Audio !== 'undefined') {
  for (const [nome, arq] of Object.entries(ARQUIVOS)) {
    const a = new Audio(`/inventario/sounds/${arq}`)
    a.preload = 'auto'
    a.addEventListener('canplaythrough', () => (carregados[nome] = a), { once: true })
    a.load()
  }
}

let ctx = null
const contexto = () => {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function nota(ac, { tipo = 'sine', freq, fim = freq, inicio = 0, dur, ganho = 0.2 }) {
  const t = ac.currentTime + inicio
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(freq, t)
  osc.frequency.exponentialRampToValueAtTime(fim, t + dur)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(ganho * VOLUME, t + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const SINTESE = {
  hover: (ac) => nota(ac, { tipo: 'triangle', freq: 2200, fim: 1900, dur: 0.035, ganho: 0.05 }),
  item: (ac) => nota(ac, { tipo: 'triangle', freq: 1000, fim: 700, dur: 0.07, ganho: 0.14 }),
  aba: (ac) => {
    nota(ac, { tipo: 'triangle', freq: 1400, dur: 0.04, ganho: 0.1 })
    nota(ac, { tipo: 'triangle', freq: 1800, inicio: 0.045, dur: 0.05, ganho: 0.1 })
  },
  abrir: (ac) => nota(ac, { freq: 520, fim: 880, dur: 0.1, ganho: 0.16 }),
  fechar: (ac) => nota(ac, { freq: 760, fim: 460, dur: 0.1, ganho: 0.14 }),
  criado: (ac) => {
    nota(ac, { freq: 660, dur: 0.12, ganho: 0.16 })
    nota(ac, { freq: 880, inicio: 0.08, dur: 0.12, ganho: 0.16 })
    nota(ac, { freq: 1320, inicio: 0.16, dur: 0.22, ganho: 0.18 })
  },
  equipar: (ac) => {
    nota(ac, { freq: 220, fim: 110, dur: 0.12, ganho: 0.25 })
    nota(ac, { tipo: 'triangle', freq: 1500, inicio: 0.03, dur: 0.05, ganho: 0.1 })
  },
  botao: (ac) => nota(ac, { tipo: 'triangle', freq: 1200, fim: 900, dur: 0.05, ganho: 0.12 }),
  selecionar: (ac) => nota(ac, { tipo: 'triangle', freq: 1500, fim: 1100, dur: 0.06, ganho: 0.12 }),
}

export const somMudo = () => {
  try {
    return localStorage.getItem(CHAVE_MUDO) === '0'
  } catch {
    return false
  }
}
export const definirSom = (ligado) => {
  try {
    localStorage.setItem(CHAVE_MUDO, ligado ? '1' : '0')
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

export function tocar(nome) {
  if (typeof window === 'undefined' || somMudo()) return
  try {
    const a = carregados[nome]
    if (a) {
      const c = a.cloneNode()
      c.volume = VOLUME
      c.play().catch(() => {})
      return
    }
    SINTESE[nome]?.(contexto())
  } catch {
    // o navegador ainda não deixou tocar (sem interação): sem som
  }
}
