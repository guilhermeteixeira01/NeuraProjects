// Baixa as molduras escolhidas (escolhidas.json) da Loja de Pontos da Steam e do Decor e grava no site
// (public/assets/molduras/<coleção>/<nome>.png + miniatura .webp). No fim, imprime as linhas para o molduras.js.
//   node baixar.mjs
//
// Steam: o arquivo animado (APNG) da moldura de avatar é o "item_image_small"; o "large" é uma imagem parada.
// Decor: o animado é "a_<hash>.png".
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gravar, lerQuadros, slug } from './comum.mjs'
import { medir } from './medir.mjs'

// O arquivo é gravado como veio (sem recomprimir e sem limite de tamanho): qualidade original da animação

const aqui = path.dirname(fileURLToPath(import.meta.url))
const lista = JSON.parse(fs.readFileSync(path.join(aqui, 'escolhidas.json'), 'utf8'))

const url = (m) =>
  m.fonte === 'steam'
    ? `https://shared.akamai.steamstatic.com/community_assets/images/items/${m.appid}/${m.arquivo}`
    : `https://ugc.decor.fieryflames.dev/a_${m.hash}.png`

const linhas = []
for (const m of lista) {
  const id = `${slug(m.pasta || m.colecao)}/${slug(m.nome)}`
  // Já está no site: pula (node baixar.mjs --tudo baixa de novo todas)
  if (!process.argv.includes('--tudo') && fs.existsSync(path.join(aqui, '../../public/assets/molduras', id + '.png'))) continue
  const r = await fetch(url(m))
  if (!r.ok) {
    console.log('FALHOU', r.status, id)
    continue
  }
  const buf = Buffer.from(await r.arrayBuffer())
  const { quadros } = lerQuadros(buf) // confere se é PNG/APNG de verdade
  await gravar(id, buf)
  console.log(id.padEnd(44), String(quadros.length).padStart(3), 'quadros', Math.round(buf.length / 1024) + ' KB')
  // Steam: molduras feitas para avatar quadrado (o site deixa o avatar quadrado com elas)
  // (com a escala que põe a borda de dentro um pouco por cima da foto: medir.mjs)
  // forma: 'redonda' na escolhidas.json = moldura da Steam com miolo redondo (avatar redondo, escala informada lá)
  const forma = m.forma === 'redonda' ? `, escala: ${m.escala}` : m.fonte === 'steam' ? `, forma: 'quadrada', escala: ${medir(buf).escala.toFixed(2)}` : ''
  linhas.push(`  { id: '${id}', nome: ${JSON.stringify(m.nome)}, colecao: '${m.colecao}', fonte: '${m.fonte}'${forma} },`)
}
console.log('\n' + linhas.join('\n'))
