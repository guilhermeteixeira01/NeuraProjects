// Cadastra as quatro artes novas sem alterar caixas existentes.
// Executar em site/: node scripts/adicionar-caixas-colecionaveis.mjs
import fs from 'node:fs'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { CONFIG_PADRAO, raridadeDaCor, raridadeCsDaCor, valorDoItem, definirValorador, sortearAbertura } from '../worker/steam-login/src/loja-core.js'

const base = new URL('../', import.meta.url)
const ler = p => JSON.parse(fs.readFileSync(new URL(p, base), 'utf8'))
const gravar = (p, v) => fs.writeFileSync(new URL(p, base), JSON.stringify(v))
const caixas = ler('worker/steam-login/src/caixas-iniciais.json')
const precos = ler('worker/steam-login/src/precos.json')
const coresAdesivos = ler('worker/steam-login/src/valor-enfeites.json').a
const nomesNeon = ['Cyber Chicken (Holo)', 'Cyber Romanov (Holo)', 'Devouring Flame', 'Devouring Flame (Holo)', 'Incineration', 'Incineration (Holo)', 'Neon MVP (Lenticular)', 'Neon Opal Strafe (Holo)', 'Hypnoteyes (Holo)', 'Chrome Dome (Holo)', 'Broken Fang (Holo)', 'Countdown (Holo)', 'Coiled Strike (Holo)', 'Cotton Candy Flow (Holo)', 'Flashblack (Holo)', 'Great Wave (Holo)', 'I See You (Holo)', 'Enemy Spotted (Holo)', 'Eye Contact (Holo)', 'Conspiracy Club (Holo)', 'Battle Scarred (Holo)', 'Bonehead (Holo)', 'Assassin (Holo)', 'All-Stars Blue (Holo)', 'All-Stars Orange (Holo)', 'Bash (Holo)', 'Bish (Holo)', 'Bosh (Holo)', 'Boost (Holo)', 'Boom (Holo)']
const nomesAmuletos = ['Hot Howl', 'Hot Wurst', 'Hot Sauce', 'Hot Hands', "Lil' Ferno", 'Magmatude', "Lil' Serpent", 'Butane Buddy', 'Diner Dog', 'Flash Bomb', 'Glitter Bomb', 'Bomb Tag', 'Dead Weight', 'Gritty', "Lil' Bloody", "Lil' Boo", "Lil' Cackle", "Lil' Chomper", "Lil' Curse", "Lil' Eldritch", "Lil' Facelift", "Lil' Goop", "Lil' Monster", "Lil' Smokey", 'Hungry Eyes', 'Eye of Ball', "Lil' Squatch", 'Quick Silver', 'Semi-Precious', 'Whittle Knife']
const nomesPins = ['Alyx Pin', 'Black Mesa Pin', 'City 17 Pin', 'Civil Protection Pin', 'CMB Pin', 'Combine Helmet Pin', 'Copper Lambda Pin', 'Headcrab Glyph Pin', 'Health Pin', 'Lambda Pin', 'Sustenance! Pin', 'Vortigaunt Pin', 'Hydra Pin', 'Valeria Phoenix Pin', 'Genuine Alyx Pin', 'Genuine Hydra Pin', 'Genuine Valeria Phoenix Pin', 'Guardian Pin', 'Guardian 2 Pin', 'Guardian 3 Pin', 'Guardian Elite Pin', 'Genuine Guardian Pin', 'Genuine Guardian 2 Pin', 'Genuine Guardian 3 Pin', 'Genuine Guardian Elite Pin', 'Phoenix Pin', 'Genuine Phoenix Pin', 'Chroma Pin', 'Genuine Chroma Pin', 'Nuke Pin']
const nomesGrafites = ['Crown', 'Fire Serpent', 'Guardian', 'Guardian Dragon', 'Howling Dawn', 'Phoenix', 'Rising Skull', "Skull n' Crosshairs", 'Ace', 'Blood Boiler', 'Cerberus', 'Clutch King', 'Drug War Veteran', 'Easy Peasy', 'EZ', 'Flickshot', 'Hamster Hawk', 'Kawaii Killer CT', 'Kawaii Killer Terrorist', 'Nice Shot', 'Old School', 'R.I.P.I.P.', 'Rage', 'Real MVP', 'Rekt', 'Shaolin', 'Toy Tiger', 'Welcome to the Clutch', 'Winged Defuser', 'Zombie Hop']
const fontes = [
  { slug: 'caixa-adesivos-neon', nome: 'Caixa Adesivos Neon', tipo: 'adesivo', catalogo: 'adesivos', cor: '#d32ce6', arquivo: 'Neura Project Neon Sticker Crate-1.png', filtro: n => /neon|cyber|incineration|devouring flame/i.test(n) && !n.includes('|') },
  { slug: 'caixa-chaveiros-hot-howl-wurst', nome: 'Caixa Hot Howl e Wurst', tipo: 'chaveiro', catalogo: 'chaveiros', cor: '#eb4b4b', arquivo: 'Neura Project Hot Howl and Wurst crate-2.png', filtro: n => /^(Hot Howl|Hot Wurst|Hot Sauce|Hot Hands|Lil' Ferno|Magmatude|Lil' Serpent)$/.test(n) },
  { slug: 'caixa-pins-sci-fi', nome: 'Caixa Pins Sci-Fi', tipo: 'emblema', catalogo: 'emblemas', cor: '#4b69ff', arquivo: 'Neura Project sci-fi pin loot case-1.png', filtro: n => /^(Alyx|Black Mesa|City 17|Civil Protection|CMB|Combine Helmet|Copper Lambda|Headcrab Glyph|Health|Lambda|Sustenance!|Vortigaunt|Hydra|Valeria Phoenix) Pin$/.test(n) },
  { slug: 'caixa-grafites-urbanos', nome: 'Caixa Grafites Urbanos', tipo: 'grafite', catalogo: 'grafites', cor: '#8847ff', arquivo: 'Neura Project graffiti loot case-2.png', filtro: (n, l) => /^(Crown|Fire Serpent|Guardian|Guardian Dragon|Howling Dawn|Phoenix|Rising Skull|Skull n' Crosshairs)$/.test(n) && !l[4] },
]
const valor = it => it.t === 'adesivo' ? Math.max(1, Math.round(precos.a[it.d] || [4, 8, 15, 40, 100, 250][coresAdesivos[it.d] || 0])) : it.t === 'chaveiro' ? Math.max(1, Math.round(precos.c[it.d] || 25)) : valorDoItem({ f: 0.5 }, raridadeCsDaCor(it.cor))
definirValorador(valor)
let id = Math.max(...caixas.map(c => c.id), ...ler('worker/steam-login/src/caixas-retiradas-ids.json'))
for (const fonte of fontes) {
  const nomes = { adesivo: nomesNeon, chaveiro: nomesAmuletos, emblema: nomesPins, grafite: nomesGrafites }[fonte.tipo]
  const linhas = ler(`public/assets/skins/${fonte.catalogo}.json`)
  const itens = nomes.map(nome => {
    const l = linhas.find(l => l[1] === nome && (fonte.tipo !== 'grafite' || !l[4]))
    if (!l) throw new Error(`Item ausente: ${nome}`)
    return { t: fonte.tipo, d: l[0], p: fonte.tipo === 'grafite' ? l[4] || 0 : 0, n: l[1], i: l[2], cor: l[3], r: fonte.tipo === 'adesivo' ? Math.min(4, coresAdesivos[l[0]] || 0) : Math.min(4, raridadeDaCor(l[3])), w: 100, min: 0, max: 1 }
  })
  if (!itens.length) throw new Error(`Sem itens para ${fonte.slug}`)
  const existente = caixas.find(c => c.slug === fonte.slug)
  const caixa = { id: existente?.id || ++id, slug: fonte.slug, nome: fonte.nome, img: `/assets/caixas/web/${fonte.slug}.webp`, ativa: true, arquivada: false, cor: fonte.cor, tier: 'media', preco: 100, itens, facas: [] }
  // Mesma margem de 1,6 das caixas de armas; simulação reproduzível.
  let seed = 20261106
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  let soma = 0
  const porId = new Map(itens.map(it => [`${it.d}:${it.p}`, it]))
  for (let i = 0; i < 60000; i++) {
    const ganho = sortearAbertura(caixa, CONFIG_PADRAO, rnd).item
    soma += valor(porId.get(`${ganho.d}:${ganho.p}`))
  }
  const bruto = Math.max(100, soma / 60000 * 1.6)
  const passo = bruto < 1000 ? 10 : 50
  caixa.preco = Math.round(bruto / passo) * passo
  await sharp(fileURLToPath(new URL(`public/assets/caixas/${fonte.arquivo}`, base))).resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(fileURLToPath(new URL(`public${caixa.img}`, base)))
  if (existente) caixas[caixas.indexOf(existente)] = caixa
  else caixas.push(caixa)
  precos.caixas[caixa.slug] = caixa.preco
  console.log(`${caixa.nome}: ${itens.length} itens, ${caixa.preco} NP`)
}
gravar('worker/steam-login/src/caixas-iniciais.json', caixas)
gravar('worker/steam-login/src/precos.json', precos)
