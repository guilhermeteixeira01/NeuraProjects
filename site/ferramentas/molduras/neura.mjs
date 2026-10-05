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
  <mask id="anel"><rect width="${T}" height="${T}" fill="#fff"/><circle cx="${C}" cy="${C}" r="113" fill="#000"/></mask>`

const svg = (corpo, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}"><defs>${DEFS}${defs}</defs><g mask="url(#anel)">${corpo}</g></svg>`

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

  // Aurora: faixas de luz suaves passando em volta
  aurora: {
    nome: 'Aurora',
    quadro: (t) => {
      const cores = ['#2de2a6', '#38b6ff', '#a66cff', '#2de2a6', '#ff6ec7', '#38b6ff', '#2de2a6', '#a66cff']
      const manchas = cores
        .map((cor, k) => {
          const ang = (t + k / cores.length) * TAU
          const [x, y] = ponto(132, ang)
          const rx = 58 + 14 * onda(t * 2 + k / 8)
          return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(12 + 5 * onda(t * 3 + k / 8))}" fill="${cor}" opacity=".7" transform="rotate(${f1((ang * 180) / Math.PI + 90)} ${f1(x)} ${f1(y)})"/>`
        })
        .join('')
      return svg(`<g filter="url(#borrar)">${manchas}</g>
        <circle cx="${C}" cy="${C}" r="130" fill="none" stroke="#e8fff8" stroke-width="1.2" opacity=".5"/>`)
    },
  },
}

async function gerar(id) {
  const m = MOLDURAS[id]
  const quadros = []
  for (let i = 0; i < QUADROS; i++) {
    const { data } = await sharp(Buffer.from(m.quadro(i / QUADROS, i))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    quadros.push(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  }
  // 256 cores por quadro: arquivo bem menor, sem diferença visível no brilho
  const apng = Buffer.from(UPNG.encode(quadros, T, T, 256, Array(QUADROS).fill(ATRASO)))
  await gravar(`neura/${id}`, apng)
  console.log(`neura/${id}`.padEnd(22), m.nome.padEnd(12), Math.round(apng.length / 1024) + ' KB')
}

const pedidas = process.argv.slice(2)
for (const id of pedidas.length ? pedidas : Object.keys(MOLDURAS)) await gerar(id)
