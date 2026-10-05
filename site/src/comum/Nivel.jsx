// Selo do nível (estilo FACEIT: anel que enche conforme o nível, na cor do nível, com o número no meio)
// e barra de XP. O XP mostrado = XP das partidas (ranking.json) + ajuste do admin (perfil no worker, campo "xp").
import { usePerfis } from './Moldura.jsx'
import { NIVEL_MAX, corNivel, nivelDe } from './niveis.js'
import { useT } from './i18n.js'

// XP total e nível de um jogador do ranking (com o ajuste do admin)
export function useNivelDe(j) {
  const ajuste = Number(usePerfis()[j?.steamId]?.xp) || 0
  return nivelDe((Number(j?.xp) || 0) + ajuste)
}

// O anel começa embaixo à esquerda e vai até embaixo à direita (270°), como o medidor da FACEIT
const RAIO = 15
const ARCO = 2 * Math.PI * RAIO * 0.75

export function SeloNivel({ nivel, tamanho = 30, classe = '' }) {
  const t = useT()
  const n = Math.min(NIVEL_MAX, Math.max(1, Number(nivel) || 1))
  const cor = corNivel(n)
  return (
    <span className={`selo-nivel ${classe}`} style={{ '--nv': cor, width: tamanho, height: tamanho }} title={t('Nível {n}', { n })} role="img" aria-label={t('Nível {n}', { n })}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="17" className="selo-fundo" />
        <circle cx="18" cy="18" r={RAIO} className="selo-trilho" strokeDasharray={`${ARCO} 999`} transform="rotate(135 18 18)" />
        <circle cx="18" cy="18" r={RAIO} className="selo-arco" strokeDasharray={`${(ARCO * n) / NIVEL_MAX} 999`} transform="rotate(135 18 18)" />
        <text x="18" y="18" dy=".36em" textAnchor="middle" fontSize={n >= 10 ? 12.5 : 15}>
          {n}
        </text>
      </svg>
    </span>
  )
}

// Barra de progresso até o próximo nível
export function BarraXp({ info, classe = '' }) {
  const t = useT()
  const fmt = (v) => v.toLocaleString(t.local)
  return (
    <div className={`barra-xp ${classe}`} style={{ '--nv': corNivel(info.nivel), '--p': `${Math.round(info.progresso * 100)}%` }}>
      <div className="barra-xp-topo">
        <b>{fmt(info.xp)} XP</b>
        <span>{info.proximo === null ? t('NÍVEL MÁXIMO') : t('faltam {xp} para o nível {n}', { xp: fmt(info.falta), n: info.nivel + 1 })}</span>
      </div>
      <div className="barra-xp-trilho" role="progressbar" aria-valuemin={info.base} aria-valuemax={info.proximo ?? info.xp} aria-valuenow={info.xp}>
        <i />
      </div>
    </div>
  )
}
