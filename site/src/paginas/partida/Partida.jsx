import { createPortal } from 'react-dom'
import { ladoDoRound, trocaDeLado } from './rounds.js'
import IconeUI from '../../comum/IconeUI.jsx'
import StatusConsumivel from '../../comum/StatusConsumivel.jsx'
import { lerApi } from '../../comum/api.js'
import { useEffect, useState, useMemo, useLayoutEffect, useRef } from 'react'
import { pontosDaPartida } from '../../comum/pontos.js'
import CarregandoPontos, { CarregandoNP } from '../../comum/Carregando.jsx'
import Layout from '../../comum/Layout.jsx'
import { useAoVivo } from '../../comum/aoVivo.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'
import GraficoUtil from './GraficoUtil.jsx'
import { lerJson, urlOk } from '../../comum/dados.js'
import { linkPerfil, useConta } from '../../comum/conta.js'
import { usePartidasServidor } from '../../comum/bonusPartidas.js'
import { fundoMapa, getMap, mapIcon, nomeMapa } from '../../comum/mapas.js'
import { fundoDoResultado } from '../../comum/assetsV2.js'
import { ComMoldura, comApelidos, usePerfis, useCardDe, CargosDe, IconeEquipe } from '../../comum/Moldura.jsx'
import { fundoCard } from '../../comum/cardsPerfil.js'
import { desempenhoAtivo } from '../../comum/desempenho.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { nivelDe, XP, xpDaPartida } from '../../comum/niveis.js'
import { dataNoIdioma, useT } from '../../comum/i18n.js'
import { fimDaSerie } from '../../comum/series.js'
import { ContagemRemocao, useRelogio } from '../../comum/ContagemSerie.jsx'
import { juntarPartidas, useRecentes } from '../../comum/partidasRecentes.js'
import { useAvatar } from '../../comum/avatares.js'

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
// Silhuetas próprias: caveira, C4 com teclado e alicate do kit de desarme.
function IconeRound({ tipo }) {
  return <svg width="20" height="22" viewBox="0 0 32 36" fill="none" aria-hidden="true" focusable="false">
    {tipo === 'bomba' ? <><path d="M10 9V5c0-4 13-4 13 1v4M24 9V5" stroke="currentColor" strokeWidth="2"/><rect x="6" y="9" width="21" height="25" rx="3" fill="currentColor"/><rect x="9" y="12" width="15" height="6" rx="1" fill="#03121e"/><path d="M11 22h2m4 0h2m4 0h1M11 26h2m4 0h2m4 0h1M11 30h2m4 0h2m4 0h1" stroke="#03121e" strokeWidth="2"/></> : tipo === 'desarme' ? <><path d="m14 16-6 16m11-16 6 16M13 17 8 9l2-6 6 9 6-9 2 6-5 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="16" cy="17" r="3" fill="currentColor"/></> : <><path d="M16 2C8 2 3 8 4 17c0 4 2 6 5 8v7h14v-7c3-2 5-4 5-8C29 8 24 2 16 2Z" fill="currentColor"/><path d="m8 14 6 2-1 5-5-2Zm16 0-6 2 1 5 5-2ZM16 21l-3 5h6Z" fill="#03121e"/><path d="M12 29v5m4-5v5m4-5v5" stroke="#03121e" strokeWidth="1.6"/></>}
  </svg>
}
const IconeElim = () => <IconeRound tipo="eliminacao"/>
const IconeBomba = () => <IconeRound tipo="bomba"/>
const IconeDesarme = () => <IconeRound tipo="desarme"/>
const IconeTempo = () => <IconeUI tipo="relogio" tamanho={18}/>
const IconeData = () => <IconeUI tipo="calendario" tamanho={18}/>
const IconeDownload = () => <IconeUI tipo="download" tamanho={18}/>

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
const dataBr = (d, idioma) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(d || '')
  return m ? `${dataNoIdioma(m[1], m[2], m[3], idioma)} ${m[4]}` : String(d || '')
}

// Foto da Steam ou as iniciais
function Avatar({ e, classe }) {
  const src = useAvatar(e?.steamId, e?.avatar) // foto atual da Steam (a do partida.json é a do dia do jogo)
  const [erro, setErro] = useState('')
  return urlOk(src) && erro !== src ? (
    <img className={classe} src={src} alt="" loading="lazy" onError={() => setErro(src)} />
  ) : (
    <span className={`${classe} av-fb`}>{iniciais(e?.nome)}</span>
  )
}

// A área é sempre quadrada; o contorno e o emblema continuam sendo os escolhidos no perfil.
function FotoJogador({ e, tamanho = 32 }) {
  const ref = useRef(null)
  const perfil = usePerfis()[e?.steamId]
  useLayoutEffect(() => {
    const area = ref.current
    const miolo = area?.querySelector('.resultado-avatar-miolo')
    if (!area || !miolo) return
    const ajustar = () => {
      miolo.style.transform = 'none'
      const origem = miolo.getBoundingClientRect()
      const partes = [miolo, ...miolo.querySelectorAll('.moldura, .emblema-sub')].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height)
      if (!partes.length) return
      const esquerda = Math.min(...partes.map(r => r.left)), topo = Math.min(...partes.map(r => r.top))
      const largura = Math.max(...partes.map(r => r.right)) - esquerda, altura = Math.max(...partes.map(r => r.bottom)) - topo
      const escala = Math.min(1, area.clientWidth / largura, area.clientHeight / altura)
      const x = (area.clientWidth - largura * escala) / 2 - (esquerda - origem.left) * escala
      const y = (area.clientHeight - altura * escala) / 2 - (topo - origem.top) * escala
      miolo.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + escala + ')'
    }
    ajustar()
    const obs = new ResizeObserver(ajustar)
    for (const el of [area, miolo, ...miolo.querySelectorAll('.moldura, .emblema-sub')]) obs.observe(el)
    return () => obs.disconnect()
  }, [e?.steamId, perfil?.moldura, perfil?.sub, tamanho])
  return <span ref={ref} className="resultado-avatar" style={{ width: tamanho, height: tamanho }}><span className="resultado-avatar-miolo"><ComMoldura steamId={e?.steamId} emblema><Avatar e={e} classe="resultado-avatar-imagem"/></ComMoldura></span></span>
}

function CardJogadorMvp({ jogador, time }) {
  const tr = useT()
  const card = useCardDe(jogador.steamId)
  return <article className={'resultado-card-usuario' + (card ? ' com-card' : '')} style={card ? { backgroundImage: fundoCard(card) } : undefined} aria-label={tr('Card do jogador')}>
    <span className="resultado-card-mvp"><IconeUI tipo="coroa" tamanho={16}/> MVP</span>
    <a className="resultado-card-perfil" href={linkPerfil(jogador.steamId)}>
      <FotoJogador e={jogador} tamanho={120}/>
      <b>{jogador.nome}<IconeEquipe steamId={jogador.steamId}/></b>
      <span>{tr('Melhor da partida')}</span><small>{time}</small>
    </a>
    <CargosDe steamId={jogador.steamId} max={3} classe="resultado-card-cargos"/>
  </article>
}

// Badge da FACEIT: número numa caixinha colorida com a barrinha de progresso embaixo
function RatingBadge({ rating, extra = '' }) {
  const tr = useT()
  const classe = classeRating(rating)
  const largura = Math.min(100, Math.max(4, (rating / 2) * 100)).toFixed(0)
  return (
    <span className={`rt-cel ${extra}`} title={`Rating ${f(rating)} · ${tr(TEXTO_RATING[classe])}`}>
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
    if (!ativo || !alvo || desempenhoAtivo() || matchMedia('(prefers-reduced-motion: reduce)').matches) return
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

function donoDoTime(d, t) {
  const id = d['dono' + t] || d['capitao' + t] || d.serie?.['capitao' + t]
  const nome = String(t === 'A' ? d.timeA : d.timeB).replace(/^time_/i, '').replace(/\s*\(\d+\)$/, '').trim().toLocaleLowerCase()
  return (d.jogadores || []).find(e => e.time === t && (String(e.steamId) === String(id) || [e.nomeOriginal, e.nome].some(n => String(n || '').trim().toLocaleLowerCase() === nome)))
}
function FotoDonoTime({ d, t }) {
  const dono = donoDoTime(d, t)
  return <span className={'bn-logo bn-logo-' + t} title={dono?.nome || (t === 'A' ? d.timeA : d.timeB)}>{dono ? <FotoJogador e={dono}/> : <span className="bn-ini">{iniciais(t === 'A' ? d.timeA : d.timeB)}</span>}</span>
}

// Logo do time: o da série (NeuraPick) ou, sem logo, a foto do líder do time (o nome do time da fila do site é time_<líder>); sem achar o líder, a do melhor jogador.
// Sem emblema de assinatura: é só a foto de perfil.
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
  const tr = useT()
  return (
    <div className={`bn-nome bn-nome-${t}`}>
      {venceu && <span className="bn-venc">{tr('VENCEDOR')}</span>}
      <b>{nome}</b>
    </div>
  )
}

// Fundo do banner: a arte do pacote (resultado do mapa, pelo identificador real) ou, sem ela, a que o mapa já tinha. Nunca outro mapa.
function arteDoBanner(mapa) {
  const arte = fundoDoResultado(mapa)
  return arte ? { ...fundoMapa(mapa), '--bn-arte': 'url("' + arte.src + '")' } : fundoMapa(mapa)
}

function Banner({ d, nomeTime, vencedor, porRating, comecou }) {
  const tr = useT()
  const serie = d.serie
  const trilhaFim = serie ? tr('Mapa {n} de {total}', { n: serie.atual + 1, total: serie.mapas.length }) : tr('Partida encerrada')
  const logo = (t) => <FotoDonoTime d={d} t={t}/>

  return (<section className="resultado-hero"><a className="resultado-voltar" href="/partidas/">← {tr('Voltar ao histórico')}</a><div className="resultado-titulo"><div><h1>{tr('Resultado da partida')}</h1><p>{tr('Partida competitiva da comunidade NEURA PROJECT.')}</p></div>{urlOk(d.demo)&&<a className="resultado-demo" href={d.demo}><IconeDownload/>{tr('Baixar demo')}</a>}</div><div className="resultado-placar"><div className="resultado-time">{logo('A')}<b>{nomeTime('A')}</b>{vencedor==='A'&&<span className="resultado-vitoria">{tr('VITÓRIA')}</span>}</div><div className="resultado-numeros"><Contador alvo={d.placarA} ativo={comecou} className={vencedor==='A'?'win':''}/><span>:</span><Contador alvo={d.placarB} ativo={comecou} className={vencedor==='B'?'win':''}/></div><div className="resultado-time">{logo('B')}<b>{nomeTime('B')}</b>{vencedor==='B'&&<span className="resultado-vitoria">{tr('VITÓRIA')}</span>}</div></div><div className="resultado-meta">{nomeMapa(d.mapa)} · {d.serie?.formato||'MD1'} · {dataBr(d.inicio,tr.idioma).split(' ')[0]} · {d.duracaoMin} min</div></section>)
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
function Serie({ serie, nomeTime, jogos, caminhoAtual, anuncio, agora }) {
  const tr = useT()
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
  const cancelada = (jogos || []).some((p) => p.serieCancelada) || anuncio?.status === 'cancelada'
  const acabou = cancelada || vitorias.A >= paraVencer || vitorias.B >= paraVencer || Object.keys(jogados).length >= serie.mapas.length

  return (
    <section className="section revelar">
      <div className="section-head-row">
        <div className="section-head">
          <span className="kicker">
            {tr('SÉRIE {formato}', { formato: serie.formato })}
            {cancelada && <span className="serie-cancelada"> · {tr('CANCELADA')}</span>}
            <ContagemRemocao fim={fimDaSerie(anuncio)} agora={agora} />
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
              ? [`res-${venc}`, `${tr('{time} venceu', { time: nomeTime(venc) })} · ${placar}`]
              : ['', `${tr('Empate')} · ${placar}`]
            : m.vencedor // página antiga, sem histórico
              ? [`res-${m.vencedor}`, `${tr('{time} venceu', { time: nomeTime(m.vencedor) })} · ${m.placar}`]
              : acabou
                ? ['nao-jogado', cancelada ? tr('Cancelado') : tr('Não jogado')]
                : anuncio?.status === 'andamento' && anuncio.mapaAtual === i
                  ? ['ao-vivo', tr('Ao vivo')] // o plugin avisou que este mapa começou valendo
                  : ['aguardando', tr('A jogar')]
          const conteudo = (
            <>
              <span className="summary-num">{tr('MAPA {n}', { n: i + 1 })}</span>
              <span className="summary-map">
                {getMap(m.mapa) && <img className="summary-icon" src={mapIcon(m.mapa)} alt="" />}
                {nomeMapa(m.mapa)}
              </span>
              <span className={`summary-meta ${classe}`}>
                {classe === 'aguardando' && <CarregandoPontos />}
                {classe === 'ao-vivo' && <i className="ponto-vivo" />}
                {texto}
              </span>
              {m.faca ? (
                <span className="summary-side knife">{tr('FACA')}</span>
              ) : m.ct ? (
                <span className="summary-side ct">{nomeTime(m.ct)} CT</span>
              ) : (
                <span className="summary-side">—</span>
              )}
            </>
          )
          const cls = `summary-item${atual ? ' atual' : ''}${classe === 'ao-vivo' ? ' ao-vivo' : !p && !m.vencedor ? (acabou ? ' nao-jogado' : ' pendente') : ''}`
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
  const tr = useT()
  return (
    <a className={`mvp-item spot mvp-${e.time}`} href={linkPerfil(e.steamId)} title={tr('Perfil de {nome}', { nome: e.nome })}>
      <FotoJogador e={e} tamanho={32}/>
      <b className={ehMvp ? `t-${e.time}` : ''}>{e.nome}</b>
      <span className="mvp-val">
        <b>{valor}</b>
        <em>{tr(rotulo)}</em>
      </span>
    </a>
  )
}

function Destaques({ jogadores, porRating, totalRounds, nomeTime }) {
  const tr = useT()
  const mvp = porRating[0]
  const maisKills = maior(jogadores, e => e.kills)
  const maisDano = maior(jogadores, e => e.dano)
  const comRounds = jogadores.filter(e => e.rounds > 0)
  const melhorKast = comRounds.length ? maior(comRounds, kastPct) : mvp
  const entry = maior(jogadores, e => e.primeirasKills)
  const hs = mvp.kills ? 100 * mvp.headshots / mvp.kills : 0
  const classe = classeRating(mvp.rating)
  const recordes = [
    [maisKills, maisKills.kills, 'Mais kills'],
    [maisDano, maisDano.dano, 'Maior dano'],
    [melhorKast, f(kastPct(melhorKast), 1) + '%', 'KAST'],
    [entry, entry.primeirasKills, 'First kills'],
  ]
  return (
    <section className="resultado-mvp revelar">
      <h2>{tr('MVP da partida')}</h2>
      <div className="resultado-mvp-corpo">
        <CardJogadorMvp jogador={mvp} time={nomeTime(mvp.time)}/>
        <div className="resultado-mvp-rating"><RatingBadge rating={mvp.rating} extra="rt-destaque"/><span className={'rt-txt rt-' + classe}>{tr(TEXTO_RATING[classe])}</span><small>Rating HLTV 1.0</small></div>
        <dl className="resultado-mvp-estatisticas">
          {[[mvp.kills + '/' + mvp.mortes + '/' + mvp.assistencias, 'K/D/A'], [f(mvp.dano / totalRounds, 1), 'ADR'], [f(hs, 1) + '%', '% de HS'], [f(kastPct(mvp), 1) + '%', 'KAST']].map(([valor, rotulo]) => <div key={rotulo}><dt>{tr(rotulo)}</dt><dd>{valor}</dd></div>)}
        </dl>
        <div className="resultado-recordes resultado-recordes-completos">{recordes.map(([e, valor, rotulo]) => <a href={linkPerfil(e.steamId)} key={rotulo}>
          <FotoJogador e={e} tamanho={36}/>
          <b className="resultado-recorde-nome">{e.nome}</b><div><b>{valor}</b><span>{tr(rotulo)}</span></div>
        </a>)}</div>
      </div>
    </section>
  )
}

function Rounds({ d, nomeTime }) {
  const tr = useT()
  const [aviso, setAviso] = useState(null)
  useEffect(() => {
    const fechar = () => setAviso(null)
    const teclado = e => { if (e.key === 'Escape') fechar() }
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    window.addEventListener('keydown', teclado)
    return () => {
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
      window.removeEventListener('keydown', teclado)
    }
  }, [])
  const mostrar = (evento, round, indice, time) => {
    const rect = evento.currentTarget.getBoundingClientRect()
    const largura = Math.min(280, window.innerWidth - 24)
    setAviso({ round, indice, time, largura,
      x: Math.max(12, Math.min(rect.left + rect.width / 2 - largura / 2, window.innerWidth - largura - 12)),
      y: rect.bottom + 10,
      acima: rect.bottom + 190 > window.innerHeight,
      topo: rect.top - 10,
    })
  }
  return (
    <section className="resultado-rounds revelar" aria-label={tr('Rounds')}>
      <div className="resultado-rounds-grade" style={{ '--rounds': d.rounds.length }}>
        <span/>{d.rounds.map((r, i) => <span className="resultado-round-num" key={i}>{i + 1}</span>)}
        {['A', 'B'].map(time => <div className={'resultado-round-linha round-' + time} key={time}>
          <span className="resultado-round-time"><span className="resultado-mini-logo"><FotoDonoTime d={d} t={time}/></span>{nomeTime(time)}</span>
          {d.rounds.map((round, i) => {
            const [Icone, texto] = motivo(round.motivo)
            const lado = ladoDoRound(round, time)
            const ganhou = round.time === time
            const id = 'round-aviso-' + time + '-' + i
            return <span key={i} tabIndex={0} role="img"
              className={'resultado-round-cel lado-' + (lado || 'desconhecido') + (trocaDeLado(i, d.maxRounds || 24, d.roundsProrrogacao || 6) ? ' troca-lado' : '')}
              aria-label={tr('Round') + ' ' + (i + 1) + ' · ' + nomeTime(time) + ' · ' + (lado || tr('Lado não informado')) + ' · ' + tr(ganhou ? 'Vitória' : 'Derrota') + ' · ' + tr(texto)}
              aria-describedby={aviso?.indice === i && aviso?.time === time ? id : undefined}
              onMouseEnter={e => mostrar(e, round, i, time)} onMouseLeave={() => setAviso(null)}
              onFocus={e => mostrar(e, round, i, time)} onBlur={() => setAviso(null)}>
              {ganhou ? <Icone/> : <i/>}
            </span>
          })}
        </div>)}
      </div>
      <div className="resultado-round-legenda"><span className="legenda-ct"><i/> CT</span><span className="legenda-tr"><i/> TR</span><small>{tr('Passe o mouse sobre um round para ver os detalhes.')}</small></div>
      {aviso && createPortal(<div className={'resultado-round-tooltip lado-' + (ladoDoRound(aviso.round, aviso.time) || 'desconhecido')}
        id={'round-aviso-' + aviso.time + '-' + aviso.indice} role="tooltip"
        style={{ left: aviso.x, top: aviso.acima ? aviso.topo : aviso.y, width: aviso.largura, transform: aviso.acima ? 'translateY(-100%)' : undefined }}>
        <strong>{tr('Round')} {aviso.indice + 1} <span>{tr(aviso.round.time === aviso.time ? 'Vitória' : 'Derrota')}</span></strong>
        <div><b>{nomeTime(aviso.time)}</b><span>{tr('Lado')}: {ladoDoRound(aviso.round, aviso.time) || tr('Não informado')}</span></div>
        <p>{tr(motivo(aviso.round.motivo)[1])}</p>
        <small>{tr('Vencedor')}: {nomeTime(aviso.round.time)} · {ladoDoRound(aviso.round, aviso.round.time) || tr('Lado não informado')}</small>
      </div>, document.body)}
    </section>
  )
}

// Utilitários de cada jogador (partidas antes desta versão do plugin não têm: a aba nem aparece)
const seg = (v) => `${f(v || 0, 1)}s`
const TIPOS_UTIL = [
  ['flash', 'F', 'Flash'],
  ['he', 'H', 'HE'],
  ['smoke', 'S', 'Smoke'],
  ['molotov', 'M', 'Molotov/incendiária'],
]

function TabelaUtil({ doTime, mvp }) {
  const tr = useT()
  return (
    <div className="tabela">
      <table className="tabela-util">
        <thead>
          <tr>
            <th>{tr('JOGADOR')}</th>
            <th title={tr('Granadas lançadas (F flash · H HE · S smoke · M molotov)')}>{tr('LANÇADOS')}</th>
            <th title={tr('Compradas e não lançadas')}>{tr('NÃO USADOS')}</th>
            <th title={tr('Dano de HE e fogo nos inimigos')}>{tr('DANO UTIL.')}</th>
            <th title={tr('Dano de HE e fogo recebido dos inimigos')}>{tr('DANO RECEBIDO')}</th>
            <th title={tr('Dano de HE e fogo nos próprios aliados')}>{tr('DANO EM ALIADOS')}</th>
            <th title={tr('Inimigos cegos pelas suas flashes (mais de 0,5s)')}>{tr('INIMIGOS CEGOS')}</th>
            <th title={tr('Tempo somado dos inimigos cegos')}>{tr('TEMPO CEGO')}</th>
            <th title={tr('Kills de colegas em inimigos cegos pela sua flash')}>FLASH ASSIST</th>
            <th title={tr('Aliados cegos pelas suas flashes')}>{tr('ALIADOS CEGOS')}</th>
            <th title={tr('Tempo somado dos aliados cegos')}>{tr('TEMPO ALIADOS')}</th>
          </tr>
        </thead>
        <tbody>
          {doTime.map((e, linha) => {
            const u = e.util || {}
            const lancados = TIPOS_UTIL.reduce((s, [k]) => s + (u[k] || 0), 0) + (u.decoy || 0)
            return (
              <tr key={e.steamId} style={{ '--i': linha }}>
                <td>
                  <a className="player" href={linkPerfil(e.steamId)}>
                    <FotoJogador e={e} tamanho={32}/>
                    <span>{e.nome}</span>
                    {e === mvp && (
                      <span className="estrela" title={tr('MVP da partida')}>
                        ★
                      </span>
                    )}
                  </a>
                </td>
                <td>
                  <span className="util-total">{lancados}</span>
                  <span className="util-tipos">
                    {TIPOS_UTIL.map(([k, letra, nome]) => (
                      <i key={k} className={`util-${k}`} title={`${tr(nome)}: ${u[k] || 0}`}>
                        {letra}
                        {u[k] || 0}
                      </i>
                    ))}
                  </span>
                </td>
                <td>{u.naoUsados ?? 0}</td>
                <td className={u.dano > 0 ? 'pos' : ''}>{u.dano ?? 0}</td>
                <td>{u.danoRecebido ?? 0}</td>
                <td className={u.danoAliados > 0 ? 'neg' : ''}>{u.danoAliados ?? 0}</td>
                <td className={u.inimigosCegos > 0 ? 'pos' : ''}>{u.inimigosCegos ?? 0}</td>
                <td>{seg(u.tempoCegoInimigos)}</td>
                <td className={u.flashAssists > 0 ? 'pos' : ''}>{u.flashAssists ?? 0}</td>
                <td className={u.aliadosCegos > 0 ? 'neg' : ''}>{u.aliadosCegos ?? 0}</td>
                <td>{seg(u.tempoCegoAliados)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaTime({ d, t, jogadores, vencedor, mvp, totalRounds, nomeTime, aba }) {
  const tr = useT()
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
  // Nível estilo FACEIT: XP ganho/perdido neste mapa e o nível depois dele (vem do deploy em d.xp; + ajuste do admin)
  const perfis = usePerfis()
  const temXp = d.xp && Object.keys(d.xp).length > 0

  return (
    <div className={`team-card spot team-${t}`}>
      <div className="team-head">
        <span className={'resultado-emblema emblema-'+t}><FotoDonoTime d={d} t={t}/></span>
        <span className={`team-name t-${t}`}>{nomeTime(t)}</span>
        <span className={`res ${classe}`}>{tr(texto)}</span>
        <div className="team-meta">
          <span>
            {tr('Média da equipe')} <RatingBadge rating={media} extra="rt-mini" />
          </span>
          <span className="sep" />
          <span title={tr('Neura Pontos que cada jogador do time recebe por este mapa')}>
            {tr('Pontos base por jogador')} <b className="team-pontos">+{pontosDaPartida(vencedor === t, d.inicio)} NP</b>
          </span>
          <span className="sep" />
          <span>
            {tr('Primeiro half')} <b>{half1}</b>
          </span>
          <span>
            {tr('Segundo half')} <b>{half2}</b>
          </span>
          {prorrogacao >= 0 && (
            <span>
              {tr('Prorrogação')} <b>{prorrogacao}</b>
            </span>
          )}
        </div>
      </div>
      {aba === 'util' ? (
        <TabelaUtil doTime={doTime} mvp={mvp} />
      ) : (
      <div className="tabela resultado-tabela resultado-tabela-completa" role="region" aria-label={tr('Estatísticas') + ' · ' + nomeTime(t)} tabIndex={0}>
        <table>
          <colgroup><col className="col-jogador"/><col className="col-nivel"/><col className="col-rating"/>{Array.from({length: 16}, (_, i) => <col key={i}/>)}<col className="col-np"/></colgroup>
          <thead><tr>
            <th scope="col">{tr('Jogador')}</th><th scope="col">{tr('Nível')}</th><th scope="col" className="col-rt">Rating</th>
            {['K', 'D', 'A', '+/-', 'ADR', 'K/D', 'K/R', 'HS', 'HS%', 'KAST', 'FK-FD', '5K', '4K', '3K', '2K', 'MVPs'].map(n => <th scope="col" key={n}>{n}</th>)}
            <th scope="col" title={tr('Pontos base da partida, sem o bônus Premium individual')}>NP</th>
          </tr></thead>
          <tbody>{doTime.map(e => {
            const ganho = ganhoDe(d, e, vencedor, mvp)
            const registro = d.xp?.[e.steamId]
            const nivel = registro ? nivelDe(Number(registro.total) + (Number(perfis[e.steamId]?.xp) || 0), registro.mapas).nivel : null
            const saldo = e.kills - e.mortes
            const kd = e.mortes ? e.kills / e.mortes : e.kills
            const kr = e.kills / Math.max(1, e.rounds > 0 ? e.rounds : totalRounds)
            return <tr key={e.steamId} className={e === mvp ? 'resultado-jogador-mvp' : ''}>
              <td><a className="player" href={linkPerfil(e.steamId)}><FotoJogador e={e} tamanho={32}/><span>{e.nome}</span>{e === mvp && <IconeUI tipo="estrela" className="resultado-estrela" tamanho={14} title={tr('MVP da partida')}/>}</a></td>
              <td><div className="resultado-nivel-xp">{nivel !== null ? <SeloNivel nivel={nivel} tamanho={24}/> : <span className="resultado-nivel-pendente" title={tr('Nível deste mapa ainda não registrado')}>—</span>}<div><b className={ganho.xp < 0 ? 'neg' : 'pos'} title={ganho.estimado ? tr('XP calculado; aguardando confirmação do registro.') : tr('XP registrado nesta partida')}>{ganho.xp !== 0 && <span aria-hidden="true">{ganho.xp > 0 ? '↑' : '↓'} </span>}{Math.abs(ganho.xp)} XP{ganho.estimado && ' *'}</b><StatusConsumivel tipo={ganho.efeito?.tipo} base={ganho.base} delta={ganho.efeito?.delta} compacto/></div></div></td>
              <td className="col-rt"><RatingBadge rating={e.rating}/></td>
              <td>{e.kills}</td><td>{e.mortes}</td><td>{e.assistencias}</td><td className={saldo >= 0 ? 'pos' : 'neg'}>{comSinal(saldo)}</td>
              <td>{f(e.dano / totalRounds, 1)}</td><td className={kd >= 1 ? 'pos' : 'neg'}>{f(kd)}</td><td>{f(kr)}</td><td>{e.headshots ?? 0}</td><td>{f(e.kills ? 100 * e.headshots / e.kills : 0, 1)}%</td><td>{f(kastPct(e), 1)}%</td>
              <td>{e.primeirasKills ?? 0}-{e.primeirasMortes ?? 0}</td><td>{e.k5 ?? 0}</td><td>{e.k4 ?? 0}</td><td>{e.k3 ?? 0}</td><td>{e.k2 ?? 0}</td><td>{e.mvps ?? 0}</td><td className="resultado-np-base">+{ganho.np}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      )}
    </div>
  )
}

const comSinal = n => (n > 0 ? '+' : '') + n
function ganhoDe(d, e, vencedor, mvp) {
  const empate = !vencedor
  const venceu = e.time === vencedor
  const calculado = xpDaPartida({ venceu, empate, rating: e.rating, mvp: e.steamId === mvp?.steamId })
  const base = Number(d.xp?.[e.steamId]?.ganho ?? calculado)
  const efeito = d.efeitos?.[e.steamId]
  return { np: pontosDaPartida(venceu, d.inicio), base, efeito, xp: base + (Number(efeito?.delta) || 0), estimado: d.xp?.[e.steamId]?.ganho == null }
}
function GanhoJogador({ d, e, vencedor, mvp }) {
  const g = ganhoDe(d, e, vencedor, mvp)
  return <div className="resultado-ganho-jogador"><span>+{g.np} NP <small>base</small></span><b className={g.xp < 0 ? 'neg' : 'pos'} title={g.estimado ? 'XP calculado pelas regras da partida; aguardando registro.' : 'XP registrado nesta partida'}>{comSinal(g.xp)} XP{g.estimado && ' *'}</b><StatusConsumivel tipo={g.efeito?.tipo} base={g.base} delta={g.efeito?.delta} compacto/></div>
}
function PontosPremiumMapa({ d, vencedor }) {
  const t = useT()
  const conta = useConta()
  const jogador = d.jogadores?.find(j => j.steamId === conta?.id)
  const recibos = usePartidasServidor(!!jogador)
  if (!jogador) return null
  const mvp = maior(d.jogadores, e => e.rating)
  const g = ganhoDe(d, jogador, vencedor, mvp)
  const bonus = Number(recibos?.partidas?.[d.caminho]) || 0
  const recente = recibos?.recentes?.find(p => p.caminho === d.caminho)
  const base = Number(recente?.xpBase ?? g.base)
  const xp = Number(recente?.xp ?? g.xp)
  const tipo = g.efeito?.tipo || recente?.consumivel
  const delta = xp - base
  const desempenho = vencedor ? (XP.rating.find(([min]) => jogador.rating >= min)?.[1] || 0) : 0
  const resultado = !vencedor ? 0 : jogador.time === vencedor ? XP.vitoria : XP.derrota
  const bonusMvp = vencedor && jogador.steamId === mvp.steamId ? XP.mvp : 0
  const ajuste = base - resultado - desempenho - bonusMvp
  return <section className="resultado-pontos">
    <h2>{t('Seus pontos')}</h2>
    <div className="resultado-pontos-grade"><div><img src="/assets/logos/logo-np-64.png" alt=""/><span><b>+{g.np + bonus} NP</b><small>{t('Pontos da partida')}</small></span></div><div><IconeUI tipo="boost" tamanho={36}/><span><b>{comSinal(xp)} XP</b><small>{t('Experiência da partida')}</small></span></div></div>
    <div className="resultado-calculos"><h3>{t('Cálculo de NP')}</h3><dl><div><dt>{t('Resultado da partida')}</dt><dd>+{g.np} NP</dd></div><div><dt>Premium</dt><dd>{recibos ? '+' + bonus + ' NP' : t('Consultando recibo…')}</dd></div><div className="calculo-total"><dt>{t('Total')}</dt><dd>+{g.np + bonus} NP{!recibos && ' *'}</dd></div></dl>
    <h3>{t('Cálculo de XP')}</h3><dl><div><dt>{t('Resultado da partida')}</dt><dd>{comSinal(resultado)} XP</dd></div><div><dt>Rating {f(jogador.rating)}</dt><dd>{comSinal(desempenho)} XP</dd></div><div><dt>MVP</dt><dd>{comSinal(bonusMvp)} XP</dd></div>{ajuste !== 0 && <div><dt>{t('Ajuste do XP registrado / limite')}</dt><dd>{comSinal(ajuste)} XP</dd></div>}<div><dt>{t('Subtotal')}</dt><dd>{comSinal(base)} XP</dd></div>{tipo && <div><dt>{tipo === 'boost' ? 'Boost' : 'Freeze'}</dt><dd>{comSinal(delta)} XP</dd></div>}<div className="calculo-total"><dt>{t('Total')}</dt><dd>{comSinal(xp)} XP</dd></div></dl>
    {tipo && <div className="resultado-efeito"><StatusConsumivel tipo={tipo} base={base} delta={delta}/><small>{tipo === 'boost' ? t('Boost dobra o ganho positivo de XP. Na derrota, não concede bônus.') : t('Freeze protege a perda de XP. Na vitória, mantém o ganho normal.')}</small></div>}
    <small className="resultado-recibo-nota">{t('Premium acrescenta NP; Boost e Freeze afetam somente XP.')}{g.estimado && !recente && ' ' + t('XP calculado; aguardando confirmação do registro.')}{!recibos && ' ' + t('O total de NP ainda não inclui um possível bônus Premium.')}</small></div>
  </section>
}

function Conteudo({ d }) {
  const tr = useT()
  const [comecou, setComecou] = useState(false)
  // Outros mapas da mesma série: vêm com a página (deploy) e são conferidos de novo no histórico ao abrir
  const [jogosSite, setJogos] = useState(d.serieJogos ?? null)
  const recentes = useRecentes(15000, !!d.serie?.id)
  const jogos = jogosSite && juntarPartidas(jogosSite, recentes.filter((p) => p.serieId === d.serie?.id)) // mapa novo da série aparece pelo worker
  // Anúncio da série (partidas/series.json): mapa ao vivo e cancelamento, antes de o mapa terminar
  const [anuncio, setAnuncio] = useState(null)
  useAoVivo('/partidas/series.json', (lista) => Array.isArray(lista) && setAnuncio(lista.find((a) => a.id === d.serie.id) || null), {
    ativo: !!d.serie?.id,
    selecionar: (lista) => (Array.isArray(lista) ? lista.find((a) => a.id === d.serie.id) || null : null),
  })
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

  // Série cancelada: contagem de 5 minutos; no fim a página avisa que a partida saiu do site
  const fimSerie = fimDaSerie(anuncio)
  const agora = useRelogio(fimSerie !== null)

  const nomeTime = (t) => (t === 'A' ? d.timeA : d.timeB)
  const vencedor = d.placarA > d.placarB ? 'A' : d.placarB > d.placarA ? 'B' : null
  const totalRounds = Math.max(1, d.placarA + d.placarB)
  const jogadores = (d.jogadores || []).filter((e) => e.time && (e.rounds > 0 || e.kills + e.mortes > 0))
  // Melhor rating primeiro (no empate, a ordem original)
  const porRating = [...jogadores].sort((a, b) => b.rating - a.rating)
  const mvp = jogadores.length ? maior(jogadores, (e) => e.rating) : null
  // Aba das tabelas: geral ou utilitários (só aparece se a partida tiver os utilitários)
  const temUtil = jogadores.some((e) => e.util)
  const [aba, setAba] = useState('geral')

  // Contagem acabou: a série saiu do site (a limpeza apaga a página e a demo; até lá, só o aviso)
  if (fimSerie !== null && agora !== null && agora >= fimSerie)
    return (
      <main className="wrap partida-conteudo">
        <section className="serie-removida">
          <span className="kicker">{tr('SÉRIE CANCELADA')}</span>
          <h1>{tr('Esta partida foi removida do site')}</h1>
          <p>{tr('A série foi cancelada e, depois de 5 minutos, tudo dela sai do site: partidas, estatísticas e demos.')}</p>
          <a className="serie-removida-btn" href="/partidas/">
            {tr('Ver partidas')}
          </a>
        </section>
      </main>
    )

  return (
    <div className="resultado-pagina" style={arteDoBanner(d.mapa)}>
      <div id="carregando" className={comecou ? 'fim' : ''} aria-hidden="true">
        <div className="ld">
          <img src="/assets/logos/logo-np-64.png" alt="" />
          <span className="mono-label">{tr('CARREGANDO ESTATÍSTICAS')}</span>
          <div className="barra" />
        </div>
      </div>
      <Banner d={d} nomeTime={nomeTime} vencedor={vencedor} porRating={porRating} comecou={comecou} />
      <main className="wrap partida-conteudo pt-v2">
        {d.serie?.mapas?.length > 1 && <Serie serie={d.serie} nomeTime={nomeTime} jogos={jogos} caminhoAtual={d.caminho} anuncio={anuncio} agora={agora} />}
        {d.rounds?.length > 0 && <Rounds d={d} nomeTime={nomeTime} />}
        {/* Grade do computador (referência): as tabelas ocupam ~2/3 à esquerda; MVP e pontos ficam no terço da direita */}
        <div className="pt-v2-grade">
        <div className="pt-v2-lado">
          {mvp && <Destaques jogadores={jogadores} porRating={porRating} totalRounds={totalRounds} nomeTime={nomeTime} />}
          <PontosPremiumMapa d={d} vencedor={vencedor} />
        </div>
        {/* Tabelas: vencedor primeiro */}
        <section className="section revelar pt-v2-tabelas">
          <div className="section-head">
            <span className="kicker">{tr('PLACAR')}</span>
            <h2>{tr('Estatísticas dos jogadores')}</h2>
          </div>
          {temUtil && (
            <div className="abas-tabela" role="tablist" aria-label={tr('Estatísticas')}>
              {[
                ['geral', 'Resumo'],
                ['util', 'Utilitários'],
              ].map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'active' : ''} onClick={() => setAba(id)}>
                  {tr(rotulo)}
                </button>
              ))}
            </div>
          )}
          {(vencedor === 'B' ? ['B', 'A'] : ['A', 'B']).map((t) => (
            <TabelaTime key={t} d={d} t={t} jogadores={jogadores} vencedor={vencedor} mvp={mvp} totalRounds={totalRounds} nomeTime={nomeTime} aba={aba} />
          ))}
          {aba === 'geral' && <p className="resultado-nota-tabela">{tr('NP base por jogador. O detalhamento Premium aparece nos seus pontos. * XP calculado: aguardando confirmação do registro.')}</p>}
          {aba === 'util' && <GraficoUtil jogadores={jogadores} ordem={vencedor === 'B' ? ['B', 'A'] : ['A', 'B']} nomeTime={nomeTime} mvp={mvp} />}
        </section>
        </div>
      </main>
      <p className="wrap gerado">{tr('Gerado pelo BaseComp em {data}', { data: dataBr(d.gerado, tr.idioma) })} · Rating HLTV 1.0</p>
    </div>
  )
}

// dados: partida.json (vem junto com a página gerada no deploy; no `npm run dev` é buscado da pasta da partida)
export default function Partida({ dados: inicial }) {
  const tr = useT()
  const [d, setD] = useState(inicial ?? null)
  const [erro, setErro] = useState(false)
  const [efeitos, setEfeitos] = useState(null)

  useEffect(() => {
    const caminho = inicial?.caminho || decodeURIComponent(location.pathname.replace(/^\/partidas\//, '').replace(/\/$/, ''))
    if (!caminho) return
    let vivo = true
    const carregar = () => lerApi(`/partidas/efeitos?c=${encodeURIComponent(caminho)}`)
      .then(dados => { if (vivo) setEfeitos(dados) }).catch(() => {})
    carregar()
    window.addEventListener('np-partida', carregar)
    window.addEventListener('focus', carregar)
    return () => { vivo = false; window.removeEventListener('np-partida', carregar); window.removeEventListener('focus', carregar) }
  }, [inicial?.caminho])

  useEffect(() => {
    if (inicial) return
    lerJson('partida.json').then((j) => (j ? setD(j) : setErro(true)))
  }, [inicial])

  useEffect(() => {
    if (d) document.title = `${d.timeA} ${d.placarA} x ${d.placarB} ${d.timeB} — ${nomeMapa(d.mapa)}`
  }, [d])

  const perfis = usePerfis()
  const dApelidos = useMemo(() => (d ? { ...d, efeitos: efeitos || d.efeitos, jogadores: comApelidos(d.jogadores.map(e => ({ ...e, nomeOriginal: e.nome })), perfis) } : d), [d, perfis, efeitos]) // apelido do site no lugar do nome do jogo
  return (
    <Layout pagina="partidas" trilha={[{ rotulo: 'Partidas', href: '/partidas/' }, ...(d ? [{ rotulo: nomeMapa(d.mapa) }] : [])]}>
      {d ? (
        <Conteudo d={dApelidos} />
      ) : (
        <main className="wrap partida-conteudo">
          {erro ? (
            <p className="gerado" style={{ padding: '80px 0' }}>
              {tr('Partida não encontrada.')}
            </p>
          ) : (
            <CarregandoNP />
          )}
        </main>
      )}
    </Layout>
  )
}
