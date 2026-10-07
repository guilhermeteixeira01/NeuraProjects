import { useEffect, useState } from 'react'
import { desempenhoAtivo } from './desempenho.js'
import { useT } from './i18n.js'
import { usePremierAtual } from './premierAtual.js'

// ── CS Rating do Premier (Leetify): o atual do worker (atualizado de hora em hora) ou, sem ele, o do deploy.
// null = jogador sem conta na Leetify ──
const faixaPremier = (v) => (v >= 30000 ? 7 : v >= 25000 ? 6 : v >= 20000 ? 5 : v >= 15000 ? 4 : v >= 10000 ? 3 : v >= 5000 ? 2 : 1)
// Igual ao jogo: milhares grandes e o resto pequeno (23,524)
const partesPremier = (v) => (v < 1000 ? [String(v), ''] : [String(Math.floor(v / 1000)), ',' + String(v % 1000).padStart(3, '0')])
// Atraso do brilho de cada badge: fixo por jogador (igual no HTML gerado e no navegador)
const atrasoBrilho = (id) => ((Number(String(id).slice(-4)) || 0) % 200) / 100

// Contagem animada de 0 até o rating (a cor da faixa acompanha enquanto sobe)
export default function Premier({ j }) {
  const t = useT()
  const atual = usePremierAtual(j.steamId)
  const alvo = atual > 0 ? atual : j.premier > 0 ? j.premier : 0
  const [v, setV] = useState(alvo)

  useEffect(() => {
    if (!alvo || desempenhoAtivo() || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const inicio = performance.now() + 350
    const duracao = 1400
    let quadro
    const passo = (agora) => {
      const t = Math.min(1, Math.max(0, (agora - inicio) / duracao))
      setV(Math.round(alvo * (1 - Math.pow(1 - t, 3)))) // desacelera no fim
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    setV(0)
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo])

  if (!alvo) {
    return (
      <span className="premier sem" title={t('Sem CS Rating do Premier (precisa de conta na leetify.gg)')}>
        <b>---</b>
      </span>
    )
  }
  const [mil, resto] = partesPremier(v)
  return (
    <span
      className={`premier t${faixaPremier(v)}`}
      style={{ '--pd': `${atrasoBrilho(j.steamId).toFixed(2)}s` }}
      title={t('CS Rating do Premier: {v}', { v: alvo.toLocaleString(t.local) })}
    >
      <b>{mil}</b>
      <small>{resto}</small>
    </span>
  )
}

