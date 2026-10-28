import IconeUI from './IconeUI.jsx'
// Contagem regressiva da série cancelada (5 minutos e ela sai do site; regra em series.js)
import { useEffect, useState } from 'react'
import { useT } from './i18n.js'

// Relógio da página: null no HTML gerado (para o React assumir sem diferença) e, no navegador, a hora atual
// atualizando a cada segundo enquanto "ativo" (só quando tem série cancelada contando)
export function useRelogio(ativo) {
  const [agora, setAgora] = useState(null)
  useEffect(() => {
    setAgora(Date.now())
    if (!ativo) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ativo])
  return agora
}

// "REMOVIDA EM 4:59" -> "REMOVENDO…" no fim
export function ContagemRemocao({ fim, agora, classe = '' }) {
  const t = useT()
  if (!fim || agora === null) return null
  const resta = Math.max(0, Math.ceil((fim - agora) / 1000))
  const texto = resta > 0 ? t('REMOVIDA EM {tempo}', { tempo: `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}` }) : t('REMOVENDO…')
  return (
    <span className={`contagem-remocao ${classe}`} title={t('Série cancelada: some do site (partidas, ranking e demos) ao fim da contagem')}>
      <IconeUI tipo="relogio" tamanho={11}/>
      {texto}
    </span>
  )
}
