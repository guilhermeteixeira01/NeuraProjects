// Mede a área não transparente das artes; o inventário usa estes dados no SVG,
// sem alterar as imagens originais nem depender de CORS no navegador.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const base = new URL('../', import.meta.url)
const ler = p => JSON.parse(fs.readFileSync(new URL(p, base), 'utf8'))
const destino = new URL('src/comum/recortesInventario.json', base)
const recortes = fs.existsSync(destino) ? JSON.parse(fs.readFileSync(destino, 'utf8')) : {}
const tarefas = []
for (const [tipo, arquivo] of [['adesivo', 'adesivos'], ['chaveiro', 'chaveiros'], ['emblema', 'emblemas'], ['grafite', 'grafites'], ['trilha', 'trilhas']]) {
  for (const l of ler(`public/assets/skins/${arquivo}.json`)) {
    tarefas.push({ chave: `${tipo}:${l[0]}:${tipo === 'grafite' ? l[4] || 0 : 0}`, src: /^https?:/.test(l[2]) ? l[2] : `https://community.akamai.steamstatic.com/economy/image/${l[2]}/256fx256f` })
  }
}
for (const c of ler('worker/steam-login/src/caixas-iniciais.json')) tarefas.push({ chave: `caixa:${c.img}`, src: c.img })
const { CAIXA_PREMIUM } = await import('../worker/steam-login/src/caixa-premium-core.js')
tarefas.push({ chave: `caixa:${CAIXA_PREMIUM.img}`, src: CAIXA_PREMIUM.img })
const pendentes = tarefas.filter(t => !recortes[t.chave])
const destaques = new Set(ler('worker/steam-login/src/caixas-iniciais.json').flatMap(c => c.itens.map(i => `${i.t}:${i.d}:${i.t === 'grafite' ? i.p || 0 : 0}`)))
pendentes.sort((a, b) => Number(destaques.has(b.chave) || !b.chave.startsWith('adesivo:')) - Number(destaques.has(a.chave) || !a.chave.startsWith('adesivo:')))
let proxima = 0, prontas = 0
const falhas = []
const salvar = () => fs.writeFileSync(destino, JSON.stringify(Object.fromEntries(Object.entries(recortes).sort(([a], [b]) => a.localeCompare(b)))))
await Promise.all(Array.from({ length: 32 }, async () => {
  while (proxima < pendentes.length) {
    const t = pendentes[proxima++]
    try {
      const bytes = t.src.startsWith('/') ? fs.readFileSync(fileURLToPath(new URL(`public${t.src}`, base))) : Buffer.from(await fetch(t.src, { signal: AbortSignal.timeout(20000) }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() }))
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + info.channels - 1] > 24) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
      }
      if (x1 < x0) throw new Error('arte vazia')
      recortes[t.chave] = [info.width, info.height, x0, y0, x1 - x0 + 1, y1 - y0 + 1]
    } catch (e) { falhas.push(`${t.chave}: ${e.message}`) }
    prontas++
    if (prontas % 500 === 0) { salvar(); console.log(`${prontas}/${pendentes.length} artes medidas`) }
  }
}))
salvar()
console.log(`${Object.keys(recortes).length} recortes; ${falhas.length} falhas`)
if (falhas.length) { console.log(falhas.slice(0, 15).join('\n')); process.exitCode = 1 }
