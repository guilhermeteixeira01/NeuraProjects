// Gera as caixas NOVAS da loja (71) e as junta às antigas em worker/steam-login/src/caixas-iniciais.json.
// As antigas ficam no arquivo com "arquivada": true (somem da loja, mas quem já tem uma fechada no inventário ainda abre). Pode rodar de novo à vontade:
// refaz só as novas (os slugs da lista abaixo) e deixa as antigas como estão.
//   node scripts/gerar-caixas-novas.mjs            (depois: node scripts/precos-caixas-novas.mjs para dar preço só às novas)
// As imagens vêm de public/assets/caixas/web/<slug>.webp (conversão dos PNG de ferramentas/caixas-originais).
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { raridadeDaCor } from '../worker/steam-login/src/loja-core.js'
import { valorBaseDaFaca } from './lib-facas.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const lerJson = (p) => JSON.parse(fs.readFileSync(path.join(aqui, p), 'utf8'))
const catalogo = lerJson('../public/assets/skins/armas.json')
const precos = lerJson('../worker/steam-login/src/precos.json')
const cores = lerJson('../ferramentas/skins/cores-skins.json')
const adesivos = lerJson('../public/assets/skins/adesivos.json') // [def, nome, img]
const chaveiros = lerJson('../public/assets/skins/chaveiros.json') // [def, nome, img, cor]
const mapa = lerJson('./caixas-mapa.json') // [{ pasta, arquivo, nome, slug }] (gerado na conversão das imagens)

const precoDe = (d, p) => {
  const l = precos.skins[`${d}:${p}`]
  if (!l) return 0
  const v = l.slice(0, l.length === 2 ? 1 : 5).filter((x) => x > 0).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : 0
}
const pesoPeloPreco = (valor) => Math.max(1, Math.round(10000 / Math.pow(Math.max(1, valor), 0.5)))

function prng(seed) {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 7)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── nome, faixa e tema de cada caixa nova ──
// Cor medida de cada skin: h = 12 faixas de matiz (0 vermelho, 1 laranja/dourado, 2 amarelo, 3 verde-amarelo, 4 verde, 5 verde-ciano, 6 ciano, 7 azul-claro,
// 8 azul, 9 violeta, 10 magenta, 11 rosa); cor, branco, preto, cinza, ouro, sat, luz.
const H = (f, ...i) => i.reduce((s, k) => s + f.h[k], 0)
const TEMAS = {
  // Anime
  'anime-hollow': { nome: 'Caixa Hollow', tier: 'premium', nota: (f) => f.branco * 2.4 + f.preto * 0.9 + H(f, 0) * f.cor * 1.2, palavras: ['bone', 'skull', 'ghost', 'white', 'death', 'bloodsport', 'hollow'] },
  'anime-ichigo': { nome: 'Caixa Ichigo', tier: 'premium', nota: (f) => H(f, 1, 0) * f.cor * 1.6 + f.preto * 0.8 + f.branco * 0.6, palavras: ['orange', 'blaze', 'hyper', 'dragon', 'redline', 'sunset', 'fire'] },
  'anime-kakashi': { nome: 'Caixa Kakashi', tier: 'premium', nota: (f) => f.cinza * 1.6 + H(f, 7, 8) * f.cor * 1.4 + f.branco * 0.8, palavras: ['steel', 'ninja', 'blue', 'silver', 'storm', 'lightning', 'ghost'] },
  'anime-naruto': { nome: 'Caixa Naruto', tier: 'premium', nota: (f) => H(f, 1) * f.cor * 2 + H(f, 7, 8, 6) * f.cor * 0.9, palavras: ['orange', 'fox', 'kitsune', 'blaze', 'chakra', 'neon', 'hyper'] },
  'anime-sasuke': { nome: 'Caixa Sasuke', tier: 'premium', nota: (f) => H(f, 8, 9) * f.cor * 1.6 + f.preto * 1.2 + H(f, 0) * f.cor * 0.4, palavras: ['dark', 'shadow', 'night', 'violet', 'blue', 'lightning', 'phantom', 'cyrex'] },
  // CS temáticas
  'cs-tematicas-clutch': { nome: 'Caixa Clutch', tier: 'premium', nota: (f) => f.cor * f.sat * 1.6 + f.ouro * 1.2 + f.preto * 0.3, palavras: ['asiimov', 'neo', 'fade', 'hyper', 'gold', 'crown', 'lore', 'prince'] },
  'cs-tematicas-dust-ii': { nome: 'Caixa Dust II', tier: 'media', nota: (f) => (H(f, 1, 2) + f.h[0] * 0.2) * f.cor * (1.3 - f.sat) * 1.8 + f.ouro * 1.2, palavras: ['dust', 'sand', 'desert', 'dune', 'safari', 'tornado', 'scorched', 'rust', 'wasteland', 'sandstorm'] },
  'cs-tematicas-inferno': { nome: 'Caixa Inferno', tier: 'media', nota: (f) => H(f, 0, 1) * f.cor * 2 + f.preto * 0.3, palavras: ['fire', 'inferno', 'flame', 'lava', 'blaze', 'hell', 'hot', 'burn', 'magma', 'redline'] },
  'cs-tematicas-nuke': { nome: 'Caixa Nuke', tier: 'media', nota: (f) => H(f, 2, 3, 4) * f.cor * 1.6 + f.cinza * 0.9 + f.preto * 0.3, palavras: ['nuclear', 'nuke', 'toxic', 'hazard', 'radiation', 'steel', 'reactor', 'rust', 'atomic'] },
  'cs-tematicas-rush-b': { nome: 'Caixa Rush B', tier: 'media', nota: (f) => H(f, 0, 1, 2) * f.cor * 1.4 + f.preto * 0.9 + f.cinza * 0.3, palavras: ['rush', 'hazard', 'bomb', 'tactical', 'red', 'jet', 'stained', 'camo', 'carbon'] },
  // Criaturas
  'criaturas-caos': { nome: 'Caixa Caos', tier: 'media', nota: (f) => f.cor * (1 - Math.max(...f.h)) * 2.4 + H(f, 9, 10, 0) * f.cor * 0.8, palavras: ['chaos', 'hyper', 'fade', 'bloodsport', 'graffiti', 'psychedelic'] },
  'criaturas-ceifador': { nome: 'Caixa Ceifador', tier: 'media', nota: (f) => f.preto * 1.8 + (1 - f.luz) * 0.8 - f.cor * 0.5 + H(f, 0) * f.cor * 0.3, palavras: ['reaper', 'death', 'skull', 'bone', 'night', 'shadow', 'black', 'grim', 'phantom'] },
  'criaturas-espantalho': { nome: 'Caixa Espantalho', tier: 'barata', nota: (f) => H(f, 1, 2) * f.cor * 1.5 + f.preto * 0.5 + f.cinza * 0.3 - f.sat * 0.2, palavras: ['straw', 'pumpkin', 'orange', 'rust', 'wood', 'leather', 'harvest', 'jungle', 'safari'] },
  'criaturas-laboratorio': { nome: 'Caixa Laboratório', tier: 'media', nota: (f) => H(f, 3, 4, 5, 6) * f.cor * 1.8 + f.branco * 1.2, palavras: ['lab', 'hydro', 'chemical', 'acid', 'toxic', 'bio', 'poison', 'crystal', 'glass', 'elixir', 'gamma'] },
  'criaturas-marionete': { nome: 'Caixa Marionete', tier: 'barata', nota: (f) => H(f, 11, 10, 0) * f.cor * 1.4 + f.branco * 1.4, palavras: ['puppet', 'doll', 'toy', 'clown', 'cartel', 'string', 'wood', 'pink', 'candy', 'pop'] },
  'criaturas-pantano': { nome: 'Caixa Pântano', tier: 'barata', nota: (f) => H(f, 3, 4, 5) * f.cor * (1.3 - f.luz) * 1.9, palavras: ['swamp', 'moss', 'forest', 'jungle', 'boreal', 'emerald', 'green', 'bog', 'toxic'] },
  'criaturas-pesadelo': { nome: 'Caixa Pesadelo', tier: 'media', nota: (f) => H(f, 9, 10) * f.cor * 1.6 + f.preto * 1.2 + H(f, 0) * f.cor * 0.5, palavras: ['nightmare', 'dream', 'demon', 'hell', 'dark', 'ghost', 'phantom', 'necro', 'violet', 'cthulhu'] },
  // Desenhos
  'desenhos-pizza-cosmica': { nome: 'Caixa Pizza Cósmica', tier: 'barata', nota: (f) => H(f, 0, 1, 2) * f.cor * 1.2 + H(f, 8, 9) * f.cor * 0.9 + f.sat * 0.3, palavras: ['pizza', 'space', 'galaxy', 'cosmic', 'orbit', 'star', 'candy', 'toy', 'sunset'] },
  'desenhos-robo-de-sucata': { nome: 'Caixa Robô de Sucata', tier: 'barata', nota: (f) => f.cinza * 1.8 + f.ouro * 1.2 + H(f, 1) * f.cor * 0.8 + f.preto * 0.3, palavras: ['robot', 'mecha', 'rust', 'scrap', 'steel', 'iron', 'circuit', 'rusty', 'metal', 'bronze'] },
  'desenhos-sapo-executivo': { nome: 'Caixa Sapo Executivo', tier: 'media', nota: (f) => H(f, 3, 4) * f.cor * 1.6 + f.cinza * 0.8 + f.preto * 0.8 + f.ouro * 0.8, palavras: ['frog', 'toad', 'green', 'emerald', 'gold', 'cash', 'suit', 'business', 'crown', 'jade'] },
  'desenhos-tv-pirata': { nome: 'Caixa TV Pirata', tier: 'barata', nota: (f) => f.sat * f.cor * 2.2 * (1 - Math.max(...f.h)) + H(f, 6, 10) * f.cor * 1.2, palavras: ['tv', 'pirate', 'neon', 'static', 'rainbow', 'pixel', 'cyber', 'retro', 'arcade', 'hyper'] },
  'desenhos-turno-da-madrugada': { nome: 'Caixa Turno da Madrugada', tier: 'barata', nota: (f) => H(f, 8, 9) * f.cor * 1.2 + f.preto * 1.4 + H(f, 2) * f.cor * 0.8 + (1 - f.luz) * 0.5, palavras: ['night', 'midnight', 'moon', 'dark', 'blue', 'shadow', 'noir', 'neo-noir', 'asphalt'] },
  // Halloween
  'halloween-abobora': { nome: 'Caixa Abóbora', tier: 'barata', nota: (f) => H(f, 1) * f.cor * 2 + f.preto * 0.6, palavras: ['pumpkin', 'orange', 'jack', 'harvest', 'hell', 'blaze', 'ghoul'] },
  'halloween-bruxa': { nome: 'Caixa Bruxa', tier: 'media', nota: (f) => H(f, 9, 10) * f.cor * 1.7 + H(f, 4, 3) * f.cor * 0.9 + f.preto * 0.4, palavras: ['witch', 'potion', 'poison', 'violet', 'purple', 'hex', 'elixir', 'toxic', 'crystal', 'curse'] },
  'halloween-cemiterio': { nome: 'Caixa Cemitério', tier: 'barata', nota: (f) => f.cinza * 1.6 + f.preto * 1.2 + f.branco * 0.6 - f.cor * 0.5, palavras: ['grave', 'tomb', 'bone', 'death', 'skull', 'gray', 'stone', 'ghost', 'moon', 'necro'] },
  'halloween-fantasma': { nome: 'Caixa Fantasma', tier: 'media', nota: (f) => f.branco * 3 + H(f, 6, 7, 5) * f.cor * 1.2 + f.luz * 0.5, palavras: ['ghost', 'phantom', 'spirit', 'white', 'frost', 'ice', 'spectral', 'mist', 'wraith'] },
  'halloween-vampiro': { nome: 'Caixa Vampiro', tier: 'media', nota: (f) => H(f, 0) * f.cor * 2 + f.preto * 1.2 + f.sat * 0.3, palavras: ['blood', 'vampire', 'crimson', 'red', 'bloodsport', 'night', 'dark', 'fang', 'crown'] },
  // Personalizada
  'personalizadas-teixeira': { nome: 'Caixa Teixeira', tier: 'premium', nota: () => 0, palavras: [] },
}
const ADESIVOS = {
  'adesivos-anime': { nome: 'Caixa de Adesivos Anime', tier: 'media', filtro: (n) => /kawaii|ninja|neko|sakura|samurai|kitsune|chibi|oni\b|koi|tokyo|geisha|dragon|waifu|cutie|panda|hello|lucky cat|zap cat|baby|pop pup|unicorn/i.test(n) },
  'adesivos-gold': { nome: 'Caixa de Adesivos Gold', tier: 'premium', filtro: (n) => /\(Gold\)/i.test(n) },
  'adesivos-grafite': { nome: 'Caixa de Adesivos Grafite', tier: 'barata', filtro: (n) => !/\((Holo|Foil|Gold|Glitter|Lenticular|Embroidered)/i.test(n) },
  'adesivos-holo': { nome: 'Caixa de Adesivos Holo', tier: 'media', filtro: (n) => /\(Holo\)/i.test(n) },
}
const CHAVEIROS = {
  'chaveiros-dragao-de-fogo': { nome: 'Caixa Dragão de Fogo', tier: 'media', nomes: ['Hot Howl', "Lil' Ferno", 'Magmatude', 'Hot Sauce', 'Hot Wurst', 'Hot Hands', 'Quick Silver', "Lil' Serpent", 'Glitter Bomb', 'Butane Buddy', "Lil' Squatch", "Lil' Eldritch", "Lil' Boo", 'Semi-Precious', 'Titeenium AWP', "Lil' Hero", 'Baby Karat T', 'Diner Dog', "Lil' Bloody", 'Flash Bomb', "Lil' Chirp"] },
  'chaveiros-gato-samurai': { nome: 'Caixa Gato Samurai', tier: 'media', nomes: ["Lil' Whiskers", 'Splatter Cat', "Lil' Buns", "Lil' Chirp", "Chicken Lil'", "Lil' Yeti", 'Piñatita', 'Fluffy', "Lil' Teacup", "Lil' Dumplin'", "Lil' Zen", "Lil' Ava", "Lil' Happy", 'Diamond Dog', 'Whittle Guy', 'Whittle Knife', "Lil' Squirt", "Lil' Tusk", "Lil' Prick", "Lil' No. 2", "Lil' Vino", 'Hang Loose', 'Baby Karat CT'] },
  'chaveiros-tatico': { nome: 'Caixa Tático', tier: 'media', nomes: ['Die-cast AK', "Baby's AK", 'Pocket AWP', 'Titeenium AWP', "Lil' SAS", 'Bomb Tag', 'Flash Bomb', "Lil' Cap Gun", 'Big Kev', 'Big Brain', 'Dr. Brian', "Pinch O' Salt", "Lil' Eco", "Lil' Smokey", 'Hot Hands', 'Backsplash', 'Biomech', 'Disco MAC', 'Dead Weight', '8 Ball IGL', "Lil' Baller", "Lil' Moments", 'Stitch-Loaded', 'Glamour Shot'] },
  'chaveiros-toxic': { nome: 'Caixa Toxic', tier: 'barata', nomes: ["Lil' Goop", 'Gritty', 'Dead Weight', "Lil' Monster", "Lil' Chomper", "Lil' Cackle", "Lil' Curse", "Lil' Facelift", "Lil' Crass", 'Hungry Eyes', 'Eye of Ball', 'Stitch-Loaded', "Lil' Bloody", "Lil' Boo", "Lil' Eldritch", "Chicken Lil'", "That's Bananas", "Lil' Sandy", 'Splatter Cat', 'Butane Buddy'] },
}

// quantas skins de cada raridade (comum … lendário) e quantas facas, por faixa (as mesmas das caixas de tema antigas)
const FAIXAS = {
  barata: { por: [9, 7, 5, 3, 2], facas: 6 },
  media: { por: [8, 7, 6, 4, 3], facas: 9 },
  premium: { por: [6, 6, 6, 5, 4], facas: 13 },
}
const ARMA_VALIOSA = { 9: 2.2, 7: 1.9, 16: 1.6, 60: 1.5, 1: 1.5, 4: 1.0, 61: 1.1, 40: 1.2, 64: 1.3, 8: 1.2, 39: 1.2 }
const SKIN_VALIOSA = /(dragon lore|howl|medusa|gungnir|fade|asiimov|fire serpent|hyper beast|neo-noir|printstream|vulcan|bloodsport|wild lotus|kill confirmed|gold arabesque|doppler|marble|case hardened|redline|desolate|crown|monster|lore)/i

const armas = catalogo.armas.filter((a) => ['rifles', 'smgs', 'pistols', 'heavy'].includes(a.c))
const facas = catalogo.armas.filter((a) => a.c === 'facas')
const todasSkins = armas.flatMap((a) => a.s.map((s) => ({ d: a.d, arma: a.n, p: s[0], nome: s[1], r: raridadeDaCor(s[2]), min: s[3], max: s[4], l: s[7] ? 1 : 0 })))
const todasFacas = facas.flatMap((a) => a.s.map((s) => ({ d: a.d, arma: a.n, p: s[0], nome: s[1], min: s[3], max: s[4], l: s[7] ? 1 : 0 })))
const pesoSkin = (s) => pesoPeloPreco(precoDe(s.d, s.p) || 40 * (ARMA_VALIOSA[s.d] || 1) * (SKIN_VALIOSA.test(s.nome) ? 3 : 1) * (s.r + 1) ** 2)
const pesoFaca = (f) => pesoPeloPreco(precoDe(f.d, f.p) || valorBaseDaFaca(f.d, f.nome))
const escolherAoAcaso = (lista, n, rnd) => lista.map((x) => ({ x, v: rnd() })).sort((a, b) => a.v - b.v).slice(0, n).map((y) => y.x)
const escolherPorCor = (lista, n, rnd, nota, palavras) =>
  lista
    .map((x) => ({ x, v: (cores[`${x.d}:${x.p}`] ? nota(cores[`${x.d}:${x.p}`]) : 0) + (palavras.some((k) => x.nome.toLowerCase().includes(k)) ? 0.12 : 0) + rnd() * 0.06 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((y) => y.x)
const todasLuvas = catalogo.armas.filter((a) => a.c === 'luvas').flatMap((a) => a.s.map((s) => ({ t: 'luva', d: a.d, arma: a.n, p: s[0], nome: s[1], min: s[3], max: s[4], l: s[7] ? 1 : 0 })))
const pesoLuva = (g) => pesoPeloPreco(precoDe(g.d, g.p) || 1500)
// o item do tier especial (o card dourado da roleta) pode ser faca ou luva: { t: 'luva', ... } quando for luva
const facasDe = (lista) => lista.map((f) => (f.t === 'luva' ? { t: 'luva', d: f.d, p: f.p, w: pesoLuva(f), min: f.min, max: f.max, l: f.l } : { d: f.d, p: f.p, w: pesoFaca(f), min: f.min, max: f.max, l: f.l }))
const semVanilla = todasFacas.filter((f) => f.nome !== 'Vanilla')
// Mistura: cada caixa tem o tier especial só de facas, só de luvas ou meio a meio (sempre o mesmo para a mesma caixa)
const modoEspecial = (slug) => [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 3
function especial(slug, n, escolher) {
  const m = modoEspecial(slug)
  if (m === 0) return escolher(semVanilla, n)
  if (m === 1) return escolher(todasLuvas, n)
  const a = Math.ceil(n / 2)
  return [...escolher(semVanilla, a), ...escolher(todasLuvas, n - a)]
}

// cor do card da caixa: a cor dominante (média dos pixels vivos) da própria imagem
const require = createRequire(import.meta.url)
const sharp = require(path.join(execSync('npm root -g').toString().trim(), 'sharp')) // instalado globalmente (nada no projeto)
async function corDaImagem(arquivo) {
  const { data, info } = await sharp(arquivo).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb)
    if (pa < 200 || mx < 50 || mx - mn < 40) continue // ignora transparente, escuro e cinza
    r += pr; g += pg; b += pb; n++
  }
  if (!n) return '#8aa0c0'
  // realça: a média de pixels dá um tom "sujo", então a cor é esticada até o canal mais forte chegar perto de 230
  const k = 230 / Math.max(r / n, g / n, b / n)
  const h = (v) => Math.min(255, Math.round((v / n) * k)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// raridade em pirâmide (topo 5% lendário, 10% épico, 20% raro, 30% incomum, o resto comum) por valor
function piramide(itens, valor, rnd) {
  const ordem = itens.map((it) => ({ it, v: valor(it) * (0.9 + rnd() * 0.2) })).sort((a, b) => b.v - a.v)
  ordem.forEach((x, i) => {
    const q = i / ordem.length
    x.it.r = q < 0.05 ? 4 : q < 0.15 ? 3 : q < 0.35 ? 2 : q < 0.65 ? 1 : 0
  })
}
// escolhe n itens espalhados por toda a faixa de preço (pega de quantil em quantil), para a caixa ter de tudo
const espalhado = (lista, valor, n) => {
  const o = [...lista].sort((a, b) => valor(a) - valor(b))
  if (o.length <= n) return o
  return Array.from({ length: n }, (_, i) => o[Math.floor((i * (o.length - 1)) / (n - 1))])
}

const novas = []
const slugsNovos = new Set(mapa.map((m) => m.slug))
const avisos = []
for (const m of mapa) {
  const chave = m.slug.replace(/^caixa-/, '')
  const rnd = prng(m.slug)
  const img = path.join(aqui, `../public/assets/caixas/web/${m.slug}.webp`)
  const base = { slug: m.slug, img: `/assets/caixas/web/${m.slug}.webp`, ativa: true, cor: await corDaImagem(img) }

  if (chave.startsWith('arma-')) {
    // caixa de ARMA: todas as skins daquela arma (+ facas)
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const alvo = norm(m.nome.replace(/^caixa-?/i, ''))
    const arma = armas.find((a) => norm(a.n) === alvo || norm(a.n).replace('seven', '7') === alvo.replace('seven', '7'))
    if (!arma) { avisos.push(`sem skins no catálogo: ${m.nome} (${m.slug}) — caixa não criada`); continue }
    const itens = arma.s.filter((s) => s[0]).map((s) => {
      const r = Math.min(4, raridadeDaCor(s[2]))
      return { d: arma.d, p: s[0], r, w: pesoSkin({ d: arma.d, p: s[0], nome: s[1], r }), min: s[3], max: s[4], l: s[7] ? 1 : 0 }
    })
    // raridade pelo valor de mercado (pirâmide), para a caixa sempre ter as 5 raridades (nem toda arma tem skin de cor lendária)
    piramide(itens, (it) => precoDe(it.d, it.p) || 40 * (it.r + 1) ** 2, rnd)
    for (const it of itens) it.w = pesoSkin({ d: it.d, p: it.p, nome: '', r: it.r })
    const fator = ARMA_VALIOSA[arma.d] || 1
    novas.push({ ...base, nome: `Caixa ${arma.n}`, preco: 400, tier: fator >= 1.5 ? 'premium' : fator > 1 ? 'media' : 'barata', itens, facas: facasDe(especial(m.slug, 8, (l, k) => escolherAoAcaso(l, k, rnd))) })
  } else if (TEMAS[chave]) {
    const t = TEMAS[chave]
    const cfg = FAIXAS[t.tier]
    const itens = []
    const usados = new Set()
    for (let r = 0; r <= 4; r++) {
      const pool = todasSkins.filter((s) => s.r === r && !usados.has(`${s.d}:${s.p}`))
      const escolhidas = chave === 'personalizadas-teixeira' ? escolherAoAcaso(pool, cfg.por[r], rnd) : escolherPorCor(pool, cfg.por[r], rnd, t.nota, t.palavras)
      for (const s of escolhidas) {
        usados.add(`${s.d}:${s.p}`)
        itens.push({ d: s.d, p: s.p, r, w: pesoSkin(s), min: s.min, max: s.max, l: s.l })
      }
    }
    const fx = especial(m.slug, cfg.facas, (l, k) => (chave === 'personalizadas-teixeira' ? escolherAoAcaso(l, k, rnd) : escolherPorCor(l, k, rnd, t.nota, t.palavras)))
    novas.push({ ...base, nome: t.nome, preco: 400, tier: t.tier, itens, facas: facasDe(fx) })
  } else if (ADESIVOS[chave]) {
    const t = ADESIVOS[chave]
    const valor = (a) => precos.a?.[a[0]] || 0
    const pool = adesivos.filter((a) => t.filtro(a[1]) && valor(a) > 0)
    const escolhidos = espalhado(pool, valor, 40)
    const itens = escolhidos.map((a) => ({ t: 'adesivo', d: a[0], p: 0, r: 0, w: 100, min: 0, max: 1, l: 0, n: a[1], i: a[2], _v: valor(a) }))
    piramide(itens, (it) => it._v, rnd)
    for (const it of itens) delete it._v
    if (itens.length < 12) avisos.push(`${m.slug}: só ${itens.length} adesivos achados`)
    novas.push({ ...base, nome: t.nome, preco: 400, tier: t.tier, itens, facas: [] })
  } else if (CHAVEIROS[chave]) {
    const t = CHAVEIROS[chave]
    const itens = []
    for (const nomeC of new Set(t.nomes)) {
      const c = chaveiros.find((x) => x[1].toLowerCase() === nomeC.toLowerCase())
      if (!c) { avisos.push(`${m.slug}: chaveiro "${nomeC}" não encontrado`); continue }
      itens.push({ t: 'chaveiro', d: c[0], p: 0, r: 0, w: 100, min: 0, max: 1, l: 0, n: c[1], i: c[2], _v: precos.c?.[c[0]] || 0 })
    }
    piramide(itens, (it) => it._v || 1, rnd)
    for (const it of itens) delete it._v
    novas.push({ ...base, nome: t.nome, preco: 400, tier: t.tier, itens, facas: [] })
  } else {
    avisos.push(`sem definição: ${m.slug}`)
  }
}

// junta com as antigas (marcadas como arquivadas) e renumera só as novas
const arquivo = path.join(aqui, '../worker/steam-login/src/caixas-iniciais.json')
const antigas = JSON.parse(fs.readFileSync(arquivo, 'utf8')).filter((c) => !slugsNovos.has(c.slug)).map((c) => ({ ...c, arquivada: true }))
let id = Math.max(0, ...antigas.map((c) => c.id))
const todas = [...antigas, ...novas.map((c) => ({ id: ++id, ...c }))]
fs.writeFileSync(arquivo, JSON.stringify(todas))
for (const c of novas) {
  const por = [0, 0, 0, 0, 0]
  c.itens.forEach((i) => por[i.r]++)
  console.log(c.nome.padEnd(28), c.tier.padEnd(8), 'itens', String(c.itens.length).padStart(3), 'raridades', por.join('/'), 'facas', c.facas.length, c.cor)
}
if (avisos.length) console.log('\nAVISOS:\n' + avisos.join('\n'))
console.log(`\n${antigas.length} antigas (arquivadas) + ${novas.length} novas = ${todas.length} caixas → ${path.relative(process.cwd(), arquivo)}`)
