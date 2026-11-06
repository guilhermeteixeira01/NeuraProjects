// Insígnias: as artes originais (public/assets/insignia/*.png, 1792×2400, vários MB) viram versões leves para o site
// Gera as versões colorida, miniatura, bloqueada e secreta a partir da mesma arte.
// Rode de novo quando trocar ou adicionar uma arte:  node ferramentas/molduras/insignias.mjs   (na pasta site)
import fs from 'node:fs'
import path from 'node:path'
import { sharp } from './comum.mjs'
import artes from './insignias-artes.json' with { type: 'json' }

const pasta = path.resolve('public/assets/insignia')
const saida = path.join(pasta, 'web')
fs.mkdirSync(saida, { recursive: true })
const mini = path.join(pasta, 'mini')
fs.mkdirSync(mini, { recursive: true })
for (const estado of ['bloqueada', 'secreta']) fs.mkdirSync(path.join(pasta, estado), { recursive: true })
const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.png')).map(arq => ({ arq, nome: path.basename(arq, '.png') }))
for (const [sub, mapa] of Object.entries(artes)) {
  const fontes = fs.readdirSync(path.join(pasta, sub))
  for (const [nome, prefixo] of Object.entries(mapa)) {
    const encontrados = fontes.filter(f => f.startsWith(prefixo) && f.endsWith('.png'))
    if (encontrados.length !== 1) throw new Error(`Esperada uma arte para ${nome}: ${encontrados}`)
    arquivos.push({ arq: path.join(sub, encontrados[0]), nome })
  }
}
const nomes = new Set()
for (const { arq, nome } of arquivos) {
  if (nomes.has(nome)) throw new Error(`Arte duplicada: ${nome}`)
  nomes.add(nome)
  const destino = path.join(saida, nome + '.webp')
  const original = path.join(pasta, arq)
  const novo = (arquivo, fonte) => !fs.existsSync(arquivo) || fs.statSync(arquivo).mtimeMs < fs.statSync(fonte).mtimeMs
  if (novo(destino, original)) {
    await sharp(original).trim().resize({ height: 512, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(destino)
    console.log(nome, '→ colorida')
  }
  // Derivar sempre da versão publicada mantém tamanho, recorte e transparência
  // idênticos quando a conquista muda de estado.
  for (const estado of ['mini', 'bloqueada', 'secreta']) {
    const arquivo = path.join(pasta, estado, nome + '.webp')
    if (!novo(arquivo, destino)) continue
    let imagem = sharp(destino)
    if (estado === 'mini') imagem = imagem.resize({ width: 128, height: 128, fit: 'inside', withoutEnlargement: true })
    if (estado === 'bloqueada') imagem = imagem.modulate({ saturation: 0, brightness: 0.45 })
    if (estado === 'secreta') imagem = imagem.modulate({ saturation: 0, brightness: 0.18 }).blur(10)
    await imagem.webp({ quality: estado === 'mini' ? 85 : 90, alphaQuality: 100 }).toFile(arquivo)
    console.log(nome, '→', estado)
  }
}
