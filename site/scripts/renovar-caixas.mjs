// Nova coleção: reutiliza conteúdos aprovados e calcula o preço pelas chances reais.
// Modelos preservados permitem executar novamente sem perder a referência anterior.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { precoDasCaixas } from './precos-caixas.mjs'

const require = createRequire(import.meta.url)
const sharp = require(path.join(execSync('npm root -g').toString().trim(), 'sharp'))
const base = new URL('../', import.meta.url)
const ler = (p) => JSON.parse(fs.readFileSync(new URL(p, base), 'utf8'))
const gravar = (p, v) => fs.writeFileSync(new URL(p, base), JSON.stringify(v))
const modelos = ler('scripts/caixas-modelos-2026.json')
const precos = ler('worker/steam-login/src/precos.json')
const catalogo = ler('public/assets/skins/armas.json')
const adesivos = ler('public/assets/skins/adesivos.json')
const raiz = new URL('public/assets/caixas/', base)
const grupos = ['originais', 'naruto', 'bleach', 'one-piece', 'demon-slayer', 'hunter-x-hunter', 'armas', 'mapas', 'rush', 'times', 'extras', 'stickers', 'charms']
const achar = (slug) => {
  const c = modelos.find((c) => c.slug === slug)
  if (!c) throw new Error(`Modelo ausente: ${slug}`)
  return structuredClone(c)
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const escolher = (prefixo, nome) => structuredClone(modelos.filter((c) => c.slug.startsWith(prefixo))[hash(nome) % modelos.filter((c) => c.slug.startsWith(prefixo)).length])
const titulo = (s) => s.split('-').map((p) => ({ ak: 'AK', awp: 'AWP', usp: 'USP', m4: 'M4', ct: 'CT' })[p] || p[0].toUpperCase() + p.slice(1)).join(' ')
const valorSkin = (x) => {
  const p = precos.skins[`${x.d}:${x.p}`] || []
  return Math.max(1, ...p.filter((n) => Number.isFinite(n)))
}
function classificar(itens, valor) {
  const ordenados = [...itens].sort((a, b) => valor(b) - valor(a))
  ordenados.forEach((it, i) => {
    const q = i / ordenados.length
    it.r = ordenados.length < 10 ? 4 - Math.min(4, Math.floor(i * 5 / ordenados.length)) : q < .05 ? 4 : q < .15 ? 3 : q < .35 ? 2 : q < .65 ? 1 : 0
    it.w = Math.max(1, Math.round(10000 / Math.sqrt(Math.max(1, valor(it)))))
  })
  return itens
}
function luxo(tipo) {
  const itens = catalogo.armas.filter((a) => a.c === (tipo === 'luva' ? 'luvas' : 'facas')).flatMap((a) => a.s.filter((s) => s[0] > 0 && precos.skins[`${a.d}:${s[0]}`]).map((s) => ({ t: tipo, d: a.d, p: s[0], min: s[3], max: s[4], l: s[7] ? 1 : 0 })))
  if (!itens.length) throw new Error(`Sem itens para ${tipo}`)
  // O worker aceita até 300 itens por caixa.
  itens.sort((a, b) => valorSkin(a) - valorSkin(b))
  const lista = itens.length <= 300 ? itens : Array.from({ length: 300 }, (_, i) => itens[Math.floor(i * (itens.length - 1) / 299)])
  return { ...achar('caixa-cs-tematicas-clutch'), tier: 'premium', itens: classificar(lista, valorSkin), facas: [] }
}
function modelo(grupo, nome) {
  if (grupo === 'armas') {
    if (nome === 'm4') {
      const c = achar('caixa-arma-m4a1-s')
      c.itens.push(...achar('caixa-arma-m4a4').itens)
      return c
    }
    return achar(`caixa-arma-${nome}`)
  }
  if (grupo === 'stickers') {
    if (nome.includes('katowice')) {
      const itens = adesivos.filter((a) => /katowice 2014/i.test(a[1]) && precos.a[a[0]] > 0).map((a) => ({ t: 'adesivo', d: a[0], p: 0, min: 0, max: 1, l: 0, n: a[1], i: a[2] }))
      if (!itens.length) throw new Error('Nenhum adesivo Katowice 2014 com preço')
      return { ...achar('caixa-adesivos-holo'), itens: classificar(itens, (it) => precos.a[it.d]), facas: [], tier: 'premium' }
    }
    return achar(nome.includes('holograf') ? 'caixa-adesivos-holo' : 'caixa-adesivos-grafite')
  }
  if (grupo === 'charms') {
    const c = achar('caixa-chaveiros-tatico')
    const origens = modelos.filter((c) => c.slug.startsWith('caixa-chaveiros-'))
    c.itens = [...new Map(origens.flatMap((c) => c.itens).filter((it) => nome.includes('small-arms') ? /ak|awp|m4|glock|usp|rifle|pistol|tec|mac|deagle/i.test(it.n) : nome.includes('missing-link') ? /link/i.test(it.n) : true).map((it) => [it.d, it])).values()]
    if (!c.itens.length) c.itens = origens[hash(nome) % origens.length].itens
    classificar(c.itens, (it) => precos.c[it.d] || 1)
    return c
  }
  if (grupo === 'extras' && ['facas', 'luvas'].includes(nome)) return luxo(nome === 'facas' ? 'faca' : 'luva')
  if (grupo === 'naruto' || grupo === 'bleach') return modelos.some((c) => c.slug === `caixa-anime-${nome}`) ? achar(`caixa-anime-${nome}`) : escolher('caixa-anime-', nome)
  if (['one-piece', 'demon-slayer', 'hunter-x-hunter'].includes(grupo)) return escolher('caixa-anime-', nome)
  if (grupo === 'mapas') return achar(nome === 'inferno' ? 'caixa-cs-tematicas-inferno' : nome === 'nuke' ? 'caixa-cs-tematicas-nuke' : 'caixa-cs-tematicas-dust-ii')
  if (grupo === 'rush') return achar('caixa-cs-tematicas-rush-b')
  if (grupo === 'times') return escolher('caixa-cs-tematicas-', nome)
  if (grupo === 'originais') return escolher('caixa-criaturas-', nome)
  return escolher('caixa-desenhos-', nome)
}

const novas = []
const manifesto = []
let id = Math.max(...modelos.map((c) => c.id), 999)
for (const grupo of grupos) {
  for (const arquivo of fs.readdirSync(new URL(`${grupo}/`, raiz)).filter((f) => f.endsWith('.png')).sort()) {
    const nome = arquivo.replace(/^\d+-/, '').replace(/\.png$/, '')
    const slug = `caixa-${grupo}-${nome}`
    const c = modelo(grupo, nome)
    const nomeVisivel = grupo === 'armas' ? ({ 'ak-47': 'AK-47', awp: 'AWP', 'usp-s': 'USP-S', 'glock-18': 'Glock-18', m4: 'M4' })[nome] : titulo(nome.replace(/^(stickers|charms)-/, ''))
    const img = `/assets/caixas/web/${slug}.webp`
    const pastaWeb = new URL('web/', raiz)
    fs.mkdirSync(pastaWeb, { recursive: true })
    await sharp(fileURLToPath(new URL(`${grupo}/${arquivo}`, raiz))).resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(fileURLToPath(new URL(`${slug}.webp`, pastaWeb)))
    novas.push({ ...c, id: ++id, slug, nome: `Caixa ${nomeVisivel}`, img, ativa: true, arquivada: false })
    manifesto.push({ grupo, arquivo, slug, modelo: c.slug })
  }
}
if (new Set(novas.map((c) => c.slug)).size !== novas.length) throw new Error('Slug duplicado')
const { precos: calculados, tabela } = precoDasCaixas(novas, precos.skins, precos.a, precos.c, 30000)
for (const c of novas) c.preco = calculados[c.slug]
gravar('worker/steam-login/src/caixas-iniciais.json', novas)
gravar('worker/steam-login/src/caixas-retiradas-ids.json', modelos.map((c) => c.id))
gravar('worker/steam-login/src/caixas-removidas.json', [...new Set([...ler('worker/steam-login/src/caixas-removidas.json'), ...modelos.map((c) => c.slug)])])
gravar('worker/steam-login/src/precos.json', { ...precos, caixas: calculados })
gravar('scripts/caixas-colecao-2026.json', manifesto)
for (const t of tabela) console.log(`${t.nome}: ${t.depois} NP (valor esperado ${t.esperado.toFixed(1)} NP)`)
console.log(`${novas.length} caixas novas, IDs a partir de 1000, sem reutilizar IDs antigos.`)
