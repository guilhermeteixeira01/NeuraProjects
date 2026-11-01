// Gera as versões leves das imagens que o site mostra em tamanho pequeno (importante no celular):
//   cards do perfil:  public/assets/cards/<tema>/<nome>.avif  ->  cards/mini/<tema>/<nome>.webp (200 px, grade da janela Personalizar)
//                                                            ->  cards/med/<tema>/<nome>.webp  (400 px, o card no perfil e no pódio)
//   insígnias:        public/assets/insignia/web/<nome>.webp  ->  insignia/mini/<nome>.webp     (128 px, lista de amigos e perfil)
// Sem elas o site cai nas imagens inteiras (bem mais pesadas). Os SVG dos cards não precisam (já são leves).
//
// Uso (na pasta site/):   node scripts/gerar-miniaturas.mjs      (só gera o que falta ou mudou; rode quando adicionar card/insígnia)
// Precisa do Playwright instalado globalmente (npm install -g @playwright/cli) e do Edge ou Chrome: ele só usa o navegador
// para redimensionar as imagens, então nada é instalado no projeto.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const assets = path.resolve(aqui, '../public/assets')
const RASTER = /\.(png|webp|avif|jpe?g|gif)$/i

// percorre as pastas e devolve "sub/pasta/arquivo" (ignorando as pastas em `ignorar` na raiz)
const listar = (dir, ignorar = [], prefixo = '') =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return prefixo === '' && ignorar.includes(e.name) ? [] : listar(path.join(dir, e.name), ignorar, prefixo + e.name + '/')
        return RASTER.test(e.name) ? [prefixo + e.name] : []
      })
    : []

// imagem animada de verdade? (AVIF em sequência "avis", WebP "ANIM", APNG "acTL")
const animada = (arquivo) => {
  const txt = fs.readFileSync(arquivo).subarray(0, 4096).toString('latin1')
  if (/\.avif$/i.test(arquivo)) return txt.slice(0, 64).includes('avis')
  if (/\.webp$/i.test(arquivo)) return txt.includes('ANIM')
  if (/\.png$/i.test(arquivo)) return txt.includes('acTL')
  return false
}

// tarefas: de onde vem, para onde vai, largura e qualidade
const tarefas = []
const cards = path.join(assets, 'cards')
for (const nome of listar(cards, ['mini', 'med', 'parado'])) {
  if (/-anim\.[a-z0-9]+$/i.test(nome)) continue // card animado (-anim) não vira miniatura: ela seria uma imagem parada
  const base = nome.replace(/\.[^.]+$/, '')
  tarefas.push({ origem: path.join(cards, nome), destino: path.join(cards, 'mini', base + '.webp'), largura: 200, qualidade: 0.8 })
  // animado de verdade (AVIF em sequência etc.): o site usa o original, então a versão média (parada) não é gerada
  if (!animada(path.join(cards, nome))) tarefas.push({ origem: path.join(cards, nome), destino: path.join(cards, 'med', base + '.webp'), largura: 400, qualidade: 0.85 })
}
const insignias = path.join(assets, 'insignia')
for (const nome of listar(path.join(insignias, 'web'))) {
  tarefas.push({ origem: path.join(insignias, 'web', nome), destino: path.join(insignias, 'mini', nome.replace(/\.[^.]+$/, '') + '.webp'), largura: 128, qualidade: 0.88 })
}

// artes do visual novo (public/assets/neura-v2/<original>.png -> neura-v2/web/<pasta>/<nome>.webp): a lista com o papel de
// cada uma fica em src/comum/assetsV2.js, que é quem o site usa
const v2 = path.join(assets, 'neura-v2')
const ARTES_V2 = {
}
// pacote de backgrounds e personagens "popout" (neura-v2/backgrounds e neura-v2/characters): derivados em web/v2/
for (const n of ['inicio', 'lobby', 'ranking', 'inventario', 'loja', 'perfil', 'time', 'partidas', 'admin', 'diretorio-times', 'pick-ban', 'global']) ARTES_V2['v2/bg-' + n] = ['backgrounds/bg-' + n + '-v2.png', 1600]
for (const n of ['cache', 'dust2', 'nuke', 'mirage']) ARTES_V2['v2/bg-resultado-' + n] = ['backgrounds/bg-resultado-' + n + '-v2.png', 1920]
Object.assign(ARTES_V2, {
  'v2/home-duo': ['characters/home-duo-v2.png', 1100],
  'v2/podium-gold': ['characters/podium-gold-popout-v2.png', 900],
  'v2/podium-silver': ['characters/podium-silver-popout-v2.png', 900],
  'v2/podium-bronze': ['characters/podium-bronze-popout-v2.png', 900],
  'v2/shop-jester': ['characters/shop-jester-popout-v2.png', 900],
  'v2/team-squad': ['characters/team-squad-v2.png', 1400],
  'v2/sidebar-agent': ['characters/sidebar-agent-v2.png.png', 480], // o arquivo veio com .png duplicado
  // ramos do top 3 (com o número dentro): pódio e tabela do ranking
  'v2/ramo-1': ['ranking/top-1-ramos-ouro.png', 320],
  'v2/ramo-2': ['ranking/top-2-ramos-prata.png', 320],
  'v2/ramo-3': ['ranking/top-3-ramos-bronze.png', 320],
  // home V3: cenário do circo e palhaço sentado (Comunidade) e as caixas azuis do login diário (o arquivo veio como "Pilha de caixas azuis com emblemas-2.png")
  'v2/community-circus-background-v3': ['backgrounds/community-circus-background-v3.png.png', 1280],
  'v2/community-champion-seated-v3': ['characters/community-champion-seated-v3.png.png', 760],
  'v2/daily-case-blue-v3': ['Inicio/Pilha de caixas azuis com emblemas-2.png', 360],
})
for (const [destino, [origem, largura]] of Object.entries(ARTES_V2)) {
  if (fs.existsSync(path.join(v2, origem))) tarefas.push({ origem: path.join(v2, origem), destino: path.join(v2, 'web', destino + '.webp'), largura, qualidade: 0.84 })
}

const pendentes = tarefas.filter((t) => !fs.existsSync(t.destino) || fs.statSync(t.destino).mtimeMs < fs.statSync(t.origem).mtimeMs)
if (!pendentes.length) {
  console.log('Nada novo para gerar.')
  process.exit(0)
}

const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim()
const achado = [path.join(raiz, '@playwright/cli/node_modules/playwright-core'), path.join(raiz, 'playwright-core'), path.join(raiz, 'playwright')].find((c) => fs.existsSync(c))
if (!achado) {
  console.error('Playwright global não encontrado. Rode: npm install -g @playwright/cli')
  process.exit(1)
}
const { chromium } = await import(pathToFileURL(path.join(achado, 'index.mjs')).href)

let navegador
for (const canal of ['msedge', 'chrome', undefined]) {
  try {
    navegador = await chromium.launch(canal ? { channel: canal } : {})
    break
  } catch {
    // tenta o próximo
  }
}
if (!navegador) {
  console.error('Não consegui abrir o Edge nem o Chrome.')
  process.exit(1)
}
const pagina = await navegador.newPage()
const MIME = { avif: 'image/avif', webp: 'image/webp', png: 'image/png', gif: 'image/gif' }
for (const t of pendentes) {
  const base64 = fs.readFileSync(t.origem).toString('base64')
  const mime = MIME[t.origem.split('.').pop().toLowerCase()] || 'image/jpeg'
  const url = await pagina.evaluate(
    async ({ base64, mime, largura, qualidade }) => {
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      // AVIF animado: o 1º quadro às vezes é um clarão/transição (a miniatura ficava errada); usa um quadro mais adiante (1/3 do caminho)
      let img
      if (mime === 'image/avif' && typeof ImageDecoder !== 'undefined') {
        try {
          const dec = new ImageDecoder({ data: bin, type: mime })
          await dec.tracks.ready
          const n = dec.tracks.selectedTrack.frameCount
          const quadro = (await dec.decode({ frameIndex: n > 1 ? Math.floor(n / 3) : 0 })).image
          img = await createImageBitmap(quadro)
        } catch {
          img = null
        }
      }
      if (!img) img = await createImageBitmap(new Blob([bin], { type: mime }))
      const w = Math.min(largura, img.width) // nunca aumenta
      const h = Math.round((img.height * w) / img.width)
      const tela = document.createElement('canvas')
      tela.width = w
      tela.height = h
      tela.getContext('2d').drawImage(img, 0, 0, w, h)
      return tela.toDataURL('image/webp', qualidade)
    },
    { base64, mime, largura: t.largura, qualidade: t.qualidade },
  )
  fs.mkdirSync(path.dirname(t.destino), { recursive: true })
  fs.writeFileSync(t.destino, Buffer.from(url.split(',')[1], 'base64'))
  console.log('ok', path.relative(assets, t.destino), Math.round(fs.statSync(t.destino).size / 1024) + ' KB')
}
await navegador.close()
