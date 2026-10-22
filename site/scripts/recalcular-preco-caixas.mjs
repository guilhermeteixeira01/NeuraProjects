// Recalcula só o preço das caixas (sem baixar o mercado de novo): lê worker/steam-login/src/precos.json e caixas-iniciais.json e grava o preço novo
// nos dois (precos.json → caixas; caixas-iniciais.json → preco). Depois suba REVISAO_CAIXAS em worker/steam-login/src/loja.js para o worker reaplicar nas caixas já salvas.
//   node scripts/recalcular-preco-caixas.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { precoDasCaixas } from './precos-caixas.mjs'

const arq = (f) => new URL(`../worker/steam-login/src/${f}`, import.meta.url)
const precos = JSON.parse(readFileSync(arq('precos.json'), 'utf8'))
const caixas = JSON.parse(readFileSync(arq('caixas-iniciais.json'), 'utf8'))
const { precos: novos, tabela } = precoDasCaixas(caixas, precos.skins, precos.a, precos.c)
for (const t of tabela) console.log(t.nome.padEnd(22), String(t.antes).padStart(5), '->', String(t.depois).padStart(5), `(valor esperado ${t.esperado.toFixed(0)})`)
writeFileSync(arq('precos.json'), JSON.stringify({ ...precos, caixas: novos }))
writeFileSync(arq('caixas-iniciais.json'), JSON.stringify(caixas.map((c) => ({ ...c, preco: novos[c.slug] ?? c.preco }))))
