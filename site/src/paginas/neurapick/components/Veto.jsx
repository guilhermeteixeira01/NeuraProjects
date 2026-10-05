import { useEffect, useMemo, useRef, useState } from 'react'
import { getMap } from '../data/maps.js'
import { FORMATS, SIDE_LABEL, buildSteps, deriveState } from '../data/veto.js'
import { playSound } from '../data/sounds.js'
import MapCard from './MapCard.jsx'
import Summary from './Summary.jsx'
import TeamLogo from './TeamLogo.jsx'
import { IconRestart, IconUndo } from './Icons.jsx'
import { useT } from '../../../comum/i18n.js'

const VERB = { ban: 'BANIR', pick: 'ESCOLHER' }
const STEP_LABEL = { ban: 'BAN', pick: 'PICK', side: 'LADO' }
const random = (arr) => arr[Math.floor(Math.random() * arr.length)]
const pad = (n) => String(n).padStart(2, '0')
const TIMER_BEEP_SECONDS = 3

function Countdown({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (left === 0) onExpire()
    // Bipe nos últimos segundos (no zero toca o som da ação automática)
    else if (left <= TIMER_BEEP_SECONDS) playSound('timer')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  return (
    <div className={`countdown ${left <= 5 ? 'low' : ''}`}>
      <div className="countdown-bar" style={{ width: `${(left / seconds) * 100}%` }} />
      <span>00:{pad(left)}</span>
    </div>
  )
}

export default function Veto({ match, onNewMatch }) {
  const tr = useT()
  const { teams, format, firstTeam, pool, timer, coinFlip } = match
  const logos = match.logos ?? { A: '', B: '' }
  const steps = useMemo(() => buildSteps(format, firstTeam), [format, firstTeam])
  const [history, setHistory] = useState([])
  const stepsRef = useRef(null)

  // No celular a faixa de etapas rola na horizontal: mantém a etapa atual visível
  useEffect(() => {
    const list = stepsRef.current
    const current = list?.querySelector('.step.current, .decider-step.done')
    if (!list || !current || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: current.offsetLeft - list.offsetLeft - 16, behavior: 'smooth' })
  }, [history.length])

  // Som a cada ação nova (clique ou timer); desfazer/reiniciar não tocam.
  // Na última ação toca também o "okay, let's go" do veto concluído.
  const prevLength = useRef(0)
  useEffect(() => {
    const added = history.length > prevLength.current
    prevLength.current = history.length
    if (!added) return

    const last = history[history.length - 1]
    playSound(last.type === 'side' ? 'lado' : last.type)
    if (history.length === steps.length) {
      const id = setTimeout(() => playSound('concluido'), 1000)
      return () => clearTimeout(id)
    }
  }, [history, steps.length])

  const step = steps[history.length]
  const done = !step
  const { status, picks, remaining } = deriveState(pool, history)
  const decider = done ? remaining[0] : null
  const sideMap = step?.type === 'side' ? picks[picks.length - 1].map : null

  const act = (payload) =>
    setHistory((h) => (h.length >= steps.length ? h : [...h, { ...steps[h.length], ...payload }]))

  const autoAct = () => {
    if (step.type === 'side') act({ side: random(['ct', 't']), auto: true })
    else act({ map: random(remaining), auto: true })
  }

  const undo = () => setHistory((h) => h.slice(0, -1))
  const restart = () => setHistory([])

  const describe = (h) => {
    const who = <b className={`t-${h.team}`}>{teams[h.team]}</b>
    if (h.type === 'ban') return <>{who} {tr('baniu')} <b>{getMap(h.map).name}</b></>
    if (h.type === 'pick') return <>{who} {tr('escolheu')} <b>{getMap(h.map).name}</b></>
    return <>{who} {tr('começa de')} <b className={h.side}>{tr(SIDE_LABEL[h.side])}</b></>
  }

  return (
    <section className="veto">
      <div className="wrap">
        {/* Placar */}
        <div className="hud-frame scoreboard-frame">
          <div className="scoreboard">
            <div className={`sb-team team-a ${step?.team === 'A' ? 'active' : ''}`}>
              <span className="mono-label">{tr('TIME {t}', { t: 'A' })}</span>
              <span className="sb-id">
                <TeamLogo url={logos.A} name={teams.A} team="A" size={44} />
                <span className="sb-name">{teams.A}</span>
              </span>
              {step?.team === 'A' && <span className="sb-turn">{tr('NA VEZ')}</span>}
            </div>
            <div className="sb-center">
              <span className="sb-format">{tr(FORMATS[format].label)}</span>
              <span className="mono-label">
                {done ? tr('VETO FINALIZADO') : tr('ETAPA {n} / {total}', { n: pad(history.length + 1), total: pad(steps.length) })}
              </span>
              {coinFlip && <span className="sb-coin">{tr('{time} venceu o sorteio', { time: teams[firstTeam] })}</span>}
            </div>
            <div className={`sb-team team-b ${step?.team === 'B' ? 'active' : ''}`}>
              <span className="mono-label">{tr('TIME {t}', { t: 'B' })}</span>
              <span className="sb-id">
                <span className="sb-name">{teams.B}</span>
                <TeamLogo url={logos.B} name={teams.B} team="B" size={44} />
              </span>
              {step?.team === 'B' && <span className="sb-turn">{tr('NA VEZ')}</span>}
            </div>
          </div>
        </div>

        {/* Sequência */}
        <ol className="steps" ref={stepsRef}>
          {steps.map((s, i) => (
            <li
              key={i}
              className={`step ${s.type} t-${s.team} ${i < history.length ? 'done' : ''} ${i === history.length ? 'current' : ''}`}
            >
              <span className="step-type">{tr(STEP_LABEL[s.type])}</span>
              <span className="step-team">{teams[s.team]}</span>
            </li>
          ))}
          <li className={`step decider-step ${done ? 'done' : ''}`}>
            <span className="step-type">DECIDER</span>
            <span className="step-team">Auto</span>
          </li>
        </ol>

        {done && <Summary teams={teams} logos={logos} format={format} picks={picks} decider={decider} />}

        {!done && (
          <div className={`turn turn-${step.team}`}>
            <div className="turn-text">
              <span className="mono-label">{tr('SUA VEZ')}</span>
              <p>
                <span className="turn-team">{teams[step.team]}</span>{' '}
                {step.type === 'side' ? (
                  <>
                    {tr('escolha o')} <b>{tr('lado inicial')}</b> {tr('em')} <b>{getMap(sideMap).name}</b>
                  </>
                ) : (
                  <>
                    {tr('deve')} <b className={step.type}>{tr(VERB[step.type]).toLowerCase()}</b> {tr('um mapa')}
                  </>
                )}
              </p>
            </div>
            {timer > 0 && <Countdown key={history.length} seconds={timer} onExpire={autoAct} />}
          </div>
        )}

        {step?.type === 'side' && (
          <div className="side-picker">
            <button className="side-btn ct" onClick={() => act({ side: 'ct' })}>
              <span className="side-code">CT</span>
              <span className="mono-label">{tr('CONTRA-TERRORISTA')}</span>
            </button>
            <button className="side-btn t" onClick={() => act({ side: 't' })}>
              <span className="side-code">{tr('TR')}</span>
              <span className="mono-label">{tr('TERRORISTA')}</span>
            </button>
          </div>
        )}

        <div className="maps-grid">
          {pool.map((id, i) => {
            const clickable = !done && step.type !== 'side' && status[id].state === 'available'
            return (
              <MapCard
                key={id}
                index={i + 1}
                map={getMap(id)}
                info={status[id]}
                teamNames={teams}
                clickable={clickable}
                action={step?.type}
                isDecider={id === decider}
                onClick={() => act({ map: id })}
              />
            )
          })}
        </div>

        {/* Histórico */}
        <div className="log-section">
          <div className="log-head">
            <h2>{tr('Histórico do veto')}</h2>
            <div className="log-actions">
              <button className="btn btn-ghost btn-sm" onClick={undo} disabled={history.length === 0}>
                <IconUndo /> {tr('Desfazer')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={restart} disabled={history.length === 0}>
                <IconRestart /> {tr('Reiniciar')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onNewMatch}>
                {tr('Nova partida')}
              </button>
            </div>
          </div>

          <div className="spec-list">
            {history.length === 0 && <p className="log-empty">{tr('Nenhuma ação registrada ainda.')}</p>}
            {history.map((h, i) => (
              <div key={i} className="spec-row">
                <span className="spec-num">{pad(i + 1)}</span>
                <div className="spec-body">
                  {describe(h)}
                  {h.auto && <em className="auto"> · {tr('tempo esgotado')}</em>}
                </div>
                <span className={`spec-tag ${h.type}`}>{tr(STEP_LABEL[h.type])}</span>
              </div>
            ))}
            {decider && (
              <div className="spec-row">
                <span className="spec-num">{pad(history.length + 1)}</span>
                <div className="spec-body">
                  <b>{getMap(decider).name}</b> {tr('sobrou no pool')}
                </div>
                <span className="spec-tag decider">DECIDER</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
