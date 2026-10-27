const CHAVE = 'np-indicacao'
const PRAZO = 30 * 86400_000
export function capturarIndicacao() {
  try {
    const ref = new URLSearchParams(location.search).get('ref')
    const atual = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (/^\d{17}$/.test(ref || '') && !(atual?.ate > Date.now())) localStorage.setItem(CHAVE, JSON.stringify({ ref, ate: Date.now() + PRAZO }))
  } catch { /* O link atual ainda funciona sem armazenamento. */ }
}
export function indicacaoAtual() {
  capturarIndicacao()
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (/^\d{17}$/.test(d?.ref || '') && d.ate > Date.now()) return d.ref
  } catch { /* Armazenamento desativado. */ }
  const ref = new URLSearchParams(location.search).get('ref')
  return /^\d{17}$/.test(ref || '') ? ref : ''
}
