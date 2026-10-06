// Procura molduras animadas boas na Loja de Pontos da Steam e monta uma folha para escolher no olho.
//   node buscar-steam.mjs           (só nomes com tema: fogo, neon, raio...)
//   node buscar-steam.mjs --todos   (sem o filtro de tema pelo nome; os filtros de qualidade continuam)
// Passa só quem: anima liso (>= 15 quadros por segundo, >= 12 quadros, com movimento de verdade), não tapa a foto
// (miolo quase vazio), tem proporção parecida com as outras (borda de dentro entre 72% e 93%) e não pesa demais.
// Saída (pasta cache/, fora do git): candidatas.json (com a medida e a escala de cada uma) e folha-N.png.
// Para usar uma: copie a linha dela de candidatas.json para escolhidas.json e rode node baixar.mjs.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sharp, lerQuadros } from './comum.mjs'
import { medir } from './medir.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(aqui, 'cache')
fs.mkdirSync(path.join(CACHE, 'steam'), { recursive: true })
const CDN = 'https://shared.akamai.steamstatic.com/community_assets/images/items'

// Nomes que não combinam com o site (personagens, fofura, comida, memes...)
const FORA = /waifu|furry|protogen|girl|maid|cat\b|kitty|chud|bubba|police|cops|pear|whisker|strawberry|bookworm|mare|sakura|anime|chibi|kawaii|cute|bunny|uwu|loli|neko|fox|dog|bear|pony|unicorn|hentai|sexy|bikini|nsfw|love|heart|valentine|baby|potato|banana|duck|frog|hamster|mouse|bread|cake|cookie|candy|pizza|burger|toilet|poop|meme|hello|kiss|lips|boob|butt|shrek|egg/i
const TEMA = /neon|fire|flame|blaze|burn|inferno|lava|lightning|electric|thunder|storm|spark|glitch|rgb|cyber|tech|hologram|matrix|digital|circuit|laser|hud|galaxy|cosmic|space|nebula|star|aurora|vortex|portal|gold|crown|royal|legend|ice|frost|crystal|skull|demon|dragon|hell|blood|gun|bullet|target|bomb|steel|metal|chrome|plasma|energy|glow|light|smoke|shadow|dark|void|abyss|toxic|acid|ember|spirit|rune|magic|arcane|mystic|ancient|wave|ocean|water|wind|thorn|chain|wire|carbon|military|tactical|camo|hex|grid|pixel|retro|synth|vapor|frame|border/i

// 1) Lista completa (guardada no cache por um dia)
const arqLista = path.join(CACHE, 'steam.json')
let lista
if (fs.existsSync(arqLista) && Date.now() - fs.statSync(arqLista).mtimeMs < 86400000) lista = JSON.parse(fs.readFileSync(arqLista, 'utf8'))
else {
  lista = []
  let cursor = ''
  for (let i = 0; i < 40; i++) {
    const u = `https://api.steampowered.com/ILoyaltyRewardsService/QueryRewardItems/v1/?community_item_classes%5B0%5D=14&count=1000&language=english${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`
    const d = (await (await fetch(u)).json()).response
    lista.push(...(d.definitions || []))
    if (!d.next_cursor || !d.definitions?.length || lista.length >= d.total_count) break
    cursor = d.next_cursor
  }
  fs.writeFileSync(arqLista, JSON.stringify(lista))
}
const usadas = new Set(JSON.parse(fs.readFileSync(path.join(aqui, 'escolhidas.json'), 'utf8')).filter((x) => x.fonte === 'steam').map((x) => x.arquivo))
const texto = (x) => `${x.community_item_data.item_name} ${x.internal_description || ''}`
const TODOS = process.argv.includes('--todos')
const candidatas = lista.filter((x) => x.community_item_data?.animated && !usadas.has(x.community_item_data.item_image_small) && !FORA.test(texto(x)) && (TODOS || TEMA.test(texto(x))))
console.log('candidatas pelo nome:', candidatas.length)

// 2) Baixa (8 de cada vez) e mede
const resultado = []
let feitas = 0
async function uma(x) {
  const arq = path.join(CACHE, 'steam', `${x.defid}.png`)
  try {
    if (!fs.existsSync(arq)) {
      const r = await fetch(`${CDN}/${x.appid}/${x.community_item_data.item_image_small}`)
      if (!r.ok) return
      fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()))
    }
    const m = medir(fs.readFileSync(arq))
    resultado.push({ defid: x.defid, appid: x.appid, arquivo: x.community_item_data.item_image_small, original: x.community_item_data.item_name, ...m })
  } catch {
    // arquivo que não é PNG/APNG: ignora
  } finally {
    if (++feitas % 100 === 0) console.log(`  ${feitas}/${candidatas.length}`)
  }
}
const fila = [...candidatas]
await Promise.all(Array.from({ length: 8 }, async () => { while (fila.length) await uma(fila.shift()) }))

// 3) Filtro
const boas = resultado
  .filter((r) => r.quadros >= 12 && r.fps >= 15 && r.movimento >= 0.004 && r.miolo < 0.01 && r.vazio >= 0.72 && r.vazio <= 0.93 && r.kb <= 1300 && r.largura >= 200)
  .sort((a, b) => b.fps - a.fps)
fs.writeFileSync(path.join(CACHE, 'candidatas.json'), JSON.stringify(boas, null, 1))
console.log('medidas:', resultado.length, '| passaram no filtro:', boas.length)

// 4) Folhas (quadro mais cheio, por cima de uma foto quadrada, já na escala calculada)
const L = 150, COLS = 10, POR_FOLHA = 80
for (let f = 0; f * POR_FOLHA < boas.length; f++) {
  const camadas = []
  for (const [i, b] of boas.slice(f * POR_FOLHA, (f + 1) * POR_FOLHA).entries()) {
    const { largura, altura, quadros } = lerQuadros(fs.readFileSync(path.join(CACHE, 'steam', `${b.defid}.png`)))
    let melhor = quadros[0], max = -1
    for (const q of quadros) {
      let s = 0
      for (let k = 3; k < q.length; k += 4) s += q[k]
      if (s > max) [max, melhor] = [s, q]
    }
    const lado = Math.round(L / 1.32) // foto; a moldura ocupa foto x escala
    const tam = Math.round(lado * b.escala)
    const mold = await sharp(Buffer.from(melhor), { raw: { width: largura, height: altura, channels: 4 } }).resize(tam, tam).png().toBuffer()
    const o = Math.round((L - lado) / 2), om = Math.round((L - tam) / 2)
    const fundo = Buffer.from(`<svg width="${L}" height="${L + 18}"><rect width="${L}" height="${L + 18}" fill="#16171c"/><rect x="${o}" y="${o}" width="${lado}" height="${lado}" rx="${lado * 0.08}" fill="#2e6fbf"/><text x="${L / 2}" y="${L + 13}" font-size="10" text-anchor="middle" fill="#ccc" font-family="Arial">${f * POR_FOLHA + i} ${b.original.replace(/[<>&"]/g, '').slice(0, 20)}</text></svg>`)
    camadas.push({ input: await sharp(fundo).composite([{ input: mold, left: om, top: om }]).png().toBuffer(), left: (i % COLS) * (L + 4), top: Math.floor(i / COLS) * (L + 22) })
  }
  const n = Math.min(POR_FOLHA, boas.length - f * POR_FOLHA)
  await sharp({ create: { width: COLS * (L + 4), height: Math.ceil(n / COLS) * (L + 22), channels: 4, background: '#0b0c0f' } }).composite(camadas).png().toFile(path.join(CACHE, `folha-${f}.png`))
}
console.log('folhas em', CACHE)
