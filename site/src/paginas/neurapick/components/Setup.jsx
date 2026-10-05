import { useEffect, useState } from 'react'
import { ALL_MAPS, DEFAULT_POOL, POOL_SIZE, POOL_UPDATED, mapIcon, mapImage } from '../data/maps.js'
import { FORMATS } from '../data/veto.js'
import { FundoHero, Palavras } from '../../../comum/HeroFundo.jsx'
import { useInclinar } from '../../../comum/efeitos.jsx'
import { IconClock, IconPlay, IconShield, IconSwap, IconTarget } from './Icons.jsx'
import TeamLogo, { MAX_LOGO_URL, logoValido } from './TeamLogo.jsx'
import TeamCombo from './TeamCombo.jsx'
import { acharTime, useTimes } from '../data/times.js'
import { useT } from '../../../comum/i18n.js'

const TIMERS = [
  { value: 0, label: 'OFF' },
  { value: 10, label: '10s' },
  { value: 20, label: '20s' },
]

const FEATURES = [
  { icon: <IconSwap />, text: 'Veto alternado Time A / Time B' },
  { icon: <IconShield />, text: 'Escolha de lado CT / TR após cada pick' },
  { icon: <IconTarget />, text: 'Decider automático no último mapa' },
  { icon: <IconClock />, text: 'Timer opcional por ação' },
]

export default function Setup({ onStart }) {
  const tr = useT()
  const configRef = useInclinar(3) // formulário inclina de leve com o mouse
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  // Logo de cada time por URL (opcional): aparece no veto e na página de estatísticas do servidor
  const [logoA, setLogoA] = useState('')
  const [logoB, setLogoB] = useState('')
  const [format, setFormat] = useState('bo3')
  const [first, setFirst] = useState('coin')
  const [timer, setTimer] = useState(0)
  const [pool, setPool] = useState(DEFAULT_POOL)

  // Lista de times do site (/times/): escolhendo um nome cadastrado, o logo entra sozinho e o campo de URL some
  // (time da lista com logo usa sempre o logo da lista). Time fora da lista: URL digitada na mão, opcional.
  const times = useTimes()
  const [logoAuto, setLogoAuto] = useState({ A: '', B: '' })
  const logoDaLista = (nome) => {
    const achado = acharTime(times, nome)
    return achado?.logo && logoValido(achado.logo) ? achado.logo : ''
  }
  // A lista chega depois de digitar o nome: põe o logo dos times que estão nela
  useEffect(() => {
    if (!times.length) return
    ;[
      ['A', teamA, setLogoA],
      ['B', teamB, setLogoB],
    ].forEach(([t, nome, setLogo]) => {
      const daLista = logoDaLista(nome)
      if (daLista) {
        setLogo(daLista)
        setLogoAuto((a) => ({ ...a, [t]: daLista }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times])

  const trocarNome = (t, valor, setNome, logo, setLogo) => {
    setNome(valor)
    const daLista = logoDaLista(valor)
    // Saiu de um time da lista: limpa o logo que a lista tinha posto (não apaga logo digitado na mão)
    if (!daLista && logo.trim() && logo !== logoAuto[t]) return
    setLogo(daLista)
    setLogoAuto((a) => ({ ...a, [t]: daLista }))
  }

  const nameA = teamA.trim() || tr('Time {t}', { t: 'A' })
  const nameB = teamB.trim() || tr('Time {t}', { t: 'B' })
  const poolOk = pool.length === POOL_SIZE
  // O mesmo time não pode jogar contra ele mesmo
  const mesmoTime = teamA.trim() !== '' && teamA.trim().toLowerCase() === teamB.trim().toLowerCase()
  const podeIniciar = poolOk && !mesmoTime
  const isPremierPool = pool.length === DEFAULT_POOL.length && DEFAULT_POOL.every((id) => pool.includes(id))
  const premierDate = new Date(`${POOL_UPDATED}T12:00:00`).toLocaleDateString(tr.local)

  const toggleMap = (id) => {
    setPool((p) => {
      if (p.includes(id)) return p.filter((m) => m !== id)
      if (p.length >= POOL_SIZE) return p
      return [...p, id]
    })
  }

  const start = () => {
    if (!podeIniciar) return
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
        <FundoHero quantidade={16} />

        <div className="wrap hero-inner">
          <div className="hero-copy">
            <span className="hero-status fx-entra" style={{ '--e': 0 }}>
              <span className="dot-live" /> MAP VETO SYSTEM · CS2
            </span>
            <h1>
              <Palavras texto={tr('Pick & Ban de mapas no')} />
              <span className="fx-gradiente">
                <Palavras texto={tr('padrão competitivo')} inicio={5} />
              </span>
            </h1>
            <p className="lead fx-entra" style={{ '--e': 3 }}>
              {tr('Monte o confronto, defina o formato e conduza o veto exatamente como nos campeonatos de Counter-Strike 2 — até sobrar um único mapa.')}
            </p>
            <div className="hero-actions fx-entra" style={{ '--e': 4 }}>
              <button className="btn btn-primary btn-lg" disabled={!podeIniciar} onClick={start}>
                <IconPlay /> {tr('Iniciar veto')}
              </button>
              <a className="btn btn-ghost btn-lg" href="#pool">
                {tr('Editar map pool')}
              </a>
            </div>
            <div className="hero-meta">
              <span>{tr(FORMATS[format].label)}</span>
              <span className="sep">/</span>
              <span className={poolOk ? '' : 'warn'}>
                {pool.length}/{POOL_SIZE} {tr('MAPAS')}
              </span>
              <span className="sep">/</span>
              <span>TIMER {timer ? `${timer}S` : 'OFF'}</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hud-frame config-3d fx-entra" ref={configRef} style={{ '--e': 2 }}>
              <div className="config">
                <div className="config-head">
                  <span className="mono-label">// {tr('CONFIGURAÇÃO DA PARTIDA')}</span>
                </div>

                <div className="teams-row">
                  {[
                    ['A', teamA, setTeamA, logoA, setLogoA],
                    ['B', teamB, setTeamB, logoB, setLogoB],
                  ].map(([t, nome, setNome, logo, setLogo], i) => (
                    <div key={t} className="team-field-wrap">
                      {i === 1 && <span className="vs">VS</span>}
                      <div className={`field team-${t.toLowerCase()}${mesmoTime ? ' mesmo-time' : ''}`}>
                        <label className="field-inner">
                          <span className="field-label">
                            <span className="mono-label">{tr('TIME {t}', { t })}</span>
                            {acharTime(times, nome) && (
                              <span className="da-lista" title={tr('Time cadastrado na lista: o logo veio de lá')}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                                {tr('DA LISTA')}
                              </span>
                            )}
                          </span>
                          <TeamCombo
                            value={nome}
                            onChange={(valor) => trocarNome(t, valor, setNome, logo, setLogo)}
                            times={times}
                            excluir={t === 'A' ? teamB : teamA}
                            team={t}
                            placeholder={tr('Time {t}', { t })}
                          />
                        </label>
                        {logoDaLista(nome) ? (
                          <div className="logo-field logo-lista">
                            <TeamLogo url={logoDaLista(nome)} name={nome || tr('Time {t}', { t })} team={t} size={34} />
                            <span>{tr('Logo da lista de times')}</span>
                          </div>
                        ) : (
                          <label className="logo-field">
                            <TeamLogo url={logo} name={nome || tr('Time {t}', { t })} team={t} size={34} />
                            <input
                              type="url"
                              inputMode="url"
                              value={logo}
                              onChange={(e) => setLogo(e.target.value)}
                              placeholder={tr('Logo (URL, opcional)')}
                              maxLength={MAX_LOGO_URL}
                              className={logo.trim() && !logoValido(logo) ? 'invalid' : ''}
                              aria-label={tr('URL do logo do time {t}', { t })}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {mesmoTime && (
                  <p className="hint warn-hint" role="alert">
                    {tr('Os dois times não podem ser o mesmo. Escolha outro time para o Time {t}.', { t: teamB.trim() ? 'B' : 'A' })}
                  </p>
                )}
                <p className="hint lista-hint">
                  {times.length > 0
                    ? `${tr('{n} times na lista: digite o nome e escolha para o logo entrar sozinho.', { n: times.length })} `
                    : `${tr('Cadastre os times uma vez e o logo entra sozinho no veto.')} `}
                  <a href="/times/">{tr('Gerenciar lista de times')}</a>
                </p>
                {(logoA.trim() && !logoValido(logoA)) || (logoB.trim() && !logoValido(logoB)) ? (
                  <p className="hint warn-hint">{tr('O logo precisa ser um link https:// de imagem (até {n} caracteres).', { n: MAX_LOGO_URL })}</p>
                ) : null}

                <div className="config-row">
                  <span className="mono-label">{tr('FORMATO')}</span>
                  <div className="segmented">
                    {Object.entries(FORMATS).map(([key, f]) => (
                      <button key={key} className={format === key ? 'active' : ''} onClick={() => setFormat(key)}>
                        {tr(f.label)}
                      </button>
                    ))}
                  </div>
                  <p className="hint">{tr(FORMATS[format].description)}</p>
                </div>

                <div className="config-row">
                  <span className="mono-label">{tr('INICIA O VETO')}</span>
                  <div className="segmented">
                    <button className={first === 'coin' ? 'active' : ''} onClick={() => setFirst('coin')}>
                      {tr('Sorteio')}
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
                  <span className="mono-label">{tr('TIMER POR AÇÃO')}</span>
                  <div className="segmented">
                    {TIMERS.map((t) => (
                      <button key={t.value} className={timer === t.value ? 'active' : ''} onClick={() => setTimer(t.value)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <p className="hint">{tr('Se o tempo acabar, a ação é feita aleatoriamente.')}</p>
                </div>
              </div>
            </div>
            <div className="hero-tag-float">
              {tr('FORMATO')} <strong>{tr(FORMATS[format].label)}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Letreiro (estilo em comum/site.css): a lista vai repetida para a faixa não ter buraco em tela larga */}
      <div className="letreiro" aria-label={tr('Recursos')}>
        <div className="letreiro-trilho">
          {[0, 1].map((copia) => (
            <div key={copia} className="letreiro-grupo" aria-hidden={copia === 1}>
              {[...FEATURES, ...FEATURES].map((f, i) => (
                <span key={i} className="faixa-item">
                  {f.icon} {tr(f.text)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="section" id="pool">
        <div className="wrap">
          <div className="section-head-row">
            <div className="section-head">
              <span className="kicker">
                <b>01</b> {tr('Configuração do veto')}
              </span>
              <h2>Map pool</h2>
              <p>{tr('Selecione exatamente {n} mapas para o veto. O padrão é o pool atual do Premier (atualizado em {data}).', { n: POOL_SIZE, data: premierDate })}</p>
            </div>
            <div className="pool-head-actions">
              {!isPremierPool && (
                <button className="btn btn-ghost btn-sm" onClick={() => setPool(DEFAULT_POOL)}>
                  {tr('Usar pool do Premier')}
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
                  className={`pool-item spot ${on ? 'on' : ''}`}
                  style={{ '--c1': m.colors[0], '--c2': m.colors[1], '--img': `url(${mapImage(m.id)})` }}
                  onClick={() => toggleMap(m.id)}
                  disabled={!on && pool.length >= POOL_SIZE}
                  aria-pressed={on}
                >
                  <span className="pool-top">
                    <span className="pool-idx">{String(i + 1).padStart(2, '0')}</span>
                    {DEFAULT_POOL.includes(m.id) && <span className="pool-premier">PREMIER</span>}
                    <span className="pool-check">{on ? tr('ATIVO') : tr('FORA')}</span>
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
            <button className="btn btn-primary btn-lg" disabled={!podeIniciar} onClick={start}>
              <IconPlay /> {tr('Iniciar veto')}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
