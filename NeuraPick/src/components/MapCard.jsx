import { useState } from 'react'
import { SIDE_LABEL } from '../data/veto.js'
import { mapIcon, mapImage } from '../data/maps.js'

const ACTION_LABEL = { ban: 'BANIR', pick: 'ESCOLHER' }

export default function MapCard({ index, map, info, teamNames, clickable, action, onClick, isDecider }) {
  const [imgOk, setImgOk] = useState(true)
  const state = isDecider ? 'decider' : info.state

  let status = { cls: 'available', label: 'DISPONÍVEL', by: null }
  if (state === 'banned') status = { cls: 'ban', label: 'BANIDO', by: teamNames[info.team] }
  if (state === 'picked') status = { cls: 'pick', label: `PICK · MAPA ${info.order}`, by: teamNames[info.team] }
  if (state === 'decider') status = { cls: 'decider', label: 'DECIDER', by: null }

  return (
    <button
      className={`map-card ${state} ${clickable ? `clickable act-${action}` : ''}`}
      style={{ '--c1': map.colors[0], '--c2': map.colors[1] }}
      disabled={!clickable}
      onClick={onClick}
    >
      <div className="map-art">
        {imgOk && <img className="map-img" src={mapImage(map.id)} alt="" onError={() => setImgOk(false)} />}
        <div className="map-shade" />
        <span className="map-idx">{String(index).padStart(2, '0')}</span>
        <div className="map-title">
          <img className="map-icon" src={mapIcon(map.id)} alt="" onError={(e) => (e.currentTarget.hidden = true)} />
          <span className="map-name">{map.name}</span>
        </div>
        {clickable && <span className="map-action">{ACTION_LABEL[action]}</span>}
      </div>

      <div className={`map-status ${status.cls}`}>
        <span className="map-status-label">{status.label}</span>
        {status.by && <span className={`map-status-by t-${info.team}`}>{status.by}</span>}
        {info.side && (
          <span className="map-status-side">
            {teamNames[info.side.team]} · <b className={info.side.side}>{SIDE_LABEL[info.side.side]}</b>
          </span>
        )}
        {state === 'decider' && <span className="map-status-side">Knife round</span>}
      </div>
    </button>
  )
}
