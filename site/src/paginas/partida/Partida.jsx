import { useEffect, useState } from 'react'
import CarregandoPontos from '../../comum/Carregando.jsx'
import Layout from '../../comum/Layout.jsx'
import { useAoVivo } from '../../comum/aoVivo.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { fundoMapa, getMap, mapIcon, nomeMapa } from '../../comum/mapas.js'

// Página de estatísticas de um mapa jogado no servidor.
// Os dados vêm do partida.json que o plugin BaseComp manda para o GitHub (formato em `partida.json`, versão 1).

// ── Ícones (traço, cor do texto) ──
function Svg({ children }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
const IconeElim = () => (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" />
  </Svg>
)
const IconeBomba = () => (
  <Svg>
    <path d="M12 2l2.4 5.6 6 .6-4.5 4 1.3 6L12 15l-5.2 3.2 1.3-6-4.5-4 6-.6z" />
  </Svg>
)
const IconeDesarme = () => (
  <Svg>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
  </Svg>
)
const IconeTempo = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)
const IconeData = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </Svg>
)
const IconeDownload = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
)

// Motivo do fim do round (código do jogo) -> ícone e texto
const MOTIVOS = {
  1: [IconeBomba, 'Bomba explodiu'],
  7: [IconeDesarme, 'Bomba desarmada'],
  12: [IconeTempo, 'Tempo esgotado'],
}
const motivo = (m) => MOTIVOS[m] || [IconeElim, 'Eliminação']

// ── Números ──
const f = (v, casas = 2) => Number(v || 0).toFixed(casas)
const classeRating = (r) => (r >= 1.5 ? 'alto' : r >= 1.2 ? 'bom' : r >= 0.9 ? 'medio' : 'baixo')
const TEXTO_RATING = { alto: 'Alto impacto', bom: 'Acima da média', medio: 'Na média', baixo: 'Abaixo da média' }
const kastPct = (e) => (100 * e.kast) / Math.max(1, e.rounds)
const iniciais = (nome) => (String(nome || '?').match(/[\p{L}\p{N}]/gu) || []).slice(0, 2).join('').toUpperCase() || '?'
// Maior valor; no empate fica o primeiro (igual ao MaxBy do plugin)
const maior = (lista, valor) => lista.reduce((m, e) => (valor(e) > valor(m) ? e : m), lista[0])
// "2026-10-02 20:23" -> "02/10/2026 20:23"
const dataBr = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(d || '')
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : String(d || '')
}

// Foto da Steam ou as iniciais
function Avatar({ e, classe }) {
  const [erro, setErro] = useState(false)
  return urlOk(e?.avatar) && !erro ? (
    <img className={classe} src={e.avatar} alt="" loading="lazy" onError={() => setErro(true)} />
  ) : (
    <span className={`${classe} av-fb`}>{iniciais(e?.nome)}</span>
  )
}

// Badge da FACEIT: número numa caixinha colorida com a barrinha de progresso embaixo
function RatingBadge({ rating, extra = '' }) {
  const classe = classeRating(rating)
  const largura = Math.min(100, Math.max(4, (rating / 2) * 100)).toFixed(0)
  return (
    <span className={`rt-cel ${extra}`} title={`Rating ${f(rating)} · ${TEXTO_RATING[classe]}`}>
      <span className={`rt-box rt-${classe}`}>{f(rating)}</span>
      <span className="rt-barra">
        <i className={`rt-${classe}`} style={{ '--w': `${largura}%` }} />
      </span>
    </span>
  )
}

// Placar contando de 0 até o valor quando a página termina de carregar
function Contador({ alvo, ativo, className }) {
  const [v, setV] = useState(alvo)
  useEffect(() => {
    if (!ativo || !alvo || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let t0 = null
    let quadro
    const passo = (t) => {
      if (t0 === null) t0 = t
      const p = Math.min(1, (t - t0) / 900)
      setV(Math.round(alvo * (1 - Math.pow(1 - p, 3))))
      if (p < 1) quadro = requestAnimationFrame(passo)
    }
    setV(0)
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [ativo, alvo])
  return <b className={className}>{v}</b>
}

// Seções entram ao rolar (só depois que a tela de carregamento some)
function useRevelarSecoes(ativo) {
  useEffect(() => {
    if (!ativo) return
    const itens = document.querySelectorAll('.revelar:not(.visivel)')
    if (!('IntersectionObserver' in window)) {
      itens.forEach((el) => el.classList.add('visivel'))
      return
    }
    const obs = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visivel')
            obs.unobserve(e.target)
          }
        }),
      { threshold: 0.08 },
    )
    itens.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [ativo])
}

// Logo do time: o da série (NeuraPick) ou, sem logo, a foto do melhor jogador do time (como o capitão na FACEIT)
function LogoTime({ url, nome, capitao, t }) {
  const [erro, setErro] = useState(false)
  return (
    <span className={`bn-logo bn-logo-${t}`}>
      <span className="bn-ini">{iniciais(nome)}</span>
      {urlOk(url) ? !erro && <img className="bn-img" src={url} alt="" onError={() => setErro(true)} /> : capitao && <Avatar e={capitao} classe="bn-img" />}
    </span>
  )
}

function NomeTime({ nome, venceu, t }) {
  return (
    <div className={`bn-nome bn-nome-${t}`}>
      {venceu && <span className="bn-venc">VENCEDOR</span>}
      <b>{nome}</b>
    </div>
  )
}

function Banner({ d, nomeTime, vencedor, porRating, comecou }) {
  const serie = d.serie
  const trilhaFim = serie ? `Mapa ${serie.atual + 1} de ${serie.mapas.length}` : 'Partida encerrada'
  const logo = (t) => (
    <LogoTime t={t} url={t === 'A' ? d.logoA : d.logoB} nome={nomeTime(t)} capitao={porRating.find((e) => e.time === t)} />
  )
  const nome = (t) => <NomeTime t={t} nome={nomeTime(t)} venceu={vencedor === t} />

  return (
    <section className="hero hero-partida">
      <div className="hero-glow hero-glow-1" />
      <div className="hero-glow hero-glow-2" />
      <div className="wrap hero-inner">
        <div className="banner revelar" style={fundoMapa(d.mapa)}>
          <div className="bn-topo">
            <div className="bn-trilha">
              <IconeElim />
              <b>{String(d.organizacao || '').toUpperCase()}</b>
              <i>/</i>
              <span>{d.categoria === 'normal' ? 'Partida' : String(d.categoria).toUpperCase()}</span>
              <i>/</i>
              <span className="bn-tag">{trilhaFim}</span>
            </div>
            <div className="bn-info">
              {getMap(d.mapa) && <img className="bn-mapa" src={mapIcon(d.mapa)} alt="" />}
              <b>{nomeMapa(d.mapa)}</b>
              <span>
                <IconeData /> {dataBr(d.inicio)}
              </span>
              <span>
                <IconeTempo /> {d.duracaoMin} min
              </span>
              <span>{d.placarA + d.placarB} rounds</span>
              {urlOk(d.demo) && (
                <a className="bn-demo" href={d.demo}>
                  <IconeDownload /> Baixar demo
                </a>
              )}
            </div>
          </div>
          <div className="bn-placar">
            {nome('A')}
            {logo('A')}
            <div className="bn-centro">
              <Contador alvo={d.placarA} ativo={comecou} className={vencedor === 'A' ? 'win' : ''} />
              <span>VS</span>
              <Contador alvo={d.placarB} ativo={comecou} className={vencedor === 'B' ? 'win' : ''} />
            </div>
            {logo('B')}
            {nome('B')}
          </div>
        </div>
      </div>
    </section>
  )
}

// Mapas da série que já foram jogados (do histórico partidas.json): índice do mapa -> resumo da partida
function jogadosDaSerie(jogos) {
  const porMapa = {}
  for (const p of jogos || []) {
    const n = Number(/mapa (\d+)\//.exec(p.serie || '')?.[1])
    if (n) porMapa[n - 1] = p
  }
  return porMapa
}
const linkPartida = (p) => `/partidas/${(p.caminho || p.nome).split('/').map(encodeURIComponent).join('/')}/`

// Série mapa a mapa, sempre atualizada: a página é gerada de novo a cada mapa novo e, ao abrir,
// ainda confere o histórico. Mapa jogado vira link; o que falta fica "A jogar" (ou "Não jogado" se a série acabou).
function Serie({ serie, nomeTime, jogos, caminhoAtual }) {
  const jogados = jogadosDaSerie(jogos)
  const vitorias = { A: 0, B: 0 }
  Object.values(jogados).forEach((p) => {
    if (p.placarA > p.placarB) vitorias.A++
    else if (p.placarB > p.placarA) vitorias.B++
  })
  // Sem histórico (ex.: página antiga sem a lista): usa o placar gravado na partida
  if (!Object.keys(jogados).length) {
    vitorias.A = serie.vitoriasA
    vitorias.B = serie.vitoriasB
  }
  const paraVencer = Math.floor(serie.mapas.length / 2) + 1
  // Série cancelada no meio (css_seriecancelar): o plugin marca os mapas dela
  const cancelada = (jogos || []).some((p) => p.serieCancelada)
  const acabou = cancelada || vitorias.A >= paraVencer || vitorias.B >= paraVencer || Object.keys(jogados).length >= serie.mapas.length

  return (
    <section className="section revelar">
      <div className="section-head-row">
        <div className="section-head">
          <span className="mono-label">
            SÉRIE {serie.formato}
            {cancelada && <span className="serie-cancelada"> · CANCELADA</span>}
          </span>
          <h2>
            <span className="t-A">{nomeTime('A')}</span> {vitorias.A} x {vitorias.B} <span className="t-B">{nomeTime('B')}</span>
          </h2>
        </div>
      </div>
      <div className="summary-list">
        {serie.mapas.map((m, i) => {
          const p = jogados[i]
          const atual = p ? p.caminho === caminhoAtual : i === serie.atual
          const venc = p && (p.placarA > p.placarB ? 'A' : p.placarB > p.placarA ? 'B' : null)
          const placar = p && `${Math.max(p.placarA, p.placarB)}-${Math.min(p.placarA, p.placarB)}`
          const [classe, texto] = p
            ? venc
              ? [`res-${venc}`, `${nomeTime(venc)} venceu · ${placar}`]
              : ['', `Empate · ${placar}`]
            : m.vencedor // página antiga, sem histórico
              ? [`res-${m.vencedor}`, `${nomeTime(m.vencedor)} venceu · ${m.placar}`]
              : acabou
                ? ['nao-jogado', cancelada ? 'Cancelado' : 'Não jogado']
                : ['aguardando', 'A jogar']
          const conteudo = (
            <>
              <span className="summary-num">MAPA {i + 1}</span>
              <span className="summary-map">
                {getMap(m.mapa) && <img className="summary-icon" src={mapIcon(m.mapa)} alt="" />}
                {nomeMapa(m.mapa)}
              </span>
              <span className={`summary-meta ${classe}`}>
                {classe === 'aguardando' && <CarregandoPontos />}
                {texto}
              </span>
              {m.faca ? (
                <span className="summary-side knife">FACA</span>
              ) : m.ct ? (
                <span className="summary-side ct">{nomeTime(m.ct)} CT</span>
              ) : (
                <span className="summary-side">—</span>
              )}
            </>
          )
          const cls = `summary-item${atual ? ' atual' : ''}${!p && !m.vencedor ? (acabou ? ' nao-jogado' : ' pendente') : ''}`
          // Outro mapa já jogado: clica e vai para a página dele
          return p && !atual ? (
            <a key={i} className={`${cls} link`} href={linkPartida(p)} style={fundoMapa(m.mapa)}>
              {conteudo}
            </a>
          ) : (
            <div key={i} className={cls} style={fundoMapa(m.mapa)}>
              {conteudo}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ItemDestaque({ e, valor, rotulo, ehMvp }) {
  return (
    <div className={`mvp-item mvp-${e.time}`}>
      <Avatar e={e} classe="av" />
      <b className={ehMvp ? `t-${e.time}` : ''}>{e.nome}</b>
      <span className="mvp-val">
        <b>{valor}</b>
        <em>{rotulo}</em>
      </span>
    </div>
  )
}

function Destaques({ jogadores, porRating, totalRounds, nomeTime }) {
  const mvp = porRating[0]
  const maisKills = maior(jogadores, (e) => e.kills)
  const maisDano = maior(jogadores, (e) => e.dano)
  const comRounds = jogadores.filter((e) => e.rounds > 0)
  const melhorKast = comRounds.length ? maior(comRounds, kastPct) : mvp
  const entry = maior(jogadores, (e) => e.primeirasKills)
  const hsMvp = mvp.kills === 0 ? 0 : (100 * mvp.headshots) / mvp.kills
  const classe = classeRating(mvp.rating)

  const item = (e, valor, rotulo) => <ItemDestaque e={e} valor={valor} rotulo={rotulo} ehMvp={e === mvp} />

  return (
    <section className="section revelar">
      <div className="section-head">
        <span className="mono-label">DESTAQUES</span>
        <h2>Melhores da partida</h2>
      </div>
      <div className="mvp-grid">
        {/* Card grande do MVP (igual ao da sala da FACEIT) */}
        <div className={`mvp-card mvp-${mvp.time}`}>
          <div className="mvp-perfil">
            <Avatar e={mvp} classe="mvp-av" />
            <b>{mvp.nome}</b>
            <span className={`mono-label t-${mvp.time}`}>{nomeTime(mvp.time)}</span>
          </div>
          <div className="mvp-info">
            <div className="mvp-rt">
              <span className={`rt-box rt-g rt-${classe}`}>{f(mvp.rating)}</span>
              <span className={`rt-txt rt-${classe}`}>{TEXTO_RATING[classe]}</span>
            </div>
            <span className="mono-label">RATING HLTV 1.0</span>
            <div className="mvp-stats">
              <div>
                <b>
                  {mvp.kills}/{mvp.mortes}/{mvp.assistencias}
                </b>
                <span>K/D/A</span>
              </div>
              <div>
                <b>{f(mvp.dano / totalRounds, 1)}</b>
                <span>ADR</span>
              </div>
              <div>
                <b>{f(hsMvp, 1)}%</b>
                <span>% de HS</span>
              </div>
              <div>
                <b>{f(kastPct(mvp), 1)}%</b>
                <span>KAST</span>
              </div>
            </div>
          </div>
          <div className="mvp-selo">
            <span>★</span>MVP
          </div>
        </div>

        {/* Ao lado: quem foi melhor em cada coisa */}
        <div className="mvp-lista">
          {item(maisKills, maisKills.kills, 'Mais kills')}
          {item(maisDano, maisDano.dano, 'Maior dano')}
          {item(melhorKast, `${f(kastPct(melhorKast), 1)}%`, 'KAST')}
          {item(entry, entry.primeirasKills, 'First kills')}
        </div>
      </div>
    </section>
  )
}

function Rounds({ d, nomeTime }) {
  const maxRounds = d.maxRounds || 24
  const meioOt = Math.max(1, Math.floor((d.roundsProrrogacao || 6) / 2))
  const total = d.rounds.length
  return (
    <section className="section revelar">
      <div className="section-head">
        <span className="mono-label">LINHA DO TEMPO</span>
        <h2>Rounds</h2>
      </div>
      <div className="rounds-card">
        <div className="rounds">
          {d.rounds.map((r, i) => {
            const n = i + 1
            const [Icone, texto] = motivo(r.motivo)
            // Troca de lado: meio do tempo normal e cada metade da prorrogação
            const fimDoTempo = n === maxRounds / 2 || n === maxRounds || (n > maxRounds && (n - maxRounds) % meioOt === 0)
            return [
              <div key={n} className={`r r-${r.time}`} style={{ '--i': i }} title={`Round ${n}: ${nomeTime(r.time)} (${r.lado}) — ${texto}`}>
                <Icone />
                <span>{n}</span>
              </div>,
              fimDoTempo && n < total && <div key={`s${n}`} className="r-sep" />,
            ]
          })}
        </div>
        <div className="legenda">
          <span className="t-A">■ {nomeTime('A')}</span>
          <span className="t-B">■ {nomeTime('B')}</span>
          <span>
            <IconeElim /> eliminação
          </span>
          <span>
            <IconeBomba /> bomba explodiu
          </span>
          <span>
            <IconeDesarme /> desarme
          </span>
          <span>
            <IconeTempo /> tempo
          </span>
        </div>
      </div>
    </section>
  )
}

function TabelaTime({ d, t, jogadores, vencedor, mvp, totalRounds, nomeTime }) {
  const doTime = jogadores.filter((e) => e.time === t).sort((a, b) => b.rating - a.rating)
  if (!doTime.length) return null

  // Rounds ganhos em cada half (e na prorrogação, se teve)
  const maxRounds = d.maxRounds || 24
  const ganhos = (noTrecho) => d.rounds.filter((r, i) => r.time === t && noTrecho(i + 1)).length
  const half1 = ganhos((n) => n <= maxRounds / 2)
  const half2 = ganhos((n) => n > maxRounds / 2 && n <= maxRounds)
  const prorrogacao = d.rounds.length > maxRounds ? ganhos((n) => n > maxRounds) : -1
  const media = doTime.reduce((s, e) => s + e.rating, 0) / doTime.length
  const placarTime = t === 'A' ? d.placarA : d.placarB
  const [classe, texto] = !vencedor ? ['', 'EMPATE'] : vencedor === t ? ['win', 'VITÓRIA'] : ['loss', 'DERROTA']

  return (
    <div className={`team-card team-${t}`}>
      <div className="team-head">
        <span className={`team-score ${classe}`}>{placarTime}</span>
        <span className={`team-name t-${t}`}>{nomeTime(t)}</span>
        <span className={`res ${classe}`}>{texto}</span>
        <div className="team-meta">
          <span>
            Média da equipe <RatingBadge rating={media} extra="rt-mini" />
          </span>
          <span className="sep" />
          <span>
            Primeiro half <b>{half1}</b>
          </span>
          <span>
            Segundo half <b>{half2}</b>
          </span>
          {prorrogacao >= 0 && (
            <span>
              Prorrogação <b>{prorrogacao}</b>
            </span>
          )}
        </div>
      </div>
      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th>JOGADOR</th>
              <th className="col-rt">RATING</th>
              <th>K</th>
              <th>D</th>
              <th>A</th>
              <th>+/-</th>
              <th>ADR</th>
              <th>K/D</th>
              <th>K/R</th>
              <th>HS</th>
              <th>HS%</th>
              <th>KAST</th>
              <th title="Primeiras kills - primeiras mortes">FK-FD</th>
              <th>5K</th>
              <th>4K</th>
              <th>3K</th>
              <th>2K</th>
              <th>MVPS</th>
            </tr>
          </thead>
          <tbody>
            {doTime.map((e, linha) => {
              const saldo = e.kills - e.mortes
              const kd = e.mortes === 0 ? e.kills : e.kills / e.mortes
              const kr = e.kills / Math.max(1, e.rounds > 0 ? e.rounds : totalRounds)
              return (
                <tr key={e.steamId} style={{ '--i': linha }}>
                  <td>
                    <a className="player" href={`https://steamcommunity.com/profiles/${e.steamId}`} target="_blank" rel="noopener">
                      <Avatar e={e} classe="av" />
                      <span>{e.nome}</span>
                      {e === mvp && (
                        <span className="estrela" title="MVP da partida">
                          ★
                        </span>
                      )}
                    </a>
                  </td>
                  <td className="col-rt">
                    <RatingBadge rating={e.rating} />
                  </td>
                  <td>{e.kills}</td>
                  <td>{e.mortes}</td>
                  <td>{e.assistencias}</td>
                  <td className={saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : ''}>
                    {saldo > 0 ? '+' : ''}
                    {saldo}
                  </td>
                  <td>{f(e.dano / totalRounds, 1)}</td>
                  <td className={kd >= 1 ? 'pos' : 'neg'}>{f(kd)}</td>
                  <td>{f(kr)}</td>
                  <td>{e.headshots}</td>
                  <td>{e.kills === 0 ? '0.0' : f((100 * e.headshots) / e.kills, 1)}%</td>
                  <td>{f(kastPct(e), 1)}%</td>
                  <td>
                    {e.primeirasKills}-{e.primeirasMortes}
                  </td>
                  <td>{e.k5}</td>
                  <td>{e.k4}</td>
                  <td>{e.k3}</td>
                  <td>{e.k2}</td>
                  <td>{e.mvps}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Conteudo({ d }) {
  const [comecou, setComecou] = useState(false)
  // Outros mapas da mesma série: vêm com a página (deploy) e são conferidos de novo no histórico ao abrir
  const [jogos, setJogos] = useState(d.serieJogos ?? null)
  // Ao vivo: quando o próximo mapa da série termina, a página recarrega sozinha e mostra o resultado + link
  useAoVivo(
    '/partidas/partidas.json',
    (lista) => Array.isArray(lista) && setJogos(lista.filter((p) => p.serieId === d.serie.id)),
    // Só os mapas desta série: partida de outra série não recarrega esta página
    { ativo: !!d.serie?.id, selecionar: (lista) => (Array.isArray(lista) ? lista.filter((p) => p.serieId === d.serie.id) : []) },
  )

  // Tela de carregamento: some quando a página termina de carregar (imagem lenta não segura mais que 2,5s)
  useEffect(() => {
    let feito = false
    const comecar = () => {
      if (feito) return
      feito = true
      setComecou(true)
    }
    const depoisDeCarregar = () => setTimeout(comecar, 250)
    if (document.readyState === 'complete') depoisDeCarregar()
    else window.addEventListener('load', depoisDeCarregar)
    const limite = setTimeout(comecar, 2500)
    return () => {
      window.removeEventListener('load', depoisDeCarregar)
      clearTimeout(limite)
    }
  }, [])
  useRevelarSecoes(comecou)

  const nomeTime = (t) => (t === 'A' ? d.timeA : d.timeB)
  const vencedor = d.placarA > d.placarB ? 'A' : d.placarB > d.placarA ? 'B' : null
  const totalRounds = Math.max(1, d.placarA + d.placarB)
  const jogadores = (d.jogadores || []).filter((e) => e.time && (e.rounds > 0 || e.kills + e.mortes > 0))
  // Melhor rating primeiro (no empate, a ordem original)
  const porRating = [...jogadores].sort((a, b) => b.rating - a.rating)
  const mvp = jogadores.length ? maior(jogadores, (e) => e.rating) : null

  return (
    <>
      <div id="carregando" className={comecou ? 'fim' : ''} aria-hidden="true">
        <div className="ld">
          <img src="/assets/logos/logo-np-64.png" alt="" />
          <span className="mono-label">CARREGANDO ESTATÍSTICAS</span>
          <div className="barra" />
        </div>
      </div>
      <Banner d={d} nomeTime={nomeTime} vencedor={vencedor} porRating={porRating} comecou={comecou} />
      <main className="wrap">
        {d.serie && <Serie serie={d.serie} nomeTime={nomeTime} jogos={jogos} caminhoAtual={d.caminho} />}
        {mvp && <Destaques jogadores={jogadores} porRating={porRating} totalRounds={totalRounds} nomeTime={nomeTime} />}
        {d.rounds?.length > 0 && <Rounds d={d} nomeTime={nomeTime} />}
        {/* Tabelas: vencedor primeiro */}
        <section className="section revelar">
          <div className="section-head">
            <span className="mono-label">PLACAR</span>
            <h2>Estatísticas dos jogadores</h2>
          </div>
          {(vencedor === 'B' ? ['B', 'A'] : ['A', 'B']).map((t) => (
            <TabelaTime key={t} d={d} t={t} jogadores={jogadores} vencedor={vencedor} mvp={mvp} totalRounds={totalRounds} nomeTime={nomeTime} />
          ))}
        </section>
      </main>
      <p className="wrap gerado">Gerado pelo BaseComp em {dataBr(d.gerado)} · Rating HLTV 1.0</p>
    </>
  )
}

// dados: partida.json (vem junto com a página gerada no deploy; no `npm run dev` é buscado da pasta da partida)
export default function Partida({ dados: inicial }) {
  const [d, setD] = useState(inicial ?? null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (inicial) return
    lerJson('partida.json').then((j) => (j ? setD(j) : setErro(true)))
  }, [inicial])

  useEffect(() => {
    if (d) document.title = `${d.timeA} ${d.placarA} x ${d.placarB} ${d.timeB} — ${nomeMapa(d.mapa)}`
  }, [d])

  return (
    <Layout pagina="partidas">
      {d ? (
        <Conteudo d={d} />
      ) : (
        <main className="wrap">
          <p className="gerado" style={{ padding: '80px 0' }}>
            {erro ? 'Partida não encontrada.' : 'Carregando…'}
          </p>
        </main>
      )}
    </Layout>
  )
}
