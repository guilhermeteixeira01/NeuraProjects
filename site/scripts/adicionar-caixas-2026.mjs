// Integra as artes novas sem substituir caixas existentes ou reutilizar seus IDs.
// Executar em site/: node scripts/adicionar-caixas-2026.mjs (requer sharp).
import fs from 'node:fs'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { precoDasCaixas } from './precos-caixas.mjs'

const base = new URL('../', import.meta.url)
const ler = (p) => JSON.parse(fs.readFileSync(new URL(p, base), 'utf8'))
const gravar = (p, dados) => fs.writeFileSync(new URL(p, base), JSON.stringify(dados))
const caixas = ler('worker/steam-login/src/caixas-iniciais.json')
const modelos = ler('scripts/caixas-modelos-2026.json')
const precos = ler('worker/steam-login/src/precos.json')
const armas = ler('public/assets/skins/armas.json').armas
const modelo = (slug) => {
  const c = modelos.find((c) => c.slug === slug)
  if (!c) throw new Error(`Modelo ausente: ${slug}`)
  return structuredClone(c)
}
function luxo(tipo) {
  const itens = armas.filter((a) => a.c === (tipo === 'luva' ? 'luvas' : 'facas')).flatMap((a) => a.s.filter((s) => s[0] > 0 && precos.skins[`${a.d}:${s[0]}`]).map((s) => ({ t: tipo, d: a.d, p: s[0], min: s[3], max: s[4], l: s[7] ? 1 : 0 })))
  const valor = (it) => Math.max(1, ...precos.skins[`${it.d}:${it.p}`].filter(Number.isFinite))
  itens.sort((a, b) => valor(b) - valor(a))
  const lista = itens.length <= 300 ? itens : Array.from({ length: 300 }, (_, i) => itens[Math.floor(i * (itens.length - 1) / 299)])
  if (!lista.length) throw new Error(`Sem itens: ${tipo}`)
  lista.forEach((it, i) => {
    const q = i / lista.length
    it.r = q < .05 ? 4 : q < .15 ? 3 : q < .35 ? 2 : q < .65 ? 1 : 0
    it.w = Math.max(1, Math.round(10000 / Math.sqrt(valor(it))))
  })
  return { ...modelo('caixa-cs-tematicas-clutch'), tier: 'premium', itens: lista, facas: [] }
}
const fontes = [
  ['armas/Neura Project AK-47.png', 'caixa-armas-ak-47', 'Caixa AK-47', 'caixa-arma-ak-47'],
  ['armas/Neura Project AWP.png', 'caixa-armas-awp', 'Caixa AWP', 'caixa-arma-awp'],
  ['armas/Neura Project Glock.png', 'caixa-armas-glock-18', 'Caixa Glock-18', 'caixa-arma-glock-18'],
  ['armas/Neura Project M4A1-S.png', 'caixa-armas-m4a1-s', 'Caixa M4A1-S', 'caixa-arma-m4a1-s'],
  ['armas/Neura Project M4A4.png', 'caixa-armas-m4a4', 'Caixa M4A4', 'caixa-arma-m4a4'],
  ['armas/Neura Project Triple USP.png', 'caixa-armas-usp-s', 'Caixa USP-S', 'caixa-arma-usp-s'],
  ['armas/Neura Project FACAS.png', 'caixa-extras-facas', 'Caixa de Facas', 'faca'],
  ['armas/Neura Project LUVAS.png', 'caixa-extras-luvas', 'Caixa de Luvas', 'luva'],
  ['outros/Rush A.png', 'caixa-rush-rush-a', 'Caixa Rush A', 'caixa-cs-tematicas-rush-b'],
  ['outros/Rush B.png', 'caixa-rush-rush-b', 'Caixa Rush B', 'caixa-cs-tematicas-rush-b'],
  ['outros/lego.png', 'caixa-extras-lego', 'Caixa Lego', 'caixa-desenhos-robo-de-sucata'],
  ['outros/Coca Cola.png', 'caixa-extras-coca-cola', 'Caixa Coca-Cola', 'caixa-cs-tematicas-clutch'],
]
let id = Math.max(...caixas.map((c) => c.id), ...ler('worker/steam-login/src/caixas-retiradas-ids.json'))
fs.mkdirSync(new URL('public/assets/caixas/web/', base), { recursive: true })
const novas = []
for (const [arquivo, slug, nome, origem] of fontes) {
  const existente = caixas.find((c) => c.slug === slug)
  const img = existente?.img || `/assets/caixas/web/${slug}.webp`
  await sharp(fileURLToPath(new URL(`public/assets/caixas/${arquivo}`, base))).resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(fileURLToPath(new URL(`public${img}`, base)))
  if (existente) continue
  const c = ['faca', 'luva'].includes(origem) ? luxo(origem) : modelo(origem)
  novas.push({ ...c, id: ++id, slug, nome, img, ativa: true, arquivada: false })
}
const calculados = precoDasCaixas(novas, precos.skins, precos.a, precos.c, 60000)
for (const c of novas) c.preco = calculados.precos[c.slug]
const diaria = caixas.find((c) => c.diaria)
if (diaria) {
  diaria.img = '/assets/caixas/web/caixa-diaria.webp'
  await sharp(fileURLToPath(new URL('public/assets/caixas/neura-projects-caixa-diaria.png', base))).resize({ width: 720, height: 720, fit: 'inside' }).webp({ quality: 86 }).toFile(fileURLToPath(new URL('public/assets/caixas/web/caixa-diaria.webp', base)))
}
gravar('worker/steam-login/src/caixas-iniciais.json', [...caixas, ...novas])
gravar('worker/steam-login/src/precos.json', { ...precos, caixas: { ...precos.caixas, ...calculados.precos } })
console.table(novas.map(({ id, nome, preco }) => ({ id, nome, preco })))
