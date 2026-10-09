// Insígnias: as artes originais (public/assets/insignia/*.png, 1792×2400, vários MB) viram versões leves para o site
// (public/assets/insignia/web/<id>.webp): corta a borda transparente e reduz para 512 px de altura.
// Rode de novo quando trocar ou adicionar uma arte:  node ferramentas/molduras/insignias.mjs   (na pasta site)
import fs from 'node:fs'
import path from 'node:path'
import { sharp } from './comum.mjs'

const pasta = path.resolve('public/assets/insignia')
const saida = path.join(pasta, 'web')
fs.mkdirSync(saida, { recursive: true })
for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith('.png'))) {
  const destino = path.join(saida, arq.replace(/\.png$/, '.webp'))
  await sharp(path.join(pasta, arq)).trim().resize({ height: 512, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(destino)
  console.log(arq, '->', path.relative(pasta, destino), Math.round(fs.statSync(destino).size / 1024) + ' KB')
}
