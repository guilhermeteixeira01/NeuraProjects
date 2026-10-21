// Gera worker/steam-login/src/caixas-iniciais.json: as caixas que a loja traz de fábrica (o dono muda tudo depois em Admin → Caixas).
// Usa o catálogo de skins do site (public/assets/skins/armas.json). Determinístico: sempre dá o mesmo resultado.
//   node scripts/gerar-caixas-iniciais.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { raridadeDaCor } from '../worker/steam-login/src/loja-core.js'
import { valorBaseDaFaca } from './lib-facas.mjs'

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


// ───────────────────────── 11 caixas novas: 5 de arma, 1 de facas e 5 de amuletos e adesivos ─────────────────────────
const adesivos = JSON.parse(fs.readFileSync(path.join(aqui, '../public/assets/skins/adesivos.json'), 'utf8')) // [def, nome, img]
const chaveiros = JSON.parse(fs.readFileSync(path.join(aqui, '../public/assets/skins/chaveiros.json'), 'utf8')) // [def, nome, img, cor]
const novas = []
const faltou = []
const proxId = () => caixas.length + novas.length + 1
const peso = (valor) => Math.max(1, Math.round(100000 / valor))

// ── caixas de ARMA: só skins daquela arma (+ o mesmo tier de facas das outras caixas) ──
const ARMAS = [
  ['caixa-ak47', 'Caixa AK-47', 'media', '#d4742c', 800, [7]],
  ['caixa-awp', 'Caixa AWP', 'premium', '#3ea6ff', 1000, [9]],
  ['caixa-deagle', 'Caixa Desert Eagle', 'media', '#e0b13a', 600, [1]],
  ['caixa-m4a1', 'Caixa M4A1', 'media', '#4fb36a', 800, [60, 16]],
  ['caixa-glock', 'Caixa Glock', 'barata', '#9a79e8', 400, [4]],
]
for (const [slug, nome, tier, cor, preco, defs] of ARMAS) {
  const rnd = prng(slug)
  const itens = []
  for (const a of armas.filter((x) => defs.includes(x.d))) {
    for (const s of a.s) {
      if (!s[0]) continue
      const w = 100 / (SKIN_VALIOSA.test(s[1]) ? 2.2 : 1)
      itens.push({ d: a.d, p: s[0], r: Math.min(4, raridadeDaCor(s[2])), w: Math.max(1, Math.round(w)), min: s[3], max: s[4], l: s[7] ? 1 : 0 })
    }
  }
  const fx = escolher(todasFacas.filter((f) => f.nome !== 'Vanilla'), 8, rnd, () => false).map((f) => {
    let w = 100 * (FACA_VALIOSA[f.d] ?? 1)
    if (FACA_SKIN_RARA.test(f.nome)) w *= 0.4
    else if (FACA_SKIN_COMUM.test(f.nome)) w *= 1.6
    return { d: f.d, p: f.p, w: Math.max(1, Math.round(w)), min: f.min, max: f.max, l: f.l }
  })
  novas.push({ id: proxId(), slug, nome, img: '/assets/caixas/web/' + slug + '.webp', preco, tier, ativa: true, cor, itens, facas: fx })
}

// ── caixa de FACAS: só facas; a mais cara da loja. Mais valiosas (Karambit, Butterfly, Doppler, Fade...) nas raridades altas e com chance menor ──
{
  const rnd = prng('caixa-facas')
  const todas = todasFacas.filter((f) => f.nome !== 'Vanilla').map((f) => ({ ...f, valor: valorBaseDaFaca(f.d, f.nome) }))
  const escolhidas = []
  for (const d of [...new Set(todas.map((f) => f.d))]) {
    const dele = todas.filter((f) => f.d === d).sort((a, b) => b.valor - a.valor)
    escolhidas.push(...dele.slice(0, 3), ...escolher(dele.slice(3), 5, rnd, () => false)) // as 3 melhores de cada modelo + 5 ao acaso
  }
  escolhidas.sort((a, b) => b.valor - a.valor)
  const n = escolhidas.length
  const faixa = (i) => (i < n * 0.05 ? 4 : i < n * 0.15 ? 3 : i < n * 0.35 ? 2 : i < n * 0.65 ? 1 : 0)
  const itens = escolhidas.map((f, i) => ({ t: 'faca', d: f.d, p: f.p, r: faixa(i), w: peso(f.valor), min: f.min, max: f.max, l: f.l }))
  novas.push({ id: proxId(), slug: 'caixa-facas', nome: 'Caixa de Facas', img: '/assets/caixas/web/caixa-facas.webp', preco: 3500, tier: 'premium', ativa: true, cor: '#e4ae39', itens, facas: [] })
}

// ── caixas de AMULETOS (chaveiros) e ADESIVOS: sem armas e sem facas. Raridade pelo acabamento do adesivo e pela cor do amuleto ──
const FINISH = /\s\((Holo|Foil|Gold|Glitter|Lenticular|Embroidered)[^)]*\)/i
const baseDe = (nome) => nome.replace(FINISH, '').trim().toLowerCase()
const raridadeAdesivo = (nome) => {
  const m = FINISH.exec(nome)
  const f = (m?.[1] || '').toLowerCase()
  return f === 'gold' ? 4 : f === 'foil' || f === 'lenticular' || f === 'embroidered' ? 3 : f === 'holo' ? 2 : f === 'glitter' ? 1 : 0
}
const raridadeChaveiro = (cor) => ({ '#4b69ff': 1, '#8847ff': 2, '#d32ce6': 3, '#eb4b4b': 4 })[(cor || '').toLowerCase()] ?? 1
const AMULETOS = [
  [
    'caixa-fliperama', 'Caixa Fliperama', 'barata', '#ff4fd8', 250,
    ['Pixel Avenger', 'Press Start', 'Retro Leet', 'Retro Zeus', 'Old School', 'Separate Pixels', 'PAC AI', 'Digi-Strike', 'Runtime', 'Cubix Connexion', 'Lambda', 'Vice Cursor', 'Neon MVP', 'Good Game', 'Well Played', 'GO', 'Lock In', 'Rush 4x20', 'XD', 'Arms Race', 'Battlefield Portal', 'BF 2042', 'Cyber Chicken', 'Cyber Romanov', 'Robo', 'Bullet Hell', 'Hi, My Game Is', 'Try Hard', 'EZ', 'Rekt', 'Flex', 'Boost', 'Lit', 'Rage', 'Nice Shot', 'Nice Clutch', 'Clutchman', 'Entry Fragger', 'Hard Carry', 'Not A Bot', 'The Bot', 'The Pro', 'The Fragger', 'Kill Count', 'Headshot Guarantee', 'Econometer', 'Eco Rush', 'Full Buy', 'Neon Opal Strafe', 'Mood Ring Strafe'],
    ['Disco MAC', 'Die-cast AK', 'Pocket AWP', 'Titeenium AWP', 'POP Art', 'Pocket Pop', 'Big Brain', 'Hot Hands', "Lil' Cap Gun", 'Hang Loose', 'Glitter Bomb', 'Bomb Tag'],
  ],
  [
    'caixa-kawaii', 'Caixa Kawaii', 'barata', '#ff8ac6', 250,
    ['Kawaii CT', 'Kawaii Eyes', 'Kawaii Killer CT', 'Kawaii Killer Terrorist', 'Kawaii T', 'Cutie', 'Lucky Cat', 'Zap Cat', 'Cat Call', 'Pandamonium', 'Pop Pup', 'Nelu the Bear', 'Doru The Fox', 'Big Hugs', 'Free Hugs', 'Unicorn', 'Hamster Hawk', 'Guinea Pig', 'Baby Howl', 'Baby Lore', 'Baby Cerberus', 'Baby Medusa', 'Baby Fire Serpent', 'Little Mischief', 'Loving Eyes', 'Pink Jaggyfish', 'My Little Friend', 'Say Cheese', 'Sent With Love', 'Googly Eye', 'Mr. Chompy', 'Purrurists', 'Toy Tiger', 'Hello AK-47', 'Hello AWP', 'Hello M4A1-S', 'Hello M4A4', 'Hello P90', 'Hello MP9', 'Hello MP7', 'Hello UMP-45', 'Hello SG 553', 'Hello FAMAS', 'Hello AUG', 'Hello CZ75-Auto', 'Hello Galil AR', 'Hello MAC-10', 'Hello PP-Bizon', 'Hello XM1014'],
    ["Lil' Whiskers", "Lil' Buns", "Lil' Chirp", "Lil' Happy", "Lil' Teacup", "Lil' Dumplin'", 'Fluffy', 'Piñatita', "Lil' Yeti", "Lil' Squirt", "Lil' Ava", "Lil' Baller", "Lil' Sandy"],
  ],
  [
    'caixa-terror', 'Caixa Terror', 'barata', '#e0572b', 300,
    ['Skull Lil Boney', 'Skull Troop', 'Skulltorgeist', 'Rising Skull', 'Bonehead', 'Death Comes', 'Zombie Hop', 'The Zombie', 'Zombie Lover', 'Trick Or Threat', 'Trick Or Treat', 'Witch', 'Witchcraft', 'Cursed Penmanship', 'Terrorized', 'Doomed', 'Bite Me', 'Blood Moon Tentaskull', 'Blood Moon Wave Rider', 'Heresy', 'Lord of Skulls', 'Bloodthirster', 'Astartes Skull', 'Hypnoteyes', 'Dead Eye', 'Gutted', 'Skelly Stabby', 'Toxic Tentaskull', 'Black Dog', 'Stalking Prey', 'Clown Nose', 'Clown Wig', 'Ace Devil', 'Blood Boiler', 'Chaos Marine', 'Death Guard 1', 'Death Guard 2', 'Nuke Beast'],
    ["Lil' Boo", "Lil' Bloody", "Lil' Curse", "Lil' Cackle", "Lil' Eldritch", "Lil' Chomper", "Lil' Monster", 'Dead Weight', "Lil' Goop", 'Hungry Eyes', 'Eye of Ball', 'Stitch-Loaded', "Lil' Crass", "Lil' Facelift", 'Gritty'],
  ],
  [
    'caixa-espacial', 'Caixa Espacial', 'barata', '#6c7bff', 350,
    ['Space Marine', 'Space Wolves', 'Ultramarines', 'Imperial Fists', 'Necron', 'Necron Ankh', 'Necron Glyphs', 'Tyranids 1', 'Tyranids 2', 'Tyranids Hive Tyrant', 'Tyranids Ravener', "T'au Empire 1", "T'au Empire 2", 'Aeldari 1', 'Aeldari 2', 'Aeldari Avatar', 'Orks 1', 'Orks 2', 'Ork Waaagh!', 'Adeptus Astartes', 'Adeptus Mechanicus 1', 'Adeptus Mechanicus 2', 'Adeptus Titanicus 1', 'Adeptus Titanicus 2', 'Adeptus Custodes 1', 'Adeptus Custodes 2', 'Dark Angels', 'Blood Angels', 'Iron Hands', 'Salamanders', 'Raven Guard', 'White Scars', 'Crimson Fists', 'Leagues of Votann 1', 'Leagues of Votann 2', 'Harlequins 1', 'Harlequins 2', 'Drukhari 1', 'Drukhari 2', 'Imperial Knights', 'Cadia', 'Astra Militarum 1', 'Astra Militarum 2', 'Vortigaunt', 'Vortigaunt the Painter', 'Combine Helmet', 'Exo Jumper', 'Leaving The Station', 'Shooting Star Return', 'Repulsor', 'Counter-Tech', 'Terrorist-Tech', 'Laser Beam', 'Lambda'],
    ['Biomech', 'Titeenium AWP', 'Quick Silver', 'Semi-Precious', 'Magmatude', 'Flash Bomb', 'Backsplash', 'Glamour Shot'],
  ],
  [
    'caixa-lendas', 'Caixa Lendas', 'media', '#f5c542', 500,
    ['Dragon', 'Dragon Lore', 'Dragon Tale', "Dragon's Keep", 'Guardian Dragon', 'Legendary', 'Legendary Eagle', 'Legendary Eagle Master', 'All Hail the King', 'King on the Field', 'Crown', 'Emperor', "Emperor's Children 1", "Emperor's Children 2", 'God of Fortune', 'Phoenix', 'Phoenix Reborn', 'Pegasus', 'Manticore', 'Basilisk', 'Cerberus', 'Hippocamp', 'Nezha', 'Pixiu', 'Sphinx', 'Aztec', 'Harp of War', 'Noble', 'Noble Steed', 'Hidden Hero', "Vertigo's Hero", 'Distinguished Master Guardian', 'Master Guardian', 'Master Guardian Elite', 'Supreme Master First Class', 'Global Elite', 'Lore Poison Frog', 'Fancy Koi', 'Twin Koi', 'Great Wave', 'Shaolin', 'The Samurai', 'The Spartan', 'Spartan', 'Winged Defuser'],
    ['Hot Howl', "Lil' Serpent", "Lil' Hero", "Lil' Ferno", 'Magmatude', 'Semi-Precious', "Lil' Squatch", 'Hot Sauce'],
  ],
]
// Tipo de cada caixa: Fliperama = amuletos e adesivos; Kawaii e Terror = SÓ adesivos; Lendas e Espacial = SÓ amuletos (chaveiros)
const SO_ADESIVOS = new Set(['caixa-kawaii', 'caixa-terror'])
const SO_AMULETOS = {
  'caixa-lendas': ['Hot Howl', "Lil' Serpent", "Lil' Hero", "Lil' Ferno", 'Magmatude', 'Semi-Precious', "Lil' Squatch", 'Hot Sauce', "Lil' Yeti", "Lil' Tusk", "Lil' SAS", "Lil' Zen", 'Diamond Dog', 'Quick Silver', 'Titeenium AWP', 'Pocket AWP', 'Die-cast AK', "Baby's AK", "Lil' Smokey", "Lil' Eco", 'Whittle Knife', 'Whittle Guy', 'Big Kev', "Lil' Moments", 'Hot Hands', 'Hot Wurst', "Lil' Eldritch", "Lil' Baller"],
  'caixa-espacial': ['Biomech', 'Titeenium AWP', 'Quick Silver', 'Semi-Precious', 'Magmatude', 'Flash Bomb', 'Backsplash', 'Glamour Shot', 'Glitter Bomb', 'Disco MAC', 'Big Brain', "Lil' Eco", "Lil' Goop", 'Eye of Ball', '8 Ball IGL', 'Dr. Brian', "Lil' Moments", 'Butane Buddy', "Lil' Zen", 'Splatter Cat', 'POP Art', "Pinch O' Salt", 'Hungry Eyes', "Lil' Eldritch", 'Dead Weight', 'Pocket Pop'],
}
for (const [slug, nome, tier, cor, preco, stickersBase, charmsBase] of AMULETOS) {
  const stickers = slug in SO_AMULETOS ? [] : stickersBase
  const charms = SO_ADESIVOS.has(slug) ? [] : SO_AMULETOS[slug] || charmsBase
  const itens = []
  const base = new Map()
  for (const a of adesivos) {
    const b = baseDe(a[1])
    if (!base.has(b)) base.set(b, [])
    base.get(b).push(a)
  }
  const jaTem = new Set()
  const colocar = (it) => {
    const k = it.t + it.d
    if (!jaTem.has(k)) {
      jaTem.add(k)
      itens.push(it)
    }
  }
  for (const nomeBase of new Set(stickers)) {
    const lista = base.get(nomeBase.toLowerCase())
    if (!lista) {
      faltou.push(slug + ': adesivo "' + nomeBase + '"')
      continue
    }
    for (const a of lista) colocar({ t: 'adesivo', d: a[0], p: 0, r: raridadeAdesivo(a[1]), w: 100, min: 0, max: 1, l: 0, n: a[1], i: a[2] })
  }
  if (false) for (const a of adesivos) if (/\(Champion\)/i.test(a[1])) colocar({ t: 'adesivo', d: a[0], p: 0, r: 4, w: 60, min: 0, max: 1, l: 0, n: a[1], i: a[2] }) // campeões de Major: o topo da caixa
  for (const nomeC of new Set(charms)) {
    const c = chaveiros.find((x) => x[1].toLowerCase() === nomeC.toLowerCase())
    if (!c) {
      faltou.push(slug + ': chaveiro "' + nomeC + '"')
      continue
    }
    colocar({ t: 'chaveiro', d: c[0], p: 0, r: raridadeChaveiro(c[3]), w: 100, min: 0, max: 1, l: 0, n: c[1], i: c[2] })
  }
  // pirâmide de raridades: o acabamento (ou a cor do amuleto) manda, e dentro de cada acabamento o desempate é sorteado (sempre igual). Topo 5% lendário, 10% épico, 20% raro, 30% incomum, resto comum
  const rr = prng(slug + '-raridade')
  const ordem = itens.map((it) => ({ it, k: it.r + (it.t === 'chaveiro' ? 0.5 : 0) + rr() * 0.3 })).sort((a, b) => b.k - a.k)
  ordem.forEach((x, i) => {
    const q = i / ordem.length
    x.it.r = q < 0.05 ? 4 : q < 0.15 ? 3 : q < 0.35 ? 2 : q < 0.65 ? 1 : 0
  })
  novas.push({ id: proxId(), slug, nome, img: '/assets/caixas/web/' + slug + '.webp', preco, tier, ativa: true, cor, itens, facas: [] })
}
caixas.push(...novas)
for (const c of novas) {
  const por = [0, 0, 0, 0, 0]
  c.itens.forEach((i) => por[i.r]++)
  console.log(c.nome.padEnd(22), String(c.preco).padStart(5), 'NP', 'itens', String(c.itens.length).padStart(3), 'por raridade', por.join('/'), 'facas', c.facas.length)
}
if (faltou.length) console.log('NÃO ENCONTRADOS no catálogo:', faltou.join('; '))

const saida = path.join(aqui, '../worker/steam-login/src/caixas-iniciais.json')
fs.writeFileSync(saida, JSON.stringify(caixas))
console.log(`${caixas.length} caixas, ${caixas.reduce((a, c) => a + c.itens.length, 0)} skins e ${caixas.reduce((a, c) => a + c.facas.length, 0)} facas → ${path.relative(process.cwd(), saida)}`)
