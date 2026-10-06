// Refaz as imagens paradas (.webp) de todas as molduras a partir das animadas (.png) já publicadas.
//   node paradas.mjs
import fs from 'fs'
import path from 'path'
import { PASTA, miniatura } from './comum.mjs'

let n = 0
for (const colecao of fs.readdirSync(PASTA)) {
  const pasta = path.join(PASTA, colecao)
  if (!fs.statSync(pasta).isDirectory()) continue
  for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith('.png'))) {
    const png = path.join(pasta, arq)
    await miniatura(fs.readFileSync(png), png.replace(/\.png$/, '.webp'))
    n++
  }
}
console.log('imagens paradas refeitas:', n)
