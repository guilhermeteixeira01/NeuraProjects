import { urlTrofeu } from '../../comum/trofeus.js'
import IconeUI from '../../comum/IconeUI.jsx'
import { useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { linkPerfil, useConta } from '../../comum/conta.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { Contador } from '../../comum/efeitos.jsx'
import { useAoVivo } from '../../comum/aoVivo.js'
import { FundoHero, Palavras } from '../../comum/HeroFundo.jsx'
import Premier from '../../comum/Premier.jsx'
import { CargosDe, ComMoldura, IconeEquipe, TimeEscolhido, apelidoDe, useCardDe, usePerfis, useTimeDe } from '../../comum/Moldura.jsx'
import { fundoCard } from '../../comum/cardsPerfil.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { nivelDe } from '../../comum/niveis.js'
import { MIN_MAPAS } from '../../comum/ranking.js'
import { useT } from '../../comum/i18n.js'
import { useAvatar } from '../../comum/avatares.js'
import { definirPreferencia, iniciar, lerPreferencia, parar } from './somRanking.js'

const TOP = 15
const PODIO_ARTE = {
  1: { moldura: 'podio-ouro.webp', personagem: 'podio-campeao.webp' },
  2: { moldura: 'podio-prata.webp', personagem: 'podio-arlequim.webp' },
  3: { moldura: 'podio-bronze.webp', personagem: 'podio-fortao.webp' },
}
const arteRanking = (arquivo) => `/assets/Ranking/${arquivo}`

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

function Podio({ j, pos, m, eu }) {
  const card = useCardDe(j.steamId) // banner que o jogador escolheu no perfil (só o pódio, top 3, mostra o card)
  const time = useTimeDe(j.steamId) // sem time: o rating fica centralizado em vez de deixar um vão vazio embaixo
  const t = useT()
  const [chave, , rotulo, casas, suf] = m
  const arte = PODIO_ARTE[pos]
  return (
    <div className={`pod spot p${pos}${eu ? ' eu' : ''}${card ? ' com-card' : ''}`} data-pos={pos} style={card ? { '--card-fundo': fundoCard(card, true) } : undefined}>
      {/* Sem o selo "VOCÊ" aqui: poluía a moldura (o destaque de quem está logado já fica só na borda azul via .pod.eu) */}
      <div className="pod-arte" aria-hidden="true">
        <img className="pod-personagem" src={arteRanking(arte.personagem)} alt="" />
        {/* Sem ComMoldura aqui: a moldura do carnaval já emoldura o avatar, a borda animada e o emblema de assinante por cima ficam poluídos */}
        <a className="pod-av" href={perfil(j)} aria-hidden="true" tabIndex={-1}>
          <Avatar j={j} classe="" />
          <span className="pod-pos">#{pos}</span>
        </a>
        <img className="pod-moldura" src={arteRanking(arte.moldura)} alt="" />
      </div>
      {pos === 1 && (
        <IconeUI tipo="jester" tamanho={26} className="coroa"/>
      )}
      {/* Cada moldura (ouro/prata/bronze) tem a arte diferente: a caixa de cima (nome+resultado) e a de baixo (time)
          são encaixadas nas medidas de cada uma (ver .pod.p1/.p2/.p3 .pod-cima/.pod-baixo), sem invadir o relevo. */}
      <div className="pod-cima">
        {/* Sem IconeEquipe aqui: o selo de dono/admin ao lado do nome polui a moldura (fica só na tabela) */}
        <a className="pod-nome" href={perfil(j)}>
          <span className="pod-nome-txt">{j.nome}</span>
        </a>
        <span className="pod-valor">
          <b>
            {fmt(j[chave], casas)}
            {suf}
          </b>
          <span className="mono">{t(rotulo)}</span>
        </span>
      </div>
      {/* No pódio do carnaval, sem nível/Premier/tag de campeão nem K/D-ADR-MAPAS/forma: só o time do jogador embaixo */}
      <div className={`pod-baixo${time ? '' : ' sem-time'}`}>
        {time && <TimeEscolhido steamId={j.steamId} classe="pod-time-rodape" />}
      </div>
    </div>
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
        {trofeu ? <img src={trofeu} alt="" aria-hidden="true" /> : pos}
        <span className="sr-only">#{pos}</span>
      </span>
      <span className="jog">
        <a className="jog-av" href={perfil(j)} aria-hidden="true" tabIndex={-1}>
          <ComMoldura steamId={j.steamId}>
            <Avatar j={j} classe="av" />
          </ComMoldura>
        </a>
        {/* Sempre 2 linhas: nome + cargo; nível, Premier e time (todas as linhas da tabela com a mesma altura) */}
        <span className="jog-txt">
          <span className="jog-l1">
            <a href={perfil(j)}>{j.nome}</a>
            <IconeEquipe steamId={j.steamId} />
            <CargosDe steamId={j.steamId} classe="linha-cargos" max={1} />
          </span>
          <span className="jog-l2">
            <SeloNivel nivel={j.nivel} tamanho={22} />
            <Premier j={j} />
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
    </div>
  )
}

// eu: SteamID de quem está logado (destaque na lista e, fora do top, a posição dele embaixo)
function Conteudo({ dados, chave, eu }) {
  const t = useT()
  const m = METRICAS.find((x) => x[0] === chave) || METRICAS[0]
  const todos = dados.jogadores
    .filter((j) => j.mapas >= MIN_MAPAS)
    .sort((a, b) => b[m[0]] - a[m[0]] || b.rating - a.rating || b.kills - a.kills)
  const top = todos.slice(0, TOP)
  const minhaPos = eu ? todos.findIndex((j) => j.steamId === eu) : -1

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
      {minhaPos >= TOP && (
        <div className="minha-pos ranking-self">
          <div className="minha-pos-tit mono">{t('SUA POSIÇÃO')}</div>
          <Linha j={todos[minhaPos]} pos={minhaPos + 1} m={m} max={max || todos[0][m[0]]} i={0} eu />
        </div>
      )}
      {top.length > 0 && (
        <div className="tabela-card">
          <div className="ranking-list-heading">
            <span>{t('RANKING')}</span>
            <span>{t('JOGADORES')} {top.length}</span>
          </div>
          <div className="linha cab">
            <span className="num-c">#</span>
            <span>{t('JOGADOR')}</span>
            <span className="sel">{t(m[2])}</span>
            <span className="num-c c-rt">{m[0] === 'rating' ? 'KILLS' : 'RATING'}</span>
            <span className="num-c c-kd">K/D</span>
            <span className="num-c c-adr">ADR</span>
            <span className="num-c c-kast">KAST</span>
            <span className="num-c c-hs">HS%</span>
            <span className="c-forma">{t('FORMA')}</span>
          </div>
          {top.map((j, i) => (
            <Linha key={j.steamId} j={j} pos={i + 1} m={m} max={max} i={i} eu={j.steamId === eu} />
          ))}
        </div>
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
  const t = useT()
  const [dados, setDados] = useState(inicial ? normalizar(inicial) : null)
  const [chave, setChave] = useState('rating')
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
      <main className="ranking-page">
        <SomRanking />
        <section className="hero">
          <FundoHero />
          <div className="wrap hero-inner">
            <div>
              <span className="chip fx-entra" style={{ '--e': 0 }}>
                <span className="ponto" />
                <span>{!dados ? t('CARREGANDO…') : quando ? t('ATUALIZADO {quando}', { quando }) : t('SEM DADOS AINDA')}</span>
              </span>
              <h1>
                <Palavras texto="Top 15" />
                <span className="fx-gradiente">
                  <Palavras texto={t('jogadores')} inicio={2} />
                </span>
              </h1>
              <p className="lead fx-entra" style={{ '--e': 3 }}>
                {t('Ranking montado com todas as partidas registradas no servidor. Cada mapa novo entra na conta sozinho: rating, ADR, KAST, kills e forma recente.')}
              </p>
            </div>
            <div className="resumo fx-entra" style={{ '--e': 4 }}>
              <div className="caixa">
                <span className="mono">{t('JOGADORES')}</span>
                <b>
                  <Contador valor={dados ? dados.jogadores.length : null} />
                </b>
              </div>
              <div className="caixa">
                <span className="mono">{t('MAPAS')}</span>
                <b>
                  <Contador valor={dados ? dados.partidas || 0 : null} />
                </b>
              </div>
              <div className="caixa">
                <span className="mono">KILLS</span>
                <b>
                  <Contador valor={dados ? dados.jogadores.reduce((s, j) => s + (j.kills || 0), 0) : null} />
                </b>
              </div>
            </div>
          </div>
        </section>

        <section className="secao" style={{ paddingTop: 40 }}>
          <div className="wrap">
            <div className="barra-topo">
              <div className="metricas" role="tablist" aria-label={t('Ordenar ranking por')}>
                {dados &&
                  METRICAS.map(([c, rotulo]) => (
                    <button key={c} type="button" role="tab" aria-selected={c === chave} className={c === chave ? 'active' : ''} onClick={() => escolher(c)}>
                      {t(rotulo)}
                    </button>
                  ))}
              </div>
              <span className="nota">{dados && `${MIN_MAPAS === 1 ? t('MÍNIMO DE {n} MAPA', { n: MIN_MAPAS }) : t('MÍNIMO DE {n} MAPAS', { n: MIN_MAPAS })} · RATING HLTV 1.0`}</span>
            </div>
            <div id="conteudo">{dados ? <Conteudo dados={comXp} chave={chave} eu={conta?.id} /> : <Esqueleto />}</div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
