// Painel "Social" (computador): botão na barra da direita e painel encostado nela, com duas abas:
//   AMIGOS — a lista no estilo do Discord (Pedidos, Online, Ausente, Offline); o balão ao lado de cada amigo abre o chat direto com ele.
//   CHATS  — as conversas (prévia da última mensagem, hora e não lidas); clicar abre a conversa (mensagens.js: histórico e envio).
// Abre por cima do site (não empurra a página); fecha com Esc ou clicando fora.
// Aberto/fechado e a última aba ficam guardados no navegador. Amigos e presença: comum/amigos.js. Chat: comum/mensagens.js.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lerApi, seForErroApi } from './api.js'
import { acaoAmizade, buscarJogadores, relacaoCom, tempoDesde, useAmigos } from './amigos.js'
import { carregarMensagens, definirConversaAberta, enviarMensagem, horaOuData, useConversas } from './mensagens.js'
import { useAvatar } from './avatares.js'
import { linkPerfil } from './conta.js'
import { lerJson } from './dados.js'
import { CargosDe, ComMoldura, IconeEquipe } from './Moldura.jsx'
import { useT } from './i18n.js'
import { InsigniasMini } from './Insignias.jsx'

const CHAVE = 'np_amigos_aberto'

export function IconeAmigos({ tamanho = 20 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20" />
    </svg>
  )
}

function Foto({ a }) {
  const src = useAvatar(a.id, a.avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" loading="lazy" onError={() => setErro(src)} /> : <span className="am-ini">{(a.nome || '?').slice(0, 2).toUpperCase()}</span>
}

function IconeBalao({ tamanho = 16 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.65 7.11L4 20l1.3-4.74A8 8 0 1 1 21 12Z" />
    </svg>
  )
}

function Linha({ a, st, visto, aoConversar, children }) {
  const t = useT()
  return (
    <li className={`am-linha am-${st}`}>
      <a className="am-pessoa" href={linkPerfil(a.id)} title={a.nome || a.id}>
        <span className="am-av">
          <ComMoldura steamId={a.id}>
            <Foto a={a} />
          </ComMoldura>
          <i className="am-bolinha" aria-label={t(st === 'online' ? 'Online' : st === 'jogando' ? 'Jogando' : st === 'ausente' ? 'Ausente' : 'Offline')} />
        </span>
        <span className="am-txt">
          <span className="am-nome">
            <b>{a.nome || a.id}</b>
            <IconeEquipe steamId={a.id} />
            {/* Insígnias na frente do ícone de verificado, com um espaço */}
            <InsigniasMini steamId={a.id} max={3} classe="am-ins" />
          </span>
          {st === 'jogando' ? <small className="am-jogando">{t('Jogando')}</small> : st === 'offline' && visto ? <small>{t('visto {quando}', { quando: tempoDesde(visto, t) })}</small> : <CargosDe steamId={a.id} max={1} classe="am-cargos" />}
        </span>
      </a>
      {aoConversar && (
        <button type="button" className="am-conversar" onClick={() => aoConversar(a.id)} title={t('Conversar')} aria-label={t('Conversar com {nome}', { nome: a.nome || a.id })}>
          <IconeBalao />
        </button>
      )}
      {children}
    </li>
  )
}

function Grupo({ titulo, n, children, classe = '' }) {
  if (!n) return null
  return (
    <section className={`am-grupo ${classe}`}>
      <h4>
        {titulo} — {n}
      </h4>
      <ul>{children}</ul>
    </section>
  )
}

// SteamID (17 dígitos) ou link do perfil da Steam (steamcommunity.com/profiles/<id>) -> SteamID
const extrairId = (txt) => /(?<!\d)(\d{17})(?!\d)/.exec(txt)?.[1] || null
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Adicionar amigo: por nome (quem já jogou ou visitou o site), SteamID, link do perfil ou nome de usuário da Steam (/id/<isto>).
// As três últimas formas acham a pessoa pela própria Steam (GET /jogador, público): funciona mesmo com quem nunca entrou no site.
function AdicionarAmigo({ lista, eu }) {
  const t = useT()
  const [busca, setBusca] = useState('')
  const [jogadores, setJogadores] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')

  const carregar = () => {
    if (jogadores === null) lerJson('/ranking/ranking.json').then((r) => setJogadores(Array.isArray(r?.jogadores) ? r.jogadores : []))
  }
  const termo = busca.trim()
  const id = extrairId(termo)
  // Quem entrou no site mas nunca jogou no servidor não está no ranking: o worker procura nos que já entraram com a Steam
  const [doSite, setDoSite] = useState([])
  useEffect(() => {
    if (id || termo.length < 2) return setDoSite([])
    let vivo = true
    const espera = setTimeout(() => {
      buscarJogadores(termo)
        .then((l) => vivo && setDoSite(l))
        .catch(seForErroApi(() => vivo && setDoSite([])))
    }, 250)
    return () => {
      vivo = false
      clearTimeout(espera)
    }
  }, [termo, id])
  // Achar pela Steam direto: sempre que tem um SteamID/link exato, ou (sem achar ninguém por nome) o texto tem cara de nome de
  // usuário da Steam ou de link do perfil — assim dá para adicionar quem nunca entrou no site, só por esses dados.
  const [porLink, setPorLink] = useState(null)
  useEffect(() => {
    setPorLink(null)
    const pareceVanity = /steamcommunity\.com\//i.test(termo) || /^[\w-]{2,32}$/.test(termo)
    const alvo = id || (pareceVanity ? termo : '')
    if (!alvo) return
    let vivo = true
    const espera = setTimeout(() => {
      lerApi(`/jogador?${id ? 'id' : 'perfil'}=${encodeURIComponent(alvo)}`)
        .then((d) => vivo && setPorLink(d?.id ? d : null))
        .catch(seForErroApi(() => vivo && setPorLink(null)))
    }, 350)
    return () => {
      vivo = false
      clearTimeout(espera)
    }
  }, [termo, id])
  let achados = []
  if (id) achados = id === eu ? [] : [{ id, nome: porLink?.nome || '', avatar: porLink?.avatar || '' }]
  else if (termo.length >= 2) {
    const q = semAcento(termo)
    const doRanking = (jogadores || []).filter((j) => j.steamId !== eu && semAcento(j.nome).includes(q)).map((j) => ({ id: j.steamId, nome: j.nome, avatar: j.avatar }))
    const vistos = new Set()
    achados = [...doRanking, ...doSite.filter((j) => j.id !== eu)].filter((a) => !vistos.has(a.id) && vistos.add(a.id)).slice(0, 8)
    // ninguém com esse nome entre quem já visitou: se também parece um link ou nome de usuário da Steam, usa quem ela achou
    // marcado "porSteam": pode não ser quem a pessoa está pensando (achado só pelo nome de usuário da Steam, não pelo nome no site)
    if (!achados.length && porLink && porLink.id !== eu) achados = [{ ...porLink, porSteam: true }]
  }

  const fazer = async (acao, alvo) => {
    setOcupado(alvo)
    setErro('')
    try {
      await acaoAmizade(acao, alvo)
    } catch (e) {
      setErro(e.message === 'limite' ? t('Você chegou ao limite de amigos.') : t('Não deu certo. Tente de novo.'))
    } finally {
      setOcupado('')
    }
  }

  return (
    <div className="am-busca">
      <input
        type="search"
        value={busca}
        placeholder={t('Nome, SteamID ou link do perfil')}
        aria-label={t('Adicionar amigo por nome, SteamID ou link do perfil')}
        onFocus={carregar}
        onChange={(e) => setBusca(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {achados.length > 0 && (
        <ul className="am-achados">
          {achados.map((a) => {
            const rel = relacaoCom(lista, a.id)
            return (
              <Linha key={a.id} a={a} st="pedido">
                {a.porSteam && <small className="am-achado-steam" title={t('Achado pelo nome de usuário da Steam, não pelo nome no site: confira se é mesmo quem você procura.')}>{t('Steam')}</small>}
                {rel === 'amigo' && <span className="am-ja">{t('Amigos')} ✓</span>}
                {rel === 'enviado' && <span className="am-ja">{t('Pedido enviado')}</span>}
                {rel === 'recebido' && (
                  <button type="button" className="am-cancelar am-adicionar" disabled={!!ocupado} onClick={() => fazer('aceitar', a.id)}>
                    {t('Aceitar')}
                  </button>
                )}
                {rel === 'nada' && (
                  <button type="button" className="am-cancelar am-adicionar" disabled={!!ocupado} onClick={() => fazer('pedir', a.id)}>
                    {t('Adicionar')}
                  </button>
                )}
              </Linha>
            )
          })}
        </ul>
      )}
      {termo.length >= 2 && !id && jogadores !== null && achados.length === 0 && <p className="am-vazio">{t('Ninguém encontrado. Tente o SteamID, o link do perfil ou o nome de usuário da Steam (o que vem depois de steamcommunity.com/id/).')}</p>}
      {erro && <p className="am-erro">{erro}</p>}
    </div>
  )
}

// ── Aba CHATS: a lista de conversas (prévia, hora, não lidas) ──
function ItemChat({ c, eu, aoAbrir }) {
  const t = useT()
  return (
    <li className={`am-linha am-chat-item am-${c.st}${c.naoLidas ? ' am-chat-naolida' : ''}`}>
      <button type="button" className="am-pessoa am-chat-btn" onClick={() => aoAbrir(c.id)} title={c.nome || c.id}>
        <span className="am-av">
          <ComMoldura steamId={c.id}>
            <Foto a={c} />
          </ComMoldura>
          <i className="am-bolinha" />
        </span>
        <span className="am-txt">
          <span className="am-nome am-chat-linha1">
            <b>{c.nome || c.id}</b>
            <small className="am-chat-hora">{horaOuData(c.ts)}</small>
          </span>
          <span className="am-chat-linha2">
            <small className="am-chat-prevista">
              {c.de === eu ? `${t('Você')}: ` : ''}
              {c.texto}
            </small>
            {c.naoLidas > 0 && <em className="am-chat-badge">{c.naoLidas > 9 ? '9+' : c.naoLidas}</em>}
          </span>
        </span>
      </button>
    </li>
  )
}

function ListaChats({ conversas, eu, aoAbrir }) {
  const t = useT()
  if (conversas === null) return <p className="am-vazio">{t('Carregando…')}</p>
  if (!conversas.length) return <p className="am-vazio">{t('Nenhuma conversa ainda. Na aba Amigos, clique no balão ao lado de alguém para começar.')}</p>
  return (
    <ul className="am-chats-lista">
      {conversas.map((c) => (
        <ItemChat key={c.id} c={c} eu={eu} aoAbrir={aoAbrir} />
      ))}
    </ul>
  )
}

// ── Conversa aberta: histórico + caixa de mandar mensagem ──
function MensagemConversa({ m, minha }) {
  return (
    <li className={`am-dm-msg${minha ? ' am-dm-minha' : ''}`}>
      <span className="am-dm-bolha">{m.texto}</span>
      <small className="am-dm-ts">{horaOuData(m.ts)}</small>
    </li>
  )
}

function Conversa({ id, eu, aoFechar }) {
  const t = useT()
  const { msgs } = useConversas()
  const [info, setInfo] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fimRef = useRef(null)
  const mensagens = msgs[id] || []

  useEffect(() => {
    let vivo = true
    // sem nome ainda (cache do worker pode levar até 30s para pegar um apelido escolhido na hora): tenta de novo uma vez
    carregarMensagens(id)
      .then((com) => {
        if (!vivo) return
        setInfo(com)
        if (!com.nome) setTimeout(() => vivo && carregarMensagens(id).then((deNovo) => vivo && setInfo((atual) => (atual?.nome ? atual : deNovo))), 2000)
      })
      .catch(() => vivo && setErro(t('Não deu para carregar a conversa.')))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens.length])

  const bloqueado = !!info && !info.amigo

  const enviar = async (e) => {
    e.preventDefault()
    const limpo = texto.trim()
    if (!limpo || enviando || bloqueado) return
    setEnviando(true)
    setErro('')
    try {
      await enviarMensagem(id, limpo)
      setTexto('')
    } catch {
      setErro(t('Não deu para enviar. Tente de novo.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="am-dm-cab">
        <button type="button" className="am-dm-voltar" onClick={aoFechar} aria-label={t('Voltar')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <a className={`am-pessoa am-dm-pessoa am-${info?.st || 'offline'}`} href={linkPerfil(id)}>
          <span className="am-av">
            <ComMoldura steamId={id}>
              <Foto a={info || { id }} />
            </ComMoldura>
            <i className="am-bolinha" />
          </span>
          <b>{info?.nome || id}</b>
        </a>
      </div>
      <ul className="am-dm-lista">
        {mensagens.map((m) => (
          <MensagemConversa key={m.id} m={m} minha={m.de === eu} />
        ))}
        {!mensagens.length && info && <p className="am-vazio">{t('Nenhuma mensagem ainda. Diga oi!')}</p>}
        <li ref={fimRef} aria-hidden="true" />
      </ul>
      {bloqueado && <p className="am-dm-aviso">{t('Vocês não são mais amigos: dá para ver as mensagens antigas, mas não para mandar novas.')}</p>}
      <form className="am-dm-form" onSubmit={enviar}>
        <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={t('Mensagem')} maxLength={1000} disabled={enviando || bloqueado} autoComplete="off" aria-label={t('Mensagem')} />
        <button type="submit" disabled={!texto.trim() || enviando || bloqueado} aria-label={t('Enviar')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m3 12 18-9-5 9 5 9-18-9Zm0 0h11" />
          </svg>
        </button>
      </form>
      {erro && <p className="am-erro">{erro}</p>}
    </>
  )
}

// celular: botão na barra de cima e lista em tela cheia (não guarda aberto/fechado nem mexe no computador)
export default function PainelAmigos({ celular = false }) {
  const t = useT()
  const { lista, status, eu } = useAmigos()
  const { conversas, naoLidas } = useConversas()
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(null)
  const [verEnviados, setVerEnviados] = useState(false)
  const [aba, setAba] = useState('amigos') // 'amigos' | 'chats'
  const [conversaCom, setConversaCom] = useState(null) // id do amigo cuja conversa está aberta (substitui o conteúdo do painel)

  useEffect(() => {
    if (celular) return
    try {
      setAberto(localStorage.getItem(CHAVE) === '1')
    } catch {
      // sem armazenamento: começa fechado
    }
  }, [])
  useEffect(() => {
    if (celular) {
      // tela cheia: a página por trás não rola
      document.documentElement.classList.toggle('amigos-cel-aberto', !!(aberto && eu))
      return
    }
    document.documentElement.classList.toggle('amigos-aberto', !!(aberto && eu))
    try {
      localStorage.setItem(CHAVE, aberto ? '1' : '0')
    } catch {
      // ignora
    }
  }, [aberto, eu])

  // Por cima do site: fecha com Esc ou clicando fora (no painel e no botão, não)
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !celular && !e.target.closest?.('.am-painel:not(.nt-painel):not(.pp-painel), .nx-amigos-btn:not(.nx-notif-btn):not(.nx-partidas-btn)') && setAberto(false)
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  // A conversa "aberta" (para o worker marcar como lida sozinho e não contar não-lida) só vale com o painel aberto e nessa conversa
  useEffect(() => {
    definirConversaAberta(aberto ? conversaCom : null)
  }, [aberto, conversaCom])
  useEffect(() => {
    if (!aberto) setConversaCom(null) // fechou o painel: a próxima vez que abrir volta para a lista (não para o meio de uma conversa)
  }, [aberto])

  if (!eu) return null
  const amigos = lista?.amigos || []
  const st = (a) => status[a.id]?.st || 'offline'
  const porNome = (x, y) => (x.nome || '').localeCompare(y.nome || '')
  const jogando = amigos.filter((a) => st(a) === 'jogando').sort(porNome)
  const online = amigos.filter((a) => st(a) === 'online').sort(porNome)
  const ausentes = amigos.filter((a) => st(a) === 'ausente').sort(porNome)
  const offline = amigos.filter((a) => st(a) === 'offline').sort((x, y) => (status[y.id]?.visto || 0) - (status[x.id]?.visto || 0) || porNome(x, y))
  const recebidos = lista?.recebidos || []
  const enviados = lista?.enviados || []

  // No celular o painel vai direto no <body>: a barra de cima (com desfoque) prenderia a tela cheia dentro dela
  const naTela = (el) => (celular ? createPortal(el, document.body) : el)

  const fazer = async (acao, id) => {
    setOcupado(id + acao)
    try {
      await acaoAmizade(acao, id)
    } catch {
      // a lista volta a mostrar como estava
    } finally {
      setOcupado(null)
    }
  }

  // Clicou no balão de um amigo (aba Amigos) ou numa conversa (aba Chats): abre essa conversa
  const abrirConversa = (id) => {
    setAba('chats')
    setConversaCom(id)
  }

  const alertas = recebidos.length + naoLidas // selo no botão da barra: pedidos de amizade + mensagens não lidas

  return (
    <>
      <button type="button" className={`nx-config-btn nx-amigos-btn${aberto ? ' ativo' : ''}`} aria-expanded={aberto} aria-label={t('Amigos')} onClick={() => setAberto((a) => !a)}>
        <IconeAmigos />
        {alertas > 0 && <span className="nx-amigos-pedidos">{alertas > 99 ? '99+' : alertas}</span>}
        {online.length > 0 && (
          <span className="nx-amigos-on" aria-hidden="true">
            <b>{online.length}</b>
          </span>
        )}
        <span className="nx-dica" aria-hidden="true">
          {t('Amigos')}
        </span>
      </button>
      {aberto && naTela(
        <aside className={`am-painel${celular ? ' am-celular' : ''}${conversaCom ? ' am-painel-dm' : ''}`} aria-label={t('Social')} onClick={(e) => celular && e.target.closest('a') && setAberto(false)}>
          <div className="am-cab">
            <b>{t('Social')}</b>
            {!conversaCom && (
              <span className="mono">
                {jogando.length + online.length + ausentes.length}/{amigos.length}
              </span>
            )}
            <button type="button" className="am-fechar" onClick={() => setAberto(false)} aria-label={t('Fechar')}>
              ×
            </button>
          </div>
          {!conversaCom && (
            <div className="am-abas" role="tablist">
              <button type="button" role="tab" aria-selected={aba === 'amigos'} className={aba === 'amigos' ? 'am-aba-ativa' : ''} onClick={() => setAba('amigos')}>
                {t('AMIGOS')}
              </button>
              <button type="button" role="tab" aria-selected={aba === 'chats'} className={aba === 'chats' ? 'am-aba-ativa' : ''} onClick={() => setAba('chats')}>
                {t('CHATS')}
                {naoLidas > 0 && <em className="am-aba-badge">{naoLidas > 9 ? '9+' : naoLidas}</em>}
              </button>
            </div>
          )}
          {conversaCom ? (
            <Conversa id={conversaCom} eu={eu} aoFechar={() => setConversaCom(null)} />
          ) : aba === 'chats' ? (
            <div className="am-rolagem">
              <ListaChats conversas={conversas} eu={eu} aoAbrir={abrirConversa} />
            </div>
          ) : (
          <>
          <AdicionarAmigo lista={lista} eu={eu} />
          <div className="am-rolagem">
            {lista === null && <p className="am-vazio">{t('Carregando…')}</p>}
            <Grupo titulo={t('PEDIDOS')} n={recebidos.length} classe="am-pedidos">
              {recebidos.map((a) => (
                <Linha key={a.id} a={a} st="pedido">
                  <span className="am-botoes">
                    <button type="button" className="am-sim" disabled={!!ocupado} onClick={() => fazer('aceitar', a.id)} title={t('Aceitar')} aria-label={t('Aceitar')}>
                      ✓
                    </button>
                    <button type="button" className="am-nao" disabled={!!ocupado} onClick={() => fazer('recusar', a.id)} title={t('Recusar')} aria-label={t('Recusar')}>
                      ✕
                    </button>
                  </span>
                </Linha>
              ))}
            </Grupo>
            <Grupo titulo={t('JOGANDO')} n={jogando.length}>
              {jogando.map((a) => (
                <Linha key={a.id} a={a} st="jogando" aoConversar={abrirConversa} />
              ))}
            </Grupo>
            <Grupo titulo={t('ONLINE')} n={online.length}>
              {online.map((a) => (
                <Linha key={a.id} a={a} st="online" aoConversar={abrirConversa} />
              ))}
            </Grupo>
            <Grupo titulo={t('AUSENTE')} n={ausentes.length}>
              {ausentes.map((a) => (
                <Linha key={a.id} a={a} st="ausente" aoConversar={abrirConversa} />
              ))}
            </Grupo>
            <Grupo titulo={t('OFFLINE')} n={offline.length} classe="am-off">
              {offline.map((a) => (
                <Linha key={a.id} a={a} st="offline" visto={status[a.id]?.visto} aoConversar={abrirConversa} />
              ))}
            </Grupo>
            {lista && !amigos.length && !recebidos.length && (
              <p className="am-vazio">{t('Você ainda não tem amigos aqui. Abra o perfil de um jogador e clique em "Adicionar amigo".')}</p>
            )}
            {enviados.length > 0 && (
              <section className="am-grupo am-enviados">
                <button type="button" className="am-ver-enviados" aria-expanded={verEnviados} onClick={() => setVerEnviados((v) => !v)}>
                  {t('PEDIDOS ENVIADOS')} — {enviados.length} <span aria-hidden="true">{verEnviados ? '▾' : '▸'}</span>
                </button>
                {verEnviados && (
                  <ul>
                    {enviados.map((a) => (
                      <Linha key={a.id} a={a} st="pedido">
                        <button type="button" className="am-cancelar" disabled={!!ocupado} onClick={() => fazer('cancelar', a.id)}>
                          {t('Cancelar')}
                        </button>
                      </Linha>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
          </>
          )}
        </aside>,
      )}
    </>
  )
}
