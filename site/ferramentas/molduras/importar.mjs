// Importa molduras soltas colocadas à mão em public/assets/molduras/<Pasta Qualquer>/<Nome>.gif|.png|.apng
// (decorações de avatar no estilo Discord: APNG, às vezes com extensão .gif). Sem compressão: o arquivo vai igual.
//   - id: <slug da pasta>/<slug do nome> (o worker só aceita a-z, 0-9 e "-")
//   - grava <id>.png (animada) + <id>.webp (miniatura parada) e apaga o original
//   - escala: canvas maior que 288 px (avatar 240 px) fica proporcionalmente maior
//   - no fim, imprime as linhas para COLECOES e MOLDURAS do src/comum/molduras.js
//   node importar.mjs            (na pasta ferramentas/molduras)
import fs from 'fs'
import path from 'path'
import { PASTA, gravar, lerQuadros, slug } from './comum.mjs'

const EXT = /\.(gif|png|apng)$/i
// Pastas já no formato do site (só minúsculas/números/hífen) ficam como estão
const soltas = fs.readdirSync(PASTA).filter((d) => fs.statSync(path.join(PASTA, d)).isDirectory() && d !== slug(d))

// Nome bonito: "black widow" -> "Black Widow", "kento-nanami" -> "Kento Nanami", "CyclingLights-rgb" -> "Cycling Lights RGB".
// Hífen só vira espaço em nome sem espaço (assim "R2-D2 on Tatooine" e "Curious BB-8" ficam como estão).
const MINUSCULAS = new Set(['of', 'the', 'on', 'and'])
function nomeBonito(arquivo) {
  let base = arquivo.replace(EXT, '').replace(/([a-z])([A-Z])/g, '$1 $2')
  if (!/\s/.test(base)) base = base.replace(/[-_]+/g, ' ')
  return base
    .trim()
    .split(/\s+/)
    .map((p, i) => (p.toLowerCase() === 'rgb' ? 'RGB' : i > 0 && MINUSCULAS.has(p.toLowerCase()) ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1)))
    .join(' ')
}

const linhas = []
const colecoes = []
for (const pasta of soltas) {
  // Windows não diferencia maiúsculas ("Tron" e "tron" são a mesma pasta): tira a original do caminho antes
  const temp = path.join(PASTA, `_importando-${slug(pasta)}`)
  fs.renameSync(path.join(PASTA, pasta), temp)
  const col = slug(pasta)
  colecoes.push(pasta)
  for (const arq of fs.readdirSync(temp).filter((f) => EXT.test(f)).sort((a, b) => a.localeCompare(b))) {
    const buf = fs.readFileSync(path.join(temp, arq))
    const id = `${col}/${slug(arq.replace(EXT, ''))}`
    const { largura } = lerQuadros(buf)
    await gravar(id, buf)
    const escala = largura > 288 ? Math.round((largura / 240) * 100) / 100 : null
    linhas.push(`  { id: '${id}', nome: ${JSON.stringify(nomeBonito(arq))}, colecao: ${JSON.stringify(pasta)}, fonte: 'decor'${escala ? `, escala: ${escala}` : ''} },`)
    console.error(`${pasta}/${arq} -> ${id} (${largura}px, ${Math.round(buf.length / 1024)} KB)`)
  }
  const sobrou = fs.readdirSync(temp).filter((f) => !EXT.test(f))
  if (!sobrou.length) fs.rmSync(temp, { recursive: true })
  else console.error(`ATENÇÃO: ${temp} ficou com arquivos que não são moldura: ${sobrou.join(', ')}`)
}
console.log('// COLECOES:\n' + colecoes.map((c) => `  ${JSON.stringify(c)},`).join('\n'))
console.log('// MOLDURAS:\n' + linhas.join('\n'))
