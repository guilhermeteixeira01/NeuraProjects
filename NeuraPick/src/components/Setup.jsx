import { useEffect, useState } from 'react'
import { ALL_MAPS, DEFAULT_POOL, POOL_SIZE, POOL_UPDATED, mapIcon, mapImage } from '../data/maps.js'
import { FORMATS } from '../data/veto.js'
import { IconClock, IconPlay, IconShield, IconSwap, IconTarget } from './Icons.jsx'
import TeamLogo, { MAX_LOGO_URL, logoValido } from './TeamLogo.jsx'
import TeamCombo from './TeamCombo.jsx'
import { acharTime, useTimes } from '../data/times.js'

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

export default function Setup({ onStart }) {
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  // Logo de cada time por URL (opcional): aparece no veto e na página de estatísticas do servidor
  const [logoA, setLogoA] = useState('')
  const [logoB, setLogoB] = useState('')
  const [format, setFormat] = useState('bo3')
  const [first, setFirst] = useState('coin')
  const [timer, setTimer] = useState(0)
  const [pool, setPool] = useState(DEFAULT_POOL)

  // Lista de times do site (/times/): escolhendo um nome cadastrado, o logo entra sozinho
  const times = useTimes()
  const [logoAuto, setLogoAuto] = useState({ A: '', B: '' })
  // A lista chega depois de digitar o nome: completa o logo que ainda estiver vazio
  useEffect(() => {
    if (!times.length) return
    ;[
      ['A', teamA, logoA, setLogoA],
      ['B', teamB, logoB, setLogoB],
    ].forEach(([t, nome, logo, setLogo]) => {
      const achado = acharTime(times, nome)
      if (!logo.trim() && achado?.logo && logoValido(achado.logo)) {
        setLogo(achado.logo)
        setLogoAuto((a) => ({ ...a, [t]: achado.logo }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times])

  const trocarNome = (t, valor, setNome, logo, setLogo) => {
    setNome(valor)
    const achado = acharTime(times, valor)
    // Só mexe no logo se ele estiver vazio ou se foi a lista que preencheu (não apaga logo digitado na mão)
    const podeTrocar = !logo.trim() || logo === logoAuto[t]
    if (!podeTrocar) return
    const novo = achado?.logo && logoValido(achado.logo) ? achado.logo : ''
    setLogo(novo)
    setLogoAuto((a) => ({ ...a, [t]: novo }))
  }

  const nameA = teamA.trim() || 'Time A'
  const nameB = teamB.trim() || 'Time B'
  const poolOk = pool.length === POOL_SIZE
  const isPremierPool = pool.length === DEFAULT_POOL.length && DEFAULT_POOL.every((id) => pool.includes(id))
  const premierDate = new Date(`${POOL_UPDATED}T12:00:00`).toLocaleDateString('pt-BR')

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
      logos: { A: logoValido(logoA) ? logoA.trim() : '', B: logoValido(logoB) ? logoB.trim() : '' },
      format,
      firstTeam: coinWinner ?? first,
      coinFlip: coinWinner !== null,
      timer,
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
                  {[
                    ['A', teamA, setTeamA, logoA, setLogoA],
                    ['B', teamB, setTeamB, logoB, setLogoB],
                  ].map(([t, nome, setNome, logo, setLogo], i) => (
                    <div key={t} className="team-field-wrap">
                      {i === 1 && <span className="vs">VS</span>}
                      <div className={`field team-${t.toLowerCase()}`}>
                        <label className="field-inner">
                          <span className="field-label">
                            <span className="mono-label">TIME {t}</span>
                            {acharTime(times, nome) && (
                              <span className="da-lista" title="Time cadastrado na lista: o logo veio de lá">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                                DA LISTA
                              </span>
                            )}
                          </span>
                          <TeamCombo
                            value={nome}
                            onChange={(valor) => trocarNome(t, valor, setNome, logo, setLogo)}
                            times={times}
                            team={t}
                            placeholder={`Time ${t}`}
                          />
                        </label>
                        <label className="logo-field">
                          <TeamLogo url={logo} name={nome || `Time ${t}`} team={t} size={34} />
                          <input
                            type="url"
                            inputMode="url"
                            value={logo}
                            onChange={(e) => setLogo(e.target.value)}
                            placeholder="Logo (URL, opcional)"
                            maxLength={MAX_LOGO_URL}
                            className={logo.trim() && !logoValido(logo) ? 'invalid' : ''}
                            aria-label={`URL do logo do time ${t}`}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="hint lista-hint">
                  {times.length > 0
                    ? `${times.length} times na lista: digite o nome e escolha para o logo entrar sozinho. `
                    : 'Cadastre os times uma vez e o logo entra sozinho no veto. '}
                  <a href="/times/">Gerenciar lista de times</a>
                </p>
                {(logoA.trim() && !logoValido(logoA)) || (logoB.trim() && !logoValido(logoB)) ? (
                  <p className="hint warn-hint">O logo precisa ser um link https:// de imagem (até {MAX_LOGO_URL} caracteres).</p>
                ) : null}

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
              <p>
                Selecione exatamente {POOL_SIZE} mapas para o veto. O padrão é o pool atual do Premier
                (atualizado em {premierDate}).
              </p>
            </div>
            <div className="pool-head-actions">
              {!isPremierPool && (
                <button className="btn btn-ghost btn-sm" onClick={() => setPool(DEFAULT_POOL)}>
                  Usar pool do Premier
                </button>
              )}
              <span className={`counter ${poolOk ? 'ok' : ''}`}>
                {pool.length}/{POOL_SIZE}
              </span>
            </div>
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
                    {DEFAULT_POOL.includes(m.id) && <span className="pool-premier">PREMIER</span>}
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
