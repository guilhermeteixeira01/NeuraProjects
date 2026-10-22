// Chat ao vivo da sala da partida: "Geral" (os dois times) e "Time" (só o seu time). As mensagens chegam pelo aviso ao vivo do worker
// (comum/amigos.js -> evento np-chat) e ficam guardadas só enquanto a sala existe: quando ela fecha, o servidor apaga o chat.
// Worker: src/amigos.js (GET/POST /chat).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAvatar } from '../../comum/avatares.js'
import { CONFIG } from '../../comum/config.js'
import { linkPerfil, tokenConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')
const MAX = 240

async function chamar(metodo, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/chat`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

const hora = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function Foto({ id, nome }) {
  const src = useAvatar(id, '')
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" width="26" height="26" loading="lazy" onError={() => setErro(src)} /> : <span className="chat-ini">{(nome || '?').slice(0, 2).toUpperCase()}</span>
}

export default function ChatSala({ partidaId, eu, nomeDoTime }) {
  const t = useT()
  const [aba, setAba] = useState('geral')
  const [msgs, setMsgs] = useState([])
  const [novas, setNovas] = useState({ geral: 0, time: 0 })
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const lista = useRef(null)
  const colado = useRef(true) // a lista está no fim: mensagem nova rola sozinha
  const abaRef = useRef(aba)
  abaRef.current = aba

  const carregar = useCallback(async () => {
    try {
      const d = await chamar('GET')
      if (d.partida === partidaId) setMsgs(d.mensagens || [])
    } catch {
      // sem chat por enquanto: tenta de novo no próximo ciclo
    }
  }, [partidaId])

  useEffect(() => {
    carregar()
    const ouvir = (e) => {
      const { partida, msg } = e.detail || {}
      if (partida !== partidaId || !msg) return
      setMsgs((l) => (l.some((x) => x.id === msg.id) ? l : [...l, msg].slice(-200)))
      if (msg.canal !== abaRef.current && msg.de !== eu) setNovas((n) => ({ ...n, [msg.canal]: n[msg.canal] + 1 }))
    }
    const voltou = () => document.visibilityState === 'visible' && carregar()
    window.addEventListener('np-chat', ouvir)
    document.addEventListener('visibilitychange', voltou)
    const relogio = setInterval(voltou, 15000) // rede de segurança caso o aviso ao vivo tenha se perdido
    return () => {
      window.removeEventListener('np-chat', ouvir)
      document.removeEventListener('visibilitychange', voltou)
      clearInterval(relogio)
    }
  }, [carregar, partidaId, eu])

  const visiveis = msgs.filter((m) => m.canal === aba)
  useEffect(() => {
    const el = lista.current
    if (el && colado.current) el.scrollTop = el.scrollHeight
  }, [visiveis.length, aba])

  const mudarAba = (a) => {
    setAba(a)
    setNovas((n) => ({ ...n, [a]: 0 }))
    colado.current = true
  }
  const rolou = (e) => {
    const el = e.currentTarget
    colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }
  const enviar = async (e) => {
    e.preventDefault()
    const limpo = texto.trim()
    if (!limpo) return
    setErro('')
    setTexto('')
    colado.current = true
    try {
      const d = await chamar('POST', { texto: limpo, canal: aba })
      setMsgs((l) => (l.some((x) => x.id === d.msg.id) ? l : [...l, d.msg].slice(-200)))
    } catch (e2) {
      setTexto(limpo)
      setErro(e2.message === 'devagar' ? t('Devagar! Espere um instante para mandar outra.') : t('Não deu para enviar agora.'))
    }
  }

  return (
    <div className="chat-sala">
      <div className="chat-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'geral'} className={aba === 'geral' ? 'is-ativo' : ''} onClick={() => mudarAba('geral')}>
          {t('Geral')}
          {novas.geral > 0 && <b className="chat-novas">{novas.geral}</b>}
        </button>
        <button type="button" role="tab" aria-selected={aba === 'time'} className={aba === 'time' ? 'is-ativo' : ''} onClick={() => mudarAba('time')}>
          {t('Time')}
          {novas.time > 0 && <b className="chat-novas">{novas.time}</b>}
        </button>
        <small>{aba === 'geral' ? t('Os dois times veem') : t('Só o seu time vê')}</small>
      </div>

      <ul className="chat-lista" ref={lista} onScroll={rolou} aria-live="polite">
        {!visiveis.length && <li className="chat-vazio">{aba === 'geral' ? t('Ninguém falou ainda. Diga oi para a sala!') : t('Converse com o seu time sobre estratégia. Os adversários não veem.')}</li>}
        {visiveis.map((m) => (
          <li key={m.id} className={`chat-msg t-${m.time}${m.de === eu ? ' minha' : ''}`}>
            <Foto id={m.de} nome={m.nome} />
            <div>
              <span className="chat-quem">
                <a href={linkPerfil(m.de)} className={`chat-nome t-${m.time}`}>
                  {m.nome}
                </a>
                {aba === 'geral' && <em>{nomeDoTime(m.time)}</em>}
                <time>{hora(m.ts)}</time>
              </span>
              <p>{m.texto}</p>
            </div>
          </li>
        ))}
      </ul>

      <form className="chat-form" onSubmit={enviar}>
        <input value={texto} maxLength={MAX} placeholder={aba === 'geral' ? t('Mensagem para todos…') : t('Mensagem para o seu time…')} onChange={(e) => setTexto(e.target.value)} aria-label={t('Mensagem')} />
        <button type="submit" disabled={!texto.trim()}>
          {t('Enviar')}
        </button>
      </form>
      {erro && <p className="chat-erro" role="alert">{erro}</p>}
    </div>
  )
}
