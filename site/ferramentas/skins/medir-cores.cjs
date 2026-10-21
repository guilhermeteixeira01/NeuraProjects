// Mede a cor de cada skin pela imagem da Steam e grava ferramentas/skins/cores-skins.json (usado por scripts/gerar-caixas-iniciais.mjs
// para montar as caixas por tema de cor). Precisa do pngjs: npm i --no-save pngjs, depois:
//   node ferramentas/skins/medir-cores.cjs public/assets/skins/armas.json ferramentas/skins/cores-skins.json
const fs = require('fs')
const { PNG } = require('pngjs')
const [, , catalogoArq, saidaArq] = process.argv
const armas = JSON.parse(fs.readFileSync(catalogoArq, 'utf8')).armas
const lista = armas.flatMap((a) => a.s.filter((s) => s[0] && s[6]).map((s) => ({ k: `${a.d}:${s[0]}`, img: s[6] })))
const saida = fs.existsSync(saidaArq) ? JSON.parse(fs.readFileSync(saidaArq, 'utf8')) : {}
const faltam = lista.filter((x) => !saida[x.k])
console.log('skins:', lista.length, 'faltam medir:', faltam.length)

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
async function medir(x) {
  const r = await fetch(`https://community.akamai.steamstatic.com/economy/image/${x.img}/128fx96f`, { headers: { Accept: 'image/png' } })
  if (!r.ok) throw new Error('http ' + r.status)
  const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()))
  const h = Array(12).fill(0)
  let n = 0, branco = 0, preto = 0, cinza = 0, ouro = 0, sat = 0, luz = 0
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 200) continue
    const [hh, s, l] = hsl(png.data[i], png.data[i + 1], png.data[i + 2])
    n++
    sat += s
    luz += l
    if (l > 0.78 && s < 0.35) branco++
    else if (l < 0.16) preto++
    else if (s < 0.18) cinza++
    else h[Math.floor(hh / 30) % 12] += s // pixel colorido: pesa pela saturação
    if (hh >= 38 && hh <= 58 && s > 0.45 && l > 0.3 && l < 0.75) ouro++
  }
  if (!n) throw new Error('vazia')
  const tot = h.reduce((a, b) => a + b, 0) || 1
  return { h: h.map((v) => Math.round((v / tot) * 1000) / 1000), cor: Math.round(((n - branco - preto - cinza) / n) * 1000) / 1000, branco: +(branco / n).toFixed(3), preto: +(preto / n).toFixed(3), cinza: +(cinza / n).toFixed(3), ouro: +(ouro / n).toFixed(3), sat: +(sat / n).toFixed(3), luz: +(luz / n).toFixed(3) }
}
;(async () => {
  let feitos = 0, erros = 0
  const fila = [...faltam]
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (fila.length) {
      const x = fila.shift()
      try {
        saida[x.k] = await medir(x)
      } catch {
        erros++
      }
      if (++feitos % 200 === 0) {
        console.log(feitos, 'medidas,', erros, 'erros')
        fs.writeFileSync(saidaArq, JSON.stringify(saida))
      }
    }
  }))
  fs.writeFileSync(saidaArq, JSON.stringify(saida))
  console.log('pronto:', Object.keys(saida).length, 'erros:', erros)
})()
