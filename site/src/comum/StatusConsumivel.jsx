// Só aparece quando há recibo do item aplicado neste mapa, inclusive Boost sem bônus na derrota.
export default function StatusConsumivel({ tipo, base, delta, compacto = false }) {
  if (tipo !== 'boost' && tipo !== 'freeze') return null
  const xpBase = Number(base) || 0
  const ajuste = Number(delta) || 0
  const nome = tipo === 'boost' ? 'Boost' : 'Freeze'
  const mudanca = `${xpBase} → ${xpBase + ajuste} XP`
  const descricao = `${nome} · ${mudanca}`
  return (
    <span className={`partida-consumivel partida-consumivel-${tipo}`} title={descricao} aria-label={descricao}>
      <span aria-hidden="true">{tipo === 'boost' ? '🚀' : '❄️'}</span>
      <span>{nome}{!compacto && ` · ${mudanca}`}</span>
    </span>
  )
}
