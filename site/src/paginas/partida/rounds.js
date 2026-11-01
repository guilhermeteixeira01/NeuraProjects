// O lado pertence ao vencedor do round, não à linha A/B da tabela.
export function ladoDoRound(round, time) {
  const valor = String(round.lado || '').toUpperCase()
  const vencedor = valor === 'CT' ? 'CT' : ['TR', 'T'].includes(valor) ? 'TR' : null
  if (!vencedor) return null
  return round.time === time ? vencedor : vencedor === 'CT' ? 'TR' : 'CT'
}
export function trocaDeLado(indice, maxRounds = 24, roundsProrrogacao = 6) {
  if (indice === maxRounds / 2 || indice === maxRounds) return true
  const metadeOt = Math.max(1, Math.floor(roundsProrrogacao / 2))
  return indice > maxRounds && (indice - maxRounds) % metadeOt === 0
}
