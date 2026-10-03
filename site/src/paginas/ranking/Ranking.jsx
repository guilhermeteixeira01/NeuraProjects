import { useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { lerJson, urlOk } from '../../comum/dados.js'

const TOP = 15
const MIN_MAPAS = 1 // mapas mínimos para entrar no ranking (suba quando tiver mais partidas)

// Métricas que podem ordenar o ranking: [chave, rótulo do botão, rótulo curto, casas decimais, sufixo]
const METRICAS = [
  ['rating', 'Rating', 'RATING', 2, ''],
  ['kills', 'Kills', 'KILLS', 0, ''],
  ['adr', 'ADR', 'ADR', 1, ''],
  ['kast', 'KAST', 'KAST', 1, '%'],
  ['kd', 'K/D', 'K/D', 2, ''],
  ['hsPct', 'HS%', 'HS%', 1, '%'],
  ['winRate', 'Vitórias', 'VITÓRIAS', 0, '%'],
]

const fmt = (v, casas) => Number(v || 0).toFixed(casas)
const classeRating = (r) => (r >= 1.5 ? 'alto' : r >= 1.2 ? 'bom' : r >= 0.9 ? 'medio' : 'baixo')
const perfil = (j) => `https://steamcommunity.com/profiles/${encodeURIComponent(j.steamId)}`
const iniciais = (nome) => String(nome || '?').trim().slice(0, 2).toUpperCase()

// Data/hora sempre no horário de Brasília (a página é gerada num servidor em UTC)
function dataBr(iso) {
  const d = new Date(iso)
  return isNaN(d)
    ? ''
    : d
        .toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
        .replace(',', '')
}

function Avatar({ j, classe }) {
  const [erro, setErro] = useState(false)
  if (!urlOk(j.avatar) || erro) {
    return (
      <span className={`${classe} ini`}>
        <span>{iniciais(j.nome)}</span>
      </span>
    )
  }
  return <img className={classe} src={j.avatar} alt="" loading="lazy" onError={() => setErro(true)} />
}

// ── CS Rating do Premier (vem da Leetify no deploy; null = jogador sem conta na Leetify) ──
const faixaPremier = (v) => (v >= 30000 ? 7 : v >= 25000 ? 6 : v >= 20000 ? 5 : v >= 15000 ? 4 : v >= 10000 ? 3 : v >= 5000 ? 2 : 1)
// Igual ao jogo: milhares grandes e o resto pequeno (23,524)
const partesPremier = (v) => (v < 1000 ? [String(v), ''] : [String(Math.floor(v / 1000)), ',' + String(v % 1000).padStart(3, '0')])
// Atraso do brilho de cada badge: fixo por jogador (igual no HTML gerado e no navegador)
const atrasoBrilho = (id) => ((Number(String(id).slice(-4)) || 0) % 200) / 100

// Contagem animada de 0 até o rating (a cor da faixa acompanha enquanto sobe)
function Premier({ j }) {
  const alvo = j.premier > 0 ? j.premier : 0
  const [v, setV] = useState(alvo)

  useEffect(() => {
    if (!alvo || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const inicio = performance.now() + 350
    const duracao = 1400
    let quadro
    const passo = (agora) => {
      const t = Math.min(1, Math.max(0, (agora - inicio) / duracao))
      setV(Math.round(alvo * (1 - Math.pow(1 - t, 3)))) // desacelera no fim
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    setV(0)
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo])

  if (!alvo) {
    return (
      <span className="premier sem" title="Sem CS Rating do Premier (precisa de conta na leetify.gg)">
        <b>---</b>
      </span>
    )
  }
  const [mil, resto] = partesPremier(v)
  return (
    <span
      className={`premier t${faixaPremier(v)}`}
      style={{ '--pd': `${atrasoBrilho(j.steamId).toFixed(2)}s` }}
      title={`CS Rating do Premier: ${alvo.toLocaleString('pt-BR')}`}
    >
      <b>{mil}</b>
      <small>{resto}</small>
    </span>
  )
}

function Forma({ j }) {
  return (
    <span className="forma">
      {(j.ultimos || []).map((u, i) => (
        <a
          key={i}
          className={u.venceu ? 'v' : 'd'}
          href={`/partidas/${String(u.caminho).split('/').map(encodeURIComponent).join('/')}/`}
          title={`${u.mapa} · rating ${fmt(u.rating, 2)} · ${u.venceu ? 'vitória' : 'derrota'}`}
        >
          {u.venceu ? 'V' : 'D'}
        </a>
      ))}
    </span>
  )
}

function Podio({ j, pos, m }) {
  const [chave, , rotulo, casas, suf] = m
  return (
    <div className={`pod p${pos}`} data-pos={pos}>
      {pos === 1 && (
        <svg className="coroa" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z" />
        </svg>
      )}
      <a className="pod-av" href={perfil(j)} target="_blank" rel="noopener">
        <Avatar j={j} classe="" />
        <span className="pod-pos">#{pos}</span>
      </a>
      <a className="pod-nome" href={perfil(j)} target="_blank" rel="noopener">
        {j.nome}
      </a>
      <Premier j={j} />
      <span className="pod-valor">
        <b>
          {fmt(j[chave], casas)}
          {suf}
        </b>
        <span className="mono">{rotulo}</span>
      </span>
      <div className="pod-mini">
        <div>
          <b>{chave === 'rating' ? fmt(j.kd, 2) : fmt(j.rating, 2)}</b>
          <span>{chave === 'rating' ? 'K/D' : 'RATING'}</span>
        </div>
        <div>
          <b>{fmt(j.adr, 1)}</b>
          <span>ADR</span>
        </div>
        <div>
          <b>{j.kills}</b>
          <span>KILLS</span>
        </div>
        <div>
          <b>{j.mapas}</b>
          <span>MAPAS</span>
        </div>
      </div>
      <Forma j={j} />
    </div>
  )
}

function Linha({ j, pos, m, max, i }) {
  const [chave, , , casas, suf] = m
  const w = max > 0 ? Math.max(3, (j[chave] / max) * 100) : 0
  return (
    <div className="linha" style={{ '--i': i }}>
      <span className="pos-n">{pos}</span>
      <span className="jog">
        <Avatar j={j} classe="av" />
        <span className="jog-txt">
          <a href={perfil(j)} target="_blank" rel="noopener">
            {j.nome}
          </a>
          <Premier j={j} />
        </span>
      </span>
      <span className="barra-val">
        <b>
          {fmt(j[chave], casas)}
          {suf}
        </b>
        <span className="trilho">
          <i style={{ '--w': `${w.toFixed(1)}%` }} />
        </span>
      </span>
      {chave === 'rating' ? (
        <span className="num-c c-rt">{j.kills}</span>
      ) : (
        <span className="num-c c-rt">
          <span className={`rt rt-${classeRating(j.rating)}`} title="Rating médio">
            {fmt(j.rating, 2)}
          </span>
        </span>
      )}
      <span className="num-c c-kd">{fmt(j.kd, 2)}</span>
      <span className="num-c c-adr">{fmt(j.adr, 1)}</span>
      <span className="num-c c-kast">{fmt(j.kast, 0)}%</span>
      <span className="num-c c-hs">{fmt(j.hsPct, 0)}%</span>
      <span className="c-forma">
        <Forma j={j} />
      </span>
    </div>
  )
}

function Conteudo({ dados, chave }) {
  const m = METRICAS.find((x) => x[0] === chave) || METRICAS[0]
  const top = dados.jogadores
    .filter((j) => j.mapas >= MIN_MAPAS)
    .sort((a, b) => b[m[0]] - a[m[0]] || b.rating - a.rating || b.kills - a.kills)
    .slice(0, TOP)

  if (top.length === 0) {
    return <p className="vazio">Ainda não há jogadores no ranking. Assim que uma partida terminar no servidor, ela entra aqui.</p>
  }

  const resto = top.slice(3)
  const max = resto.length ? Math.max(...top.map((j) => j[m[0]])) : 0
  return (
    // key: troca de métrica remonta o bloco e as animações tocam de novo
    <div key={chave} className="anim">
      <div className="podio">
        {top.slice(0, 3).map((j, i) => (
          <Podio key={j.steamId} j={j} pos={i + 1} m={m} />
        ))}
      </div>
      {resto.length > 0 && (
        <div className="tabela-card">
          <div className="linha cab">
            <span className="num-c">#</span>
            <span>JOGADOR</span>
            <span className="sel">{m[2]}</span>
            <span className="num-c c-rt">{m[0] === 'rating' ? 'KILLS' : 'RATING'}</span>
            <span className="num-c c-kd">K/D</span>
            <span className="num-c c-adr">ADR</span>
            <span className="num-c c-kast">KAST</span>
            <span className="num-c c-hs">HS%</span>
            <span className="c-forma">FORMA</span>
          </div>
          {resto.map((j, i) => (
            <Linha key={j.steamId} j={j} pos={i + 4} m={m} max={max} i={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function Esqueleto() {
  return (
    <>
      <div className="podio">
        <div className="pod esq-pod p2" />
        <div className="pod esq-pod p1" />
        <div className="pod esq-pod p3" />
      </div>
      <div className="tabela-card">
        <div className="esq" />
        <div className="esq" />
        <div className="esq" />
      </div>
    </>
  )
}

const normalizar = (d) => (d && Array.isArray(d.jogadores) ? d : { jogadores: [], partidas: 0 })

// dados: ranking.json (vem junto com a página gerada no deploy; no `npm run dev` é buscado aqui)
export default function Ranking({ dados: inicial }) {
  const [dados, setDados] = useState(inicial ? normalizar(inicial) : null)
  const [chave, setChave] = useState('rating')

  useEffect(() => {
    if (!inicial) lerJson('/ranking/ranking.json').then((d) => setDados(normalizar(d)))
    const daUrl = location.hash.slice(1)
    if (METRICAS.some((m) => m[0] === daUrl)) setChave(daUrl)
  }, [inicial])

  const escolher = (c) => {
    history.replaceState(null, '', c === 'rating' ? location.pathname : `#${c}`)
    setChave(c)
  }

  const quando = dados && dataBr(dados.atualizado)
  return (
    <Layout pagina="ranking">
      <main>
        <section className="hero">
          <div className="hero-glow hero-glow-1" />
          <div className="hero-glow hero-glow-2" />
          <div className="wrap hero-inner">
            <div className="reveal">
              <span className="chip">
                <span className="ponto" />
                <span>{!dados ? 'CARREGANDO…' : quando ? `ATUALIZADO ${quando}` : 'SEM DADOS AINDA'}</span>
              </span>
              <h1>
                Top 15 <span className="destaque">jogadores</span>
              </h1>
              <p className="lead">
                Ranking montado com todas as partidas registradas no servidor. Cada mapa novo entra na conta sozinho: rating,
                ADR, KAST, kills e forma recente.
              </p>
            </div>
            <div className="resumo reveal" style={{ '--d': '.1s' }}>
              <div className="caixa">
                <span className="mono">JOGADORES</span>
                <b>{dados ? dados.jogadores.length : '—'}</b>
              </div>
              <div className="caixa">
                <span className="mono">MAPAS</span>
                <b>{dados ? dados.partidas || 0 : '—'}</b>
              </div>
              <div className="caixa">
                <span className="mono">KILLS</span>
                <b>{dados ? dados.jogadores.reduce((s, j) => s + (j.kills || 0), 0) : '—'}</b>
              </div>
            </div>
          </div>
        </section>

        <section className="secao" style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="barra-topo">
              <div className="metricas" role="tablist" aria-label="Ordenar ranking por">
                {dados &&
                  METRICAS.map(([c, rotulo]) => (
                    <button key={c} type="button" role="tab" aria-selected={c === chave} className={c === chave ? 'active' : ''} onClick={() => escolher(c)}>
                      {rotulo}
                    </button>
                  ))}
              </div>
              <span className="nota">{dados && `MÍNIMO DE ${MIN_MAPAS} MAPA${MIN_MAPAS === 1 ? '' : 'S'} · RATING HLTV 1.0`}</span>
            </div>
            <div id="conteudo">{dados ? <Conteudo dados={dados} chave={chave} /> : <Esqueleto />}</div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
