// Gera worker/steam-login/src/skins-raridade.json: raridade de cada skin do catálogo ("<defIndex>:<paint>" -> 0..5), lida pela cor da Steam.
// O worker usa para dar o valor de venda de cada item (src/loja-core.js). Facas e luvas são sempre "Extraordinário" (6) e não entram aqui.
//   node scripts/gerar-raridades.mjs     (rode de novo quando o catálogo de skins mudar: node ferramentas/skins/gerar-catalogo.mjs)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const catalogo = JSON.parse(fs.readFileSync(path.join(aqui, '../public/assets/skins/armas.json'), 'utf8'))
const COR = { '#b0c3d9': 0, '#5e98d9': 1, '#4b69ff': 2, '#8847ff': 3, '#d32ce6': 4, '#eb4b4b': 5 }
const mapa = {}
for (const a of catalogo.armas) {
  if (a.c === 'facas' || a.c === 'luvas') continue
  for (const s of a.s) mapa[`${a.d}:${s[0]}`] = COR[(s[2] || '').toLowerCase()] ?? 2
}
fs.writeFileSync(path.join(aqui, '../worker/steam-login/src/skins-raridade.json'), JSON.stringify(mapa))
console.log(`${Object.keys(mapa).length} skins → skins-raridade.json`)

// valor base de cada faca (tabela usada em worker/steam-login/src/loja.js)
import { valorBaseDaFaca } from './lib-facas.mjs'
const valores = {}
for (const a of catalogo.armas) if (a.c === 'facas') for (const s of a.s) valores[`${a.d}:${s[0]}`] = valorBaseDaFaca(a.d, s[1])
fs.writeFileSync(path.join(aqui, '../worker/steam-login/src/facas-valor.json'), JSON.stringify(valores))
console.log(`${Object.keys(valores).length} facas → facas-valor.json`)
