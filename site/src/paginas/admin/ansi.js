// Console do servidor: transforma o texto com códigos de cor do terminal (ANSI/SGR) em pedaços coloridos e tira o resto das
// sequências de controle (mover cursor, apagar linha, título da janela…), que apareciam como "�[0m" e quadradinhos.
// Uso: const linhas = ansiParaLinhas(['[14:33:25] \x1b[32mok\x1b[0m', ...])  →  [{ hora, marca, partes: [{ texto, estilo }] }]

const PALETA = [
  '#6e7681', '#ff6b6b', '#3fb950', '#e3b341', '#58a6ff', '#d2a8ff', '#56d4dd', '#d0d7de', // 0-7 (preto vira cinza para aparecer no fundo escuro)
  '#8b949e', '#ff8e8e', '#56d364', '#f2cc60', '#79c0ff', '#e2c5ff', '#76e3ea', '#ffffff', // 8-15 (brilhantes)
]

function cor256(n) {
  if (n < 16) return PALETA[n]
  if (n < 232) {
    const i = n - 16
    const v = [0, 95, 135, 175, 215, 255]
    return `rgb(${v[Math.floor(i / 36)]} ${v[Math.floor(i / 6) % 6]} ${v[i % 6]})`
  }
  const g = 8 + (n - 232) * 10
  return `rgb(${g} ${g} ${g})`
}

// Tira tudo que não é texto nem cor: título da janela (OSC), mover/apagar (CSI que não termina em "m"), troca de charset e controles soltos
function limpar(s) {
  return String(s)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-ln-~]/g, '') // qualquer CSI, exceto os terminados em "m" (esses são as cores)
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b(?!\[[0-9;:]*m)/g, '') // ESC solto
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f\x9b]/g, '')
}

// Aplica um código "m" (lista de números) ao estado atual
function aplicar(estado, nums) {
  if (!nums.length) nums = [0]
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i]
    if (n === 0) {
      estado.fg = estado.bg = null
      estado.neg = estado.fraco = estado.suj = estado.it = false
    } else if (n === 1) estado.neg = true
    else if (n === 2) estado.fraco = true
    else if (n === 3) estado.it = true
    else if (n === 4) estado.suj = true
    else if (n === 22) estado.neg = estado.fraco = false
    else if (n === 23) estado.it = false
    else if (n === 24) estado.suj = false
    else if (n >= 30 && n <= 37) estado.fg = PALETA[n - 30]
    else if (n >= 90 && n <= 97) estado.fg = PALETA[n - 90 + 8]
    else if (n >= 40 && n <= 47) estado.bg = PALETA[n - 40]
    else if (n >= 100 && n <= 107) estado.bg = PALETA[n - 100 + 8]
    else if (n === 39) estado.fg = null
    else if (n === 49) estado.bg = null
    else if ((n === 38 || n === 48) && nums[i + 1] === 5) {
      estado[n === 38 ? 'fg' : 'bg'] = cor256(nums[i + 2] ?? 0)
      i += 2
    } else if ((n === 38 || n === 48) && nums[i + 1] === 2) {
      estado[n === 38 ? 'fg' : 'bg'] = `rgb(${nums[i + 2] ?? 0} ${nums[i + 3] ?? 0} ${nums[i + 4] ?? 0})`
      i += 4
    }
  }
}

const estiloDe = (e) => {
  if (!e.fg && !e.bg && !e.neg && !e.fraco && !e.suj && !e.it) return null
  const s = {}
  if (e.fg) s.color = e.fg
  if (e.bg) s.backgroundColor = e.bg
  if (e.neg) s.fontWeight = 700
  if (e.fraco) s.opacity = 0.7
  if (e.suj) s.textDecoration = 'underline'
  if (e.it) s.fontStyle = 'italic'
  return s
}

// "[hh:mm:ss] texto" → hora + texto; as mensagens do próprio agente começam com ">>" (aviso), "!!" (erro) ou ">" (comando enviado)
const RE_HORA = /^(\[\d{2}:\d{2}:\d{2}\]) ?([\s\S]*)$/

export function ansiParaLinhas(linhas) {
  const estado = { fg: null, bg: null, neg: false, fraco: false, suj: false, it: false } // a cor continua de uma linha para a próxima
  return linhas.map((bruta) => {
    let texto = String(bruta)
    const h = RE_HORA.exec(texto)
    const hora = h ? h[1] : ''
    if (h) texto = h[2]
    // barra-r: o programa reescreveu a linha (barra de progresso do SteamCMD): vale só o último trecho
    if (texto.includes('\r')) texto = texto.split('\r').filter(Boolean).pop() || ''
    texto = limpar(texto)
    let marca = ''
    if (texto.startsWith('>> ')) marca = 'aviso'
    else if (texto.startsWith('!! ')) marca = 'erro'
    else if (texto.startsWith('> ')) marca = 'comando'
    const partes = []
    const re = /\x1b\[([0-9;:]*)m/g
    let ultimo = 0
    let m
    while ((m = re.exec(texto))) {
      if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index), estilo: estiloDe(estado) })
      aplicar(estado, m[1] === '' ? [0] : m[1].split(/[;:]/).map((x) => Number(x) || 0))
      ultimo = re.lastIndex
    }
    if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), estilo: estiloDe(estado) })
    return { hora, marca, partes }
  })
}
