// Insígnias: as artes originais (public/assets/insignia/*.png, 1792×2400, vários MB) viram versões leves para o site
// (public/assets/insignia/web/<id>.webp): corta a borda transparente e reduz para 512 px de altura.
// Rode de novo quando trocar ou adicionar uma arte:  node ferramentas/molduras/insignias.mjs   (na pasta site)
import fs from 'node:fs'
import path from 'node:path'
import { sharp } from './comum.mjs'

const pasta = path.resolve('public/assets/insignia')
const saida = path.join(pasta, 'web')
fs.mkdirSync(saida, { recursive: true })
const mini = path.join(pasta, 'mini')
fs.mkdirSync(mini, { recursive: true })
const arquivos = fs.readdirSync(pasta, { recursive: true }).filter(f => f.endsWith('.png'))
const nomes = new Set()
for (const arq of arquivos) {
  const nome = path.basename(arq, '.png')
  if (nomes.has(nome)) throw new Error(`Arte duplicada: ${nome}`)
  nomes.add(nome)
  const destino = path.join(saida, nome + '.webp')
  if (fs.existsSync(destino) && fs.existsSync(path.join(mini,nome+'.webp')) && fs.statSync(destino).mtimeMs >= fs.statSync(path.join(pasta,arq)).mtimeMs) continue
  const imagem = sharp(path.join(pasta, arq)).trim()
  await imagem.clone().resize({ height: 512, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(destino)
  await imagem.clone().resize({ width:128,height:128,fit:'inside',withoutEnlargement:true }).webp({quality:85,alphaQuality:100}).toFile(path.join(mini,nome+'.webp'))
  console.log(arq, '->', path.relative(pasta, destino), Math.round(fs.statSync(destino).size / 1024) + ' KB')
}
