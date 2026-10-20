// Gera o catálogo de skins do site (public/assets/skins/*.json) a partir da API pública ByMykel/CSGO-API.
// Roda só quando você quer atualizar o catálogo (ex.: skin nova do jogo):  node ferramentas/skins/gerar-catalogo.mjs
// Os arquivos gerados vão para o repositório, então o build do site não depende da internet.
//
//   armas.json    armas de fogo e facas/luvas:  { armas: [{ d, k, n, c, s: [[paint, nome, cor, minFloat, maxFloat, stattrak, imagem, modeloAntigo]] }] }
//                 modeloAntigo (1/0): o plugin precisa dele para mostrar a pintura certa (bodygroup do modelo)
//   agentes.json  agentes de CT e TR:           [{ d, n, t, m, c, i }]
//   adesivos.json adesivos:                     [[defIndex, nome, imagem]]
// "imagem" é o final do endereço da Steam: o site junta com IMG_BASE (ver src/comum/skins.js).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const saida = path.resolve(aqui, '../../public/assets/skins')
const API = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en'
const PREFIXO_IMG = 'https://community.akamai.steamstatic.com/economy/image/'

const baixar = async (nome) => {
  const r = await fetch(`${API}/${nome}.json`)
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`)
  return r.json()
}
const img = (u) => (typeof u === 'string' && u.startsWith(PREFIXO_IMG) ? u.slice(PREFIXO_IMG.length) : '')
const CATEGORIAS = { Rifles: 'rifles', SMGs: 'smgs', Pistols: 'pistols', Heavy: 'heavy', Knives: 'facas', Gloves: 'luvas' }

console.log('Baixando skins...')
const skins = await baixar('skins_not_grouped')
const porArma = new Map()
for (const x of skins) {
  const c = CATEGORIAS[x.category?.name]
  if (!c || !x.weapon?.weapon_id || x.paint_index == null || x.souvenir) continue
  let arma = porArma.get(x.weapon.weapon_id)
  if (!arma) porArma.set(x.weapon.weapon_id, (arma = { d: x.weapon.weapon_id, k: x.weapon.id, n: x.weapon.name, c, s: new Map() }))
  const p = String(x.paint_index)
  const atual = arma.s.get(p)
  const imagem = img(x.image)
  if (!atual) {
    arma.s.set(p, { paint: Number(p), nome: x.pattern?.name || '', cor: x.rarity?.color || '', min: x.min_float ?? 0, max: x.max_float ?? 1, st: !!x.stattrak, legado: !!x.legacy_model, img: imagem, nitido: x.wear?.id })
  } else {
    atual.min = Math.min(atual.min, x.min_float ?? 0)
    atual.max = Math.max(atual.max, x.max_float ?? 1)
    atual.st ||= !!x.stattrak
    atual.legado ||= !!x.legacy_model
    // imagem do desgaste mais limpo (Factory New / Minimal Wear)
    if (imagem && (!atual.img || (x.wear?.id || 'Z') < (atual.nitido || 'Z'))) {
      atual.img = imagem
      atual.nitido = x.wear?.id
    }
  }
}
const armas = [...porArma.values()]
  .map((a) => ({
    d: a.d,
    k: a.k,
    n: a.n,
    c: a.c,
    s: [...a.s.values()]
      .sort((x, y) => x.nome.localeCompare(y.nome))
      .map((s) => [s.paint, s.nome, s.cor, Number(s.min.toFixed(4)), Number(s.max.toFixed(4)), s.st ? 1 : 0, s.img, s.legado ? 1 : 0]),
  }))
  .sort((a, b) => a.c.localeCompare(b.c) || a.n.localeCompare(b.n))

console.log('Baixando agentes...')
const agentes = (await baixar('agents'))
  .filter((a) => a.def_index && a.model_player)
  .map((a) => ({
    d: Number(a.def_index),
    n: a.name,
    t: a.team?.id === 'counter-terrorists' ? 'ct' : 'tr',
    m: a.model_player,
    c: a.rarity?.color || '',
    i: img(a.image),
  }))
  .sort((a, b) => a.t.localeCompare(b.t) || a.n.localeCompare(b.n))

console.log('Baixando adesivos...')
const adesivos = (await baixar('stickers'))
  .filter((s) => s.def_index && img(s.image))
  .map((s) => [Number(s.def_index), String(s.name).replace(/^Sticker \| /, ''), img(s.image)])
  .sort((a, b) => a[1].localeCompare(b[1]))

fs.mkdirSync(saida, { recursive: true })
const gravar = (nome, v) => {
  fs.writeFileSync(path.join(saida, nome), JSON.stringify(v))
  console.log(`${nome}: ${(fs.statSync(path.join(saida, nome)).size / 1024).toFixed(0)} KB`)
}
gravar('armas.json', { gerado: new Date().toISOString().slice(0, 10), armas })
gravar('agentes.json', agentes)
gravar('adesivos.json', adesivos)
console.log(`${armas.length} armas/facas/luvas, ${armas.reduce((n, a) => n + a.s.length, 0)} skins, ${agentes.length} agentes, ${adesivos.length} adesivos`)
