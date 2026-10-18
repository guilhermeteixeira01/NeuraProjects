// Gera as miniaturas leves (200 px, webp) dos cards que o perfil mostra na janela "Personalizar":
// public/assets/cards/<nome>.avif  ->  public/assets/cards/mini/<nome>.webp
// Sem a miniatura, a janela carrega a imagem inteira de cada card (pesado no celular). Os SVG não precisam (já são leves).
//
// Uso (na pasta site/):   node scripts/gerar-miniaturas-cards.mjs
// Precisa do Playwright instalado globalmente (npm install -g @playwright/cli) e do Edge ou Chrome: ele só usa o navegador
// para redimensionar as imagens, então nada é instalado no projeto. Rode de novo sempre que adicionar um card novo.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const pasta = path.resolve(aqui, '../public/assets/cards')
const saida = path.join(pasta, 'mini')
const LARGURA = 200

const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim()
const candidatos = [
  path.join(raiz, '@playwright/cli/node_modules/playwright-core'),
  path.join(raiz, 'playwright-core'),
  path.join(raiz, 'playwright'),
]
const achado = candidatos.find((c) => fs.existsSync(c))
if (!achado) {
  console.error('Playwright global não encontrado. Rode: npm install -g @playwright/cli')
  process.exit(1)
}
const { chromium } = await import(pathToFileURL(path.join(achado, 'index.mjs')).href)

fs.mkdirSync(saida, { recursive: true })
const imagens = fs.readdirSync(pasta).filter((n) => /\.(png|webp|avif|jpe?g|gif)$/i.test(n))
const pendentes = imagens.filter((n) => {
  const destino = path.join(saida, n.replace(/\.[^.]+$/, '') + '.webp')
  return !fs.existsSync(destino) || fs.statSync(destino).mtimeMs < fs.statSync(path.join(pasta, n)).mtimeMs
})
if (!pendentes.length) {
  console.log('Nenhuma miniatura nova para gerar.')
  process.exit(0)
}

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
for (const nome of pendentes) {
  const base64 = fs.readFileSync(path.join(pasta, nome)).toString('base64')
  const mime = { avif: 'image/avif', webp: 'image/webp', png: 'image/png', gif: 'image/gif' }[nome.split('.').pop().toLowerCase()] || 'image/jpeg'
  const url = await pagina.evaluate(
    async ({ base64, mime, largura }) => {
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const img = await createImageBitmap(new Blob([bin], { type: mime }))
      const altura = Math.round((img.height * largura) / img.width)
      const tela = document.createElement('canvas')
      tela.width = largura
      tela.height = altura
      tela.getContext('2d').drawImage(img, 0, 0, largura, altura)
      return tela.toDataURL('image/webp', 0.8)
    },
    { base64, mime, largura: LARGURA },
  )
  const destino = path.join(saida, nome.replace(/\.[^.]+$/, '') + '.webp')
  fs.writeFileSync(destino, Buffer.from(url.split(',')[1], 'base64'))
  console.log('ok', path.relative(pasta, destino), Math.round(fs.statSync(destino).size / 1024) + ' KB')
}
await navegador.close()
