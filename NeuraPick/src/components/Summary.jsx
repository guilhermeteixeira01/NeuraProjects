import { useState } from 'react'
import { getMap, mapIcon, mapImage, serverMap } from '../data/maps.js'
import { FORMATS, SIDE_LABEL, other } from '../data/veto.js'
import { IconCopy } from './Icons.jsx'

export default function Summary({ teams, format, picks, decider }) {
  const [copied, setCopied] = useState(false)

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
  const copy = async () => {
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
    try {
      await navigator.clipboard.writeText(`css_serie ${JSON.stringify(config)}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard indisponível (ex.: http sem permissão)
    }
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
            <IconCopy /> {copied ? 'Copiado!' : 'Copiar resultado'}
          </button>
        </div>

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
      </div>
    </div>
  )
}
