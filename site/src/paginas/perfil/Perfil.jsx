import { useCallback, useEffect, useState } from 'react'
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
import { mapIcon, nomeMapa } from '../../comum/mapas.js'
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
import { InsigniasDe } from '../../comum/Insignias.jsx'
import HallDaFama from './HallDaFama.jsx'
import ConfiguracoesConta from './ConfiguracoesConta.jsx'
import PerfilProtegido, { ApresentacaoPerfil } from './PerfilProtegido.jsx'
import { AmigosDoPerfil, AfiliadoDoPerfil } from './PerfilSocial.jsx'

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
  const [foco, setFoco] = useState(null)
  const lista = mapas.slice(0, NO_GRAFICO).reverse()
  // Escala: até 3 de 0,5 em 0,5; acima disso, passos maiores (sempre umas 4–6 linhas)
  const maior = Math.max(2, ...lista.map((m) => m.rating))
  const passo = maior <= 3 ? 0.5 : maior <= 6 ? 1 : Math.ceil(maior / 4)
  const topo = Math.ceil(maior / passo) * passo
  const linhas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, k) => k * passo)
  // Tooltip abre para o lado com mais espaço (barra na metade direita do gráfico: abre para a esquerda)
  const mostrar = (e, i) => {
    const col = e.currentTarget.getBoundingClientRect()
    const area = e.currentTarget.parentElement.getBoundingClientRect()
    setFoco({ i, esq: col.left - area.left > area.width / 2 })
  }
  return (
    <div className="pf-grafico-card spot">
      <div className="pf-card-cab">
        <h2>{t('Rating por mapa')}</h2>
        <span className="mono">{t('ÚLTIMOS {n} MAPAS', { n: lista.length })}</span>
      </div>
      <div className="pf-grafico">
        <div className="pf-grade" aria-hidden="true">
          {/* 1.00 (média) sempre aparece, mesmo quando a escala pula de 3 em 3 */}
          {(linhas.includes(1) ? linhas : [...linhas, 1]).map((v) => (
            <div key={v} className={`pf-linha${v === 1 ? ' media' : ''}`} style={{ bottom: `${(v / topo) * 100}%` }}>
              <span>{passo >= 1 && v !== 1 ? v : v.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="pf-barras">
          {lista.map((m, i) => (
            <a
              key={m.caminho}
              href={linkPartida(m.caminho)}
              className={`pf-col${foco?.i === i ? ' foco' : ''}`}
              onPointerEnter={(e) => mostrar(e, i)}
              onPointerLeave={() => setFoco(null)}
              onFocus={(e) => mostrar(e, i)}
              onBlur={() => setFoco(null)}
              aria-label={`${nomeMapa(m.mapa)}, ${m.venceu ? t('vitória') : t('derrota')} ${m.placar[0]}–${m.placar[1]}, rating ${fmt(m.rating, 2)}`}
            >
              <i style={{ height: `${Math.max(1.5, (m.rating / topo) * 100)}%` }} />
              {foco?.i === i && (
                <span className={`pf-tip${foco.esq ? ' esq' : ''}`} role="tooltip">
                  <b>{nomeMapa(m.mapa)}</b>
                  <span>
                    {m.venceu ? t('Vitória') : t('Derrota')} {m.placar[0]}–{m.placar[1]} vs {m.adversario}
                  </span>
                  <span>
                    Rating <b>{fmt(m.rating, 2)}</b> · {m.kills}/{m.mortes}/{m.assist} · ADR {fmt(m.adr, 1)}
                  </span>
                  <span className="mono">{dataBr(m.data, t.local)}</span>
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
      <div className="pf-vd" aria-hidden="true">
        {lista.map((m) => (
          <span key={m.caminho} className={m.venceu ? 'v' : 'd'}>
            {m.venceu ? t('V') : t('D')}
          </span>
        ))}
      </div>
    </div>
  )
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

// Histórico de partidas: uma linha por mapa, com a faixa da cor do resultado na esquerda (verde vitória, vermelho derrota)
function Historico({ mapas }) {
  const t = useT()
  const [qtd, setQtd] = useState(POR_PAGINA)
  return (
    <div className="pf-hist-card spot">
      <div className="pf-card-cab">
        <h2>{t('Histórico de partidas')}</h2>
        <span className="mono">{t('{n} MAPAS', { n: mapas.length })}</span>
      </div>
      <div className="pf-hist">
        <div className="pf-hist-cab" aria-hidden="true">
          <span>{t('Data')}</span>
          <span>{t('Pontuação')}</span>
          <span className="pf-c-partida">{t('Partida')}</span>
          <span className="pf-c-xp">XP</span>
          <span>{t('Rating')}</span>
          <span>K / D / A</span>
          <span>{t('Mapa')}</span>
        </div>
        {mapas.slice(0, qtd).map((m) => {
          const [dia, hora] = quando(m.data, t.local)
          return (
            <a key={m.caminho} className={`pf-hist-linha ${m.venceu ? 'v' : 'd'}`} href={linkPartida(m.caminho)}>
              <span className="pf-c-data">
                <b>{dia}</b>
                <small>{hora}</small>
              </span>
              <span className="pf-c-placar">
                <i className="pf-vd-tag">{m.venceu ? t('V') : t('D')}</i>
                <span>
                  <b className={m.venceu ? 'ganhou' : 'perdeu'}>{m.placar[0]}</b> : {m.placar[1]}
                </span>
              </span>
              <span className="pf-c-partida">
                <span>
                  {m.time} <em>vs</em> {m.adversario}
                </span>
                {m.serie && <small>{m.serie}</small>}
              </span>
              <span className={`pf-c-xp pf-xp-mapa${m.xp < 0 ? ' perdeu' : ''}`}>
                {m.xp !== 0 && <i aria-hidden="true">{m.xp < 0 ? '↓' : '↑'}</i>} {Math.abs(m.xp)}
              </span>
              <span className="pf-c-rating">
                <span className={`rt rt-${classeRating(m.rating)}`}>
                  {fmt(m.rating, 2)}
                  <i style={{ width: `${Math.min(100, Math.max(4, (m.rating / 2) * 100))}%` }} />
                </span>
                {m.mvp && (
                  <span className="pf-mvp" title={t('MVP da partida')}>
                    ★
                  </span>
                )}
              </span>
              <span className="pf-c-kda">
                <b>
                  {m.kills} / {m.mortes} / {m.assist}
                </b>
                <small>
                  ADR {fmt(m.adr, 1)} · HS {m.hs}%
                </small>
              </span>
              <span className="pf-c-mapa">
                <img src={mapIcon(m.mapa)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                {nomeMapa(m.mapa)}
              </span>
            </a>
          )
        })}
      </div>
      {qtd < mapas.length && (
        <button type="button" className="pf-mais" onClick={() => setQtd((q) => q + POR_PAGINA)}>
          {t('Mostrar mais ({n})', { n: mapas.length - qtd })}
        </button>
      )}
    </div>
  )
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
      <div className="pf-lado-bloco pf-insig-lado">
        <h3>{t('Insígnias')}</h3>
        <InsigniasDe steamId={j.steamId} classe="pf-insignias" />
      </div>
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

function IconeCabecalho({ tipo }) {
  const paths = {
    perfil: 'M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    inventario: 'M6 7h12v14H6zM9 7V4h6v3M9 11h6M9 15h6',
    amigos: 'M16 21v-2a5 5 0 0 0-10 0v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M20 21v-2a5 5 0 0 0-3-4',
    foto: 'M3 7h4l2-3h6l2 3h4v14H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    ajustes: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    compartilhar: 'M8 12l8-5M8 12l8 5M5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[tipo]} /></svg>
}

function Jogador({ j, mapas, pos, total, eu, personalizar, admin = false }) {
  const t = useT()
  const timeEscolhido = useTimeDe(j.steamId)
  const [verInventario, setVerInventario] = useState(false)
  const [abaPerfil, setAbaPerfil] = useState(() => typeof location !== 'undefined' && ['#inventario', '#amigos', '#afiliado'].includes(location.hash) ? location.hash.slice(1) : 'status')
  const [linkCopiado, setLinkCopiado] = useState('')
  const trocarAbaPerfil = (aba) => {
    setAbaPerfil(aba)
    history.replaceState(null, '', location.pathname + location.search + (aba !== 'status' ? `#${aba}` : ''))
  }
  useEffect(() => {
    const atualizar = () => setAbaPerfil(['#inventario', '#amigos', '#afiliado'].includes(location.hash) ? location.hash.slice(1) : 'status')
    window.addEventListener('hashchange', atualizar)
    return () => window.removeEventListener('hashchange', atualizar)
  }, [])
  const abrirFotoPersonalizada = () => {
    trocarAbaPerfil('status')
    setTimeout(() => {
      const editor = document.querySelector('.hf-editar')
      if (editor) { editor.open = true; editor.scrollIntoView({ behavior: 'smooth', block: 'center' }); editor.querySelector('summary')?.focus({ preventScroll: true }) }
    }, 0)
  }
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
        <div className="pf-cover" style={card ? { '--pf-cover': fundoCard(card) } : undefined} aria-hidden="true" />
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
                <h1>{j.nome}</h1>
                <span>{t('Comunidade Neura Project')}</span>
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
              <a href="/ranking/"><SeloNivel nivel={nivel.nivel} tamanho={18} />{t('Ranking')}</a>
              <button type="button" aria-current={abaPerfil === 'amigos' ? 'page' : undefined} onClick={() => trocarAbaPerfil('amigos')}><IconeCabecalho tipo="amigos" />{t('Amigos')}</button>
              {eu && <button type="button" aria-current={abaPerfil === 'afiliado' ? 'page' : undefined} onClick={() => trocarAbaPerfil('afiliado')}><IconeCabecalho tipo="compartilhar" />{t('Afiliado')}</button>}
              {eu && <button type="button" onClick={abrirFotoPersonalizada}><IconeCabecalho tipo="foto" />{t('Foto personalizada')}</button>}
            </nav>
            <span className="pf-header-feedback" role="status">{linkCopiado}</span>
          </header>
          {contaAberta && eu && <ConfiguracoesConta id={j.steamId} fechar={() => setContaAberta(false)} />}
        </div>
        <FundoHero quantidade={10} rastros={false} />
        {/* Estilo FACEIT: cartão do jogador na esquerda (a capa pode virar personalizável no futuro) e as informações no meio */}
        {abaPerfil === 'amigos' ? <div className="wrap"><AmigosDoPerfil key={j.steamId} id={j.steamId} eu={eu} /></div> : abaPerfil === 'afiliado' && eu ? <div className="wrap"><AfiliadoDoPerfil id={j.steamId} /></div> : <div className="wrap pf-layout">
          <aside className="pf-lado">
            <HallDaFama j={j} pos={pos} total={total} nivel={nivel} eu={eu}/>
            <div className={`pf-cartao fx-entra${card ? ' com-card' : ''}`} style={{ '--e': 1, ...(card ? { backgroundImage: fundoCard(card) } : {}) }}>
              <ComMoldura steamId={j.steamId} emblema>
                <Avatar id={j.steamId} src={j.avatar} nome={j.nome} classe="pf-av" />
              </ComMoldura>
              <div className="pf-id">
                {eu && <span className="pf-voce pf-voce-cartao">{t('VOCÊ')}</span>}
                <h1 className="nome-proprio">
                  {j.nome}
                  <IconeEquipe steamId={j.steamId} />
                </h1>
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
            {verInventario && <InventarioDoJogador steamId={j.steamId} nome={j.nome} aoFechar={() => setVerInventario(false)} />}
          </aside>

          <div className="pf-centro">
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

            {sem && (
              <div className="pf-sem spot">
                <b>{eu ? t('Você ainda não tem partidas no servidor') : t('Ainda sem partidas no servidor')}</b>
                <span>{eu ? t('Assim que você jogar um mapa, as estatísticas, o gráfico de rating e o histórico aparecem aqui — e cada partida dá XP para subir de nível.') : t('Assim que o jogador jogar um mapa, as estatísticas, o gráfico de rating e o histórico aparecem aqui — e cada partida dá XP para subir de nível.')}</span>
              </div>
            )}

            {mapas?.length > 0 && <GraficoRating mapas={mapas} />}
            {mapas?.length > 0 && <Armas mapas={mapas} steamId={j.steamId} />}
            {mapas?.length > 0 && <Historico mapas={mapas} />}
            </PerfilInventario>
          </div>
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
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
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
