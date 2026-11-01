import { imagemFundoPerfil, podeUsarFundoPerfil } from '../../../worker/steam-login/src/fundos-perfil.js'
import IconeUI from '../../comum/IconeUI.jsx'
import PainelMissoes from '../../comum/PainelMissoes.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { lerApi, seForErroApi, enderecoApi } from '../../comum/api.js'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { useAoVivo } from '../../comum/aoVivo.js'
import { ordenarRanking } from '../../comum/ranking.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'
import { IconeSteam } from '../../comum/Icones.jsx'
import { nomeArma, somarArmas, urlArma } from '../../comum/armas.js'
import { SkinsDoJogador, useSkinDaArma, useSkinsEquipadas } from '../../comum/skinsPerfil.js'
import { mapImage, nomeMapa } from '../../comum/mapas.js'
import { acharTime, useTimes } from '../../comum/times.js'
import { NIVEIS, NIVEL_ELITE, textoNivel } from '../../comum/niveis.js'
import { CargosDe, ComMoldura, IconeEquipe, TimeEscolhido, salvarPerfil, useAdmin, useCardDe, usePerfis, useTimeDe } from '../../comum/Moldura.jsx'
import Premier from '../../comum/Premier.jsx'
import InventarioDoJogador from '../../comum/InventarioDoJogador.jsx'
import PerfilInventario from './PerfilInventario.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { BarraXp, SeloNivel, useNivelDe } from '../../comum/Nivel.jsx'
import SeletorMoldura from './SeletorMoldura.jsx'
import { fundoCard } from '../../comum/cardsPerfil.js'
import { useT } from '../../comum/i18n.js'
import { useAvatar } from '../../comum/avatares.js'
import { BotaoAmizade, StatusAmigo } from './Amizade.jsx'
import GaleriaInsignias from '../../comum/GaleriaInsignias.jsx'
import { InsigniasDe } from '../../comum/Insignias.jsx'
import HallDaFama from './HallDaFama.jsx'
import ConfiguracoesConta from './ConfiguracoesConta.jsx'
import PerfilProtegido, { ApresentacaoPerfil } from './PerfilProtegido.jsx'
import { AmigosDoPerfil, AfiliadoDoPerfil } from './PerfilSocial.jsx'
import { FUNDOS, PERSONAGENS } from '../../comum/assetsV2.js'

// Perfil do jogador: /perfil/?id=<SteamID64>. Sem id, mostra o de quem está logado pela Steam.
// Dados: ranking/ranking.json (totais) e perfil/historico/<id>.json (todos os mapas), gerados no deploy.

const POR_PAGINA = 15 // mapas do histórico por vez ("Mostrar mais")
const NO_GRAFICO = 20 // últimos mapas no gráfico de rating

const fmt = (v, casas) => Number(v || 0).toFixed(casas)
const classeRating = (r) => (r >= 1.5 ? 'alto' : r >= 1.2 ? 'bom' : r >= 0.9 ? 'medio' : 'baixo')
const linkPartida = (caminho) => `/partidas/${String(caminho).split('/').map(encodeURIComponent).join('/')}/`
const steam = (id) => `https://steamcommunity.com/profiles/${encodeURIComponent(id)}`
const iniciais = (nome) => String(nome || '?').trim().slice(0, 2).toUpperCase()

// Data/hora no horário de Brasília (a página é gerada num servidor em UTC)
const dataBr = (iso, local = 'pt-BR', hora = true) => {
  const d = new Date(iso)
  return isNaN(d)
    ? ''
    : d
        .toLocaleString(local, { day: '2-digit', month: '2-digit', ...(hora ? { hour: '2-digit', minute: '2-digit' } : { year: '2-digit' }), timeZone: 'America/Sao_Paulo' })
        .replace(',', '')
}

function Avatar({ id, src: padrao, nome, classe }) {
  const src = useAvatar(id, padrao) // foto atual da Steam
  const [erro, setErro] = useState('')
  return (urlOk(src) || (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//'))) && erro !== src ? (
    <img className={classe} src={src} alt="" onError={() => setErro(src)} />
  ) : (
    <span className={`${classe} ini`}>{iniciais(nome)}</span>
  )
}

// Rating por mapa (últimos NO_GRAFICO, mais antigo à esquerda). Uma série só (azul); a linha tracejada
// marca 1.00 (média). Vitória/derrota fica no V/D embaixo de cada barra, não na cor.
function GraficoRating({ mapas }) {
  const t = useT()
  const [quantidade, setQuantidade] = useState(Math.min(9, mapas.length))
  const grafico = useRef(null)
  const [largura, setLargura] = useState(770)
  useEffect(() => {
    const observar = new ResizeObserver(([entrada]) => setLargura(Math.max(260, entrada.contentRect.width)))
    observar.observe(grafico.current)
    return () => observar.disconnect()
  }, [])
  const lista = mapas.slice(0, quantidade).reverse()
  const valores = lista.map(m => Number(m.rating) || 0)
  const min = Math.max(0, Math.floor((Math.min(...valores) - .2) * 5) / 5)
  const max = Math.max(min + .6, Math.ceil((Math.max(...valores) + .2) * 5) / 5)
  const x = i => 40 + i * (largura - 70) / Math.max(1, lista.length - 1)
  const y = valor => 174 - (valor - min) / (max - min) * 140
  const linha = valores.map((valor, i) => `${x(i)},${y(valor)}`).join(' ')
  return <section className="pf-grafico-card pf-linha-card" aria-label={t('Desempenho recente')}>
    <header className="pf-ref-cab"><h2><IconeUI tipo="estatisticas" tamanho={22} />{t('Desempenho recente')}</h2>
      <select aria-label={t('Período do gráfico')} value={quantidade} onChange={e => setQuantidade(Number(e.target.value))}>
        {[...new Set([Math.min(9,mapas.length),Math.min(15,mapas.length),Math.min(20,mapas.length)])].map(n => <option key={n} value={n}>{t('Últimos {n} jogos', { n })}</option>)}
      </select>
    </header>
    <span className="pf-chart-label">Rating</span>
    <svg ref={grafico} className="pf-chart-svg" viewBox={`0 0 ${largura} 204`} role="img" aria-label={t('Rating por mapa')}>
      <defs><linearGradient id="pf-rating-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#087cff" stopOpacity=".35"/><stop offset="1" stopColor="#087cff" stopOpacity="0"/></linearGradient></defs>
      {[0,1,2,3].map(i => { const valor = min + (max-min)*i/3; return <g key={i}><line x1="40" x2={largura-16} y1={y(valor)} y2={y(valor)} stroke="#254462" strokeDasharray="2 4"/><text x="4" y={y(valor)+4}>{valor.toFixed(1)}</text></g> })}
      <polygon points={`40,174 ${linha} ${x(lista.length-1)},174`} fill="url(#pf-rating-area)"/>
      <polyline points={linha} fill="none" stroke="#138aff" strokeWidth="2.5"/>
      {lista.map((m,i) => <a key={m.caminho} href={linkPartida(m.caminho)} aria-label={`${nomeMapa(m.mapa)} · Rating ${fmt(m.rating,2)}`}><title>{nomeMapa(m.mapa)} · {fmt(m.rating,2)} · {m.venceu?t('Vitória'):t('Derrota')}</title><circle cx={x(i)} cy={y(m.rating)} r="4" fill="#087cff" stroke="#68b4ff" strokeWidth="1.5"/><text x={x(i)} y="196" textAnchor="middle">J{i+1}</text></a>)}
      <text className="pf-chart-last" x={x(lista.length-1)} y={y(valores.at(-1))-12} textAnchor="middle">{fmt(valores.at(-1),2)}</text>
    </svg>
  </section>
}
// Dia da semana + dia e mês, e a hora embaixo (horário de Brasília): "qui. 30 jul." / "21:21"
function quando(iso, local = 'pt-BR') {
  const d = new Date(iso)
  if (isNaN(d)) return ['', '']
  const fuso = { timeZone: 'America/Sao_Paulo' }
  return [
    // "sex. 16 out." (sem o "de" e sem vírgula, para caber no celular)
    new Intl.DateTimeFormat(local, { weekday: 'short', day: '2-digit', month: 'short', ...fuso })
      .formatToParts(d)
      .filter((p) => ['weekday', 'day', 'month'].includes(p.type))
      .map((p) => p.value)
      .join(' '),
    d.toLocaleTimeString(local, { hour: '2-digit', minute: '2-digit', ...fuso }),
  ]
}

// Partidas recentes (estilo bigcs): faixa da cor do resultado à esquerda, data, K/D/A com o K/D, placar no meio (time · placar · adversário),
// tipo (série ou mix), miniatura do mapa e o XP ganho/perdido. O fundo da linha é a arte do mapa, bem apagada, do lado direito.
function LogoTime({ nome, times }) {
  const [erro, setErro] = useState(false)
  const logo = acharTime(times, nome)?.logo
  if (/^https?:\/\//.test(logo || '') && !erro) return <img className="pf-pr-logo" src={logo} alt="" loading="lazy" onError={() => setErro(true)} />
  return <i className="pf-pr-logo pf-pr-logo-letra" aria-hidden="true">{String(nome || '?').trim().slice(0, 1).toUpperCase()}</i>
}
function Historico({ mapas }) {
  const t = useT()
  const [todos, setTodos] = useState(false)
  return <section className="pf-ref-historico" aria-label={t('Últimas partidas')}>
    <header className="pf-ref-cab"><h2><IconeUI tipo="espadas" tamanho={22}/>{t('Últimas partidas')}</h2><button type="button" onClick={() => setTodos(v => !v)}>{t(todos ? 'Mostrar menos' : 'Ver todas')} <IconeUI tipo="direita" tamanho={15}/></button></header>
    <ol>{mapas.slice(0, todos ? mapas.length : 3).map(m => <li key={m.caminho}>
      <a className={`pf-ref-partida ${m.venceu?'v':'d'}`} href={linkPartida(m.caminho)}>
        <img className="pf-ref-mapa" src={mapImage(m.mapa)} alt="" loading="lazy"/>
        <span className="pf-ref-mapa-nome"><b>{nomeMapa(m.mapa)}</b><small>{t('Competitivo')}</small></span>
        <strong className="pf-ref-placar"><i>{m.placar[0]}</i> : {m.placar[1]}</strong>
        <span className="pf-ref-resultado"><IconeUI tipo="trofeu" tamanho={17}/>{t(m.venceu?'Vitória':'Derrota')}</span>
        <span className="pf-ref-stat"><small>K/D</small><b>{fmt(m.mortes ? m.kills/m.mortes : m.kills,2)}</b></span>
        <span className="pf-ref-stat pf-ref-extra"><small>Kills</small><b>{m.kills}</b></span>
        <span className="pf-ref-stat pf-ref-extra"><small>ADR</small><b>{fmt(m.adr,1)}</b></span>
        <span className="pf-ref-stat pf-ref-extra"><small>KAST</small><b>{m.kast != null ? `${fmt(m.kast,0)}%` : '—'}</b></span>
        <IconeUI tipo="direita" tamanho={18}/>
      </a>
    </li>)}</ol>
  </section>
}
// Armas mais usadas (soma das partidas do histórico): as 3 primeiras em destaque e o resto numa lista com barra de kills.
// Clicar numa arma abre o detalhe dela com barras (participação nas kills e no dano, HS% e dano por acerto).
const ARMAS_NA_LISTA = 5
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
function ImagemArma({ id }) {
  const [erro, setErro] = useState(false)
  const skins = useSkinDaArma() // skin que o jogador tem equipada nesta arma (se tiver)
  const url = skins?.imagem(id) || urlArma(id)
  if (!url || erro) return <span className="pf-arma-sem">{nomeArma(id)}</span>
  return <img src={url} alt="" loading="lazy" onError={() => setErro(true)} />
}
// Barra fina com o gradiente do tema (azul → verde); `valor` em % (0–100)
function BarraArma({ valor }) {
  return (
    <span className="pf-arma-barra" aria-hidden="true">
      <i style={{ width: `${Math.max(2, Math.min(100, valor))}%` }} />
    </span>
  )
}
function DetalheArma({ a, kills, dano, fechar }) {
  const t = useT()
  const porAcerto = a.acertos ? Math.round(a.dano / a.acertos) : 0
  const linhas = [
    { rotulo: t('Participação nas kills'), valor: pct(a.kills, kills), texto: `${pct(a.kills, kills)}%`, sub: t('{k} de {t} kills', { k: a.kills, t: kills }) },
    { rotulo: t('Headshot'), valor: pct(a.headshots, a.kills), texto: a.kills ? `${pct(a.headshots, a.kills)}%` : '—', sub: t('{n} de cabeça', { n: a.headshots }) },
    { rotulo: t('Participação no dano'), valor: pct(a.dano, dano), texto: `${pct(a.dano, dano)}%`, sub: t('{d} de {t} de dano', { d: a.dano, t: dano }) },
    // Dano por acerto na escala de 0 a 100 (um tiro de 100+ enche a barra)
    { rotulo: t('Dano por acerto'), valor: porAcerto, texto: a.acertos ? String(porAcerto) : '—', sub: t('{n} acertos', { n: a.acertos }) },
  ]
  return (
    <div className="pf-arma-detalhe" role="region" aria-label={nomeArma(a.id)}>
      <div className="pf-arma-detalhe-cab">
        <span className="pf-arma-mini">
          <ImagemArma id={a.id} />
        </span>
        <b>{nomeArma(a.id)}</b>
        <button type="button" className="pf-arma-fechar" onClick={fechar} aria-label={t('Fechar')}>
          ×
        </button>
      </div>
      {linhas.map((l) => (
        <div key={l.rotulo} className="pf-arma-linha">
          <span className="pf-arma-rotulo">{l.rotulo}</span>
          <BarraArma valor={l.valor} />
          <b className="mono">{l.texto}</b>
          <span className="pf-arma-sub">{l.sub}</span>
        </div>
      ))}
    </div>
  )
}
function Armas({ mapas, steamId }) {
  const t = useT()
  const skins = useSkinsEquipadas(steamId)
  const [todas, setTodas] = useState(false)
  const [aberta, setAberta] = useState(null) // arma com o detalhe aberto
  const { lista, mapas: n, kills } = somarArmas(mapas)
  if (!lista.length) return null
  const dano = lista.reduce((s, a) => s + a.dano, 0)
  const destaque = lista.slice(0, 3)
  const resto = lista.slice(3)
  const maior = lista[0].kills || 1
  const mostrar = todas ? resto : resto.slice(0, ARMAS_NA_LISTA)
  const alternar = (id) => setAberta((x) => (x === id ? null : id))
  const fechar = () => setAberta(null)
  const abertaTop = destaque.find((a) => a.id === aberta)
  return (
    <SkinsDoJogador.Provider value={skins}>
    <div className="pf-armas-card spot">
      <div className="pf-card-cab">
        <h2>{t('Armas mais usadas')}</h2>
        <span className="mono">{t('{n} ARMAS · {m} MAPAS', { n: lista.length, m: n })}</span>
      </div>
      <div className="pf-armas-top">
        {destaque.map((a, i) => (
          <button
            key={a.id}
            type="button"
            className={`pf-arma-dest${i === 0 ? ' primeira' : ''}${aberta === a.id ? ' aberta' : ''}`}
            aria-expanded={aberta === a.id}
            onClick={() => alternar(a.id)}
          >
            <span className="pf-arma-pos">#{i + 1}</span>
            <span className="pf-arma-img">
              <ImagemArma id={a.id} />
            </span>
            <b className="pf-arma-nome">{nomeArma(a.id)}</b>
            <span className="pf-arma-nums">
              <span>
                <b>{a.kills}</b> {t('kills')}
              </span>
              <span>
                <b>{pct(a.kills, kills)}%</b> {t('das kills')}
              </span>
              <span>
                <b>{a.kills ? `${pct(a.headshots, a.kills)}%` : '—'}</b> HS
              </span>
              <span>
                <b>{a.dano}</b> {t('dano')}
              </span>
            </span>
            <BarraArma valor={(100 * a.kills) / maior} />
          </button>
        ))}
      </div>
      {abertaTop && <DetalheArma a={abertaTop} kills={kills} dano={dano} fechar={fechar} />}
      {resto.length > 0 && (
        <ul className="pf-armas-lista">
          {mostrar.map((a) => (
            <li key={a.id}>
              <button type="button" className={`pf-arma-linha-btn${aberta === a.id ? ' aberta' : ''}`} aria-expanded={aberta === a.id} onClick={() => alternar(a.id)}>
                <span className="pf-arma-mini">
                  <ImagemArma id={a.id} />
                </span>
                <span className="pf-arma-nome">{nomeArma(a.id)}</span>
                <BarraArma valor={(100 * a.kills) / maior} />
                <span className="mono">
                  <b>{a.kills}</b> {t('kills')}
                </span>
                <span className="mono pf-arma-hs">{a.kills ? `${pct(a.headshots, a.kills)}% HS` : '— HS'}</span>
                <span className="mono pf-arma-dano">
                  {a.dano} {t('dano')}
                </span>
              </button>
              {aberta === a.id && <DetalheArma a={a} kills={kills} dano={dano} fechar={fechar} />}
            </li>
          ))}
        </ul>
      )}
      {resto.length > ARMAS_NA_LISTA && (
        <button type="button" className="pf-mais" onClick={() => setTodas((v) => !v)}>
          {todas ? t('Mostrar menos') : t('Mostrar mais ({n})', { n: resto.length - ARMAS_NA_LISTA })}
        </button>
      )}
    </div>
    </SkinsDoJogador.Provider>
  )
}

// "Ocultar do ranking" (só dono e admins, no próprio perfil): ligado, a pessoa some do ranking e o próximo sobe
function OcultarRanking({ steamId }) {
  const t = useT()
  const oculto = !!usePerfis()[steamId]?.ocultoRanking
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(false)
  const trocar = async () => {
    setSalvando(true)
    setErro(false)
    try {
      await salvarPerfil({ ocultoRanking: !oculto })
    } catch {
      setErro(true)
    } finally {
      setSalvando(false)
    }
  }
  return (
    // Compacto, na linha dos botões: a explicação fica na dica (title) e só aparece escrita quando ligado ou com erro
    <label className={`pf-ocultar${oculto ? ' ligado' : ''}`} title={t('Só o dono e os admins têm esta opção.')}>
      <input type="checkbox" checked={oculto} disabled={salvando} onChange={trocar} />
      <span className="pf-ocultar-chave" aria-hidden="true" />
      <span>
        <b>{t('Ocultar do ranking')}</b>
        {(erro || oculto) && <small>{erro ? t('Não deu para salvar. Tente de novo.') : t('Você não aparece no ranking e o próximo sobe de posição.')}</small>}
      </span>
    </label>
  )
}

// Número grande do topo do perfil (referência): ícone, rótulo, valor e a linha de apoio com dados reais
function MetricaPerfil({ icone, rotulo, valor, sub }) {
  return (
    <div className="pf-v2-metrica">
      <span className="pf-v2-metrica-icone" aria-hidden="true"><IconeUI tipo={icone} tamanho={30} /></span>
      <div>
        <small>{rotulo}</small>
        <b className="v2-num">{valor}</b>
        <span>{sub}</span>
      </div>
    </div>
  )
}

function Estat({ rotulo, valor, sub, classe = '' }) {
  return (
    <div className={`pf-estat spot ${classe}`}>
      <span className="mono">{rotulo}</span>
      <b>{valor}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}

// Atividade recente (últimos 91 dias = 13 semanas): um quadradinho por dia, mais forte quanto mais partidas no dia
const SEMANAS = 13
function AtividadeRecente({ mapas }) {
  const t = useT()
  const fuso = { timeZone: 'America/Sao_Paulo' }
  const dia = (d) => d.toLocaleDateString('en-CA', fuso) // AAAA-MM-DD no horário de Brasília
  const contagem = {}
  for (const m of mapas) {
    const d = new Date(m.data)
    if (!isNaN(d)) contagem[dia(d)] = (contagem[dia(d)] || 0) + 1
  }
  const [a, mes, d0] = dia(new Date()).split('-').map(Number)
  const hoje = Date.UTC(a, mes - 1, d0)
  const UM_DIA = 86400000
  const dow = (new Date(hoje).getUTCDay() + 6) % 7 // segunda = 0
  const inicio = hoje - ((SEMANAS - 1) * 7 + dow) * UM_DIA
  const nome = (ms, op) => new Date(ms).toLocaleDateString(t.local, { ...op, timeZone: 'UTC' })
  let total = 0
  const colunas = Array.from({ length: SEMANAS }, (_, c) => {
    const dias = Array.from({ length: 7 }, (_, r) => {
      const ms = inicio + (c * 7 + r) * UM_DIA
      if (ms > hoje) return null
      const n = contagem[new Date(ms).toISOString().slice(0, 10)] || 0
      total += n
      return { ms, n }
    })
    return dias
  })
  const nivel = (n) => (n >= 4 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0)
  return (
    <div className="pf-lado-bloco pf-ativ">
      <h3>
        {t('Atividade recente')} <small>{t('Últimos 90 dias')}</small>
      </h3>
      <div className="pf-ativ-grade" role="img" aria-label={t('{n} partidas jogadas', { n: total })}>
        <span />
        {Array.from({ length: 7 }, (_, r) => (
          <span key={r} className="pf-ativ-dia">
            {nome(Date.UTC(2024, 0, 1 + r), { weekday: 'short' })}
          </span>
        ))}
        {colunas.map((dias, c) => {
          const primeiro = dias.find(Boolean)
          const antes = c > 0 ? colunas[c - 1].find(Boolean) : null
          const novoMes = primeiro && (!antes || new Date(primeiro.ms).getUTCMonth() !== new Date(antes.ms).getUTCMonth())
          return [
            <span key={`m${c}`} className="pf-ativ-mes">
              {novoMes ? nome(primeiro.ms, { month: 'short' }) : ''}
            </span>,
            ...dias.map((x, r) => (x ? <i key={`${c}-${r}`} className={`pf-cel n${nivel(x.n)}`} title={`${nome(x.ms, { day: '2-digit', month: 'short' })}: ${x.n}`} /> : <i key={`${c}-${r}`} className="pf-cel vazio" />)),
          ]
        })}
      </div>
      <div className="pf-ativ-rodape">
        <b>{t('{n} partidas jogadas', { n: total })}</b>
        <span className="pf-ativ-legenda">
          <small>{t('1 partida')}</small>
          <i className="pf-cel n1" />
          <i className="pf-cel n2" />
          <i className="pf-cel n3" />
          <small>{t('+{n} partidas', { n: 4 })}</small>
        </span>
      </div>
    </div>
  )
}

// Coluna da esquerda, abaixo dos botões: insígnias, jogando desde, histórico (jogo) e atividade recente
function InfosLado({ j, mapas }) {
  const t = useT()
  const primeira = mapas?.length ? mapas[mapas.length - 1].data : null
  const desde = primeira ? new Date(primeira).toLocaleDateString(t.local, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : ''
  return (
    <>
      {desde && <p className="pf-desde">{t('Jogando no servidor desde {data}', { data: desde })}</p>}
      {mapas?.length > 0 && (
        <>
          <div className="pf-lado-bloco">
            <h3>{t('Histórico de partidas')}</h3>
            <div className="pf-jogo-cartao">
              <span className="pf-jogo-logo">CS2</span>
              <span>
                <b>CS2</b>
                <small>{mapas.length === 1 ? t('1 partida') : t('{n} partidas', { n: mapas.length })}</small>
              </span>
            </div>
          </div>
          <AtividadeRecente mapas={mapas} />
        </>
      )}
    </>
  )
}

// Desempenho recente (estilo FACEIT): mudança de XP, V/D das últimas 30 partidas e a progressão de nível: uma gema por
// nível (as já alcançadas acesas, a atual em destaque e as próximas apagadas, com o XP de cada uma), e a barra de XP embaixo.
const RECENTES = 30
function DesempenhoRecente({ mapas, nivel, eu }) {
  const t = useT()
  const recentes = mapas.slice(0, RECENTES)
  const vitorias = recentes.filter((m) => m.venceu).length
  const mudanca = recentes.reduce((s, m) => s + (Number(m.xp) || 0), 0)
  return (
    <div className="pf-desemp fx-entra" style={{ '--e': 2 }}>
      <div className="pf-desemp-cab">
        <h2>{t('Desempenho recente')}</h2>
        <span>
          {t('Últimas {n} partidas', { n: recentes.length })}
        </span>
      </div>
      <div className="pf-desemp-linha">
        <span>
          {t('Mudança de XP')}{' '}
          <b className={mudanca > 0 ? 'pos' : mudanca < 0 ? 'neg' : ''}>
            {mudanca !== 0 && <i aria-hidden="true">{mudanca > 0 ? '↑' : '↓'}</i>}
            {Math.abs(mudanca)}
          </b>
        </span>
        <span className="pf-vd-placar">
          <span className="pf-vd-v">{t('V')}</span> <b>{vitorias}</b> / <span className="pf-vd-d">{t('D')}</span> <b>{recentes.length - vitorias}</b>
        </span>
      </div>
      <div className="pf-class">
        <p className="pf-class-titulo">{t('PROGRESSÃO DE NÍVEL')}</p>
        <div className="pf-class-trilha">
          {NIVEIS.map((xp, i) => {
            const n = i + 1
            const estado = !nivel.classificado ? 'proximo' : n < nivel.nivel ? 'feito' : n === nivel.nivel ? 'atual' : 'proximo'
            return (
              <div key={n} className={`pf-ci pf-nv ${estado}`} title={`${n >= NIVEL_ELITE ? 'Elite' : t('Nível {n}', { n })} · ${xp.toLocaleString(t.local)} XP`}>
                <span className="pf-ci-rot">{textoNivel(n)}</span>
                <span className="pf-nv-gema">
                  <SeloNivel nivel={n} tamanho={40} />
                </span>
                <span className="pf-ci-baixo">{xp.toLocaleString(t.local)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <BarraXp info={nivel} classe="pf-xp" eu={eu} />
    </div>
  )
}

function IconeCabecalho({ tipo }) { return <IconeUI tipo={tipo} tamanho={18}/> }

function Jogador({ j, mapas, pos, total, eu, personalizar, admin = false }) {
  const t = useT()
  const timeEscolhido = useTimeDe(j.steamId)
  const [verInventario, setVerInventario] = useState(false)
  const [abaPerfil, setAbaPerfil] = useState(() => typeof location !== 'undefined' && ['#inventario', '#amigos', '#afiliado', '#missoes', '#insignias'].includes(location.hash) ? location.hash.slice(1) : 'status')
  const [linkCopiado, setLinkCopiado] = useState('')
  const trocarAbaPerfil = (aba) => {
    setAbaPerfil(aba)
    history.replaceState(null, '', location.pathname + location.search + (aba !== 'status' ? `#${aba}` : ''))
  }
  useEffect(() => {
    const atualizar = () => setAbaPerfil(['#inventario', '#amigos', '#afiliado', '#missoes', '#insignias'].includes(location.hash) ? location.hash.slice(1) : 'status')
    window.addEventListener('hashchange', atualizar)
    return () => window.removeEventListener('hashchange', atualizar)
  }, [])
  const compartilharPerfil = async () => {
    try {
      const url = new URL('/perfil/', location.origin)
      url.searchParams.set('id', j.steamId)
      await navigator.clipboard.writeText(url.href)
      setLinkCopiado(t('Link copiado'))
    } catch { setLinkCopiado(t('Não foi possível copiar o link')) }
  }
  const [contaAberta,setContaAberta] = useState(()=>typeof location!=='undefined'&&new URLSearchParams(location.search).get('conta')==='1')
  const nivel = useNivelDe(j)
  const perfilFundo = usePerfis()[j.steamId]
  const fundoPerfil = podeUsarFundoPerfil(perfilFundo?.fundoPerfil, perfilFundo) ? perfilFundo?.fundoPerfil : null
  const card = useCardDe(j.steamId) // banner do card (janela Personalizar); some se for exclusivo de cargo que o jogador não tem
  // CS Rating do Premier: vem do ranking (deploy); sem ele (jogador sem partidas, ou deploy sem Leetify),
  // busca direto na Leetify (a API pública aceita chamada do navegador)
  const [premierLeetify, setPremierLeetify] = useState(null)
  useEffect(() => {
    if (j.premier > 0) return
    let vivo = true
    fetch(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${encodeURIComponent(j.steamId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.ranks?.premier
        if (vivo && Number.isFinite(p) && p > 0) setPremierLeetify(p)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [j.steamId, j.premier])
  const premier = j.premier > 0 ? j.premier : premierLeetify
  const derrotas = j.mapas - j.vitorias
  // resumo que aparece no cartão de cima do perfil quando a aba STATUS está aberta (time, Premier, ranking, nível, tempo de servidor e insígnias)
  const resumoStatus = (
    <>
      <div className="pf-resumo-chips">
        <div className="pf-info pf-resumo-chip">
          <span className="pf-info-rot">{t('TIME')}</span>
          <span className="pf-info-val">{timeEscolhido ? <TimeEscolhido steamId={j.steamId} classe="pf-time" /> : <span className="pf-time"><span>{t('Sem time')}</span></span>}</span>
        </div>
        <div className="pf-info pf-resumo-chip">
          <span className="pf-info-rot">PREMIER</span>
          <span className="pf-info-val">
            <Premier key={premier || 0} j={{ ...j, premier }} />
          </span>
        </div>
        {pos > 0 && (
          <a className="pf-info pf-info-pos pf-resumo-chip pf-resumo-pos" href="/ranking/">
            <span className="pf-info-rot">RANKING</span>
            <span className="pf-info-val">
              <b>#{pos}</b> <small>{t('de {total}', { total })}</small>
            </span>
          </a>
        )}
      </div>
    </>
  )
  const sem = !j.mapas // ainda sem partidas: perfil aparece igual, com os números em "—"
  const v = (texto) => (sem ? '—' : texto)
  return (
    <>
      <section className="secao pf-pagina pf-hall-pagina">
        <div className="pf-cover" style={{ '--pf-cover': `url("${fundoPerfil ? imagemFundoPerfil(fundoPerfil) : FUNDOS.inventario.src}")` }} aria-hidden="true">
          <img className="pf-cover-personagem" src={PERSONAGENS.lojaArlequim.src} alt="" />
        </div>
        <div className="wrap pf-header-wrap">
          <header className="pf-profile-header">
            <div className="pf-profile-row">
              <a className="pf-header-level" href="/ranking/" aria-label={t('Ver ranking')}>
                <SeloNivel nivel={nivel.nivel} tamanho={42} />
                <span><b>{nivel.classificado ? t('Nível {n}', { n: textoNivel(nivel.nivel) }) : t('Sem classificação')}</b><span className="pf-header-progress"><i style={{ width: `${Math.max(0, Math.min(100, nivel.progresso * 100))}%` }} /></span></span>
              </a>
              <div className="pf-header-links">
                {premier > 0 && <Premier j={{ ...j, premier }} />}
                <a href={steam(j.steamId)} target="_blank" rel="noopener" className="pf-header-icon" aria-label={t('Perfil na Steam')} title={t('Perfil na Steam')}><IconeSteam /></a>
              </div>
              <div className="pf-header-identity">
                <div className="pf-header-portrait"><ComMoldura steamId={j.steamId} emblema><Avatar id={j.steamId} src={j.avatar} nome={j.nome} classe="pf-header-avatar" /></ComMoldura></div>
                <div className="pf-header-bio">
                  <h1>{j.nome}<IconeEquipe steamId={j.steamId} /></h1>
                  <CargosDe steamId={j.steamId} max={2} classe="pf-header-cargos" />
                  <span className="pf-header-comunidade">{timeEscolhido ? <TimeEscolhido steamId={j.steamId} /> : 'Neura Project'}</span>
                  {pos > 0 && <a className="pf-header-ranking" href="/ranking/"><IconeUI tipo="trofeu" tamanho={22} />#{pos} {t('no ranking')}</a>}
                </div>
              </div>
              <div className="pf-header-actions">
                <button type="button" className="pf-header-icon" onClick={compartilharPerfil} aria-label={t('Copiar link do perfil')} title={t('Copiar link do perfil')}><IconeCabecalho tipo="compartilhar" /></button>
                {eu && <button type="button" className="pf-header-icon" onClick={() => setContaAberta(v => !v)} aria-label={t('Configurações da conta')} title={t('Configurações da conta')} aria-expanded={contaAberta}><IconeCabecalho tipo="ajustes" /></button>}
                {eu ? <button type="button" className="pf-header-customize" onClick={personalizar}>{t('Personalizar perfil')}</button> : <BotaoAmizade id={j.steamId} />}
              </div>
            </div>
            <nav className="pf-profile-nav" aria-label={t('Seções do perfil')}>
              <button type="button" aria-current={abaPerfil === 'status' ? 'page' : undefined} onClick={() => trocarAbaPerfil('status')}><IconeCabecalho tipo="perfil" />{t('Perfil')}</button>
              <button type="button" data-aba="inventario" aria-current={abaPerfil === 'inventario' ? 'page' : undefined} onClick={() => trocarAbaPerfil('inventario')}><IconeCabecalho tipo="inventario" />{t('Inventário')}</button>
              <button type="button" aria-current={abaPerfil === 'insignias' ? 'page' : undefined} onClick={() => trocarAbaPerfil('insignias')}>{t('Insígnias')}</button>
              {eu && <button type="button" aria-current={abaPerfil === 'missoes' ? 'page' : undefined} onClick={() => trocarAbaPerfil('missoes')}>Missões</button>}
              <a href="/ranking/"><SeloNivel nivel={nivel.nivel} tamanho={18} />{t('Ranking')}</a>
              <button type="button" aria-current={abaPerfil === 'amigos' ? 'page' : undefined} onClick={() => trocarAbaPerfil('amigos')}><IconeCabecalho tipo="amigos" />{t('Amigos')}</button>
              {eu && <button type="button" aria-current={abaPerfil === 'afiliado' ? 'page' : undefined} onClick={() => trocarAbaPerfil('afiliado')}><IconeCabecalho tipo="compartilhar" />{t('Afiliado')}</button>}
            </nav>
            <span className="pf-header-feedback" role="status">{linkCopiado}</span>
          </header>
          {contaAberta && eu && <ConfiguracoesConta id={j.steamId} fechar={() => setContaAberta(false)} />}
        </div>
        <FundoHero quantidade={10} rastros={false} />
        {/* Estilo FACEIT: cartão do jogador na esquerda (a capa pode virar personalizável no futuro) e as informações no meio */}
        {abaPerfil === 'inventario' ? <div className="wrap pf-inventario-pagina"><PerfilInventario key={j.steamId} steamId={j.steamId} nome={j.nome} abaPerfil="inventario" aoTrocarAba={trocarAbaPerfil} somenteInventario /></div> : abaPerfil === 'insignias' ? <div className="wrap"><GaleriaInsignias steamId={j.steamId} /></div> : abaPerfil === 'missoes' && eu ? <div className="wrap"><PainelMissoes /></div> : abaPerfil === 'amigos' ? <div className="wrap"><AmigosDoPerfil key={j.steamId} id={j.steamId} eu={eu} /></div> : abaPerfil === 'afiliado' && eu ? <div className="wrap"><AfiliadoDoPerfil id={j.steamId} /></div> : <div className="wrap pf-layout pf-v2">
          {/* Como na referência: quatro números grandes; à esquerda o gráfico e as partidas; à direita progressão, insígnias e
              time, seguidos do cartão do jogador e das outras informações (nada saiu da página) */}
          <div className="pf-v2-metricas">
            <MetricaPerfil icone="caveira" rotulo="Rating" valor={v(fmt(j.rating, 2))} sub={sem ? t('sem partidas') : t('melhor {v}', { v: fmt(j.melhorRating, 2) })} />
            <MetricaPerfil icone="partidas" rotulo="K/D" valor={v(fmt(j.kd, 2))} sub={t('{k} kills · {d} mortes', { k: j.kills, d: j.mortes })} />
            <MetricaPerfil icone="estatisticas" rotulo="ADR" valor={v(fmt(j.adr, 1))} sub={t('dano por round')} />
            <MetricaPerfil icone="trofeu" rotulo={t('Vitórias')} valor={v(`${fmt(j.winRate, 0)}%`)} sub={t('{v}V · {d}D em {n} mapas', { v: j.vitorias, d: derrotas, n: j.mapas })} />
          </div>

          <div className="pf-centro">
            {sem && (
              <div className="pf-sem spot">
                <b>{eu ? t('Você ainda não tem partidas no servidor') : t('Ainda sem partidas no servidor')}</b>
                <span>{eu ? t('Assim que você jogar um mapa, as estatísticas, o gráfico de rating e o histórico aparecem aqui — e cada partida dá XP para subir de nível.') : t('Assim que o jogador jogar um mapa, as estatísticas, o gráfico de rating e o histórico aparecem aqui — e cada partida dá XP para subir de nível.')}</span>
              </div>
            )}
            {mapas?.length > 0 && <GraficoRating mapas={mapas} />}
            {mapas?.length > 0 && <Historico mapas={mapas} />}
            <details className="pf-ref-mais"><summary>{t('Mais estatísticas e informações')}</summary>
            <PerfilInventario steamId={j.steamId} nome={j.nome} resumoStatus={resumoStatus} abaPerfil={abaPerfil} aoTrocarAba={trocarAbaPerfil}>
            <ApresentacaoPerfil />
            <DesempenhoRecente mapas={mapas || []} nivel={nivel} eu={eu} />

            <div className={`pf-estats${sem ? ' vazio' : ''}`}>
              <Estat rotulo="RATING" valor={v(fmt(j.rating, 2))} sub={sem ? t('sem partidas') : t('melhor {v}', { v: fmt(j.melhorRating, 2) })} classe={sem ? 'destaque' : `destaque rt-txt-${classeRating(j.rating)}`} />
              <Estat rotulo="K/D" valor={v(fmt(j.kd, 2))} sub={t('{k} kills · {d} mortes', { k: j.kills, d: j.mortes })} />
              <Estat rotulo="ADR" valor={v(fmt(j.adr, 1))} sub={t('dano por round')} />
              <Estat rotulo="KAST" valor={v(`${fmt(j.kast, 1)}%`)} sub={t('rounds com impacto')} />
              <Estat rotulo="HS%" valor={v(`${fmt(j.hsPct, 1)}%`)} sub={t('kills de headshot')} />
              <Estat rotulo={t('VITÓRIAS')} valor={v(`${fmt(j.winRate, 0)}%`)} sub={t('{v}V · {d}D em {n} mapas', { v: j.vitorias, d: derrotas, n: j.mapas })} />
              <Estat rotulo={t('ENTRADAS')} valor={v(`${j.fk} / ${j.fd}`)} sub={t('primeira kill / primeira morte')} />
              <Estat rotulo="MULTI-KILLS" valor={v(`${j.multi?.k5 || 0} · ${j.multi?.k4 || 0} · ${j.multi?.k3 || 0}`)} sub="5K · 4K · 3K" />
              <Estat rotulo={t('MVP DA PARTIDA')} valor={v(j.mvpPartida)} sub={t('{n} MVPs de round', { n: j.mvps })} />
            </div>

            {mapas?.length > 0 && <Armas mapas={mapas} steamId={j.steamId} />}
            </PerfilInventario>
            </details>
          </div>

          <aside className="pf-lado">
            <section className="v2-painel pf-v2-bloco pf-v2-progresso">
              <header className="v2-painel-cab"><h2><IconeUI tipo="estatisticas" tamanho={22} />{t('Progressão')}</h2></header>
              <div className="pf-v2-progresso-corpo">
                <SeloNivel nivel={nivel.nivel} tamanho={88} />
                <div>
                  <b>{nivel.classificado ? t('Nível {n}', { n: textoNivel(nivel.nivel) }) : t('Sem classificação')}</b>
                  <small>{nivel.classificado ? (nivel.proximo === null ? t('Nível máximo') : t('{falta} XP para o próximo nível', { falta: Number(nivel.falta || 0).toLocaleString('pt-BR') })) : nivel.faltamPartidas === 1 ? t('Falta 1 partida para obter seu nível.') : t('Faltam {n} partidas para obter seu nível.', { n: nivel.faltamPartidas })}</small>
                  <span className="pf-v2-barra"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, nivel.classificado ? nivel.progresso : nivel.partidas / Math.max(1, nivel.partidas + nivel.faltamPartidas))) * 100)}%` }} /></span>
                  {!nivel.classificado && <em className="v2-num">{nivel.partidas} / {nivel.partidas + nivel.faltamPartidas}</em>}
                </div>
              </div>
            </section>
            <section className="v2-painel pf-v2-bloco">
              <header className="v2-painel-cab"><h2><IconeUI tipo="estrela" tamanho={22} />{t('Insígnias')}</h2><a href="#insignias" onClick={(e) => { e.preventDefault(); trocarAbaPerfil('insignias') }}>{t('Ver todas')} <IconeUI tipo="direita" tamanho={15} /></a></header>
              <div className="pf-v2-insignias"><InsigniasDe steamId={j.steamId} classe="pf-insignias" /></div>
            </section>
            <section className="v2-painel pf-v2-bloco">
              <header className="v2-painel-cab"><h2><IconeUI tipo="grupo" tamanho={22} />{t('Time')}</h2><a href="/times/">{t('Ver times')} <IconeUI tipo="direita" tamanho={15} /></a></header>
              <div className="pf-v2-time">{timeEscolhido ? <TimeEscolhido steamId={j.steamId} classe="pf-v2-time-nome" /> : <span className="v2-vazio">{t('Sem time')}</span>}</div>
            </section>
            <details className="pf-ref-mais"><summary>{t('Mais sobre o jogador')}</summary>
            <HallDaFama j={j} pos={pos} total={total} nivel={nivel} eu={eu} avatar={<Avatar id={j.steamId} src={j.avatar} nome={j.nome} classe="hf-avatar-imagem" />}/>
            <div className={`pf-cartao fx-entra${card ? ' com-card' : ''}`} style={{ '--e': 1, ...(card ? { backgroundImage: fundoCard(card) } : {}) }}>
              <ComMoldura steamId={j.steamId} emblema>
                <Avatar id={j.steamId} src={j.avatar} nome={j.nome} classe="pf-av" />
              </ComMoldura>
              <div className="pf-id">
                {eu && <span className="pf-voce pf-voce-cartao">{t('VOCÊ')}</span>}
                <h2 className="nome-proprio">
                  {j.nome}
                  <IconeEquipe steamId={j.steamId} />
                </h2>
                {!eu && <StatusAmigo id={j.steamId} />}
                <CargosDe steamId={j.steamId} max={3} classe="pf-cargos" />
              </div>
            </div>
            <div className="pf-acoes pf-acoes-lado fx-entra" style={{ '--e': 2 }}>
              {!eu && <BotaoAmizade id={j.steamId} />}
              {!eu && (
                <button type="button" className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent('np-perfil-aba', { detail: 'inventario' }))}>
                  {t('Ver inventário')}
                </button>
              )}
              {eu && admin && <OcultarRanking steamId={j.steamId} />}
            </div>
            <InfosLado j={j} mapas={mapas} />
            </details>
            {verInventario && <InventarioDoJogador steamId={j.steamId} nome={j.nome} aoFechar={() => setVerInventario(false)} />}
          </aside>
        </div>}
      </section>
    </>
  )
}

// Perfil sem login: o conteúdo fica embaçado e sem clique (inert), com um cartão fixo no meio da tela pedindo o login.
// Entrar volta para este mesmo perfil (entrar() usa o endereço atual).
function TravaLogin({ children }) {
  const t = useT()
  return (
    <div className="pf-trava">
      <div className="pf-trava-conteudo" aria-hidden="true" inert="">
        {children}
      </div>
      <div className="pf-trava-aviso" role="dialog" aria-modal="false" aria-labelledby="pf-trava-titulo">
        <div className="pf-trava-cartao">
          <span className="pf-trava-icone" aria-hidden="true">
            <IconeUI tipo="cadeado" tamanho={26}/>
          </span>
          <h2 id="pf-trava-titulo">{t('Entre para ver este perfil')}</h2>
          <p>{t('Estatísticas, histórico de partidas, armas e nível dos jogadores ficam disponíveis para quem entra com a conta Steam.')}</p>
          <button type="button" className="btn btn-primary" onClick={entrar}>
            <IconeSteam /> {t('Entrar com Steam')}
          </button>
          <a className="pf-trava-voltar" href="/ranking/">
            {t('Voltar para o ranking')}
          </a>
        </div>
      </div>
    </div>
  )
}

// Tela simples (sem login, jogador sem partidas, carregando)
function Aviso({ titulo, texto, children }) {
  const t = useT()
  return (
    <section className="hero pf-hero pf-aviso">
      <FundoHero quantidade={10} rastros={false} />
      <div className="wrap">
        <span className="kicker">{t('PERFIL DO JOGADOR')}</span>
        <h1>{t(titulo)}</h1>
        {texto && <p className="lead">{t(texto)}</p>}
        {children && <div className="pf-acoes">{children}</div>}
      </div>
    </section>
  )
}

export default function Perfil() {
  const t = useT()
  const conta = useConta()
  const [idUrl, setIdUrl] = useState(null) // null = ainda não leu o endereço (HTML gerado)
  const [dados, setDados] = useState(null)
  const [editando, setEditando] = useState(false) // janela "Personalizar" aberta
  const [steamPublico, setSteamPublico] = useState(null) // nome/avatar da Steam de quem não está no ranking

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id') || ''
    setIdUrl(/^\d{17}$/.test(id) ? id : '')
  }, [])

  const id = idUrl || conta?.id || ''
  useEffect(() => {
    if (!id) return
    let vivo = true
    setDados(null)
    Promise.all([lerJson('/ranking/ranking.json'), lerJson(`/perfil/historico/${id}.json`)]).then(([ranking, mapas]) => {
      if (vivo) setDados({ id, ranking, mapas: Array.isArray(mapas) ? mapas : [] })
    })
    return () => {
      vivo = false
    }
  }, [id])

  // Jogador fora do ranking (sem partidas): nome e avatar da Steam pelo worker (/jogador, público)
  const noRanking = !!dados?.ranking?.jogadores?.some((x) => x.steamId === id)
  useEffect(() => {
    if (!id || !dados || noRanking || !enderecoApi()) return
    let vivo = true
    lerApi(`/jogador?id=${encodeURIComponent(id)}`)
      .then((d) => vivo && setSteamPublico({ id, nome: d.nome || '', avatar: d.avatar || '' }))
      .catch(seForErroApi()) // sem resposta: fica o SteamID
    return () => {
      vivo = false
    }
  }, [id, dados, noRanking])

  // Nome do jogador na aba do navegador
  const perfisNick = usePerfis()
  const jRanking = dados?.ranking?.jogadores?.find((x) => x.steamId === id)
  // apelido escolhido no site no lugar do nome do jogo
  const j = jRanking && perfisNick[id]?.nick ? { ...jRanking, nome: perfisNick[id].nick } : jRanking
  useEffect(() => {
    if (j) document.title = `${j.nome} — ${t('Perfil')} | Neura Project`
  }, [j, t.idioma]) // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = useCallback(() => setEditando(false), [])
  // Deploy novo (partida terminou): recarrega sozinha com os números e o histórico atualizados
  useAoVivo('/ranking/ranking.json', undefined, { selecionar: (r) => r?.atualizado, ativo: !editando })
  // Seu nível (trava das molduras por nível) e se é admin (sem trava)
  const { admin } = useAdmin(conta)
  const perfis = usePerfis()
  const meuNivel = useNivelDe(dados?.ranking?.jogadores?.find((x) => x.steamId === conta?.id) || { steamId: conta?.id, xp: 0 })
  const minhaFoto = useAvatar(conta?.id, conta?.avatar) // prévia do "Personalizar" com a foto atual
  let conteudo
  // Sem login, o perfil de um jogador aparece embaçado com o pedido para entrar (a tela "Seu perfil" já pede login)
  let travado = false
  if (idUrl === null || (id && (!dados || dados.id !== id))) {
    conteudo = <CarregandoNP />
  } else if (!id) {
    conteudo = loginAtivo() ? (
      <Aviso titulo="Seu perfil" texto="Entre com a Steam para ver suas estatísticas, seu histórico de partidas e sua posição no ranking.">
        <button type="button" className="btn btn-primary" onClick={entrar}>
          <IconeSteam /> {t('Entrar com Steam')}
        </button>
      </Aviso>
    ) : (
      <Aviso titulo="Perfil do jogador" texto="Abra o perfil de um jogador pelo ranking.">
        <a className="btn btn-primary" href="/ranking/">
          {t('Ver ranking')}
        </a>
      </Aviso>
    )
  } else if (!j) {
    // Sem partidas: o perfil aparece do mesmo jeito (nível pelo ajuste do admin, moldura, time), números em "—"
    const eu = conta?.id === id
    const vazio = {
      steamId: id,
      nome: perfisNick[id]?.nick || (eu && conta.nome) || (steamPublico?.id === id && steamPublico.nome) || t('Jogador'),
      avatar: (eu && conta.avatar) || (steamPublico?.id === id && steamPublico.avatar) || '',
      time: '', logoTime: '', premier: null, xp: 0,
      mapas: 0, vitorias: 0, kills: 0, mortes: 0, fk: 0, fd: 0, multi: {}, mvps: 0, mvpPartida: 0, rating: 0, melhorRating: 0, adr: 0, kast: 0, hsPct: 0, kd: 0, winRate: 0,
    }
    conteudo = <Jogador j={vazio} mapas={[]} pos={0} total={0} eu={eu} admin={admin} personalizar={() => setEditando(true)} />
    travado = !conta && loginAtivo()
  } else {
    // Quem está oculto do ranking fica sem posição (e não conta para a dos outros)
    const ordem = ordenarRanking(dados.ranking.jogadores, perfis)
    conteudo = <Jogador j={j} mapas={dados.mapas} pos={ordem.findIndex(jogador => jogador.steamId === j.steamId) + 1} total={ordem.length} eu={conta?.id === id} admin={admin} personalizar={() => setEditando(true)} />
    travado = !conta && loginAtivo()
  }

  return (
    <Layout pagina="perfil">
      <main>{travado ? <TravaLogin>{conteudo}</TravaLogin> : <PerfilProtegido id={id}>{conteudo}</PerfilProtegido>}</main>
      {editando && conta && (
        <SeletorMoldura steamId={conta.id} avatar={minhaFoto || j?.avatar} nome={conta.nome || j?.nome || t('Você')} nivel={meuNivel.nivel} admin={admin} fechar={fechar} />
      )}
    </Layout>
  )
}
