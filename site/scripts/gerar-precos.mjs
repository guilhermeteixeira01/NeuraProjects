// Gera worker/steam-login/src/precos.json: preço de mercado (R$) de skins, adesivos e chaveiros, para o valor de venda ficar fiel ao mercado.
// Fonte: preços do mercado da Steam (prices.csgotrader.app, em US$) convertidos para R$ pela cotação do dia.
//   node scripts/gerar-precos.mjs
import { gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { CONFIG_PADRAO, precoDeMercado, rndSeguro, sortearAbertura } from '../worker/steam-login/src/loja-core.js'

const ler = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
const armas = ler('public/assets/skins/armas.json').armas
const adesivos = ler('public/assets/skins/adesivos.json')
const chaveiros = ler('public/assets/skins/chaveiros.json')

const bytes = Buffer.from(await (await fetch('https://prices.csgotrader.app/latest/steam.json')).arrayBuffer())
let mercado
try { mercado = JSON.parse(bytes.toString('utf8')) } catch { mercado = JSON.parse(gunzipSync(bytes).toString('utf8')) }
const cotacao = (await (await fetch('https://open.er-api.com/v6/latest/USD')).json()).rates.BRL
console.log('cotação US$ 1 =', cotacao, 'R$ | itens no mercado:', Object.keys(mercado).length)

// Adesivos e chaveiros raros (sem venda na Steam há 90 dias) ou novos demais para a Steam (ex.: Cologne 2026): preço do CSFloat e, sem ele, do Buff (US$)
async function baixarExtra(nome) {
  try {
    const b = Buffer.from(await (await fetch(`https://prices.csgotrader.app/latest/${nome}.json`)).arrayBuffer())
    try { return JSON.parse(b.toString('utf8')) } catch { return JSON.parse(gunzipSync(b).toString('utf8')) }
  } catch {
    console.log(`sem preços de ${nome} (segue só com a Steam)`)
    return {}
  }
}
const csfloat = await baixarExtra('csfloat')
const buff = await baixarExtra('buff163')
const usdExtra = (nome) => {
  const v = csfloat[nome]?.price || csfloat[nome]?.starting_at?.price || buff[nome]?.starting_at?.price || 0
  return v > 0 ? v : 0
}

const usd = (nome) => {
  const p = mercado[nome]
  const v = p && (p.last_7d || p.last_30d || p.last_24h || p.last_90d)
  return v > 0 ? v : 0
}
const brlEnfeite = (nome) => {
  const v = usd(nome) || usdExtra(nome)
  return v ? Math.round(v * cotacao * 100) / 100 : 0
}
const brl = (nome) => {
  const v = usd(nome)
  return v ? Math.round(v * cotacao * 100) / 100 : 0
}
const DESGASTES = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

// skins: "<def>:<paint>" -> [FN, MW, FT, WW, BS, stFN, stMW, stFT, stWW, stBS] (0 = não existe no mercado); faca lisa: "<def>:0" -> [preço, preço ST]
const skins = {}
let achou = 0
let total = 0
for (const a of armas) {
  const faca = a.c === 'facas'
  const luva = a.c === 'luvas'
  const pref = faca || luva ? '★ ' : ''
  for (const s of a.s) {
    total++
    const nome = `${a.n} | ${s[1]}`
    const linha = DESGASTES.map((d) => brl(`${pref}${a.n} | ${s[1]} (${d})`))
    const st = luva ? [0, 0, 0, 0, 0] : DESGASTES.map((d) => brl(`${pref}${faca ? 'StatTrak™ ' : 'StatTrak™ '}${a.n} | ${s[1]} (${d})`))
    if (linha.some(Boolean)) achou++
    else if (!linha.some(Boolean)) {
      const lisa = brl(`${pref}${a.n}`)
      if (lisa) { skins[`${a.d}:${s[0]}`] = [lisa, brl(`${pref}StatTrak™ ${a.n}`)]; achou++; continue }
    }
    if (linha.some(Boolean) || st.some(Boolean)) skins[`${a.d}:${s[0]}`] = [...linha, ...st]
    void nome
  }
}
console.log(`skins com preço: ${achou}/${total}`)

const a = {}
for (const r of adesivos) { const v = brlEnfeite(`Sticker | ${r[1]}`); if (v) a[r[0]] = v }
const c = {}
for (const r of chaveiros) { const v = brlEnfeite(`Charm | ${r[1]}`); if (v) c[r[0]] = v }
console.log(`adesivos com preço: ${Object.keys(a).length}/${adesivos.length}; chaveiros: ${Object.keys(c).length}/${chaveiros.length}`)

// Preço das caixas: o que se espera ganhar ao abrir (valor de venda médio, simulado) mais ~15% de margem da casa. { slug: NP }
const caixasIniciais = ler('worker/steam-login/src/caixas-iniciais.json')
const caixas = {}
for (const cx of caixasIniciais) {
  let soma = 0
  const N = 60000
  for (let i = 0; i < N; i++) {
    const it = sortearAbertura(cx, CONFIG_PADRAO, rndSeguro).item
    soma += (it.t === 'adesivo' ? a[it.d] : it.t === 'chaveiro' ? c[it.d] : precoDeMercado(it, skins)) || 0
  }
  const bruto = (soma / N) * 1.15
  const passo = bruto < 100 ? 5 : bruto < 1000 ? 10 : 50
  caixas[cx.slug] = Math.max(5, Math.round(bruto / passo) * passo)
  console.log(cx.nome.padEnd(22), String(cx.preco).padStart(5), '->', String(caixas[cx.slug]).padStart(5), '(valor esperado', (soma / N).toFixed(1) + ')')
}

writeFileSync(new URL('../worker/steam-login/src/precos.json', import.meta.url), JSON.stringify({ cotacao, gerado: new Date().toISOString().slice(0, 10), skins, a, c, caixas }))
