// Dá preço SÓ às caixas novas (as que não estão arquivadas), pelo valor esperado do que sai nelas (scripts/precos-caixas.mjs).
// As caixas antigas (arquivadas) ficam com o preço que têm. Grava em precos.json (caixas) e em caixas-iniciais.json (preco).
//   node scripts/precos-caixas-novas.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { precoDasCaixas } from './precos-caixas.mjs'

const arq = (f) => new URL(`../worker/steam-login/src/${f}`, import.meta.url)
const precos = JSON.parse(readFileSync(arq('precos.json'), 'utf8'))
const caixas = JSON.parse(readFileSync(arq('caixas-iniciais.json'), 'utf8'))
const novas = caixas.filter((c) => !c.arquivada)
const { precos: novos, tabela } = precoDasCaixas(novas, precos.skins, precos.a, precos.c)
for (const t of tabela) console.log(t.nome.padEnd(28), String(t.antes).padStart(5), '->', String(t.depois).padStart(5), `(valor esperado ${t.esperado.toFixed(0)})`)
writeFileSync(arq('precos.json'), JSON.stringify({ ...precos, caixas: { ...precos.caixas, ...novos } }))
writeFileSync(arq('caixas-iniciais.json'), JSON.stringify(caixas.map((c) => (c.arquivada ? c : { ...c, preco: novos[c.slug] ?? c.preco }))))
