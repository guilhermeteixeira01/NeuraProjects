// Selo do nível (modelo "Gema": pedra lapidada de 8 lados na cor da faixa do nível, com brilho do 8 em diante)
// e barra de XP. O XP mostrado = XP das partidas (ranking.json) + ajuste do admin (perfil no worker, campo "xp").
// Nível 0 = "Sem classificação" (menos de 10 partidas, como a FACEIT): gema cinza com "?".
import { usePerfis } from './Moldura.jsx'
import { NIVEL_MAX, PARTIDAS_CLASSIFICACAO, corNivel, nivelDe } from './niveis.js'
import { useT } from './i18n.js'

// XP total e nível de um jogador do ranking (com o ajuste do admin e a regra das 10 partidas)
export function useNivelDe(j) {
  const ajuste = Number(usePerfis()[j?.steamId]?.xp) || 0
  return nivelDe((Number(j?.xp) || 0) + ajuste, Number(j?.mapas) || 0)
}

// Pontos de um polígono regular (8 lados, girado para ficar com a face reta em cima)
const oito = (r) =>
  Array.from({ length: 8 }, (_, i) => {
    const a = ((-90 + 22.5 + 45 * i) * Math.PI) / 180
    return [50 + r * Math.cos(a), 52 + r * Math.sin(a)]
  })
const pts = (l) => l.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const FORA = oito(42)
const DENTRO = oito(26)
const LUZ = [0.55, 0.3, 0.18, 0.12, 0.2, 0.32, 0.5, 0.65] // facetas mais claras em cima à esquerda (luz vindo de lá)
const COR_SEM = '#5b616d'

export function SeloNivel({ nivel, tamanho = 30, classe = '' }) {
  const t = useT()
  const n = Math.min(NIVEL_MAX, Math.max(0, Math.round(Number(nivel) || 0)))
  const cor = n ? corNivel(n) : COR_SEM
  const rotulo = n ? t('Nível {n}', { n }) : t('Sem classificação')
  return (
    <span className={`selo-nivel ${classe}`} style={{ '--nv': cor, width: tamanho, height: tamanho }} title={rotulo} role="img" aria-label={rotulo}>
      <svg viewBox="-4 -4 108 108" aria-hidden="true">
        <polygon points={pts(FORA)} fill="#14161c" />
        {FORA.map((p, i) => (
          <polygon key={i} points={pts([p, FORA[(i + 1) % 8], DENTRO[(i + 1) % 8], DENTRO[i]])} fill={cor} fillOpacity={n ? LUZ[i] : LUZ[i] * 0.6} />
        ))}
        <polygon points={pts(FORA)} fill="none" stroke={cor} strokeWidth="4" strokeLinejoin="round" />
        <polygon points={pts(DENTRO)} fill="#14161c" fillOpacity=".78" stroke={cor} strokeOpacity=".6" strokeWidth="1.5" />
        <text x="50" y="52" dy=".36em" textAnchor="middle" fontSize={n >= 10 ? 27 : 32} className={n ? '' : 'sem'}>
          {n || '?'}
        </text>
        {n >= 8 && <path className="selo-brilho" d="M50 -2 L52.6 7.4 L62 10 L52.6 12.6 L50 22 L47.4 12.6 L38 10 L47.4 7.4 Z" />}
      </svg>
    </span>
  )
}

// Barra de progresso até o próximo nível. Sem classificação: 10 traços, um por partida, e quantas faltam.
// eu: é o perfil de quem está olhando ("seu nível"); de outro jogador: "para ter nível"
export function BarraXp({ info, classe = '', eu = false }) {
  const t = useT()
  const fmt = (v) => v.toLocaleString(t.local)
  if (!info.classificado) {
    return (
      <div className={`barra-xp sem-class ${classe}`}>
        <div className="barra-xp-topo">
          <b>{t('Sem classificação')}</b>
          <span>
            {eu
              ? info.faltamPartidas === 1 ? t('falta 1 partida para obter seu nível') : t('faltam {n} partidas para obter seu nível', { n: info.faltamPartidas })
              : info.faltamPartidas === 1 ? t('falta 1 partida para ter nível') : t('faltam {n} partidas para ter nível', { n: info.faltamPartidas })}
          </span>
        </div>
        <div className="barra-partidas" role="progressbar" aria-valuemin={0} aria-valuemax={PARTIDAS_CLASSIFICACAO} aria-valuenow={info.partidas}>
          {Array.from({ length: PARTIDAS_CLASSIFICACAO }, (_, i) => (
            <i key={i} className={i < info.partidas ? 'feita' : ''} />
          ))}
        </div>
      </div>
    )
  }
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
