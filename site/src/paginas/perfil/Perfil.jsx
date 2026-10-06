import { useCallback, useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { useAoVivo } from '../../comum/aoVivo.js'
import { CONFIG } from '../../comum/config.js'
import { ordenarRanking } from '../../comum/ranking.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'
import { IconeSteam } from '../../comum/Icones.jsx'
import { nomeArma, somarArmas, urlArma } from '../../comum/armas.js'
import { nomeMapa } from '../../comum/mapas.js'
import { CargosDe, ComMoldura, TimeEscolhido, salvarPerfil, useAdmin, usePerfis, useTimeDe } from '../../comum/Moldura.jsx'
import Premier from '../../comum/Premier.jsx'
import { BarraXp, SeloNivel, useNivelDe } from '../../comum/Nivel.jsx'
import SeletorMoldura from './SeletorMoldura.jsx'
import { useT } from '../../comum/i18n.js'

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

function Avatar({ src, nome, classe }) {
  const [erro, setErro] = useState(false)
  return urlOk(src) && !erro ? (
    <img className={classe} src={src} alt="" onError={() => setErro(true)} />
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

function Historico({ mapas }) {
  const t = useT()
  const [qtd, setQtd] = useState(POR_PAGINA)
  return (
    <div className="pf-hist-card spot">
      <div className="pf-card-cab">
        <h2>{t('Histórico de partidas')}</h2>
        <span className="mono">{t('{n} MAPAS', { n: mapas.length })}</span>
      </div>
      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th className="esq">{t('DATA')}</th>
              <th className="esq">{t('MAPA')}</th>
              <th className="esq">{t('PARTIDA')}</th>
              <th>{t('RESULTADO')}</th>
              <th>K / D / A</th>
              <th>ADR</th>
              <th>HS%</th>
              <th>RATING</th>
              <th>XP</th>
            </tr>
          </thead>
          <tbody>
            {mapas.slice(0, qtd).map((m) => (
              <tr key={m.caminho} onClick={() => (location.href = linkPartida(m.caminho))}>
                <td className="esq mono">{dataBr(m.data, t.local)}</td>
                <td className="esq">
                  <a href={linkPartida(m.caminho)} className="pf-mapa">
                    {nomeMapa(m.mapa)}
                  </a>
                  {m.serie && <span className="pf-serie">{m.serie}</span>}
                </td>
                <td className="esq pf-partida">
                  <span>{m.time}</span> <b>vs</b> <span>{m.adversario}</span>
                </td>
                <td>
                  <span className={`pf-res ${m.venceu ? 'v' : 'd'}`}>
                    {m.venceu ? t('V') : t('D')} {m.placar[0]}–{m.placar[1]}
                  </span>
                </td>
                <td className="mono">
                  {m.kills} / {m.mortes} / {m.assist}
                </td>
                <td className="mono">{fmt(m.adr, 1)}</td>
                <td className="mono">{m.hs}%</td>
                <td>
                  <span className={`rt rt-${classeRating(m.rating)}`}>{fmt(m.rating, 2)}</span>
                  {m.mvp && (
                    <span className="pf-mvp" title={t('MVP da partida')}>
                      ★
                    </span>
                  )}
                </td>
                <td className={`mono pf-xp-mapa${m.xp < 0 ? ' perdeu' : ''}`}>{m.xp > 0 ? `+${m.xp}` : m.xp < 0 ? m.xp : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
const ARMAS_NA_LISTA = 8
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
function ImagemArma({ id }) {
  const [erro, setErro] = useState(false)
  const url = urlArma(id)
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
function Armas({ mapas }) {
  const t = useT()
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
    <label className={`pf-ocultar${oculto ? ' ligado' : ''}`}>
      <input type="checkbox" checked={oculto} disabled={salvando} onChange={trocar} />
      <span className="pf-ocultar-chave" aria-hidden="true" />
      <span>
        <b>{t('Ocultar do ranking')}</b>
        <small>
          {erro ? t('Não deu para salvar. Tente de novo.') : oculto ? t('Você não aparece no ranking e o próximo sobe de posição.') : t('Só o dono e os admins têm esta opção.')}
        </small>
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

// Ícone do botão "Personalizar"
function IconePincel() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function Jogador({ j, mapas, pos, total, eu, personalizar, admin = false }) {
  const t = useT()
  const timeEscolhido = useTimeDe(j.steamId)
  const nivel = useNivelDe(j)
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
  const sem = !j.mapas // ainda sem partidas: perfil aparece igual, com os números em "—"
  const v = (texto) => (sem ? '—' : texto)
  return (
    <>
      <section className="hero pf-hero">
        <FundoHero quantidade={10} />
        <div className="wrap pf-topo">
          <ComMoldura steamId={j.steamId}>
            <Avatar src={j.avatar} nome={j.nome} classe="pf-av fx-entra" />
          </ComMoldura>
          <div className="pf-id fx-entra" style={{ '--e': 1 }}>
            <span className="kicker">
              {t('PERFIL DO JOGADOR')}{eu && <span className="pf-voce">{t('VOCÊ')}</span>}
            </span>
            <h1>{j.nome}</h1>
            <div className="pf-meta">
              <span className="pf-nivel">
                <SeloNivel nivel={nivel.nivel} tamanho={38} />
                <span>
                  {t('NÍVEL')} <b>{nivel.nivel}</b>
                </span>
              </span>
              <CargosDe steamId={j.steamId} max={3} />
              {/* Time escolhido no "Personalizar"; sem escolha, o da última partida */}
              <TimeEscolhido steamId={j.steamId} classe="pf-time" />
              {!timeEscolhido && j.time && (
                <span className="pf-time">
                  {urlOk(j.logoTime) && <img src={j.logoTime} alt="" />}
                  {j.time}
                </span>
              )}
              <Premier key={premier || 0} j={{ ...j, premier }} />
              {pos > 0 && (
                <a className="pf-pos" href="/ranking/">
                  #{pos} <small>{t('de {total} no ranking', { total })}</small>
                </a>
              )}
            </div>
            <BarraXp info={nivel} classe="pf-xp" />
            <div className="pf-acoes">
              {eu && (
                <button type="button" className="btn btn-primary" onClick={personalizar}>
                <IconePincel /> {t('Personalizar')}
              </button>
              )}
              <a className="btn btn-ghost" href={steam(j.steamId)} target="_blank" rel="noopener">
                <IconeSteam /> {t('Perfil na Steam')}
              </a>
              <a className="btn btn-ghost" href="/ranking/">
                {t('Ver ranking')}
              </a>
            </div>
            {eu && admin && <OcultarRanking steamId={j.steamId} />}
          </div>
        </div>
      </section>

      <section className="secao pf-secao">
        <div className="wrap">
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
          {mapas?.length > 0 && <Armas mapas={mapas} />}
          {mapas?.length > 0 && <Historico mapas={mapas} />}
        </div>
      </section>
    </>
  )
}

// Tela simples (sem login, jogador sem partidas, carregando)
function Aviso({ titulo, texto, children }) {
  const t = useT()
  return (
    <section className="hero pf-hero pf-aviso">
      <FundoHero quantidade={10} />
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
    if (!id || !dados || noRanking || !CONFIG.loginSteam) return
    let vivo = true
    fetch(`${CONFIG.loginSteam.replace(/\/$/, '')}/jogador?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && d && setSteamPublico({ id, nome: d.nome || '', avatar: d.avatar || '' }))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [id, dados, noRanking])

  // Nome do jogador na aba do navegador
  const j = dados?.ranking?.jogadores?.find((x) => x.steamId === id)
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
  let conteudo
  if (idUrl === null || (id && (!dados || dados.id !== id))) {
    conteudo = <Aviso titulo="Carregando perfil…" />
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
      nome: (eu && conta.nome) || (steamPublico?.id === id && steamPublico.nome) || t('Jogador'),
      avatar: (eu && conta.avatar) || (steamPublico?.id === id && steamPublico.avatar) || '',
      time: '', logoTime: '', premier: null, xp: 0,
      mapas: 0, vitorias: 0, kills: 0, mortes: 0, fk: 0, fd: 0, multi: {}, mvps: 0, mvpPartida: 0, rating: 0, melhorRating: 0, adr: 0, kast: 0, hsPct: 0, kd: 0, winRate: 0,
    }
    conteudo = <Jogador j={vazio} mapas={[]} pos={0} total={0} eu={eu} admin={admin} personalizar={() => setEditando(true)} />
  } else {
    // Quem está oculto do ranking fica sem posição (e não conta para a dos outros)
    const ordem = ordenarRanking(dados.ranking.jogadores, perfis)
    conteudo = <Jogador j={j} mapas={dados.mapas} pos={ordem.indexOf(j) + 1} total={ordem.length} eu={conta?.id === id} admin={admin} personalizar={() => setEditando(true)} />
  }

  return (
    <Layout pagina="perfil">
      <main>{conteudo}</main>
      {editando && conta && (
        <SeletorMoldura steamId={conta.id} avatar={conta.avatar || j?.avatar} nome={conta.nome || j?.nome || t('Você')} nivel={meuNivel.nivel} admin={admin} fechar={fechar} />
      )}
    </Layout>
  )
}
