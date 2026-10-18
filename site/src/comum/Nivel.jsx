// Selo do nível (modelo "Gema": pedra lapidada de 8 lados na cor da faixa do nível, com brilho do 8 em diante)
// e barra de XP. O XP mostrado = XP das partidas (ranking.json) + ajuste do admin (perfil no worker, campo "xp").
// Nível 0 = "Sem classificação" (menos de 10 partidas, como a FACEIT): gema cinza com "?".
import { usePerfis } from './Moldura.jsx'
import { NIVEL_ELITE, NIVEL_MAX, PARTIDAS_CLASSIFICACAO, corNivel, nivelDe } from './niveis.js'
import { useT } from './i18n.js'

// XP total e nível de um jogador do ranking (com o ajuste do admin e a regra das 10 partidas)
export function useNivelDe(j) {
  const ajuste = Number(usePerfis()[j?.steamId]?.xp) || 0
  return nivelDe((Number(j?.xp) || 0) + ajuste, Number(j?.mapas) || 0)
}

// Gema de 10 facetas (uma por nível): a faceta N acende com o nível, na cor dele, e as outras ficam apagadas.
// A luz vem de cima à esquerda; entre uma faceta e outra há um cortezinho. Do nível 8 em diante tem a estrela de brilho.
// Nível 11 = Elite ("10+"): gema colorida e animada (SeloElite).
const rad = (g) => (g * Math.PI) / 180
const poligono = (r) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = rad(-90 + 36 * i)
    return [50 + r * Math.cos(a), 52 + r * Math.sin(a)]
  })
const pts = (l) => l.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const FORA = poligono(42)
const DENTRO = poligono(26)
// opacidade de cada faceta acesa (mais clara em cima à esquerda)
const LUZ = Array.from({ length: 10 }, (_, i) => 0.28 + 0.48 * ((Math.cos(rad(-90 + i * 36 + 18 + 135)) + 1) / 2))
const COR_SEM = '#5b616d'
const BRILHO = 'M50 -2 L52.6 7.4 L62 10 L52.6 12.6 L50 22 L47.4 12.6 L38 10 L47.4 7.4 Z'
const FAISCAS = [
  ['M8 20 L9.6 25 L14.6 26.6 L9.6 28.2 L8 33.2 L6.4 28.2 L1.4 26.6 L6.4 25 Z', 0],
  ['M96 48 L97.4 52.4 L101.8 53.8 L97.4 55.2 L96 59.6 L94.6 55.2 L90.2 53.8 L94.6 52.4 Z', 0.9],
  ['M86 90 L87.5 94.5 L92 96 L87.5 97.5 L86 102 L84.5 97.5 L80 96 L84.5 94.5 Z', 1.7],
]

function SeloElite({ tamanho, classe }) {
  const t = useT()
  const rotulo = t('Elite')
  return (
    <span className={`selo-nivel selo-elite ${classe}`} style={{ width: tamanho, height: tamanho }} title={rotulo} role="img" aria-label={rotulo}>
      <svg viewBox="-4 -4 108 108" aria-hidden="true">
        <defs>
          <clipPath id="np-elite-corte">
            <polygon points={pts(FORA)} />
          </clipPath>
          <linearGradient id="np-elite-borda" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff3d81" />
            <stop offset=".25" stopColor="#ffb300" />
            <stop offset=".5" stopColor="#3dff8a" />
            <stop offset=".75" stopColor="#1ec8ff" />
            <stop offset="1" stopColor="#b04dff" />
          </linearGradient>
          <linearGradient id="np-elite-luz" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* cores girando (matiz) */}
        <g className="elite-cor">
          <polygon points={pts(FORA)} fill="#14161c" />
          {FORA.map((p, i) => (
            <polygon key={i} points={pts([p, FORA[(i + 1) % 10], DENTRO[(i + 1) % 10], DENTRO[i]])} fill={`hsl(${i * 36 + 330} 95% 58%)`} fillOpacity={LUZ[i] + 0.22} />
          ))}
          <polygon points={pts(FORA)} fill="none" stroke="url(#np-elite-borda)" strokeWidth="4" strokeLinejoin="round" />
        </g>
        {FORA.map((p, i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={DENTRO[i][0]} y2={DENTRO[i][1]} stroke="#14161c" strokeWidth="1.3" strokeLinecap="round" />
        ))}
        <polygon points={pts(DENTRO)} fill="#14161c" fillOpacity=".8" stroke="url(#np-elite-borda)" strokeOpacity=".8" strokeWidth="1.5" />
        {/* brilho que passa pela gema */}
        <g clipPath="url(#np-elite-corte)">
          <g className="elite-brilho">
            <rect x="-40" y="-10" width="24" height="120" fill="url(#np-elite-luz)" transform="skewX(-20)" />
          </g>
        </g>
        {/* logo do site no meio da gema Elite */}
        <image href="/assets/logos/logo-np-64.png" x="31" y="33" width="38" height="38" preserveAspectRatio="xMidYMid meet" />
        <path className="selo-brilho" d={BRILHO} />
        {FAISCAS.map(([d, atraso], i) => (
          <path key={i} className="elite-faisca" d={d} style={{ animationDelay: `${atraso}s` }} />
        ))}
      </svg>
    </span>
  )
}

export function SeloNivel({ nivel, tamanho = 30, classe = '' }) {
  const t = useT()
  const n = Math.min(NIVEL_MAX, Math.max(0, Math.round(Number(nivel) || 0)))
  if (n >= NIVEL_ELITE) return <SeloElite tamanho={tamanho} classe={classe} />
  const cor = n ? corNivel(n) : COR_SEM
  const rotulo = n ? t('Nível {n}', { n }) : t('Sem classificação')
  return (
    <span className={`selo-nivel ${classe}`} style={{ '--nv': cor, width: tamanho, height: tamanho }} title={rotulo} role="img" aria-label={rotulo}>
      <svg viewBox="-4 -4 108 108" aria-hidden="true">
        <polygon points={pts(FORA)} fill="#14161c" />
        {FORA.map((p, i) => {
          const acesa = !n || i < n
          return (
            <polygon
              key={i}
              points={pts([p, FORA[(i + 1) % 10], DENTRO[(i + 1) % 10], DENTRO[i]])}
              fill={n ? (acesa ? cor : '#ffffff') : COR_SEM}
              fillOpacity={n ? (acesa ? LUZ[i] : 0.045) : LUZ[i] * 0.5}
            />
          )
        })}
        {FORA.map((p, i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={DENTRO[i][0]} y2={DENTRO[i][1]} stroke="#14161c" strokeWidth="1.3" strokeLinecap="round" />
        ))}
        <polygon points={pts(FORA)} fill="none" stroke={cor} strokeWidth="4" strokeLinejoin="round" />
        <polygon points={pts(DENTRO)} fill="#14161c" fillOpacity=".78" stroke={cor} strokeOpacity=".6" strokeWidth="1.5" />
        <text x="50" y="52" dy=".36em" textAnchor="middle" fontSize={n >= 10 ? 27 : 32} className={n ? '' : 'sem'}>
          {n || '?'}
        </text>
        {n >= 8 && <path className="selo-brilho" d={BRILHO} />}
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
        <span>{info.proximo === null ? t('NÍVEL MÁXIMO') : info.nivel + 1 >= NIVEL_ELITE ? t('faltam {xp} para o Elite', { xp: fmt(info.falta) }) : t('faltam {xp} para o nível {n}', { xp: fmt(info.falta), n: info.nivel + 1 })}</span>
      </div>
      <div className="barra-xp-trilho" role="progressbar" aria-valuemin={info.base} aria-valuemax={info.proximo ?? info.xp} aria-valuenow={info.xp}>
        <i />
      </div>
    </div>
  )
}
