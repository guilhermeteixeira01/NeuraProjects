// Coleção própria "Neura": molduras animadas desenhadas por código (SVG quadro a quadro -> APNG 288x288).
// Mesmo formato das outras: o avatar ocupa o círculo central (raio 120) e a moldura fica em volta.
//   node neura.mjs            gera todas
//   node neura.mjs radar c4   gera só essas
import { UPNG, gravar, sharp } from './comum.mjs'

const T = 288 // tamanho da moldura
const C = T / 2 // centro
const QUADROS = 48
const ATRASO = 50 // ms por quadro: volta completa em 2,4 s
const TAU = Math.PI * 2
// Foto quadrada (moldura = 120% dela): começa em Q0 e tem lado QL
const QL = T / 1.2
const Q0 = (T - QL) / 2

// Números "aleatórios" fixos (a mesma moldura sai igual toda vez que gerar)
function sorteio(semente) {
  let s = semente >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
const ponto = (r, ang) => [C + r * Math.cos(ang), C + r * Math.sin(ang)]
const f1 = (n) => n.toFixed(1)
const onda = (x) => 0.5 + 0.5 * Math.sin(x * TAU) // 0..1, uma volta por unidade

// Filtros de brilho e a máscara que deixa o centro (avatar) livre
const DEFS = `
  <filter id="brilho" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="brilhoForte" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="borrar"><feGaussianBlur stdDeviation="9"/></filter>
  <mask id="anel"><rect width="${T}" height="${T}" fill="#fff"/><circle cx="${C}" cy="${C}" r="113" fill="#000"/></mask>
  <mask id="quadro"><rect width="${T}" height="${T}" fill="#fff"/><rect x="${Q0 + 7}" y="${Q0 + 7}" width="${QL - 14}" height="${QL - 14}" rx="13" fill="#000"/></mask>`

const svg = (corpo, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}"><defs>${DEFS}${defs}</defs><g mask="url(#anel)">${corpo}</g></svg>`

// ── Quadradas (avatar quadrado: a foto vai de Q0 a Q0+QL, com cantinho arredondado) ──
// A moldura pode entrar 7 px por cima da foto (fica na frente da beirada dela); do meio para dentro, nada.
const svgQ = (corpo, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}"><defs>${DEFS}${defs}</defs><g mask="url(#quadro)">${corpo}</g></svg>`
// Ponto no contorno de um quadrado (d = distância da borda da moldura), u = 0..1 dando a volta;
// devolve [x, y, nx, ny] com a direção "para fora" daquele lado
function noQuadrado(d, u) {
  const lado = T - 2 * d
  const s = (((u % 1) + 1) % 1) * 4 * lado
  const k = Math.floor(s / lado), p = s - k * lado
  return [
    [d + p, d, 0, -1],
    [T - d, d + p, 1, 0],
    [T - d - p, T - d, 0, 1],
    [d, T - d - p, -1, 0],
  ][k]
}

// ── Desenhos (t = 0..1 ao longo da volta; tudo fecha o ciclo em t = 1) ──
const MOLDURAS = {
  // Anel neon nas cores do site (azul -> verde) girando, com um cometa branco correndo
  'pulso-neon': {
    nome: 'Pulso Neon',
    quadro: (t) => {
      const a = t * 360
      const largura = 6 + 2 * onda(t * 2)
      return svg(
        `<circle cx="${C}" cy="${C}" r="131" fill="none" stroke="url(#gr)" stroke-width="${f1(largura)}" filter="url(#brilhoForte)"/>
         <circle cx="${C}" cy="${C}" r="131" fill="none" stroke="#fff" stroke-width="1.4" opacity=".55"/>
         <circle cx="${C}" cy="${C}" r="131" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="70 754" transform="rotate(${f1(a * 2)} ${C} ${C})" filter="url(#brilho)"/>`,
        `<linearGradient id="gr" gradientUnits="userSpaceOnUse" x1="10" y1="${C}" x2="278" y2="${C}" gradientTransform="rotate(${f1(a)} ${C} ${C})">
           <stop offset="0" stop-color="#1a73e8"/><stop offset=".5" stop-color="#3ddc84"/><stop offset="1" stop-color="#1a73e8"/></linearGradient>`,
      )
    },
  },

  // Dois arcos de plasma (rosa e ciano) girando em sentidos opostos
  plasma: {
    nome: 'Plasma',
    quadro: (t) =>
      svg(`<circle cx="${C}" cy="${C}" r="133" fill="none" stroke="#7b2cff" stroke-width="2" opacity=".45"/>
        <circle cx="${C}" cy="${C}" r="130" fill="none" stroke="#ff3df0" stroke-width="6" stroke-linecap="round" stroke-dasharray="210 607" transform="rotate(${f1(t * 360)} ${C} ${C})" filter="url(#brilhoForte)"/>
        <circle cx="${C}" cy="${C}" r="137" fill="none" stroke="#33e1ff" stroke-width="5" stroke-linecap="round" stroke-dasharray="160 700" transform="rotate(${f1(180 - t * 720)} ${C} ${C})" filter="url(#brilhoForte)"/>
        <circle cx="${C}" cy="${C}" r="130" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="210 607" transform="rotate(${f1(t * 360)} ${C} ${C})"/>
        <circle cx="${C}" cy="${C}" r="137" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="160 700" transform="rotate(${f1(180 - t * 720)} ${C} ${C})"/>`),
  },

  // Chamas em volta do avatar (cada chama oscila no seu ritmo)
  inferno: {
    nome: 'Inferno',
    quadro: (t) => {
      const rnd = sorteio(7)
      const chamas = (cor, escala, base) =>
        Array.from({ length: 40 }, (_, k) => {
          const ang = (k / 40) * TAU
          const fase = rnd()
          const alt = (12 + 12 * onda(t * 2 + fase) + 8 * onda(t * 3 + fase * 2)) * escala
          const balanco = 0.05 * Math.sin((t * 2 + fase) * TAU)
          const [x1, y1] = ponto(base, ang - 0.09)
          const [x2, y2] = ponto(base, ang + 0.09)
          const [xp, yp] = ponto(base + alt, ang + balanco)
          const [xc, yc] = ponto(base + alt * 0.55, ang + balanco * 0.5)
          return `<path d="M${f1(x1)},${f1(y1)} Q${f1(xc)},${f1(yc)} ${f1(xp)},${f1(yp)} Q${f1(xc)},${f1(yc)} ${f1(x2)},${f1(y2)} Z" fill="${cor}"/>`
        }).join('')
      return svg(`<g filter="url(#brilho)">${chamas('#ff3b1f', 1, 121)}${chamas('#ff8a1f', 0.72, 121)}${chamas('#ffd84a', 0.42, 121)}</g>
        <circle cx="${C}" cy="${C}" r="122" fill="none" stroke="#ffb02e" stroke-width="4" filter="url(#brilho)"/>`)
    },
  },

  // Anel elétrico com raios estourando de tempos em tempos
  tempestade: {
    nome: 'Tempestade',
    quadro: (t, i) => {
      const golpes = [[0, 6], [17, 22], [31, 37]] // quadros com raio
      const ativo = golpes.findIndex(([a, b]) => i >= a && i < b)
      let raios = ''
      if (ativo >= 0) {
        const fixo = sorteio(100 + ativo) // posição do golpe
        const tremor = sorteio(1000 + i) // treme a cada quadro
        for (let n = 0; n < 3; n++) {
          const ini = fixo() * TAU
          const pts = Array.from({ length: 12 }, (_, k) => ponto(127 + (tremor() - 0.5) * 22, ini + (k / 11) * 1.1))
          raios += `<polyline points="${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>`
        }
      }
      const forca = ativo >= 0 ? 1 : 0.55
      return svg(`<circle cx="${C}" cy="${C}" r="130" fill="none" stroke="#5ab8ff" stroke-width="${ativo >= 0 ? 4 : 2.5}" opacity="${forca}" filter="url(#brilhoForte)"/>
        <circle cx="${C}" cy="${C}" r="130" fill="none" stroke="#dff2ff" stroke-width="1" opacity="${forca}"/>
        <g filter="url(#brilhoForte)" stroke="#7fd0ff">${raios}</g>`)
    },
  },

  // Radar do CS: marcações, varredura verde e alvos que acendem quando ela passa
  radar: {
    nome: 'Radar',
    quadro: (t) => {
      const a = t * TAU
      const marcas = Array.from({ length: 36 }, (_, k) => {
        const ang = (k / 36) * TAU
        const [x1, y1] = ponto(k % 3 === 0 ? 121 : 125, ang)
        const [x2, y2] = ponto(130, ang)
        return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`
      }).join('')
      // rastro da varredura: fatias com opacidade caindo
      const rastro = Array.from({ length: 14 }, (_, k) => {
        const a1 = a - (k + 1) * 0.06
        const a2 = a - k * 0.06
        const [x1, y1] = ponto(142, a1)
        const [x2, y2] = ponto(142, a2)
        const [x3, y3] = ponto(116, a2)
        const [x4, y4] = ponto(116, a1)
        return `<path d="M${f1(x1)},${f1(y1)} A142,142 0 0 1 ${f1(x2)},${f1(y2)} L${f1(x3)},${f1(y3)} A116,116 0 0 0 ${f1(x4)},${f1(y4)} Z" fill="#3ddc84" opacity="${f1(0.42 * (1 - k / 14))}"/>`
      }).join('')
      const alvos = [0.6, 2.4, 4.3]
        .map((ang) => {
          const desde = (((a - ang) % TAU) + TAU) % TAU // quanto a varredura já passou
          const brilho = Math.max(0, 1 - desde / 2.5)
          const [x, y] = ponto(136, ang)
          return `<circle cx="${f1(x)}" cy="${f1(y)}" r="4" fill="#ff4655" opacity="${f1(brilho)}" filter="url(#brilho)"/>`
        })
        .join('')
      const [xl, yl] = ponto(142, a)
      const [xi, yi] = ponto(116, a)
      return svg(`<circle cx="${C}" cy="${C}" r="134" fill="none" stroke="#3ddc84" stroke-width="2" opacity=".8" filter="url(#brilho)"/>
        <g stroke="#3ddc84" stroke-width="1.6" opacity=".7">${marcas}</g>${rastro}
        <line x1="${f1(xi)}" y1="${f1(yi)}" x2="${f1(xl)}" y2="${f1(yl)}" stroke="#b9ffd6" stroke-width="2.5" filter="url(#brilho)"/>${alvos}`)
    },
  },

  // Mira do CS: as quatro linhas abrem e fecham como o "spread" do tiro
  mira: {
    nome: 'Mira',
    quadro: (t) => {
      const abre = 6 * Math.pow(Math.max(0, Math.sin(t * 2 * TAU)), 3) // dois "tiros" por volta
      const traco = (ang) => {
        const [x1, y1] = ponto(121 + abre, ang)
        const [x2, y2] = ponto(141 + abre * 0.3, ang)
        return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`
      }
      const tracos = [0, 1, 2, 3].map((k) => traco((k * TAU) / 4 - TAU / 4)).join('')
      const pontos = [1, 3, 5, 7].map((k) => {
        const [x, y] = ponto(131, (k * TAU) / 8)
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.6"/>`
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="129" fill="none" stroke="#fff" stroke-width="1.2" opacity=".35"/>
        <g stroke="#000" stroke-width="9" stroke-linecap="square" opacity=".6">${tracos}</g>
        <g stroke="#3ddc84" stroke-width="5.5" stroke-linecap="square" filter="url(#brilho)">${tracos}</g>
        <g fill="#3ddc84" opacity=".8">${pontos}</g>`)
    },
  },

  // Anel com falhas digitais: canais RGB separando, pedaços sumindo e faixas de interferência
  glitch: {
    nome: 'Glitch',
    quadro: (t, i) => {
      const rnd = sorteio(500 + i)
      const forte = [2, 3, 4, 9, 14, 15, 16, 17, 23, 29, 30, 31, 37, 41, 42, 43].includes(i)
      const d = forte ? 4 + rnd() * 4 : 1 + rnd() * 1.5
      const tracejado = forte ? `${Math.round(40 + rnd() * 120)} ${Math.round(6 + rnd() * 18)} ${Math.round(20 + rnd() * 80)} ${Math.round(4 + rnd() * 12)}` : 'none'
      const anel = (cor, dx, dy) =>
        `<circle cx="${f1(C + dx)}" cy="${f1(C + dy)}" r="131" fill="none" stroke="${cor}" stroke-width="5" stroke-dasharray="${tracejado}" opacity=".9"/>`
      const faixas = forte
        ? Array.from({ length: 4 }, () => `<rect x="0" y="${Math.round(rnd() * T)}" width="${T}" height="${Math.round(2 + rnd() * 6)}" fill="${rnd() > 0.5 ? '#ff2a6d' : '#05d9e8'}" opacity=".55"/>`).join('')
        : ''
      return svg(`<g filter="url(#brilho)">${anel('#ff2a6d', -d, 0)}${anel('#05d9e8', d, d * 0.4)}${anel('#ffffff', 0, 0)}</g>
        <g mask="url(#faixa)">${faixas}</g>`,
        `<mask id="faixa"><rect width="${T}" height="${T}" fill="#000"/><circle cx="${C}" cy="${C}" r="143" fill="#fff"/><circle cx="${C}" cy="${C}" r="119" fill="#000"/></mask>`)
    },
  },

  // Três partículas em órbita, cada uma com rastro
  orbita: {
    nome: 'Órbita',
    quadro: (t) => {
      const particula = (raio, voltas, cor, fase) =>
        Array.from({ length: 14 }, (_, k) => {
          const ang = (t * voltas + fase) * TAU - k * 0.07 * Math.sign(voltas)
          const [x, y] = ponto(raio, ang)
          return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(5 - k * 0.32)}" fill="${cor}" opacity="${f1(1 - k / 14)}"/>`
        }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="132" fill="none" stroke="#9aa7ff" stroke-width="1" opacity=".35"/>
        <circle cx="${C}" cy="${C}" r="125" fill="none" stroke="#9aa7ff" stroke-width=".8" opacity=".2"/>
        <g filter="url(#brilho)">${particula(125, 2, '#33e1ff', 0)}${particula(133, 1, '#3ddc84', 0.33)}${particula(140, -1, '#c77dff', 0.66)}</g>`)
    },
  },

  // Escudo de hexágonos que acendem em onda
  hexa: {
    nome: 'Hexa',
    quadro: (t) => {
      const n = 20
      const hex = (x, y, r) =>
        Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * TAU + TAU / 12
          return `${f1(x + r * Math.cos(a))},${f1(y + r * Math.sin(a))}`
        }).join(' ')
      const celulas = Array.from({ length: n }, (_, k) => {
        const ang = (k / n) * TAU
        const [x, y] = ponto(132, ang)
        const luz = Math.pow(Math.max(0, Math.cos(ang - t * TAU)), 6)
        return `<polygon points="${hex(x, y, 11.5)}" fill="#3498db" fill-opacity="${f1(0.12 + 0.75 * luz)}" stroke="#7cc4ff" stroke-width="1.6" stroke-opacity="${f1(0.45 + 0.55 * luz)}"/>`
      }).join('')
      return svg(`<g filter="url(#brilho)">${celulas}</g>`)
    },
  },

  // Coroa dourada (combina com cargo VIP/top do ranking): anel de ouro com brilho correndo e faíscas
  coroa: {
    nome: 'Coroa',
    quadro: (t) => {
      const sobe = 2 * Math.sin(t * TAU)
      const estrela = (x, y, s) => `<path d="M${f1(x)},${f1(y - s)} L${f1(x + s * 0.25)},${f1(y - s * 0.25)} L${f1(x + s)},${f1(y)} L${f1(x + s * 0.25)},${f1(y + s * 0.25)} L${f1(x)},${f1(y + s)} L${f1(x - s * 0.25)},${f1(y + s * 0.25)} L${f1(x - s)},${f1(y)} L${f1(x - s * 0.25)},${f1(y - s * 0.25)} Z" fill="#fff6c8"/>`
      const faiscas = Array.from({ length: 9 }, (_, k) => {
        const ang = (k / 9) * TAU + 0.3
        const [x, y] = ponto(139, ang)
        const s = 7 * Math.pow(onda(t * 2 + k / 9), 4)
        return s > 0.4 ? estrela(x, y, s) : ''
      }).join('')
      // base da coroa em y=30 (encostada no topo do anel), pontas quase na borda de cima
      const b = 30 + sobe
      const coroa = `<path d="M106,${f1(b)} L100,${f1(b - 22)} L120,${f1(b - 11)} L144,${f1(b - 27)} L168,${f1(b - 11)} L188,${f1(b - 22)} L182,${f1(b)} Z" fill="url(#ouro)" stroke="#7a5200" stroke-width="1.6" stroke-linejoin="round"/>
        <rect x="104" y="${f1(b - 2)}" width="80" height="7" rx="2" fill="url(#ouro)" stroke="#7a5200" stroke-width="1.4"/>
        <circle cx="144" cy="${f1(b - 9)}" r="5" fill="#ff4655" stroke="#7a1020" stroke-width="1"/>
        <circle cx="121" cy="${f1(b - 5)}" r="3.2" fill="#33e1ff"/><circle cx="167" cy="${f1(b - 5)}" r="3.2" fill="#33e1ff"/>
        <circle cx="100" cy="${f1(b - 23)}" r="2.6" fill="#fff6c8"/><circle cx="144" cy="${f1(b - 28)}" r="2.8" fill="#fff6c8"/><circle cx="188" cy="${f1(b - 23)}" r="2.6" fill="#fff6c8"/>`
      return svg(`<circle cx="${C}" cy="${C}" r="131" fill="none" stroke="url(#ouroGira)" stroke-width="7" filter="url(#brilho)"/>
        <circle cx="${C}" cy="${C}" r="131" fill="none" stroke="#fff3b0" stroke-width="1.2" opacity=".6"/>
        <g filter="url(#brilho)">${coroa}</g><g filter="url(#brilho)">${faiscas}</g>`,
        `<linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
         <linearGradient id="ouroGira" gradientUnits="userSpaceOnUse" x1="10" y1="${C}" x2="278" y2="${C}" gradientTransform="rotate(${f1(t * 360)} ${C} ${C})">
           <stop offset="0" stop-color="#b8860b"/><stop offset=".45" stop-color="#f5c542"/><stop offset=".5" stop-color="#fffbe0"/><stop offset=".55" stop-color="#f5c542"/><stop offset="1" stop-color="#b8860b"/></linearGradient>`)
    },
  },

  // Bomba C4: anel de contagem que vai apagando, LED piscando e o visor
  c4: {
    nome: 'C4',
    quadro: (t, i) => {
      const n = 48
      const acesos = n - i // um segmento apaga por quadro
      const segmentos = Array.from({ length: n }, (_, k) => {
        const a1 = (k / n) * TAU - TAU / 4 + 0.012
        const a2 = ((k + 1) / n) * TAU - TAU / 4 - 0.012
        const [x1, y1] = ponto(131, a1)
        const [x2, y2] = ponto(131, a2)
        const aceso = k < acesos
        return `<path d="M${f1(x1)},${f1(y1)} A131,131 0 0 1 ${f1(x2)},${f1(y2)}" stroke="${aceso ? '#ff4655' : '#4a1c22'}" stroke-width="7" fill="none"/>`
      }).join('')
      const led = i % 12 < 3 // pisca 4 vezes por volta
      const seg = String(Math.ceil(40 * (1 - t))).padStart(2, '0')
      return svg(`<g filter="url(#brilho)">${segmentos}</g>
        <circle cx="${C}" cy="10" r="6" fill="${led ? '#ff2a2a' : '#5a1010'}" ${led ? 'filter="url(#brilhoForte)"' : ''}/>
        <rect x="117" y="262" width="54" height="22" rx="4" fill="#111" stroke="#ff4655" stroke-width="1.5"/>
        <text x="${C}" y="279" text-anchor="middle" font-family="Consolas, monospace" font-size="16" font-weight="700" fill="#ff4655">0:${seg}</text>`)
    },
  },

  // ════════ Redondas (2ª leva) ════════

  // Braços em espiral girando, roxo e ciano
  vortice: {
    nome: 'Vórtice',
    quadro: (t) => {
      const bracos = Array.from({ length: 8 }, (_, k) => {
        const a0 = (k / 8) * TAU + t * TAU
        const pts = []
        for (let r = 116; r <= 143; r += 1.5) {
          const [x, y] = ponto(r, a0 + (r - 116) * 0.045)
          pts.push(`${f1(x)},${f1(y)}`)
        }
        return `<polyline points="${pts.join(' ')}" fill="none" stroke="${k % 2 ? '#33e1ff' : '#9b5cff'}" stroke-width="3.2" stroke-linecap="round"/>`
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="119" fill="none" stroke="#9b5cff" stroke-width="2.5" filter="url(#brilho)"/>
        <g filter="url(#brilho)">${bracos}</g>`)
    },
  },

  // Ondas de sonar saindo do avatar
  sonar: {
    nome: 'Sonar',
    quadro: (t) => {
      const ondas = [0, 1, 2]
        .map((k) => {
          const p = (t + k / 3) % 1
          return `<circle cx="${C}" cy="${C}" r="${f1(121 + p * 21)}" fill="none" stroke="#33e1ff" stroke-width="${f1(1 + 3 * (1 - p))}" opacity="${f1(1 - p)}"/>`
        })
        .join('')
      return svg(`<circle cx="${C}" cy="${C}" r="121" fill="none" stroke="#33e1ff" stroke-width="3" filter="url(#brilhoForte)"/>
        <g filter="url(#brilho)">${ondas}</g>`)
    },
  },

  // Anéis de holograma com marcações girando em sentidos opostos
  holograma: {
    nome: 'Holograma',
    quadro: (t) =>
      svg(`<g filter="url(#brilho)" fill="none" stroke="#4ff0ff">
        <circle cx="${C}" cy="${C}" r="123" stroke-width="2" stroke-dasharray="2 5" transform="rotate(${f1(t * 360)} ${C} ${C})" opacity=".9"/>
        <circle cx="${C}" cy="${C}" r="131" stroke-width="5" stroke-dasharray="60 46" transform="rotate(${f1(-t * 360)} ${C} ${C})" opacity=".85"/>
        <circle cx="${C}" cy="${C}" r="139" stroke-width="1.5" stroke-dasharray="14 8" transform="rotate(${f1(t * 720)} ${C} ${C})" opacity=".7"/>
        <circle cx="${C}" cy="${C}" r="131" stroke="#e6ffff" stroke-width="1.2" stroke-dasharray="60 46" transform="rotate(${f1(-t * 360)} ${C} ${C})"/>
      </g>`),
  },

  // Faíscas saindo do anel
  faiscas: {
    nome: 'Faíscas',
    quadro: (t) => {
      const rnd = sorteio(31)
      const faiscas = Array.from({ length: 34 }, () => {
        const a0 = rnd() * TAU, fase = rnd(), giro = (rnd() - 0.5) * 0.6
        const p = (t * 2 + fase) % 1
        const [x, y] = ponto(121 + p * 21, a0 + p * giro)
        const [x0, y0] = ponto(121 + Math.max(0, p - 0.12) * 21, a0 + Math.max(0, p - 0.12) * giro)
        return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x)}" y2="${f1(y)}" stroke="${p < 0.5 ? '#ffe066' : '#ff8a1f'}" stroke-width="${f1(2.6 * (1 - p) + 0.6)}" stroke-linecap="round" opacity="${f1(1 - p)}"/>`
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="121" fill="none" stroke="#ff9f1c" stroke-width="3" filter="url(#brilho)"/>
        <g filter="url(#brilho)">${faiscas}</g>`)
    },
  },

  // Anel tóxico com bolhas subindo
  toxico: {
    nome: 'Tóxico',
    quadro: (t) => {
      const rnd = sorteio(77)
      const bolhas = Array.from({ length: 24 }, () => {
        const a0 = rnd() * TAU, fase = rnd()
        const p = (t + fase) % 1
        const [x, y] = ponto(122 + p * 19, a0 + 0.05 * Math.sin(p * TAU * 2))
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1.5 + 4 * p)}" fill="none" stroke="#9dff6a" stroke-width="1.6" opacity="${f1(1 - p)}"/>`
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="123" fill="none" stroke="#39ff14" stroke-width="${f1(4 + onda(t * 2))}" filter="url(#brilhoForte)"/>
        <g filter="url(#brilho)">${bolhas}</g>`)
    },
  },

  // Arco-íris girando (cada pedaço do anel troca de cor)
  prisma: {
    nome: 'Prisma',
    quadro: (t) => {
      const n = 36
      const pedacos = Array.from({ length: n }, (_, k) => {
        const a1 = (k / n) * TAU, a2 = ((k + 1) / n) * TAU + 0.01
        const [x1, y1] = ponto(131, a1)
        const [x2, y2] = ponto(131, a2)
        return `<path d="M${f1(x1)},${f1(y1)} A131,131 0 0 1 ${f1(x2)},${f1(y2)}" stroke="hsl(${Math.round((k * 10 + t * 360) % 360)},100%,62%)" stroke-width="7" fill="none"/>`
      }).join('')
      return svg(`<g filter="url(#brilho)">${pedacos}</g>
        <circle cx="${C}" cy="${C}" r="131" fill="none" stroke="#fff" stroke-width="1.2" opacity=".55"/>`)
    },
  },

  // Cristais de gelo em volta, com um brilho correndo
  cristal: {
    nome: 'Cristal',
    quadro: (t) => {
      const rnd = sorteio(12)
      const n = 26
      const cacos = Array.from({ length: n }, (_, k) => {
        const ang = (k / n) * TAU
        const alt = 9 + rnd() * 13
        const [x1, y1] = ponto(120, ang - 0.07)
        const [x2, y2] = ponto(120, ang + 0.07)
        const [xp, yp] = ponto(120 + alt, ang + (rnd() - 0.5) * 0.06)
        const luz = Math.pow(Math.max(0, Math.cos(ang - t * TAU)), 10)
        return `<polygon points="${f1(x1)},${f1(y1)} ${f1(xp)},${f1(yp)} ${f1(x2)},${f1(y2)}" fill="#bfe9ff" fill-opacity="${f1(0.55 + 0.45 * luz)}" stroke="#ffffff" stroke-width="${f1(0.6 + luz * 1.6)}" stroke-opacity="${f1(0.5 + 0.5 * luz)}"/>`
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="121" fill="none" stroke="#9fdcff" stroke-width="3" filter="url(#brilho)"/>
        <g filter="url(#brilho)">${cacos}</g>`)
    },
  },

  // Linha de batimento cardíaco dando a volta
  batimento: {
    nome: 'Batimento',
    quadro: (t) => {
      const cabeca = t * TAU
      const pts = []
      for (let j = 0; j <= 240; j++) {
        const ang = (j / 240) * TAU
        const d = (((cabeca - ang) % TAU) + TAU) % TAU // quanto atrás da cabeça do pulso
        let amp = 0
        if (d < 0.07) amp = -15 * Math.sin((d / 0.07) * Math.PI)
        else if (d < 0.13) amp = 7 * Math.sin(((d - 0.07) / 0.06) * Math.PI)
        const [x, y] = ponto(129 + amp, ang)
        pts.push(`${f1(x)},${f1(y)}`)
      }
      const pulso = 1 + 0.6 * Math.pow(Math.max(0, Math.sin(t * 2 * TAU)), 6)
      return svg(`<circle cx="${C}" cy="${C}" r="129" fill="none" stroke="#ff3355" stroke-width="${f1(1.5 * pulso)}" opacity=".45"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="#ff4d6d" stroke-width="2.6" stroke-linejoin="round" filter="url(#brilhoForte)"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="#ffd1da" stroke-width="1" stroke-linejoin="round"/>`)
    },
  },

  // Nebulosa com estrelas piscando
  nebulosa: {
    nome: 'Nebulosa',
    quadro: (t) => {
      const rnd = sorteio(58)
      const nuvens = ['#7b2cff', '#ff4fd8', '#3a86ff', '#7b2cff', '#ff4fd8', '#3a86ff']
        .map((cor, k) => {
          const [x, y] = ponto(134, (t + k / 6) * TAU)
          return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(20 + 6 * onda(t * 2 + k / 6))}" fill="${cor}" opacity=".6"/>`
        })
        .join('')
      const estrelas = Array.from({ length: 34 }, () => {
        const [x, y] = ponto(118 + rnd() * 25, rnd() * TAU)
        const fase = rnd()
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.8 + rnd() * 1.4)}" fill="#fff" opacity="${f1(0.15 + 0.85 * Math.pow(onda(t * 2 + fase), 3))}"/>`
      }).join('')
      return svg(`<g filter="url(#borrar)">${nuvens}</g><g filter="url(#brilho)">${estrelas}</g>`)
    },
  },

  // Duas lâminas cortando em volta, com rastro
  lamina: {
    nome: 'Lâmina',
    quadro: (t) => {
      const lamina = (a, opac) => {
        const fora = [], dentro = []
        for (let s = 0; s <= 1.0001; s += 0.05) {
          const w = Math.sin(s * Math.PI) * 7
          const [xo, yo] = ponto(132 + w, a - s * 1.1)
          const [xi, yi] = ponto(132 - w * 0.35, a - s * 1.1)
          fora.push(`${f1(xo)},${f1(yo)}`)
          dentro.unshift(`${f1(xi)},${f1(yi)}`)
        }
        return `<polygon points="${[...fora, ...dentro].join(' ')}" fill="url(#aco)" opacity="${opac}"/>`
      }
      const a = t * 2 * TAU
      const par = (b) => lamina(b - 0.22, 0.18) + lamina(b - 0.11, 0.35) + lamina(b, 1)
      return svg(`<circle cx="${C}" cy="${C}" r="132" fill="none" stroke="url(#aco)" stroke-width="3" opacity=".85" filter="url(#brilho)"/>
        <g filter="url(#brilho)">${par(a)}${par(a + Math.PI)}</g>`,
        `<linearGradient id="aco" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b8c7dc"/><stop offset="1" stop-color="#6b7f99"/></linearGradient>`)
    },
  },

  // ════════ Quadradas (para avatar quadrado) ════════

  'neon-quadrado': {
    nome: 'Neon Quadrado',
    forma: 'quadrada',
    quadro: (t) => {
      const d = 26
      const r = `x="${d}" y="${d}" width="${T - 2 * d}" height="${T - 2 * d}" rx="16" fill="none" pathLength="1000"`
      return svgQ(`<rect ${r} stroke="url(#grQ)" stroke-width="${f1(6 + 2 * onda(t * 2))}" filter="url(#brilhoForte)"/>
        <rect ${r} stroke="#fff" stroke-width="1.3" opacity=".55"/>
        <rect ${r} stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="80 920" stroke-dashoffset="${f1(-t * 2000)}" filter="url(#brilho)"/>`,
        `<linearGradient id="grQ" gradientUnits="userSpaceOnUse" x1="10" y1="${C}" x2="278" y2="${C}" gradientTransform="rotate(${f1(t * 360)} ${C} ${C})">
           <stop offset="0" stop-color="#1a73e8"/><stop offset=".5" stop-color="#3ddc84"/><stop offset="1" stop-color="#1a73e8"/></linearGradient>`)
    },
  },

  circuito: {
    nome: 'Circuito',
    forma: 'quadrada',
    quadro: (t) => {
      const rnd = sorteio(9)
      const trilhas = Array.from({ length: 20 }, (_, k) => {
        const [x, y, nx, ny] = noQuadrado(26, (k + 0.5) / 20)
        const l1 = 5 + rnd() * 6, l2 = (rnd() > 0.5 ? 1 : -1) * (5 + rnd() * 8)
        const x1 = x + nx * l1, y1 = y + ny * l1
        const x2 = x1 + -ny * l2, y2 = y1 + nx * l2
        return `<polyline points="${f1(x)},${f1(y)} ${f1(x1)},${f1(y1)} ${f1(x2)},${f1(y2)}" fill="none" stroke="#0fd9c3" stroke-width="1.6" opacity=".75"/><circle cx="${f1(x2)}" cy="${f1(y2)}" r="2.2" fill="#0fd9c3"/>`
      }).join('')
      const pulsos = Array.from({ length: 6 }, (_, k) => {
        const [x, y] = noQuadrado(26, t + k / 6)
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.4" fill="#c8fff7"/>`
      }).join('')
      return svgQ(`<rect x="26" y="26" width="${T - 52}" height="${T - 52}" rx="10" fill="none" stroke="#0fd9c3" stroke-width="2.6" filter="url(#brilho)"/>
        ${trilhas}<g filter="url(#brilhoForte)">${pulsos}</g>`)
    },
  },

  hud: {
    nome: 'HUD',
    forma: 'quadrada',
    quadro: (t) => {
      const d = 21 - 4 * Math.pow(Math.max(0, Math.sin(t * 2 * TAU)), 3) // cantos abrem e fecham
      const L = 46
      const cantos = [
        `M${d},${d + L} V${d} H${d + L}`,
        `M${T - d - L},${d} H${T - d} V${d + L}`,
        `M${T - d},${T - d - L} V${T - d} H${T - d - L}`,
        `M${d + L},${T - d} H${d} V${T - d - L}`,
      ].map((p) => `<path d="${p}"/>`).join('')
      const pisca = Math.round(t * 8) % 2 === 0
      const marcas = [0.125, 0.375, 0.625, 0.875].map((u) => {
        const [x, y, nx, ny] = noQuadrado(24, u)
        return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + nx * 9)}" y2="${f1(y + ny * 9)}"/>`
      }).join('')
      return svgQ(`<rect x="26" y="26" width="${T - 52}" height="${T - 52}" rx="12" fill="none" stroke="#fff" stroke-width="1.2" opacity=".3"/>
        <g fill="none" stroke="#3ddc84" stroke-width="5" stroke-linecap="square" filter="url(#brilho)">${cantos}</g>
        <g stroke="#3ddc84" stroke-width="2.5" opacity="${pisca ? 1 : 0.35}">${marcas}</g>`)
    },
  },

  'raio-quadrado': {
    nome: 'Tempestade Quadrada',
    forma: 'quadrada',
    quadro: (t, i) => {
      const golpes = [[0, 6], [16, 21], [31, 37]]
      const ativo = golpes.findIndex(([a, b]) => i >= a && i < b)
      let raios = ''
      if (ativo >= 0) {
        const fixo = sorteio(200 + ativo), tremor = sorteio(2000 + i)
        for (let n = 0; n < 3; n++) {
          const u0 = fixo()
          const pts = Array.from({ length: 12 }, (_, k) => {
            const [x, y, nx, ny] = noQuadrado(26, u0 + (k / 11) * 0.18)
            const j = (tremor() - 0.5) * 18
            return `${f1(x + nx * j)},${f1(y + ny * j)}`
          })
          raios += `<polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>`
        }
      }
      const forte = ativo >= 0
      return svgQ(`<rect x="26" y="26" width="${T - 52}" height="${T - 52}" rx="14" fill="none" stroke="#5ab8ff" stroke-width="${forte ? 4 : 2.5}" opacity="${forte ? 1 : 0.6}" filter="url(#brilhoForte)"/>
        <g filter="url(#brilhoForte)" stroke="#7fd0ff">${raios}</g>`)
    },
  },

  'plasma-quadrado': {
    nome: 'Plasma Quadrado',
    forma: 'quadrada',
    quadro: (t) => {
      const r = (d, extra) => `<rect x="${d}" y="${d}" width="${T - 2 * d}" height="${T - 2 * d}" rx="16" fill="none" pathLength="1000" ${extra}/>`
      return svgQ(`${r(24, 'stroke="#7b2cff" stroke-width="2" opacity=".45"')}
        <g filter="url(#brilhoForte)">${r(28, `stroke="#ff3df0" stroke-width="6" stroke-linecap="round" stroke-dasharray="230 770" stroke-dashoffset="${f1(-t * 1000)}"`)}
        ${r(19, `stroke="#33e1ff" stroke-width="5" stroke-linecap="round" stroke-dasharray="170 830" stroke-dashoffset="${f1(t * 2000)}"`)}</g>
        ${r(28, `stroke="#fff" stroke-width="1.4" stroke-dasharray="230 770" stroke-dashoffset="${f1(-t * 1000)}"`)}
        ${r(19, `stroke="#fff" stroke-width="1.2" stroke-dasharray="170 830" stroke-dashoffset="${f1(t * 2000)}"`)}`)
    },
  },

  'inferno-quadrado': {
    nome: 'Inferno Quadrado',
    forma: 'quadrada',
    quadro: (t) => {
      const rnd = sorteio(17)
      const chamas = (cor, escala) =>
        Array.from({ length: 60 }, (_, k) => {
          const [x, y, nx, ny] = noQuadrado(27, (k + 0.5) / 60)
          const tx = -ny, ty = nx
          const fase = rnd()
          const alt = (10 + 9 * onda(t * 2 + fase) + 6 * onda(t * 3 + fase * 2)) * escala
          const bal = 3 * Math.sin((t * 2 + fase) * TAU)
          const xp = x + nx * alt + tx * bal, yp = y + ny * alt + ty * bal
          const xc = x + nx * alt * 0.55 + tx * bal * 0.5, yc = y + ny * alt * 0.55 + ty * bal * 0.5
          return `<path d="M${f1(x - tx * 6)},${f1(y - ty * 6)} Q${f1(xc)},${f1(yc)} ${f1(xp)},${f1(yp)} Q${f1(xc)},${f1(yc)} ${f1(x + tx * 6)},${f1(y + ty * 6)} Z" fill="${cor}"/>`
        }).join('')
      return svgQ(`<g filter="url(#brilho)">${chamas('#ff3b1f', 1)}${chamas('#ff8a1f', 0.7)}${chamas('#ffd84a', 0.4)}</g>
        <rect x="27" y="27" width="${T - 54}" height="${T - 54}" rx="12" fill="none" stroke="#ffb02e" stroke-width="4" filter="url(#brilho)"/>`)
    },
  },

  'glitch-quadrado': {
    nome: 'Glitch Quadrado',
    forma: 'quadrada',
    quadro: (t, i) => {
      const rnd = sorteio(900 + i)
      const forte = [2, 3, 4, 9, 14, 15, 16, 17, 23, 29, 30, 31, 37, 41, 42, 43].includes(i)
      const d = forte ? 4 + rnd() * 4 : 1 + rnd() * 1.5
      const tracejado = forte ? `${Math.round(60 + rnd() * 160)} ${Math.round(6 + rnd() * 18)} ${Math.round(30 + rnd() * 90)} ${Math.round(4 + rnd() * 12)}` : 'none'
      const q = (cor, dx, dy) => `<rect x="${f1(26 + dx)}" y="${f1(26 + dy)}" width="${T - 52}" height="${T - 52}" rx="12" fill="none" stroke="${cor}" stroke-width="5" stroke-dasharray="${tracejado}" opacity=".9"/>`
      const faixas = forte
        ? Array.from({ length: 4 }, () => `<rect x="0" y="${Math.round(rnd() * T)}" width="${T}" height="${Math.round(2 + rnd() * 6)}" fill="${rnd() > 0.5 ? '#ff2a6d' : '#05d9e8'}" opacity=".55"/>`).join('')
        : ''
      return svgQ(`<g filter="url(#brilho)">${q('#ff2a6d', -d, 0)}${q('#05d9e8', d, d * 0.4)}${q('#ffffff', 0, 0)}</g>
        <g mask="url(#faixaQ)">${faixas}</g>`,
        `<mask id="faixaQ"><rect width="${T}" height="${T}" fill="#000"/><rect x="6" y="6" width="${T - 12}" height="${T - 12}" fill="#fff"/><rect x="${Q0 + 4}" y="${Q0 + 4}" width="${QL - 8}" height="${QL - 8}" fill="#000"/></mask>`)
    },
  },

  'ouro-quadrado': {
    nome: 'Ouro Quadrado',
    forma: 'quadrada',
    quadro: (t) => {
      const estrela = (x, y, s) => `<path d="M${f1(x)},${f1(y - s)} L${f1(x + s * 0.25)},${f1(y - s * 0.25)} L${f1(x + s)},${f1(y)} L${f1(x + s * 0.25)},${f1(y + s * 0.25)} L${f1(x)},${f1(y + s)} L${f1(x - s * 0.25)},${f1(y + s * 0.25)} L${f1(x - s)},${f1(y)} L${f1(x - s * 0.25)},${f1(y - s * 0.25)} Z" fill="#fff6c8"/>`
      const faiscas = Array.from({ length: 10 }, (_, k) => {
        const [x, y] = noQuadrado(18, k / 10 + 0.05)
        const s = 7 * Math.pow(onda(t * 2 + k / 10), 4)
        return s > 0.4 ? estrela(x, y, s) : ''
      }).join('')
      const joia = (x, y) => `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" fill="url(#ouroQ)" stroke="#7a5200" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="3.2" fill="#ff4655"/>`
      return svgQ(`<rect x="25" y="25" width="${T - 50}" height="${T - 50}" rx="12" fill="none" stroke="url(#ouroGiraQ)" stroke-width="8" filter="url(#brilho)"/>
        <rect x="17" y="17" width="${T - 34}" height="${T - 34}" rx="16" fill="none" stroke="#b8860b" stroke-width="1.5" opacity=".8"/>
        ${joia(25, 25)}${joia(T - 25, 25)}${joia(T - 25, T - 25)}${joia(25, T - 25)}
        <g filter="url(#brilho)">${faiscas}</g>`,
        `<linearGradient id="ouroQ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
         <linearGradient id="ouroGiraQ" gradientUnits="userSpaceOnUse" x1="10" y1="${C}" x2="278" y2="${C}" gradientTransform="rotate(${f1(t * 360)} ${C} ${C})">
           <stop offset="0" stop-color="#b8860b"/><stop offset=".45" stop-color="#f5c542"/><stop offset=".5" stop-color="#fffbe0"/><stop offset=".55" stop-color="#f5c542"/><stop offset="1" stop-color="#b8860b"/></linearGradient>`)
    },
  },

  // ── Redondas (segunda leva) ──

  // Coroa do sol num eclipse: raios dourados tremendo e o "anel de diamante" correndo em volta
  eclipse: {
    nome: 'Eclipse',
    quadro: (t) => {
      const rnd = sorteio(31)
      const raios = Array.from({ length: 44 }, (_, k) => {
        const ang = (k / 44) * TAU + (rnd() - 0.5) * 0.06
        const fase = rnd()
        const alt = 6 + 10 * rnd() + 7 * onda(t * 2 + fase)
        const [x1, y1] = ponto(121, ang - 0.035)
        const [x2, y2] = ponto(121, ang + 0.035)
        const [xp, yp] = ponto(121 + alt, ang)
        return `<path d="M${f1(x1)},${f1(y1)} L${f1(xp)},${f1(yp)} L${f1(x2)},${f1(y2)} Z"/>`
      }).join('')
      const [bx, by] = ponto(124, t * TAU - Math.PI / 2)
      return svg(`<circle cx="${C}" cy="${C}" r="128" fill="none" stroke="#ffb02e" stroke-width="16" opacity=".22" filter="url(#borrar)"/>
        <g fill="#ffd27a" filter="url(#brilho)">${raios}</g>
        <circle cx="${C}" cy="${C}" r="122" fill="none" stroke="#fff3c4" stroke-width="3" filter="url(#brilho)"/>
        <circle cx="${f1(bx)}" cy="${f1(by)}" r="7" fill="#fff" filter="url(#brilhoForte)"/>
        <circle cx="${f1(bx)}" cy="${f1(by)}" r="3" fill="#fff"/>`)
    },
  },

  // Duas fitas (azul e verde, as cores do site) trançadas como DNA, girando em volta
  helice: {
    nome: 'Hélice',
    quadro: (t) => {
      const N = 160
      const fita = (sinal) =>
        Array.from({ length: N + 1 }, (_, k) => {
          const a = (k / N) * TAU
          return ponto(130 + sinal * 8 * Math.sin(8 * a - t * TAU), a).map(f1).join(',')
        }).join(' ')
      const degraus = Array.from({ length: 48 }, (_, k) => {
        const a = (k / 48) * TAU
        const s = Math.sin(8 * a - t * TAU)
        const [x1, y1] = ponto(130 + 8 * s, a)
        const [x2, y2] = ponto(130 - 8 * s, a)
        return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" opacity="${f1(0.25 + 0.5 * Math.abs(Math.cos(8 * a - t * TAU)))}"/>`
      }).join('')
      return svg(`<g stroke="#9fd0ff" stroke-width="1.6">${degraus}</g>
        <g fill="none" stroke-width="4" stroke-linejoin="round" filter="url(#brilho)">
          <polyline points="${fita(1)}" stroke="#1a73e8"/><polyline points="${fita(-1)}" stroke="#3ddc84"/></g>
        <g fill="none" stroke="#fff" stroke-width="1.1" opacity=".6"><polyline points="${fita(1)}"/><polyline points="${fita(-1)}"/></g>`)
    },
  },

  // Círculo arcano: runas fixas que acendem quando a luz passa e dois anéis tracejados girando
  runas: {
    nome: 'Runas',
    quadro: (t) => {
      const rnd = sorteio(77)
      const runas = Array.from({ length: 14 }, (_, k) => {
        const ang = (k / 14) * TAU
        const [x, y] = ponto(130, ang)
        // runa = 3 tracinhos sorteados num quadradinho de 14 px
        const tracos = Array.from({ length: 3 }, () => {
          const p = () => f1((rnd() - 0.5) * 14)
          return `M${p()},${p()} L${p()},${p()}`
        }).join(' ')
        const dist = Math.abs(((k / 14 - t + 1.5) % 1) - 0.5) // 0 = a luz está em cima dela
        const luz = 0.5 + 0.5 * Math.pow(Math.max(0, 1 - dist * 4), 2)
        return `<path d="${tracos}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1((ang * 180) / Math.PI + 90)})" opacity="${f1(luz)}"/>`
      }).join('')
      const anel = (r, tr, off) => `<circle cx="${C}" cy="${C}" r="${r}" fill="none" pathLength="1000" stroke-dasharray="${tr}" stroke-dashoffset="${f1(off)}"/>`
      return svg(`<g stroke="#b26bff" stroke-width="3.2" filter="url(#brilhoForte)">${anel(122, '28 22', t * 100)}${anel(138, '6 14', -t * 200)}</g>
        <circle cx="${C}" cy="${C}" r="122" fill="none" stroke="#e4ccff" stroke-width="1" opacity=".5"/>
        <g fill="none" stroke="#f1e4ff" stroke-width="2.8" stroke-linecap="round" filter="url(#brilho)">${runas}</g>`)
    },
  },

  // Cristais de gelo em volta, com um brilho que passa por eles e estrelinhas piscando
  geada: {
    nome: 'Geada',
    quadro: (t) => {
      const rnd = sorteio(55)
      const cristais = Array.from({ length: 30 }, (_, k) => {
        const ang = (k / 30) * TAU + (rnd() - 0.5) * 0.08
        const alt = 8 + rnd() * 14
        const larg = 0.035 + rnd() * 0.02
        const [x1, y1] = ponto(120, ang - larg)
        const [xm, ym] = ponto(120 + alt * 0.45, ang)
        const [x2, y2] = ponto(120, ang + larg)
        const [xp, yp] = ponto(120 + alt, ang)
        const dist = Math.abs(((k / 30 - t + 1.5) % 1) - 0.5)
        const luz = 0.55 + 0.45 * Math.pow(Math.max(0, 1 - dist * 5), 2)
        return `<path d="M${f1(x1)},${f1(y1)} L${f1(xm)},${f1(ym)} L${f1(xp)},${f1(yp)} L${f1(xm)},${f1(ym)} L${f1(x2)},${f1(y2)} Z" fill="#bfefff" stroke="#fff" stroke-width=".8" opacity="${f1(luz)}"/>`
      }).join('')
      const estrelas = Array.from({ length: 8 }, (_, k) => {
        const [x, y] = ponto(127 + rnd() * 12, rnd() * TAU)
        const s = 6 * Math.pow(onda(t * 2 + k / 8), 6)
        return s > 0.5 ? `<path d="M${f1(x)},${f1(y - s)} L${f1(x + s * 0.2)},${f1(y)} L${f1(x)},${f1(y + s)} L${f1(x - s * 0.2)},${f1(y)} Z M${f1(x - s)},${f1(y)} L${f1(x)},${f1(y - s * 0.2)} L${f1(x + s)},${f1(y)} L${f1(x)},${f1(y + s * 0.2)} Z" fill="#fff"/>` : ''
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="122" fill="none" stroke="#7fd8ff" stroke-width="4" filter="url(#brilhoForte)"/>
        <g filter="url(#brilho)">${cristais}</g><g filter="url(#brilho)">${estrelas}</g>`)
    },
  },

  // Barras de áudio em volta (de ciano a rosa), pulsando no ritmo
  equalizador: {
    nome: 'Equalizador',
    quadro: (t) => {
      const rnd = sorteio(64)
      const barras = Array.from({ length: 60 }, (_, k) => {
        const ang = (k / 60) * TAU - Math.PI / 2
        const f1a = rnd(), f2a = rnd()
        const v = 0.55 * onda(t * 2 + f1a) + 0.45 * onda(t * 3 + f2a)
        const [x1, y1] = ponto(123, ang)
        const [x2, y2] = ponto(125 + 17 * v, ang)
        const cor = `hsl(${Math.round(185 + 135 * Math.abs(Math.sin(ang / 2 + Math.PI / 4)))} 100% 62%)`
        return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${cor}"/>`
      }).join('')
      return svg(`<circle cx="${C}" cy="${C}" r="121" fill="none" stroke="#fff" stroke-width="1.4" opacity=".5"/>
        <g stroke-width="4" stroke-linecap="round" filter="url(#brilho)">${barras}</g>`)
    },
  },

  // ── Quadradas (segunda leva) ──

  'equalizador-quadrado': {
    nome: 'Equalizador Quadrado',
    forma: 'quadrada',
    quadro: (t) => {
      const rnd = sorteio(65)
      const barras = Array.from({ length: 72 }, (_, k) => {
        const u = (k + 0.5) / 72
        const [x, y, nx, ny] = noQuadrado(27, u)
        const v = 0.55 * onda(t * 2 + rnd()) + 0.45 * onda(t * 3 + rnd())
        const alt = 2 + 15 * v
        const cor = `hsl(${Math.round(185 + 135 * Math.abs(Math.sin(u * Math.PI)))} 100% 62%)`
        return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + nx * alt)}" y2="${f1(y + ny * alt)}" stroke="${cor}"/>`
      }).join('')
      return svgQ(`<rect x="27" y="27" width="${T - 54}" height="${T - 54}" rx="12" fill="none" stroke="#fff" stroke-width="1.4" opacity=".5"/>
        <g stroke-width="3.6" stroke-linecap="round" filter="url(#brilho)">${barras}</g>`)
    },
  },

  'geada-quadrado': {
    nome: 'Geada Quadrada',
    forma: 'quadrada',
    quadro: (t) => {
      const rnd = sorteio(56)
      const cristais = Array.from({ length: 40 }, (_, k) => {
        const u = (k + 0.5) / 40 + (rnd() - 0.5) * 0.008
        const [x, y, nx, ny] = noQuadrado(27, u)
        const tx = -ny, ty = nx
        const alt = 7 + rnd() * 13, larg = 4 + rnd() * 3
        const dist = Math.abs(((u - t + 1.5) % 1) - 0.5)
        const luz = 0.55 + 0.45 * Math.pow(Math.max(0, 1 - dist * 5), 2)
        const xm = x + nx * alt * 0.45, ym = y + ny * alt * 0.45
        return `<path d="M${f1(x - tx * larg)},${f1(y - ty * larg)} L${f1(xm)},${f1(ym)} L${f1(x + nx * alt)},${f1(y + ny * alt)} L${f1(xm)},${f1(ym)} L${f1(x + tx * larg)},${f1(y + ty * larg)} Z" fill="#bfefff" stroke="#fff" stroke-width=".8" opacity="${f1(luz)}"/>`
      }).join('')
      return svgQ(`<rect x="27" y="27" width="${T - 54}" height="${T - 54}" rx="12" fill="none" stroke="#7fd8ff" stroke-width="4" filter="url(#brilhoForte)"/>
        <g filter="url(#brilho)">${cristais}</g>`)
    },
  },

  // Borda "gamer" RGB: arco-íris girando e dois brilhos brancos correndo
  'rgb-quadrado': {
    nome: 'RGB Quadrado',
    forma: 'quadrada',
    quadro: (t) => {
      const r = (extra) => `<rect x="25" y="25" width="${T - 50}" height="${T - 50}" rx="16" fill="none" pathLength="1000" ${extra}/>`
      const cores = ['#ff2a2a', '#ffb02e', '#f5f542', '#3ddc84', '#33e1ff', '#1a73e8', '#b26bff', '#ff3df0', '#ff2a2a']
      return svgQ(`${r('stroke="url(#rgbQ)" stroke-width="7" filter="url(#brilhoForte)"')}
        ${r('stroke="url(#rgbQ)" stroke-width="3"')}
        ${r(`stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-dasharray="60 440" stroke-dashoffset="${f1(-t * 1000)}" filter="url(#brilho)"`)}`,
        `<linearGradient id="rgbQ" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${T}" y2="${T}" gradientTransform="rotate(${f1(t * 360)} ${C} ${C})">
          ${cores.map((c, k) => `<stop offset="${f1(k / (cores.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`)
    },
  },

  // Dados correndo em volta: três trilhas verdes com pacotes em velocidades diferentes
  'dados-quadrado': {
    nome: 'Fluxo de Dados',
    forma: 'quadrada',
    quadro: (t) => {
      const trilha = (d, tr, vel, cor, w) =>
        `<rect x="${d}" y="${d}" width="${T - 2 * d}" height="${T - 2 * d}" rx="${Math.max(4, 22 - d / 2)}" fill="none" pathLength="1000" stroke="${cor}" stroke-width="${w}" stroke-dasharray="${tr}" stroke-dashoffset="${f1(-t * 1000 * vel)}"/>`
      return svgQ(`<rect x="27" y="27" width="${T - 54}" height="${T - 54}" rx="12" fill="none" stroke="#3ddc84" stroke-width="2.4" filter="url(#brilho)"/>
        <g filter="url(#brilho)">
          ${trilha(19, '40 18 12 30 6 22 70 52', 1, '#3ddc84', 3)}
          ${trilha(12, '8 14 22 40 4 12', -1, '#2fbf6f', 2.4)}
          ${trilha(19, '3 247', 1, '#eafff2', 4)}
          ${trilha(12, '3 197', -1, '#eafff2', 3.4)}
        </g>`)
    },
  },
}

// ── Terceira leva: variações de cor das que mais ficaram (fogo e neon) e versões redondas do RGB e do HUD ──

// Fogo em volta (igual ao Inferno), com as cores escolhidas: [fora, meio, dentro, anel]
function chamasRedondas([c1, c2, c3, anel], semente) {
  return (t) => {
    const rnd = sorteio(semente)
    const chamas = (cor, escala) =>
      Array.from({ length: 40 }, (_, k) => {
        const ang = (k / 40) * TAU
        const fase = rnd()
        const alt = (12 + 12 * onda(t * 2 + fase) + 8 * onda(t * 3 + fase * 2)) * escala
        const balanco = 0.05 * Math.sin((t * 2 + fase) * TAU)
        const [x1, y1] = ponto(121, ang - 0.09)
        const [x2, y2] = ponto(121, ang + 0.09)
        const [xp, yp] = ponto(121 + alt, ang + balanco)
        const [xc, yc] = ponto(121 + alt * 0.55, ang + balanco * 0.5)
        return `<path d="M${f1(x1)},${f1(y1)} Q${f1(xc)},${f1(yc)} ${f1(xp)},${f1(yp)} Q${f1(xc)},${f1(yc)} ${f1(x2)},${f1(y2)} Z" fill="${cor}"/>`
      }).join('')
    return svg(`<g filter="url(#brilho)">${chamas(c1, 1)}${chamas(c2, 0.72)}${chamas(c3, 0.42)}</g>
      <circle cx="${C}" cy="${C}" r="122" fill="none" stroke="${anel}" stroke-width="4" filter="url(#brilho)"/>`)
  }
}
// O mesmo fogo em volta do avatar quadrado (igual ao Inferno Quadrado)
function chamasQuadradas([c1, c2, c3, anel], semente) {
  return (t) => {
    const rnd = sorteio(semente)
    const chamas = (cor, escala) =>
      Array.from({ length: 60 }, (_, k) => {
        const [x, y, nx, ny] = noQuadrado(27, (k + 0.5) / 60)
        const tx = -ny, ty = nx
        const fase = rnd()
        const alt = (10 + 9 * onda(t * 2 + fase) + 6 * onda(t * 3 + fase * 2)) * escala
        const bal = 3 * Math.sin((t * 2 + fase) * TAU)
        const xp = x + nx * alt + tx * bal, yp = y + ny * alt + ty * bal
        const xc = x + nx * alt * 0.55 + tx * bal * 0.5, yc = y + ny * alt * 0.55 + ty * bal * 0.5
        return `<path d="M${f1(x - tx * 6)},${f1(y - ty * 6)} Q${f1(xc)},${f1(yc)} ${f1(xp)},${f1(yp)} Q${f1(xc)},${f1(yc)} ${f1(x + tx * 6)},${f1(y + ty * 6)} Z" fill="${cor}"/>`
      }).join('')
    return svgQ(`<g filter="url(#brilho)">${chamas(c1, 1)}${chamas(c2, 0.7)}${chamas(c3, 0.4)}</g>
      <rect x="27" y="27" width="${T - 54}" height="${T - 54}" rx="12" fill="none" stroke="${anel}" stroke-width="4" filter="url(#brilho)"/>`)
  }
}
// Anel neon com degradê girando e um cometa branco (igual ao Pulso Neon), nas cores escolhidas
function neonRedondo([a, b], id) {
  return (t) => {
    const ang = t * 360
    return svg(
      `<circle cx="${C}" cy="${C}" r="131" fill="none" stroke="url(#${id})" stroke-width="${f1(6 + 2 * onda(t * 2))}" filter="url(#brilhoForte)"/>
       <circle cx="${C}" cy="${C}" r="131" fill="none" stroke="#fff" stroke-width="1.4" opacity=".55"/>
       <circle cx="${C}" cy="${C}" r="131" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="70 754" transform="rotate(${f1(ang * 2)} ${C} ${C})" filter="url(#brilho)"/>`,
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="10" y1="${C}" x2="278" y2="${C}" gradientTransform="rotate(${f1(ang)} ${C} ${C})">
         <stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`,
    )
  }
}
function neonQuadrado([a, b], id) {
  return (t) => {
    const r = `x="26" y="26" width="${T - 52}" height="${T - 52}" rx="16" fill="none" pathLength="1000"`
    return svgQ(`<rect ${r} stroke="url(#${id})" stroke-width="${f1(6 + 2 * onda(t * 2))}" filter="url(#brilhoForte)"/>
      <rect ${r} stroke="#fff" stroke-width="1.3" opacity=".55"/>
      <rect ${r} stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="80 920" stroke-dashoffset="${f1(-t * 2000)}" filter="url(#brilho)"/>`,
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="10" y1="${C}" x2="278" y2="${C}" gradientTransform="rotate(${f1(t * 360)} ${C} ${C})">
         <stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`)
  }
}
const ARCO_IRIS = ['#ff2a2a', '#ffb02e', '#f5f542', '#3ddc84', '#33e1ff', '#1a73e8', '#b26bff', '#ff3df0', '#ff2a2a']

Object.assign(MOLDURAS, {
  'inferno-azul': { nome: 'Inferno Azul', quadro: chamasRedondas(['#1f5bff', '#33b4ff', '#d6f6ff', '#7fd8ff'], 7) },
  'inferno-roxo': { nome: 'Inferno Roxo', quadro: chamasRedondas(['#7b2cff', '#c04dff', '#ffd6ff', '#e08bff'], 8) },
  'inferno-verde': { nome: 'Inferno Verde', quadro: chamasRedondas(['#14a83c', '#3ddc84', '#e4ffd6', '#7dff9e'], 9) },
  'inferno-azul-quadrado': { nome: 'Inferno Azul Quadrado', forma: 'quadrada', quadro: chamasQuadradas(['#1f5bff', '#33b4ff', '#d6f6ff', '#7fd8ff'], 17) },
  'inferno-roxo-quadrado': { nome: 'Inferno Roxo Quadrado', forma: 'quadrada', quadro: chamasQuadradas(['#7b2cff', '#c04dff', '#ffd6ff', '#e08bff'], 18) },
  'inferno-verde-quadrado': { nome: 'Inferno Verde Quadrado', forma: 'quadrada', quadro: chamasQuadradas(['#14a83c', '#3ddc84', '#e4ffd6', '#7dff9e'], 19) },
  'neon-rosa': { nome: 'Neon Rosa', quadro: neonRedondo(['#ff3df0', '#7b2cff'], 'nrR') },
  'neon-sol': { nome: 'Neon Sol', quadro: neonRedondo(['#ff4655', '#f5c542'], 'nsR') },
  'neon-rosa-quadrado': { nome: 'Neon Rosa Quadrado', forma: 'quadrada', quadro: neonQuadrado(['#ff3df0', '#7b2cff'], 'nrQ') },
  'neon-sol-quadrado': { nome: 'Neon Sol Quadrado', forma: 'quadrada', quadro: neonQuadrado(['#ff4655', '#f5c542'], 'nsQ') },

  // RGB "gamer" redondo: arco-íris girando e dois brilhos brancos correndo
  rgb: {
    nome: 'RGB',
    quadro: (t) => {
      const c = (extra) => `<circle cx="${C}" cy="${C}" r="129" fill="none" pathLength="1000" ${extra}/>`
      return svg(`${c('stroke="url(#rgbR)" stroke-width="7" filter="url(#brilhoForte)"')}
        ${c('stroke="url(#rgbR)" stroke-width="3"')}
        ${c(`stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-dasharray="60 440" stroke-dashoffset="${f1(-t * 1000)}" filter="url(#brilho)"`)}`,
        `<linearGradient id="rgbR" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${T}" y2="${T}" gradientTransform="rotate(${f1(t * 360)} ${C} ${C})">
          ${ARCO_IRIS.map((cor, k) => `<stop offset="${f1(k / (ARCO_IRIS.length - 1))}" stop-color="${cor}"/>`).join('')}</linearGradient>`)
    },
  },

  // HUD redondo: quatro arcos de mira girando devagar, marcações e um ponto de varredura
  'hud-redondo': {
    nome: 'HUD Redondo',
    quadro: (t) => {
      const arcos = [0, 90, 180, 270].map((g) => {
        const a0 = ((g + t * 90 + 12) * Math.PI) / 180, a1 = ((g + t * 90 + 78) * Math.PI) / 180
        const [x0, y0] = ponto(127, a0), [x1, y1] = ponto(127, a1)
        return `<path d="M${f1(x0)},${f1(y0)} A127,127 0 0 1 ${f1(x1)},${f1(y1)}"/>`
      }).join('')
      const marcas = Array.from({ length: 36 }, (_, k) => {
        const a = (k / 36) * TAU
        const [x0, y0] = ponto(136, a), [x1, y1] = ponto(k % 3 === 0 ? 142 : 139, a)
        return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"/>`
      }).join('')
      const [px, py] = ponto(136, -t * TAU)
      return svg(`<circle cx="${C}" cy="${C}" r="121" fill="none" stroke="#fff" stroke-width="1.2" opacity=".35"/>
        <g fill="none" stroke="#3ddc84" stroke-width="5" stroke-linecap="round" filter="url(#brilho)">${arcos}</g>
        <g stroke="#3ddc84" stroke-width="1.6" opacity=".6">${marcas}</g>
        <circle cx="${f1(px)}" cy="${f1(py)}" r="4" fill="#eafff2" filter="url(#brilhoForte)"/>`)
    },
  },
})

// ── Turbilhão (estilo da Vortex): faixas em forma de lua crescente girando em espiral em volta da foto, umas por cima das
// outras em velocidades diferentes, e faíscas de energia saindo para os cantos. cores = [principal, clara, faíscas 1, faíscas 2]
function turbilhao([cor, clara, fa1, fa2], semente) {
  return (t) => {
    const rnd = sorteio(semente)
    // Faixa crescente: começa em a0, abre por "abre" radianos, grossura máxima "g", raio subindo em espiral
    const faixa = (a0, abre, g, r0, sobe) => {
      const N = 56, fora = [], dentro = []
      for (let k = 0; k <= N; k++) {
        const u = k / N, a = a0 + abre * u
        const gr = g * Math.sin(Math.PI * u) ** 0.7, r = r0 + sobe * u
        fora.push(ponto(r + gr / 2, a)); dentro.push(ponto(r - gr / 2, a))
      }
      return [...fora, ...dentro.reverse()].map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')
    }
    // Voltas por ciclo em número inteiro: a animação fecha certinho no fim
    const lista = [
      [1, 3.2, 11, 128, 7, cor], [-1, 2.6, 8, 135, -6, clara], [1, 2.4, 9, 122, 8, cor],
      [2, 2.0, 6, 139, -5, clara], [-2, 2.2, 7, 125, 6, cor], [1, 1.6, 3.5, 131, 5, clara],
    ].map(([voltas, abre, g, r0, sobe, c], k) => [faixa(t * voltas * TAU + k * 1.7, abre, g, r0, sobe), c])
    // Brilho embaixo (borrado) e as faixas nítidas por cima, com contorno escuro separando uma da outra
    const brilho = lista.map(([p, c]) => `<polygon points="${p}" fill="${c}"/>`).join('')
    const nitidas = lista.map(([p, c]) => `<polygon points="${p}" fill="${c}" stroke="#03141a" stroke-width="1.6" stroke-linejoin="round"/>`).join('')
    // Chamas de energia nos 4 cantos: línguas (como as do Inferno) saindo do anel rumo ao canto, balançando;
    // mais umas línguas curtinhas em volta do anel todo
    const lingua = (ang, base, alt, larg, bal, c, op) => {
      const [x1, y1] = ponto(base, ang - larg), [x2, y2] = ponto(base, ang + larg)
      const [xp, yp] = ponto(base + alt, ang + bal), [xc, yc] = ponto(base + alt * 0.55, ang + bal * 0.5)
      return `<path d="M${f1(x1)},${f1(y1)} Q${f1(xc)},${f1(yc)} ${f1(xp)},${f1(yp)} Q${f1(xc)},${f1(yc)} ${f1(x2)},${f1(y2)} Z" fill="${c}" opacity="${f1(op)}"/>`
    }
    let chamas = ''
    for (let q = 0; q < 4; q++) {
      const centro = q * (Math.PI / 2) + Math.PI / 4
      for (let k = 0; k < 14; k++) {
        const ang = centro + (rnd() - 0.5) * 1.15, fase = rnd()
        const perto = 1 - Math.abs(ang - centro) / 0.6 // mais comprida no meio do canto
        const alt = (14 + 40 * Math.max(0, perto)) * (0.55 + 0.45 * onda(t * 2 + fase))
        chamas += lingua(ang, 134, alt, 0.035 + 0.03 * rnd(), 0.12 * Math.sin((t * 2 + fase) * TAU), rnd() > 0.45 ? fa1 : fa2, 0.55 + 0.4 * rnd())
      }
    }
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * TAU + rnd() * 0.1, fase = rnd()
      chamas += lingua(ang, 136, 5 + 7 * onda(t * 3 + fase), 0.03, 0.05 * Math.sin((t + fase) * TAU), fa1, 0.5)
    }
    const faiscas = ''
    return svg(`<g filter="url(#brilho)">${chamas}</g>${faiscas}
      <g filter="url(#brilho)" opacity=".75">${brilho}</g>
      <g>${nitidas}</g>
      <circle cx="${C}" cy="${C}" r="121" fill="none" stroke="#03141a" stroke-width="2" opacity=".6"/>`)
  }
}
const TURBILHOES = {
  'turbilhao-ciano': ['Turbilhão Ciano', ['#19e6d0', '#a6fff3', '#1aa3ff', '#3ddc84']],
  'turbilhao-violeta': ['Turbilhão Violeta', ['#a24dff', '#e2c2ff', '#ff3df0', '#6a5cff']],
  'turbilhao-fogo': ['Turbilhão de Fogo', ['#ff6a1a', '#ffd38a', '#ff2a2a', '#ffb02e']],
  'turbilhao-gelo': ['Turbilhão de Gelo', ['#5ab8ff', '#e8f6ff', '#ffffff', '#7fd8ff']],
  'turbilhao-sangue': ['Turbilhão Sangue', ['#e0102a', '#ff8a96', '#ff4655', '#7a0010']],
  'turbilhao-ouro': ['Turbilhão Dourado', ['#f5c542', '#fff2b0', '#ffb02e', '#ffffff']],
  'turbilhao-toxico': ['Turbilhão Tóxico', ['#7dff2e', '#e4ffd0', '#c6ff00', '#2fbf6f']],
  'turbilhao-rosa': ['Turbilhão Rosa', ['#ff3d9a', '#ffd0e6', '#ff8ad0', '#b026ff']],
}
Object.entries(TURBILHOES).forEach(([id, [nome, cores]], k) => (MOLDURAS[id] = { nome, quadros: 72, atraso: 40, quadro: turbilhao(cores, 500 + k) }))

async function gerar(id) {
  const m = MOLDURAS[id]
  const total = m.quadros || QUADROS // alguns desenhos usam mais quadros (animação mais lisa)
  const quadros = []
  for (let i = 0; i < total; i++) {
    const { data } = await sharp(Buffer.from(m.quadro(i / total, i))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    quadros.push(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  }
  // Cores completas (sem reduzir paleta): qualidade máxima do brilho e dos degradês
  const apng = Buffer.from(UPNG.encode(quadros, T, T, 0, Array(total).fill(m.atraso || ATRASO)))
  await gravar(`neura/${id}`, apng)
  console.log(`neura/${id}`.padEnd(26), m.nome.padEnd(20), (m.forma || 'redonda').padEnd(9), Math.round(apng.length / 1024) + ' KB')
}

const pedidas = process.argv.slice(2)
for (const id of pedidas.length ? pedidas : Object.keys(MOLDURAS)) await gerar(id)
