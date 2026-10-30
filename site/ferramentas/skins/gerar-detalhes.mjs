// Gera os detalhes das skins que aparecem ao passar o mouse num cartão (public/assets/skins/detalhes-<idioma>.json):
// nome traduzido da skin, coleção (nome + ícone), descrição da arma, descrição da pintura e a frase de efeito.
// Fonte: a biblioteca MIT @ianlucas/cs2-lib (a mesma do inventory.cstrike.app), lida como TEXTO: nada baixado é executado.
// Roda junto com o catálogo, quando ele for atualizado:  node ferramentas/skins/gerar-detalhes.mjs
//
//   { armas: { defIndex: [nome, descrição] },
//     colecoes: { chave: [nome, imagem] },              imagem: fim do endereço do ícone (ver ICONE_COLECAO em src/comum/DicaSkin.jsx)
//     skins: { "def:paint": [nome, chaveColeção, descrição, frase] } }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const saida = path.resolve(aqui, '../../public/assets/skins')
const VERSAO_LIB = '9.9.0'
const LIB = `https://unpkg.com/@ianlucas/cs2-lib@${VERSAO_LIB}/dist`
const COLECOES = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json'
const PREFIXO_ICONE = 'https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/set_icons/'
const IDIOMAS = { pt: 'brazilian', en: 'english', es: 'spanish' }

const baixarTexto = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.text()
}

// Texto entre crases (template literal sem ${}): desfaz os escapes
const STR = '`((?:\\\\[\\s\\S]|[^`\\\\])*)`'
const desescapar = (s) =>
  s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16))
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16))
    return { n: '\n', t: '\t', r: '' }[e] ?? e
  })

// Itens: cada objeto do array CS2_ITEMS é plano ({...} sem objetos dentro); só precisamos de alguns campos
const textoItens = await baixarTexto(`${LIB}/items.mjs`)
const itens = []
for (const [obj] of textoItens.matchAll(/\{[^{}]*\}/g)) {
  const num = (k) => obj.match(new RegExp(`[{,]${k}:(\\d+)`))?.[1]
  const str = (k) => obj.match(new RegExp(`[{,]${k}:${STR}`))?.[1]
  const tipo = str('type')
  if (tipo !== 'weapon' && tipo !== 'melee' && tipo !== 'glove') continue
  itens.push({ id: num('id'), def: num('definitionIndex'), paint: num('variantIndex'), base: /[{,]isBase:!0/.test(obj), colecao: str('collectionKey') })
}
console.log(`${itens.length} armas/facas/luvas na biblioteca`)

// Ícones das coleções (ByMykel): "collection-set-community-3" -> set_community_3_png.png
const icones = {}
for (const c of JSON.parse(await baixarTexto(COLECOES))) {
  const chave = c.original?.image_inventory?.split('/').pop()
  if (chave && c.image?.startsWith(PREFIXO_ICONE)) icones[chave] = c.image.slice(PREFIXO_ICONE.length)
}

for (const [idioma, arquivo] of Object.entries(IDIOMAS)) {
  const texto = await baixarTexto(`${LIB}/translations/${arquivo}.mjs`)
  const tr = {}
  // (?<=[{,]): a chave inteira, para "100004:{" não virar a chave 4
  for (const m of texto.matchAll(new RegExp(`(?<=[{,])(\\d+):\\{((?:[a-zA-Z]+:${STR},?)*)\\}`, 'g'))) {
    const campos = {}
    for (const f of m[2].matchAll(new RegExp(`([a-zA-Z]+):${STR}`, 'g'))) campos[f[1]] = desescapar(f[2])
    tr[m[1]] = campos
  }
  const det = { armas: {}, colecoes: {}, skins: {} }
  for (const it of itens) {
    const t = tr[it.id]
    if (!t) continue
    if (it.base) {
      det.armas[it.def] ??= [t.name || '', (t.description || '').trim()]
      continue
    }
    if (it.paint == null) continue
    // "Esta arma foi ... \n\nFrase de efeito": o último parágrafo (se houver mais de um) é a frase
    const partes = (t.description || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    const frase = partes.length > 1 ? partes.pop() : ''
    const nome = (t.name || '').replace(/^.*? \| /, '')
    if (it.colecao && t.collectionName) det.colecoes[it.colecao] ??= [t.collectionName, icones[it.colecao] || '']
    det.skins[`${it.def}:${it.paint}`] ??= [nome, it.colecao || '', partes.join('\n\n'), frase]
  }
  const nome = `detalhes-${idioma}.json`
  fs.writeFileSync(path.join(saida, nome), JSON.stringify(det))
  console.log(`${nome}: ${Object.keys(det.skins).length} skins, ${Object.keys(det.colecoes).length} coleções, ${(fs.statSync(path.join(saida, nome)).size / 1024).toFixed(0)} KB`)
}
