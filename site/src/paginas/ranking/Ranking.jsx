import { urlTrofeu } from '../../comum/trofeus.js'
import IconeUI from '../../comum/IconeUI.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from '../../comum/desempenho.js'
import Layout from '../../comum/Layout.jsx'
import { linkPerfil, useConta } from '../../comum/conta.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { Contador } from '../../comum/efeitos.jsx'
import { useAoVivo } from '../../comum/aoVivo.js'
import { PERSONAGENS, RAMOS, fundoCss } from '../../comum/assetsV2.js'
import Premier from '../../comum/Premier.jsx'
import { CargosDe, ComMoldura, IconeEquipe, TimeEscolhido, apelidoDe, useCardDe, usePerfis } from '../../comum/Moldura.jsx'
import { fundoCard } from '../../comum/cardsPerfil.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { nivelDe } from '../../comum/niveis.js'
import { MIN_MAPAS } from '../../comum/ranking.js'
import { useT } from '../../comum/i18n.js'
import { useAvatar } from '../../comum/avatares.js'
import { definirPreferencia, iniciar, lerPreferencia, parar } from './somRanking.js'

const TOP = 15

// Métricas que podem ordenar o ranking: [chave, rótulo do botão, rótulo curto, casas decimais, sufixo]
const METRICAS = [
  ['rating', 'Rating', 'RATING', 2, ''],
  ['kills', 'Kills', 'KILLS', 0, ''],
  ['adr', 'ADR', 'ADR', 1, ''],
  ['kast', 'KAST', 'KAST', 1, '%'],
  ['kd', 'K/D', 'K/D', 2, ''],
  ['hsPct', 'HS%', 'HS%', 1, '%'],
  ['winRate', 'Vitórias', 'VITÓRIAS', 0, '%'],
  ['xp', 'XP', 'XP', 0, ''],
]

// Ícone de cada botão de métrica
const ICONE_METRICA = { rating: 'trofeu', kills: 'caveira', adr: 'estatisticas', kast: 'check', kd: 'trocar', hsPct: 'partidas', winRate: 'coroa', xp: 'estrela' }

const fmt = (v, casas) => Number(v || 0).toFixed(casas)
const classeRating = (r) => (r >= 1.5 ? 'alto' : r >= 1.2 ? 'bom' : r >= 0.9 ? 'medio' : 'baixo')
const perfil = (j) => linkPerfil(j.steamId) // página de perfil do site (estatísticas e histórico)
const iniciais = (nome) => String(nome || '?').trim().slice(0, 2).toUpperCase()

// Data/hora sempre no horário de Brasília (a página é gerada num servidor em UTC)
function dataBr(iso, local = 'pt-BR') {
  const d = new Date(iso)
  return isNaN(d)
    ? ''
    : d
        .toLocaleString(local, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
        .replace(',', '')
}

function Avatar({ j, classe }) {
  const src = useAvatar(j.steamId, j.avatar) // foto atual da Steam (a do ranking é a da última partida)
  const [erro, setErro] = useState('')
  if (!urlOk(src) || erro === src) {
    return (
      <span className={`${classe} ini`}>
        <span>{iniciais(j.nome)}</span>
      </span>
    )
  }
  return <img className={classe} src={src} alt="" loading="lazy" onError={() => setErro(src)} />
}

function Forma({ j }) {
  const t = useT()
  return (
    <span className="forma">
      {(j.ultimos || []).map((u, i) => (
        <a
          key={i}
          className={u.venceu ? 'v' : 'd'}
          href={`/partidas/${String(u.caminho).split('/').map(encodeURIComponent).join('/')}/`}
          title={`${u.mapa} · rating ${fmt(u.rating, 2)} · ${u.venceu ? t('vitória') : t('derrota')}`}
        >
          {u.venceu ? t('V') : t('D')}
        </a>
      ))}
    </span>
  )
}

// Pódio (top 3). Quatro camadas independentes dentro de um wrapper que NÃO recorta (isolation + overflow visível):
//   1. cenário (.v2-pod-cenario): arredondado e com o recorte próprio, só o fundo;
//   2. personagem (.v2-pod-camada > img): PNG transparente, irmão do cenário e por cima dele; pode passar da borda de cima
//      (o recorte é só embaixo, na altura do card, porque o PNG vem cortado reto na cintura);
//   3. faixa de informações (.v2-pod-info): à frente da parte de baixo do personagem, com foto, nome, time, métrica e medalha;
//   4. número da colocação.
// Escala, largura e deslocamento de cada personagem ficam em ranking/v2.css (.p1, .p2, .p3), um por um. O card que o jogador
// escolheu no perfil continua aparecendo, atrás da faixa dele.
function PersonagemPodio({ arte }) {
  const video = useRef(null)
  const [erro, setErro] = useState(false)
  const [reproduzindo, setReproduzindo] = useState(false)
  useEffect(() => {
    const el = video.current
    if (!el) return
    el.muted = true
    el.defaultMuted = true
    const movimento = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visivel = true
    const atualizar = () => {
      if (!visivel || document.hidden || movimento.matches || desempenhoAtivo()) el.pause()
      else el.play().catch(() => {})
    }
    const observer = new IntersectionObserver(([entrada]) => { visivel = entrada.isIntersecting; atualizar() })
    observer.observe(el)
    movimento.addEventListener('change', atualizar)
    el.addEventListener('loadeddata', atualizar)
    window.addEventListener(EVENTO_DESEMPENHO, atualizar)
    document.addEventListener('visibilitychange', atualizar)
    atualizar()
    return () => {
      observer.disconnect()
      movimento.removeEventListener('change', atualizar)
      el.removeEventListener('loadeddata', atualizar)
      window.removeEventListener(EVENTO_DESEMPENHO, atualizar)
      document.removeEventListener('visibilitychange', atualizar)
      el.pause()
    }
  }, [erro, arte.video])
  return <>
    {(!reproduzindo || erro) && <img src={arte.src} width={arte.w} height={arte.h} alt="" />}
    {!erro && <video ref={video} src={arte.video} poster={arte.src} autoPlay muted loop playsInline preload="auto" style={{ opacity: reproduzindo ? 1 : 0 }} onPlaying={() => setReproduzindo(true)} onError={() => setErro(true)} />}
  </>
}

function Podio({ j, pos, m, eu }) {
  const card = useCardDe(j.steamId)
  const t = useT()
  const [chave, rotuloBotao, , casas, suf] = m
  const arte = PERSONAGENS.podio[pos - 1]
  const medalha = ['ouro', 'prata', 'bronze'][pos - 1]
  return (
    <article className={`v2-pod p${pos}${eu ? ' eu' : ''}${card ? ' com-card' : ''}`} style={card ? { '--card-fundo': fundoCard(card, true) } : undefined} aria-label={t('{n}º lugar: {nome}', { n: pos, nome: j.nome })}>
      <div className="v2-pod-cenario" aria-hidden="true" />
      <div className="v2-pod-camada" aria-hidden="true">
        <PersonagemPodio arte={arte} />
      </div>
      <img className="v2-pod-ramo" src={RAMOS[pos - 1].src} width="64" height="64" alt="" loading={pos === 1 ? 'eager' : 'lazy'} decoding="async" aria-hidden="true" draggable="false" />
      <div className="v2-pod-espaco" aria-hidden="true" />
      <div className="v2-pod-info">
        <a className="v2-pod-av" href={perfil(j)} aria-hidden="true" tabIndex={-1}>
          <Avatar j={j} classe="" />
        </a>
        <span className="v2-pod-quem">
          <a className="v2-pod-nome" href={perfil(j)}>{j.nome}</a>
          {eu && <span className="v2-selo v2-selo-azul">{t('Você')}</span>}
          <TimeEscolhido steamId={j.steamId} classe="v2-pod-time" />
        </span>
        <span className="v2-pod-valor">
          <small>{t(rotuloBotao)}</small>
          <b className="v2-num">
            {fmt(j[chave], casas)}
            {suf}
          </b>
        </span>
        <IconeUI tipo={pos === 1 ? 'coroa' : pos === 2 ? 'escudo' : 'medalha'} tamanho={pos === 1 ? 36 : 40} className={`v2-pod-medalha v2-pod-medalha-${medalha}`} />
      </div>
    </article>
  )
}

function Linha({ j, pos, m, max, i, eu }) {
  const t = useT()
  const [chave, , , casas, suf] = m
  const w = max > 0 ? Math.max(3, (j[chave] / max) * 100) : 0
  const trofeu = urlTrofeu(pos)
  return (
    <div className={`linha spot${eu ? ' eu' : ''}${trofeu ? ` linha-pod p${pos}` : ''}`} style={{ '--i': i }}>
      <span className={`pos-n${trofeu ? ' com-trofeu' : ''}`}>
        {pos <= 3 ? <img className="v2-ramo-mini" src={RAMOS[pos - 1].src} width="36" height="36" alt="" aria-hidden="true" loading="lazy" draggable="false" /> : pos}
        <span className="sr-only">#{pos}</span>
      </span>
      <span className="jog">
        <a className="jog-av" href={perfil(j)} aria-hidden="true" tabIndex={-1}>
          <ComMoldura steamId={j.steamId} emblema>
            <Avatar j={j} classe="av" />
          </ComMoldura>
        </a>
        {/* Sempre 2 linhas: nome + cargo; nível, Premier e time (todas as linhas da tabela com a mesma altura) */}
        <span className="jog-txt">
          <span className="jog-l1">
            <span className="jog-nome"><a href={perfil(j)}>{j.nome}</a><IconeEquipe steamId={j.steamId} /></span>
            <CargosDe steamId={j.steamId} classe="linha-cargos" max={1} />
          </span>
          <span className="jog-l2">
            {j.nivel > 0 && <SeloNivel nivel={j.nivel} tamanho={22} />}
            {j.premier > 0 && <Premier j={j} />}
            <TimeEscolhido steamId={j.steamId} classe="linha-time" />
          </span>
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
          <span className={`rt rt-${classeRating(j.rating)}`} title={t('Rating médio')}>
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
      <a className="v2-linha-mais" href={perfil(j)} aria-label={t('Ver perfil de {nome}', { nome: j.nome })} title={t('Ver perfil')}>
        <IconeUI tipo="mais" tamanho={18} />
      </a>
    </div>
  )
}

// eu: SteamID de quem está logado (destaque na lista e, fora do top, a posição dele embaixo)
function Conteudo({ dados, chave, eu, barra, busca = '' }) {
  const t = useT()
  const m = METRICAS.find((x) => x[0] === chave) || METRICAS[0]
  const todos = dados.jogadores
    .filter((j) => j.mapas >= MIN_MAPAS)
    .sort((a, b) => b[m[0]] - a[m[0]] || b.rating - a.rating || b.kills - a.kills)
  const top = todos.slice(0, TOP)
  const minhaPos = eu ? todos.findIndex((j) => j.steamId === eu) : -1
  // Com busca, a tabela mostra quem combina com o nome (em todo o ranking, na posição real); o pódio continua sendo o top 3
  const q = busca.trim().toLowerCase()
  const lista = q ? todos.map((j, i) => ({ j, pos: i + 1 })).filter(({ j }) => String(j.nome || '').toLowerCase().includes(q)) : top.map((j, i) => ({ j, pos: i + 1 }))

  if (top.length === 0) {
    return <p className="vazio">{t('Ainda não há jogadores no ranking. Assim que uma partida terminar no servidor, ela entra aqui.')}</p>
  }

  const max = top.length ? Math.max(...top.map((j) => j[m[0]])) : 0
  return (
    // key: troca de métrica remonta o bloco e as animações tocam de novo
    <div key={chave} className="anim">
      <div className="ranking-arena">
        <div className="podio">
          {top.slice(0, 3).map((j, i) => (
            <Podio key={j.steamId} j={j} pos={i + 1} m={m} eu={j.steamId === eu} />
          ))}
        </div>
      </div>
      {barra}
      {minhaPos >= TOP && !q && (
        <div className="minha-pos ranking-self">
          <div className="minha-pos-tit mono">{t('SUA POSIÇÃO')}</div>
          <Linha j={todos[minhaPos]} pos={minhaPos + 1} m={m} max={max || todos[0][m[0]]} i={0} eu />
        </div>
      )}
      {top.length > 0 && (
        <div className="tabela-card" tabIndex={0} role="region" aria-label={t('Estatísticas dos jogadores')}>
          <div className="ranking-list-heading">
            <span>{t('RANKING')}</span>
            <span>{t('JOGADORES')} {top.length}</span>
          </div>
          <div className="linha cab">
            <span className="num-c">#</span>
            <span>{t('Jogador')}</span>
            <span className="sel">{t(m[1])} <IconeUI tipo="baixo" tamanho={14} className="v2-ord" /></span>
            <span className="num-c c-rt">{m[0] === 'rating' ? 'Kills' : 'Rating'}</span>
            <span className="num-c c-kd">K/D</span>
            <span className="num-c c-adr">ADR</span>
            <span className="num-c c-kast">KAST</span>
            <span className="num-c c-hs">HS%</span>
            <span className="c-forma">{t('Forma')}</span>
            <span className="v2-linha-mais" aria-hidden="true" />
          </div>
          {lista.map(({ j, pos }, i) => (
            <Linha key={j.steamId} j={j} pos={pos} m={m} max={max} i={i} eu={j.steamId === eu} />
          ))}
          {q && !lista.length && <p className="v2-rk-sem-busca">{t('Nenhum jogador encontrado.')}</p>}
        </div>
      )}
      {top.length > 0 && (
        <p className="nota v2-rk-nota">{`${MIN_MAPAS === 1 ? t('Mínimo de {n} mapa', { n: MIN_MAPAS }) : t('Mínimo de {n} mapas', { n: MIN_MAPAS })} · Rating HLTV 1.0 · ${t('Jogadores no ranking')}: ${todos.length}`}</p>
      )}
    </div>
  )
}

// Toca a música de fundo do evento (loop) e mostra o botão de mutar + controle de volume
function SomRanking() {
  const t = useT()
  const [pref, setPref] = useState(() => lerPreferencia())

  useEffect(() => {
    iniciar(pref)
    return () => parar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mudar = (p) => setPref((atual) => definirPreferencia(p, atual))

  return (
    <div className="rk-som">
      <button
        type="button"
        className="rk-som-icone"
        onClick={() => mudar({ mudo: !pref.mudo })}
        aria-label={pref.mudo ? t('Ligar o som') : t('Desligar o som')}
        title={pref.mudo ? t('Ligar o som') : t('Desligar o som')}
      >
        {pref.mudo ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={pref.vol}
        onChange={(e) => mudar({ vol: Number(e.target.value), mudo: false })}
        aria-label={t('Volume')}
      />
    </div>
  )
}

function Esqueleto() {
  return (
    <>
      <div className="podio">
        <div className="v2-pod esq-pod p2" />
        <div className="v2-pod esq-pod p1" />
        <div className="v2-pod esq-pod p3" />
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
  const t = useT()
  const [dados, setDados] = useState(inicial ? normalizar(inicial) : null)
  const [chave, setChave] = useState('rating')
  const [busca, setBusca] = useState('')
  const conta = useConta()
  const perfis = usePerfis()
  // Deploy novo (partida terminou): a página recarrega sozinha com o ranking atualizado
  useAoVivo('/ranking/ranking.json', undefined, { selecionar: (r) => r?.atualizado })
  // XP com o ajuste do admin (perfil no worker) e o nível dele
  const comXp = useMemo(() => {
    if (!dados) return null
    // Dono/admin com "Ocultar do ranking" ligado não aparece (o próximo sobe de posição)
    const jogadores = dados.jogadores.filter((j) => !perfis[j.steamId]?.ocultoRanking).map((j) => {
      const xp = (Number(j.xp) || 0) + (Number(perfis[j.steamId]?.xp) || 0)
      return { ...j, nome: apelidoDe(perfis, j.steamId, j.nome), xp, nivel: nivelDe(xp, j.mapas).nivel }
    })
    return { ...dados, jogadores }
  }, [dados, perfis])

  useEffect(() => {
    if (!inicial) lerJson('/ranking/ranking.json').then((d) => setDados(normalizar(d)))
    const daUrl = location.hash.slice(1)
    if (METRICAS.some((m) => m[0] === daUrl)) setChave(daUrl)
  }, [inicial])

  const escolher = (c) => {
    history.replaceState(null, '', c === 'rating' ? location.pathname : `#${c}`)
    setChave(c)
  }

  const quando = dados && dataBr(dados.atualizado, t.local)
  return (
    <Layout pagina="ranking">
      <main className="ranking-page v2-rk" style={fundoCss('ranking')}>
        <SomRanking />
        {/* Topo: título, resumo e (no Conteudo) o pódio sobre o cenário do circo */}
        <section className="v2-rk-topo">
          <div className="wrap v2-rk-cab">
            <header className="v2-titulo">
              <div>
                <h1>{t('Ranking da comunidade')}</h1>
                <p>{t('Ranking montado com todas as partidas registradas no servidor. Cada mapa novo entra na conta sozinho: rating, ADR, KAST, kills e forma recente.')}</p>
              </div>
              <div className="v2-rk-ferramentas">
                <label className="v2-rk-busca">
                  <IconeUI tipo="busca" tamanho={20} />
                  <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('Buscar jogador…')} aria-label={t('Buscar jogador')} />
                </label>
              <span className="v2-rk-atualizado">
                <span className="ponto" aria-hidden="true" />
                {!dados ? t('Carregando…') : quando ? t('Atualizado {quando}', { quando }) : t('Sem dados ainda')}
              </span>
              </div>
            </header>
            <dl className="v2-rk-resumo">
              <div>
                <IconeUI tipo="grupo" tamanho={24} />
                <dt>{t('jogadores')}</dt>
                <dd className="v2-num"><Contador valor={dados ? dados.jogadores.length : null} /></dd>
              </div>
              <div>
                <IconeUI tipo="mapa" tamanho={24} />
                <dt>{t('mapas')}</dt>
                <dd className="v2-num"><Contador valor={dados ? dados.partidas || 0 : null} /></dd>
              </div>
              <div>
                <IconeUI tipo="caveira" tamanho={24} />
                <dt>kills</dt>
                <dd className="v2-num"><Contador valor={dados ? dados.jogadores.reduce((s, j) => s + (j.kills || 0), 0) : null} /></dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="secao v2-rk-corpo">
          <div className="wrap">
            {/* As abas de métrica ficam entre o pódio e a tabela (como na referência): o Conteudo encaixa a barra lá */}
            <div id="conteudo">
              {dados ? (
                <Conteudo
                  dados={comXp}
                  chave={chave}
                  eu={conta?.id}
                  busca={busca}
                  barra={
                    <div className="barra-topo">
                      <div className="metricas" role="tablist" aria-label={t('Ordenar ranking por')}>
                        {METRICAS.map(([c, rotulo]) => (
                          <button key={c} type="button" role="tab" aria-selected={c === chave} className={c === chave ? 'active' : ''} onClick={() => escolher(c)}>
                            <IconeUI tipo={ICONE_METRICA[c]} tamanho={20} />
                            {t(rotulo)}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                />
              ) : (
                <Esqueleto />
              )}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
