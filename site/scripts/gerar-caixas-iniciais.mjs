// Gera worker/steam-login/src/caixas-iniciais.json: as caixas que a loja traz de fábrica (o dono muda tudo depois em Admin → Caixas).
// Usa o catálogo de skins do site (public/assets/skins/armas.json). Determinístico: sempre dá o mesmo resultado.
//   node scripts/gerar-caixas-iniciais.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { raridadeDaCor } from '../worker/steam-login/src/loja-core.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const catalogo = JSON.parse(fs.readFileSync(path.join(aqui, '../public/assets/skins/armas.json'), 'utf8'))

// preço por faixa e quantas skins de cada raridade a caixa leva (comum, incomum, raro, épico, lendário) + quantas facas
const FAIXAS = {
  barata: { preco: 300, por: [9, 7, 5, 3, 2], facas: 6 },
  media: { preco: 800, por: [8, 7, 6, 4, 3], facas: 9 },
  premium: { preco: 2000, por: [6, 6, 6, 5, 4], facas: 13 },
}
// [slug, nome, faixa, cor do card, palavras que combinam com o tema (nome da skin) ]
const CAIXAS = [
  ['caixa-radioativa', 'Caixa Radioativa', 'barata', '#7bd34f', ['toxic', 'nuclear', 'acid', 'hazard', 'radiation', 'neon', 'green', 'jungle', 'bio']],
  ['caixa-explorador', 'Caixa do Explorador', 'barata', '#c8893b', ['safari', 'desert', 'jungle', 'sand', 'dune', 'rust', 'camo', 'tornado', 'scorched']],
  ['caixa-faroeste', 'Caixa Faroeste', 'barata', '#d9a25a', ['sheriff', 'rust', 'leather', 'wood', 'bronze', 'gold', 'bullet', 'outlaw', 'canal']],
  ['caixa-abismo', 'Caixa do Abismo', 'barata', '#2f8fbf', ['ocean', 'blue', 'water', 'coral', 'sea', 'abyss', 'kraken', 'hydra', 'tide', 'wave', 'bright water']],
  ['caixa-pirata', 'Caixa do Pirata', 'barata', '#b9812f', ['pirate', 'skull', 'gold', 'bone', 'blood', 'crimson', 'sunset', 'treasure', 'rust']],
  ['caixa-navegador', 'Caixa do Navegador', 'barata', '#4aa3a0', ['compass', 'cobalt', 'blue', 'steel', 'ocean', 'storm', 'ice', 'frost', 'sky']],
  ['caixa-naufragio', 'Caixa Naufrágio', 'barata', '#4f8a6a', ['green', 'sea', 'moss', 'forest', 'swamp', 'boreal', 'emerald', 'jade']],
  ['caixa-sombria', 'Caixa Sombria', 'media', '#7a8794', ['night', 'dark', 'black', 'shadow', 'obsidian', 'carbon', 'ghost', 'phantom', 'death', 'noir']],
  ['caixa-alquimista', 'Caixa do Alquimista', 'media', '#a465e8', ['hydro', 'chemical', 'acid', 'violet', 'purple', 'crystal', 'poison', 'toxic', 'glass', 'elixir', 'marble']],
  ['caixa-halloween', 'Caixa Halloween', 'media', '#ff8a1f', ['pumpkin', 'skull', 'bone', 'blood', 'orange', 'bloodsport', 'hell', 'demon', 'ghost', 'necro', 'zombie']],
  ['caixa-natal', 'Caixa de Natal', 'media', '#e0463c', ['snow', 'frost', 'ice', 'red', 'candy', 'winter', 'santa', 'holly', 'frozen', 'white']],
  ['caixa-circo', 'Caixa do Circo', 'media', '#e2574c', ['clown', 'ringmaster', 'carnival', 'cartel', 'party', 'pop', 'toy', 'rainbow', 'candy', 'graffiti', 'sticker']],
  ['caixa-artica', 'Caixa Ártica', 'media', '#7fd2ee', ['ice', 'frost', 'snow', 'arctic', 'polar', 'blue', 'cold', 'glacier', 'winter', 'white', 'steel']],
  ['caixa-dragao', 'Caixa do Dragão', 'premium', '#ff3b30', ['dragon', 'fire', 'flame', 'hot', 'red', 'gold', 'lava', 'inferno', 'blaze', 'phoenix', 'asiimov', 'redline']],
  ['caixa-samurai', 'Caixa Samurai', 'premium', '#ff3d8b', ['ronin', 'samurai', 'hyper', 'neon', 'katana', 'oni', 'kitsune', 'japan', 'cyrex', 'cherry', 'sakura']],
  ['caixa-neon', 'Caixa Neon', 'premium', '#35d0ff', ['neon', 'neo', 'hyper', 'cyber', 'laser', 'light', 'rainbow', 'prism', 'spectrum', 'fade', 'gamma']],
  ['caixa-cosmica', 'Caixa Cósmica', 'premium', '#9fb4ff', ['space', 'galaxy', 'star', 'nebula', 'cosmic', 'orbit', 'moon', 'planet', 'astro', 'mecha', 'nuclear']],
  ['caixa-cibernetica', 'Caixa Cibernética', 'premium', '#8c5cff', ['cyber', 'circuit', 'tech', 'matrix', 'wire', 'neon', 'digital', 'hex', 'pixel', 'hacker', 'dark']],
  ['caixa-farao', 'Caixa do Faraó', 'premium', '#f2c230', ['pharaoh', 'egypt', 'gold', 'ankh', 'sphinx', 'tomb', 'mummy', 'sand', 'desert', 'bronze', 'anubis', 'hieroglyph']],
]

// ── valor aproximado (quanto maior, menor o peso: a skin é mais difícil de sair) ──
const ARMA_VALIOSA = { 9: 2.2, 7: 1.9, 16: 1.6, 60: 1.5, 1: 1.5, 4: 1.0, 61: 1.1, 40: 1.2, 64: 1.3, 8: 1.2, 39: 1.2 } // AWP, AK-47, M4A4, M4A1-S, Deagle, SSG, R8...
const SKIN_VALIOSA = /(dragon lore|howl|medusa|gungnir|fade|asiimov|fire serpent|hyper beast|neo-noir|printstream|vulcan|bloodsport|wild lotus|kill confirmed|gold arabesque|doppler|marble|case hardened|redline|desolate|crown|monster|lore)/i
const FACA_VALIOSA = { 507: 0.25, 515: 0.2, 505: 0.35, 508: 0.4, 509: 0.45, 500: 0.8, 514: 0.9 } // Karambit, Butterfly, Flip, M9, Huntsman... mais raras
const FACA_SKIN_RARA = /(doppler|fade|marble|tiger tooth|case hardened|slaughter|lore|gamma|autotronic|black laminate|freehand|damascus)/i
const FACA_SKIN_COMUM = /(boreal|forest|safari|scorched|urban|night|stained|rust|crimson web|ultraviolet|blue steel)/i

// PRNG determinístico (mulberry32) para a mesma caixa sempre sair igual
function prng(seed) {
  let a = [...seed].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 7)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const armas = catalogo.armas.filter((a) => ['rifles', 'smgs', 'pistols', 'heavy'].includes(a.c))
const facas = catalogo.armas.filter((a) => a.c === 'facas')
const todasSkins = armas.flatMap((a) => a.s.map((s) => ({ d: a.d, arma: a.n, p: s[0], nome: s[1], r: raridadeDaCor(s[2]), min: s[3], max: s[4], l: s[7] ? 1 : 0 })))
const todasFacas = facas.flatMap((a) => a.s.map((s) => ({ d: a.d, arma: a.n, p: s[0], nome: s[1], min: s[3], max: s[4], l: s[7] ? 1 : 0 })))

const escolher = (lista, n, rnd, bonus) => {
  // sorteio sem repetir: quem combina com o tema tem 6x mais chance de entrar
  const pool = lista.map((x) => ({ x, v: rnd() * (bonus(x) ? 6 : 1) })).sort((a, b) => b.v - a.v)
  return pool.slice(0, n).map((y) => y.x)
}

const caixas = CAIXAS.map(([slug, nome, faixa, cor, tema], n) => {
  const rnd = prng(slug)
  const cfg = FAIXAS[faixa]
  const combina = (x) => tema.some((k) => x.nome.toLowerCase().includes(k))
  const itens = []
  const usados = new Set()
  for (let r = 0; r <= 4; r++) {
    const pool = todasSkins.filter((s) => s.r === r && !usados.has(`${s.d}:${s.p}`))
    for (const s of escolher(pool, cfg.por[r], rnd, combina)) {
      usados.add(`${s.d}:${s.p}`)
      // peso: mais valiosa = mais rara dentro da própria raridade
      let w = 100 / (ARMA_VALIOSA[s.d] || 1)
      if (SKIN_VALIOSA.test(s.nome)) w *= 0.45
      if (combina(s)) w *= 1.15
      itens.push({ d: s.d, p: s.p, r, w: Math.max(1, Math.round(w)), min: s.min, max: s.max, l: s.l })
    }
  }
  const poolFacas = todasFacas.filter((f) => f.nome !== 'Vanilla')
  const fx = escolher(poolFacas, cfg.facas, rnd, combina).map((f) => {
    let w = 100 * (FACA_VALIOSA[f.d] ?? 1)
    if (FACA_SKIN_RARA.test(f.nome)) w *= 0.4
    else if (FACA_SKIN_COMUM.test(f.nome)) w *= 1.6
    return { d: f.d, p: f.p, w: Math.max(1, Math.round(w)), min: f.min, max: f.max, l: f.l }
  })
  return { id: n + 1, slug, nome, img: `/assets/caixas/web/${slug}.webp`, preco: cfg.preco, tier: faixa, ativa: true, cor, itens, facas: fx }
})

const saida = path.join(aqui, '../worker/steam-login/src/caixas-iniciais.json')
fs.writeFileSync(saida, JSON.stringify(caixas))
console.log(`${caixas.length} caixas, ${caixas.reduce((a, c) => a + c.itens.length, 0)} skins e ${caixas.reduce((a, c) => a + c.facas.length, 0)} facas → ${path.relative(process.cwd(), saida)}`)
