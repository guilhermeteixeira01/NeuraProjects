// Sem cotação não significa valor zero: nesse caso não anuncia lucro/prejuízo.
export function calcularResumoTroca(entrega, recebe) {
  const somar = valores => valores.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    ? valores.reduce((total, valor) => total + valor, 0) : null
  const oferecido = somar(entrega)
  const recebido = somar(recebe)
  return { oferecido, recebido, diferenca: oferecido === null || recebido === null ? null : recebido - oferecido }
}
