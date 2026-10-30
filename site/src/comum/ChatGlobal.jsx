// Chat global do painel da direita (aba CHAT), no estilo do bigcs: mensagens de todo mundo + os drops das caixas no meio
// (cartão "dropou X — Caixa Y"), aviso fixado da staff no topo e o campo "Fale com a galera…" embaixo.
// Worker: GET /chat/global (público) e POST /chat/global { acao } (amigos.js: chatGlobal). Com login as novidades chegam pelo
// WebSocket da presença (evento np-chat-global); sem login a lista é relida de tempos em tempos. Só abre junto com o painel
// (React.lazy em PainelAmigos.jsx): o catálogo de skins (nome e imagem dos drops) não pesa nas páginas.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ErroApi, chamarApi, lerApi } from './api.js'
import { useAvatar } from './avatares.js'
import { entrar, linkPerfil, loginAtivo, useConta } from './conta.js'
import { useT } from './i18n.js'
import IconeUI from './IconeUI.jsx'
import { lerCaixasPublicas, lerDrops } from './loja.js'
import { ComMoldura, IconeEquipe, apelidoDe, useAdmin, usePerfis } from './Moldura.jsx'
import { SeloNivel } from './Nivel.jsx'
import { nivelDe } from './niveis.js'
import { lerJson } from './dados.js'
import { urlImg, urlImgArma, useCatalogo } from './skins.js'
import { horaOuData } from './mensagens.js'
import './chatGlobal.css'

const COR_RARIDADE = ['#b0c3d9', '#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39']
const DROP_MIN = 4 // raridade mínima dos drops no chat: 4 vermelho (Oculto), 5 amarelo (faca/luva)
const RELER_MS = 15000 // sem login (sem WebSocket): relê o chat; drops: sempre
const MAX_ITENS = 120
const TONS = { aviso: 'Aviso', evento: 'Evento', torneio: 'Torneio', promo: 'Promoção' }

const ERROS = {
  devagar: 'Calma! Espere um segundo entre as mensagens.',
  silenciado: 'Você foi silenciado no chat por um tempo.',
  mensagem: 'Escreva alguma coisa.',
  login: 'Seu login venceu. Entre de novo com a Steam.',
  admin: 'Só a staff pode fazer isso.',
}

// ranking.json uma vez por página (nível de cada jogador ao lado do avatar)
let ranking = null
function useNivel() {
  const [r, setR] = useState(ranking)
  const perfis = usePerfis()
  useEffect(() => {
    if (ranking) return
    let vivo = true
    lerJson('/ranking/ranking.json').then((d) => {
      ranking = d || { jogadores: [] }
      vivo && setR(ranking)
    })
    return () => {
      vivo = false
    }
  }, [])
  return (id) => {
    const j = r?.jogadores?.find((x) => x.steamId === id)
    return nivelDe((Number(j?.xp) || 0) + (Number(perfis[id]?.xp) || 0), Number(j?.mapas) || 0).nivel
  }
}

// nome e imagem de um item de drop (mesma regra de loja/Abertura.jsx: dadosDoItem), sem trazer o código da loja para cá
function useItem() {
  const { dados } = useCatalogo('armas')
  const mapa = useMemo(() => {
    const m = new Map()
    for (const a of dados?.armas || []) for (const s of a.s) m.set(`${a.d}:${s[0]}`, { arma: a, skin: s })
    return m
  }, [dados])
  return (x) => {
    if (x.t === 'adesivo' || x.t === 'chaveiro') return { nome: x.n || '', img: urlImg(x.i, 128) }
    const achado = mapa.get(`${x.d}:${x.p}`)
    if (!achado) return { nome: '', img: '' }
    const faca = achado.arma.c === 'facas'
    return { nome: `${faca ? '★ ' : ''}${achado.arma.n} | ${achado.skin[1]}`, img: urlImgArma(achado.skin[6], 128) }
  }
}

function Autor({ id, nome, avatar, ts, nivelDe, children }) {
  const perfis = usePerfis()
  const nivel = nivelDe(id)
  const foto = useAvatar(id, avatar) // foto atual da Steam (a da mensagem é a do dia em que foi enviada)
  return (
    <header className="cg-autor">
      <a className="cg-ava" href={linkPerfil(id)} tabIndex={-1} aria-hidden="true">
        <ComMoldura steamId={id} emblema>
          <img src={foto || '/assets/logos/logo-np-64.png'} alt="" width="34" height="34" loading="lazy" />
        </ComMoldura>
        {nivel > 0 && <SeloNivel nivel={nivel} tamanho={18} classe="cg-nivel" />}
      </a>
      <a className="cg-nome" href={linkPerfil(id)}>
        <IconeEquipe steamId={id} />
        <span>{apelidoDe(perfis, id, nome)}</span>
      </a>
      {children}
      <time dateTime={new Date(ts).toISOString()}>{horaOuData(ts)}</time>
    </header>
  )
}

function Mensagem({ m, minha, admin, nivelDe, aoModerar }) {
  const t = useT()
  const [menu, setMenu] = useState(false)
  return (
    <li className={`cg-linha${minha ? ' cg-minha' : ''}`}>
      <Autor id={m.de} nome={m.nome} avatar={m.avatar} ts={m.ts} nivelDe={nivelDe}>
        {admin && (
          <span className="cg-mod">
            <button type="button" aria-label={t('Moderar')} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              ⋯
            </button>
            {menu && (
              <span className="cg-mod-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button type="button" role="menuitem" onClick={() => (setMenu(false), aoModerar('apagar', { id: m.id }))}>
                  {t('Apagar mensagem')}
                </button>
                {[10, 60, 1440].map((min) => (
                  <button key={min} type="button" role="menuitem" onClick={() => (setMenu(false), aoModerar('silenciar', { id: m.de, minutos: min }))}>
                    {t('Silenciar {t}', { t: min < 60 ? `${min} min` : min < 1440 ? '1 h' : '24 h' })}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
      </Autor>
      <p className="cg-texto">{m.texto}</p>
    </li>
  )
}

function Drop({ d, caixa, item, nivelDe }) {
  const t = useT()
  const x = item(d)
  return (
    <li className="cg-drop" style={{ '--cor': COR_RARIDADE[d.r] || COR_RARIDADE[0] }}>
      <Autor id={d.quem} nome={d.nome} avatar={d.avatar} ts={d.ts} nivelDe={nivelDe} />
      <a className="cg-drop-corpo" href={caixa ? `/loja/?caixa=${encodeURIComponent(caixa.slug)}` : '/loja/'}>
        <span className="cg-drop-arte">{x.img ? <img src={x.img} alt="" loading="lazy" draggable="false" /> : null}</span>
        <span className="cg-drop-info">
          <span>
            {t('dropou')} <b>{x.nome || t('um item')}</b>
          </span>
          {caixa && (
            <small>
              <img src={caixa.img} alt="" width="16" height="16" loading="lazy" /> {caixa.nome}
            </small>
          )}
        </span>
      </a>
    </li>
  )
}

export default function ChatGlobal() {
  const t = useT()
  const conta = useConta()
  const { admin } = useAdmin(conta)
  const nivelDe = useNivel()
  const item = useItem()
  const [msgs, setMsgs] = useState(null)
  const [fixado, setFixado] = useState(null)
  const [drops, setDrops] = useState([])
  const [caixas, setCaixas] = useState({})
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mais, setMais] = useState(false)
  const lista = useRef(null)
  const noFim = useRef(true)

  // mensagens: leitura inicial; com login, o resto chega ao vivo; sem login, relê de tempos em tempos
  useEffect(() => {
    let vivo = true
    const ler = () =>
      lerApi('/chat/global', { cache: 'no-store' })
        .then((d) => {
          if (!vivo) return
          setMsgs(Array.isArray(d?.mensagens) ? d.mensagens : [])
          setFixado(d?.fixado || null)
        })
        .catch(() => vivo && setMsgs((m) => m || []))
    ler()
    const relogio = conta ? null : setInterval(() => document.visibilityState === 'visible' && ler(), RELER_MS)
    const aoVivo = (e) => {
      const m = e.detail
      if (m.tipo === 'chat-global') setMsgs((l) => (l?.some((x) => x.id === m.msg.id) ? l : [...(l || []), m.msg].slice(-MAX_ITENS)))
      else if (m.tipo === 'chat-global-apagada') setMsgs((l) => (l || []).filter((x) => x.id !== m.id))
      else if (m.tipo === 'chat-global-silenciado') setMsgs((l) => (l || []).filter((x) => x.de !== m.id))
      else if (m.tipo === 'chat-global-fixado') setFixado(m.fixado || null)
    }
    window.addEventListener('np-chat-global', aoVivo)
    return () => {
      vivo = false
      clearInterval(relogio)
      window.removeEventListener('np-chat-global', aoVivo)
    }
  }, [conta?.id])

  // drops das caixas entram no meio do chat: só os vermelhos e amarelos (raridade 4 e 5, DROP_MIN)
  useEffect(() => {
    let vivo = true
    const ler = () =>
      lerDrops()
        .then((d) => {
          if (!vivo) return
          const todos = new Map()
          for (const x of [...(d?.recentes || []), ...(d?.bons || []), ...(d?.top || [])]) if (x.r >= DROP_MIN && x.quem) todos.set(x.id, x)
          setDrops([...todos.values()])
        })
        .catch(() => {})
    ler()
    lerCaixasPublicas()
      .then((l) => vivo && setCaixas(Object.fromEntries((Array.isArray(l) ? l : []).map((c) => [c.slug, c]))))
      .catch(() => {})
    const relogio = setInterval(() => document.visibilityState === 'visible' && ler(), RELER_MS)
    return () => {
      vivo = false
      clearInterval(relogio)
    }
  }, [])

  const itens = useMemo(
    () =>
      [...(msgs || []).map((m) => ({ tipo: 'msg', ts: m.ts, chave: `m${m.id}`, m })), ...drops.map((d) => ({ tipo: 'drop', ts: d.ts, chave: `d${d.id}`, d }))]
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_ITENS),
    [msgs, drops],
  )

  // desce sozinho quando chega coisa nova, se a pessoa já estava lá embaixo (lendo o histórico, não puxa)
  useEffect(() => {
    const el = lista.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }, [itens])
  const rolou = () => {
    const el = lista.current
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const pedir = async (corpo) => {
    setErro('')
    try {
      const r = await chamarApi('/chat/global', corpo)
      if (r?.msg) setMsgs((l) => (l?.some((x) => x.id === r.msg.id) ? l : [...(l || []), r.msg].slice(-MAX_ITENS)))
      if (corpo.acao === 'apagar') setMsgs((l) => (l || []).filter((x) => x.id !== corpo.id))
      if (corpo.acao === 'silenciar') setMsgs((l) => (l || []).filter((x) => x.de !== corpo.id))
      if (corpo.acao === 'fixar') setFixado(r?.fixado || null)
      return true
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e
      setErro(t(ERROS[e.codigo] || 'Não deu certo. Tente de novo.'))
      return false
    }
  }
  const enviar = async (e) => {
    e.preventDefault()
    const limpo = texto.trim()
    if (!limpo || enviando) return
    setEnviando(true)
    noFim.current = true
    if (await pedir({ acao: 'enviar', texto: limpo })) setTexto('')
    setEnviando(false)
  }
  const fixar = async () => {
    setMais(false)
    const novo = window.prompt(t('Texto do aviso fixado (vazio tira o aviso):'), fixado?.texto || '')
    if (novo === null) return
    const tom = novo.trim() ? window.prompt(t('Tipo do aviso: aviso, evento, torneio ou promo'), fixado?.tom || 'aviso') || 'aviso' : 'aviso'
    await pedir({ acao: 'fixar', texto: novo, tom: tom.trim().toLowerCase() })
  }

  return (
    <section className="cg-chat" aria-label={t('Chat global')}>
      {fixado && (
        <div className={`cg-fixado cg-tom-${fixado.tom}`} role="note">
          <span className="cg-fixado-tag">
            <IconeUI tipo="info" tamanho={13} /> {t(TONS[fixado.tom] || 'Aviso')}
          </span>
          <p>{fixado.texto}</p>
        </div>
      )}
      <ol className="cg-lista" ref={lista} onScroll={rolou} aria-live="polite">
        {msgs === null && <li className="cg-vazio">{t('Carregando…')}</li>}
        {msgs !== null && !itens.length && <li className="cg-vazio">{t('Ninguém falou nada ainda. Comece a conversa!')}</li>}
        {itens.map((x) =>
          x.tipo === 'msg' ? (
            <Mensagem key={x.chave} m={x.m} minha={x.m.de === conta?.id} admin={admin} nivelDe={nivelDe} aoModerar={(acao, dados) => pedir({ acao, ...dados })} />
          ) : (
            <Drop key={x.chave} d={x.d} caixa={caixas[x.d.caixa]} item={item} nivelDe={nivelDe} />
          ),
        )}
      </ol>
      {erro && (
        <p className="cg-erro" role="alert">
          {erro}
        </p>
      )}
      {conta ? (
        <form className="cg-compor" onSubmit={enviar}>
          {admin && (
            <span className="cg-mais">
              <button type="button" className="cg-mais-btn" aria-label={t('Ações da staff')} aria-expanded={mais} onClick={() => setMais((v) => !v)}>
                <IconeUI tipo="maisAdicionar" tamanho={16} />
              </button>
              {mais && (
                <span className="cg-mais-menu" role="menu">
                  <button type="button" role="menuitem" onClick={fixar}>
                    {fixado ? t('Editar aviso fixado') : t('Fixar um aviso')}
                  </button>
                  {fixado && (
                    <button type="button" role="menuitem" onClick={() => (setMais(false), pedir({ acao: 'fixar', texto: '' }))}>
                      {t('Tirar aviso fixado')}
                    </button>
                  )}
                </span>
              )}
            </span>
          )}
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={240} placeholder={t('Fale com a galera…')} aria-label={t('Mensagem para o chat global')} />
          <button type="submit" className="cg-enviar" disabled={!texto.trim() || enviando} aria-label={t('Enviar')}>
            <IconeUI tipo="enviar" tamanho={16} />
          </button>
        </form>
      ) : (
        loginAtivo() && (
          <button type="button" className="cg-entrar" onClick={entrar}>
            {t('Entre com a Steam para conversar')}
          </button>
        )
      )}
    </section>
  )
}
