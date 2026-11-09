// Raridade (0..6) e valor (NP) de um item do inventário: preço de mercado (precos.json, 1 NP = R$ 1) ou, sem preço, a conta por raridade
// e desgaste; padrão raro (Blue Gem, Fade 97%+, Fire & Ice) multiplica; adesivos e chaveiros colados somam. null = não se vende (caixa, agente).
// A loja (venda), o mercado (preço de referência), o perfil (valor do inventário) e o carrossel de drops usam daqui.
import { definirValorador, precoDeMercado, valorDaFaca, valorDoItem, raridadeCsDaCor } from './loja-core.js'
import { padraoRaro } from './padroes.js'
import ENFEITES_VALOR from './valor-enfeites.json'
import FACAS_VALOR from './facas-valor.json'
import PRECOS from './precos.json'
import RARIDADE_SKIN from './skins-raridade.json'
import FAIXAS_SKIN from './skins-faixas.json'
import EMBLEMAS from '../../../public/assets/skins/emblemas.json'
import GRAFITES from '../../../public/assets/skins/grafites.json'
import TRILHAS from '../../../public/assets/skins/trilhas.json'

const PERFIL_VALOR = new Map([
  ...EMBLEMAS.map(l => [`emblema:${l[0]}:0`, l]),
  ...GRAFITES.map(l => [`grafite:${l[0]}:${l[4] || 0}`, l]),
  ...TRILHAS.map(l => [`trilha:${l[0]}:0`, l]),
])

// Sem preço de mercado: adesivo por acabamento (papel, glitter, holo, foil, gold, campeão) e chaveiro por raridade (azul, roxo, rosa, vermelho)
const VALOR_ADESIVO = [4, 8, 15, 40, 100, 250]
const VALOR_CHAVEIRO = [25, 70, 180, 450]

const valorDoAdesivo = (id) => (PRECOS.a[id] ? Math.max(1, Math.round(PRECOS.a[id])) : VALOR_ADESIVO[ENFEITES_VALOR.a[id] ?? 0] ?? VALOR_ADESIVO[0])
const valorDoChaveiro = (id) => (PRECOS.c[id] ? Math.max(1, Math.round(PRECOS.c[id])) : VALOR_CHAVEIRO[(ENFEITES_VALOR.c[id] ?? 2) - 2] ?? VALOR_CHAVEIRO[0])

// O que está colado na arma (até 5 adesivos e 1 chaveiro) vale junto com ela
function valorDosEnfeites(it) {
  let v = 0
  for (const ad of Array.isArray(it.a) ? it.a : []) if (ad?.i) v += valorDoAdesivo(ad.i)
  if (it.k?.i) v += valorDoChaveiro(it.k.i)
  return v
}

export function valorDe(it) {
  if (['emblema', 'grafite', 'trilha'].includes(it.t)) {
    const linha = PERFIL_VALOR.get(`${it.t}:${it.d}:${it.t === 'grafite' ? it.p || 0 : 0}`)
    if (!linha) return null
    const r = raridadeCsDaCor(linha[3])
    return { r, v: valorDoItem({ f: 0.5 }, r) }
  }
  if (it.t === 'adesivo') return { r: Math.min(5, (ENFEITES_VALOR.a[it.d] ?? 0) + 1), v: valorDoAdesivo(it.d) }
  if (it.t === 'chaveiro') return { r: ENFEITES_VALOR.c[it.d] ?? 2, v: valorDoChaveiro(it.d) }
  if (!['arma', 'faca', 'luva'].includes(it.t)) return null
  const mercado = precoDeMercado(it, PRECOS.skins)
  const mult = padraoRaro(it)?.mult ?? 1
  if (it.t === 'faca') return { r: 6, v: Math.round((mercado ?? valorDaFaca(it, FACAS_VALOR)) * mult) }
  const r = it.t === 'arma' ? RARIDADE_SKIN[`${it.d}:${it.p}`] ?? 2 : 6
  return { r, v: Math.round((mercado ?? valorDoItem(it, r)) * mult) + (it.t === 'arma' ? valorDosEnfeites(it) : 0) }
}

// Valores de vários itens { id: { r, v } } (os que não se vendem ficam de fora)
export function valoresDe(itens) {
  const m = {}
  for (const [k, it] of Object.entries(itens || {})) {
    const x = valorDe(it)
    if (x) m[k] = x
  }
  return m
}

const DESGASTES = [[0, 0.07], [0.07, 0.15], [0.15, 0.38], [0.38, 0.45], [0.45, 1]]

// Item que o upgrade pode entregar: skin do catálogo num desgaste (0 = FN .. 4 = BS) que ela tem. null = não existe
export function alvoDoUpgrade(d, p, w) {
  const linha = FAIXAS_SKIN[`${d}:${p}`]
  const faixa = Number.isInteger(w) ? DESGASTES[w] : null
  if (!linha || !faixa) return null
  const [t, min, max] = linha
  const lo = Math.max(min, faixa[0])
  const hi = Math.min(max, faixa[1])
  if (hi <= lo) return null
  const v = valorDe({ t, d, p, f: (lo + hi) / 2, st: 0 })?.v
  return v > 0 ? { t, d, p, lo, hi, v } : null
}

// Preço de cada skin do catálogo por desgaste: { "<d>:<p>": [FN, MW, FT, WW, BS] }, 0 = a skin não tem esse desgaste
let catalogoComValores
export function valoresDoCatalogo() {
  if (catalogoComValores) return catalogoComValores
  catalogoComValores = {}
  for (const chave of Object.keys(FAIXAS_SKIN)) {
    const [d, p] = chave.split(':').map(Number)
    catalogoComValores[chave] = DESGASTES.map((_, w) => alvoDoUpgrade(d, p, w)?.v ?? 0)
  }
  return catalogoComValores
}

// Dificuldade pelo valor (loja-core.js: DIFICULDADE): as caixas sorteiam com o valor de mercado do item (no desgaste do meio da faixa dele;
// a abertura especial pede o valor num desgaste específico, f)
definirValorador((x) => {
  if (x.t === 'adesivo' || x.t === 'chaveiro') return valorDe({ t: x.t, d: x.d })?.v ?? 0
  const f = Number.isFinite(x.f) ? x.f : Math.min(0.45, ((Number.isFinite(x.min) ? x.min : 0) + (Number.isFinite(x.max) ? x.max : 1)) / 2)
  return valorDe({ t: x.t, d: x.d, p: x.p, f, st: 0 })?.v ?? 0
})
