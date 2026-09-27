import { useState } from 'react'
import { ALL_MAPS, DEFAULT_POOL, POOL_SIZE, mapIcon, mapImage } from '../data/maps.js'
import { FORMATS } from '../data/veto.js'
import { IconClock, IconPlay, IconShield, IconSwap, IconTarget } from './Icons.jsx'

const TIMERS = [
  { value: 0, label: 'OFF' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
]

const FEATURES = [
  { icon: <IconSwap />, text: 'Veto alternado Time A / Time B' },
  { icon: <IconShield />, text: 'Escolha de lado CT / TR após cada pick' },
  { icon: <IconTarget />, text: 'Decider automático no último mapa' },
  { icon: <IconClock />, text: 'Timer opcional por ação' },
]

// Sem letras/números que se confundem (O/0, I/1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const gerarCodigo = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(5)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('')

const gerarCodigos = () => {
  const A = gerarCodigo()
  let B = gerarCodigo()
  while (B === A) B = gerarCodigo()
  return { A, B }
}

export default function Setup({ onStart }) {
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [format, setFormat] = useState('bo3')
  const [first, setFirst] = useState('coin')
  const [timer, setTimer] = useState(0)
  const [pool, setPool] = useState(DEFAULT_POOL)
  const [server, setServer] = useState(() => {
    try {
      return localStorage.getItem('neurapick.server') ?? ''
    } catch {
      return ''
    }
  })

  const changeServer = (value) => {
    setServer(value)
    try {
      localStorage.setItem('neurapick.server', value)
    } catch {
      // sem armazenamento (aba anônima etc.): só não lembra na próxima vez
    }
  }

  const nameA = teamA.trim() || 'Time A'
  const nameB = teamB.trim() || 'Time B'
  const poolOk = pool.length === POOL_SIZE

  const toggleMap = (id) => {
    setPool((p) => {
      if (p.includes(id)) return p.filter((m) => m !== id)
      if (p.length >= POOL_SIZE) return p
      return [...p, id]
    })
  }

  const start = () => {
    const coinWinner = first === 'coin' ? (Math.random() < 0.5 ? 'A' : 'B') : null
    onStart({
      id: Date.now(),
      teams: { A: nameA, B: nameB },
      format,
      firstTeam: coinWinner ?? first,
      coinFlip: coinWinner !== null,
      timer,
      // IP:porta do servidor, só com o que o comando connect aceita
      server: server.trim().replace(/[^\w.:-]/g, ''),
      // Código de cada equipe para entrar no time certo no servidor (!time <código>)
      codes: gerarCodigos(),
      // mantém a ordem original dos mapas
      pool: ALL_MAPS.map((m) => m.id).filter((id) => pool.includes(id)),
    })
  }

  return (
    <>
      <section className="hero">
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />

        <div className="wrap hero-inner">
          <div className="hero-copy">
            <span className="hero-status">
              <span className="dot-live" /> MAP VETO SYSTEM · CS2
            </span>
            <h1>Pick &amp; Ban de mapas no padrão competitivo</h1>
            <p className="lead">
              Monte o confronto, defina o formato e conduza o veto exatamente como nos campeonatos de
              Counter-Strike 2 — até sobrar um único mapa.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-lg" disabled={!poolOk} onClick={start}>
                <IconPlay /> Iniciar veto
              </button>
              <a className="btn btn-ghost btn-lg" href="#pool">
                Editar map pool
              </a>
            </div>
            <div className="hero-meta">
              <span>{FORMATS[format].label}</span>
              <span className="sep">/</span>
              <span className={poolOk ? '' : 'warn'}>
                {pool.length}/{POOL_SIZE} MAPAS
              </span>
              <span className="sep">/</span>
              <span>TIMER {timer ? `${timer}S` : 'OFF'}</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hud-frame">
              <div className="config">
                <div className="config-head">
                  <span className="mono-label">// CONFIGURAÇÃO DA PARTIDA</span>
                </div>

                <div className="teams-row">
                  <label className="field team-a">
                    <span className="mono-label">TIME A</span>
                    <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="Time A" maxLength={24} />
                  </label>
                  <span className="vs">VS</span>
                  <label className="field team-b">
                    <span className="mono-label">TIME B</span>
                    <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="Time B" maxLength={24} />
                  </label>
                </div>

                <div className="config-row">
                  <span className="mono-label">FORMATO</span>
                  <div className="segmented">
                    {Object.entries(FORMATS).map(([key, f]) => (
                      <button key={key} className={format === key ? 'active' : ''} onClick={() => setFormat(key)}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <p className="hint">{FORMATS[format].description}</p>
                </div>

                <div className="config-row">
                  <span className="mono-label">INICIA O VETO</span>
                  <div className="segmented">
                    <button className={first === 'coin' ? 'active' : ''} onClick={() => setFirst('coin')}>
                      Sorteio
                    </button>
                    <button className={first === 'A' ? 'active' : ''} onClick={() => setFirst('A')}>
                      {nameA}
                    </button>
                    <button className={first === 'B' ? 'active' : ''} onClick={() => setFirst('B')}>
                      {nameB}
                    </button>
                  </div>
                </div>

                <div className="config-row">
                  <span className="mono-label">TIMER POR AÇÃO</span>
                  <div className="segmented">
                    {TIMERS.map((t) => (
                      <button key={t.value} className={timer === t.value ? 'active' : ''} onClick={() => setTimer(t.value)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <p className="hint">Se o tempo acabar, a ação é feita aleatoriamente.</p>
                </div>

                <label className="field config-row">
                  <span className="mono-label">IP DO SERVIDOR (OPCIONAL)</span>
                  <input
                    value={server}
                    onChange={(e) => changeServer(e.target.value)}
                    placeholder="123.45.67.89:27015"
                    maxLength={64}
                    inputMode="url"
                    spellCheck={false}
                  />
                  <p className="hint">Gera o botão de conectar de cada time no fim do veto.</p>
                </label>
              </div>
            </div>
            <div className="hero-tag-float">
              FORMATO <strong>{FORMATS[format].label}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="status-strip">
        <div className="wrap">
          {FEATURES.map((f) => (
            <span key={f.text} className="status-item">
              {f.icon} {f.text}
            </span>
          ))}
        </div>
      </div>

      <section className="section" id="pool">
        <div className="wrap">
          <div className="section-head-row">
            <div className="section-head">
              <h2>Map pool</h2>
              <p>Selecione exatamente {POOL_SIZE} mapas para o veto. O padrão é o Active Duty atual.</p>
            </div>
            <span className={`counter ${poolOk ? 'ok' : ''}`}>
              {pool.length}/{POOL_SIZE}
            </span>
          </div>

          <div className="pool-grid">
            {ALL_MAPS.map((m, i) => {
              const on = pool.includes(m.id)
              return (
                <button
                  key={m.id}
                  className={`pool-item ${on ? 'on' : ''}`}
                  style={{ '--c1': m.colors[0], '--c2': m.colors[1], '--img': `url(${mapImage(m.id)})` }}
                  onClick={() => toggleMap(m.id)}
                  disabled={!on && pool.length >= POOL_SIZE}
                  aria-pressed={on}
                >
                  <span className="pool-top">
                    <span className="pool-idx">{String(i + 1).padStart(2, '0')}</span>
                    <span className="pool-check">{on ? 'ATIVO' : 'FORA'}</span>
                  </span>
                  <span className="pool-main">
                    <img className="pool-icon" src={mapIcon(m.id)} alt="" />
                    <span className="pool-name">{m.name}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="pool-cta">
            <button className="btn btn-primary btn-lg" disabled={!poolOk} onClick={start}>
              <IconPlay /> Iniciar veto
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
