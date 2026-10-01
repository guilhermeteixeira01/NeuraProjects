import { useState } from 'react'
import { getMap, mapIcon, mapImage, serverMap } from '../data/maps.js'
import { FORMATS, SIDE_LABEL, other } from '../data/veto.js'
import { IconCopy } from './Icons.jsx'
import TeamLogo from './TeamLogo.jsx'

// Tamanho máximo seguro de uma linha colada no console do CS2
const LIMITE_CONSOLE = 500

export default function Summary({ teams, logos, format, picks, decider }) {
  // Qual botão de copiar mostra "Copiado!" agora
  const [copied, setCopied] = useState(null)

  const copyText = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
    } catch {
      // clipboard indisponível (ex.: http sem permissão)
    }
  }

  const games = [
    ...picks.map((p) => ({
      map: getMap(p.map),
      pickedBy: p.pickedBy,
      sideText: `${teams[p.sideBy]} começa de ${SIDE_LABEL[p.side]}`,
      side: p.side,
    })),
    { map: getMap(decider), pickedBy: null, sideText: 'Lado no knife round' },
  ]

  // Comando para colar no console do servidor (plugin BaseComp): configura a série inteira.
  // Picks já têm lado definido (sem faca); o decider é decidido no round faca.
  // ";" e aspas saem do nome do time porque quebrariam o comando no console.
  // Acentos viram \uXXXX: o console do CS2 descarta caracteres fora do ASCII ("café" chegava "caf"),
  // e o plugin decodifica de volta ao ler o JSON.
  const clean = (name) => name.replace(/[;"\\]/g, '').trim()
  const config = {
    formato: FORMATS[format].label,
    timeA: clean(teams.A),
    timeB: clean(teams.B),
    mapas: [
      ...picks.map((p) => ({
        mapa: serverMap(p.map),
        faca: false,
        ct: p.side === 'ct' ? p.sideBy : other(p.sideBy),
      })),
      { mapa: serverMap(decider), faca: true },
    ],
  }
  const json = JSON.stringify(config).replace(
    /[^\x00-\x7f]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
  const serie = `css_serie ${json}`

  // Logos vão num comando à parte (css_serie_logo): o console do CS2 corta linhas muito grandes.
  // Cabendo, vão na mesma linha separados por ";"; senão, ficam no botão "Copiar logos".
  const comandosLogo = ['A', 'B'].filter((t) => logos?.[t]).map((t) => `css_serie_logo ${t} ${logos[t]}`)
  const tudo = [serie, ...comandosLogo].join('; ')
  const logosSeparados = comandosLogo.length > 0 && tudo.length > LIMITE_CONSOLE
  const copy = () => copyText('serie', logosSeparados ? serie : tudo)
  const copyLogos = () => copyText('logos', comandosLogo.join('; '))

  // Lado de cada time no primeiro mapa (no decider, quem decide é o round faca)
  const first = picks[0]
  const firstSide = (team) => {
    if (!first) return 'Lado decidido no round faca'
    const ctTeam = first.side === 'ct' ? first.sideBy : other(first.sideBy)
    return `Começa de ${team === ctTeam ? 'CT' : 'TR'} em ${getMap(first.map).name}`
  }

  return (
    <div className="summary hud-frame">
      <div className="summary-inner">
        <div className="summary-head">
          <div>
            <span className="hero-status">
              <span className="dot-live" /> VETO CONCLUÍDO
            </span>
            <h2>{games.length === 1 ? 'Mapa da partida' : 'Mapas da série'}</h2>
          </div>
          <button
            className="btn btn-primary"
            onClick={copy}
            title="Copia o comando css_serie para colar no console do servidor"
          >
            <IconCopy /> {copied === 'serie' ? 'Copiado!' : 'Copiar resultado'}
          </button>
        </div>
        {logosSeparados && (
          <div className="logos-aviso">
            <span>Os links dos logos são grandes: cole o resultado no console e depois os logos.</span>
            <button className="btn btn-ghost btn-sm" onClick={copyLogos} title="Copia os comandos css_serie_logo">
              <IconCopy /> {copied === 'logos' ? 'Copiado!' : 'Copiar logos'}
            </button>
          </div>
        )}

        <div className="summary-list">
          {games.map((g, i) => (
            <div
              key={g.map.id}
              className="summary-item"
              style={{ '--c1': g.map.colors[0], '--c2': g.map.colors[1], '--img': `url(${mapImage(g.map.id)})` }}
            >
              <span className="summary-num">MAPA {String(i + 1).padStart(2, '0')}</span>
              <span className="summary-map">
                <img className="summary-icon" src={mapIcon(g.map.id)} alt="" />
                {g.map.name}
              </span>
              <span className="summary-meta">
                {g.pickedBy ? (
                  <>
                    Pick de <b className={`t-${g.pickedBy}`}>{teams[g.pickedBy]}</b>
                  </>
                ) : (
                  <b className="decider">Decider</b>
                )}
              </span>
              <span className={`summary-side ${g.side ?? 'knife'}`}>{g.sideText}</span>
            </div>
          ))}
        </div>

        {/* Como cada time entra no servidor e cai no lado certo (plugin BaseComp: !time A / !time B) */}
        <div className="join">
          <span className="mono-label">// COMO ENTRAR NO SERVIDOR</span>
          <div className="join-grid">
            {['A', 'B'].map((t) => (
              <div key={t} className={`join-card team-${t}`}>
                <div className="join-card-head join-card-head-logo">
                  <TeamLogo url={logos?.[t]} name={teams[t]} team={t} size={38} />
                  <span className="join-card-txt">
                    <b className={`join-team t-${t}`}>{teams[t]}</b>
                    <span className="join-side">{firstSide(t)}</span>
                  </span>
                </div>
                <ol className="join-steps">
                  <li>
                    Entre no servidor: você fica como <b>espectador</b>
                  </li>
                  <li>
                    No chat, digite{' '}
                    <button className="join-code" onClick={() => copyText(`time-${t}`, `!time ${t}`)} title="Copiar">
                      !time {t}
                    </button>
                    {copied === `time-${t}` && <span className="join-copied">copiado</span>}
                    <span className="join-note">o servidor te coloca no lado certo — nos próximos mapas é automático</span>
                  </li>
                </ol>
              </div>
            ))}
          </div>
          <p className="hint">
            O admin precisa carregar a série no servidor antes (botão <b>Copiar resultado</b> → colar no console).
          </p>
        </div>
      </div>
    </div>
  )
}
