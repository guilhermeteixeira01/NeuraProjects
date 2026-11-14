// Preço de mercado confiável: uma única listagem absurda (ex.: US$ 100.000 numa skin de US$ 20) não pode virar o preço da skin.
// Fontes em US$: cs = CSFloat, bf = menor oferta no Buff, bo = maior pedido de compra no Buff, sm = Steam (cerca de 1,7x mais cara).

const STEAM_PARA_TERCEIROS = 1.7

const mediana = (valores) => {
  const v = [...valores].sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)]
}

export function referencia({ cs = 0, bf = 0, bo = 0, sm = 0 }) {
  const refs = [cs, bf, sm / STEAM_PARA_TERCEIROS].filter((v) => v > 0)
  if (refs.length < 3 && (bf > 0 || sm > 0) && bo > 0) refs.push(bo)
  return refs.length >= 2 ? mediana(refs) : 0
}

// O preço principal continua sendo o do CSFloat (sem ele, Buff; sem os dois, Steam), salvo se estiver a mais de 4x da referência
export function usdConfiavel(fontes) {
  const principal = fontes.cs || fontes.bf || fontes.sm || 0
  const ref = referencia(fontes)
  const foraDoMercado = ref > 0 && (principal > ref * 4 || principal < ref / 4)
  return { usd: foraDoMercado ? ref : principal, ref }
}

// Desgaste pior custando mais que o dobro de um melhor, sem as outras fontes confirmarem, também é listagem isolada. itens em ordem FN..BS
export function corrigirCurva(itens) {
  let teto = 0
  return itens.map(({ usd, ref }) => {
    const corrigido = teto > 0 && usd > teto * 2 && ref > 0 && usd > ref * 2.5 ? ref : usd
    teto = Math.max(teto, corrigido)
    return corrigido
  })
}
