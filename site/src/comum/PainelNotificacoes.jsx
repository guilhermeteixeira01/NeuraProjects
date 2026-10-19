// Sino de notificações (barra da direita; no celular, na barra de cima): junta num painel só o que precisa de resposta
// (convite para entrar no lobby, pedido de amizade) e o histórico do que já passou (partida nova, nível).
// Os convites vêm do servidor, então quem não viu na hora encontra aqui. O painel usa o mesmo visual do de amigos.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { acaoAmizade, tempoDesde, useAmigos } from './amigos.js'
import { useAvatar } from './avatares.js'
import { linkPerfil } from './conta.js'
import { acaoLobby, useLobby } from './lobby.js'
import { useNotificacoes, registrarNotificacao } from './notificacoes.js'
import { SeloNivel } from './Nivel.jsx'
import { ComMoldura, SeloCargo, useConfigSite, usePerfis, usePerfisFrescos } from './Moldura.jsx'
import { miniaturaInsignia } from './insignias.js'
import { useT } from './i18n.js'

export function IconeSino({ tamanho = 20 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

function Foto({ p }) {
  const src = useAvatar(p.id, p.avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" loading="lazy" onError={() => setErro(src)} /> : <span className="am-ini">{(p.nome || '?').slice(0, 2).toUpperCase()}</span>
}

// Uma notificação com pessoa (convite/pedido): foto, texto e os botões ✓ / ✕
function ComPessoa({ p, texto, ocupado, aceitar, recusar }) {
  const t = useT()
  return (
    <li className="am-linha nt-item nt-pede">
      <a className="am-pessoa" href={linkPerfil(p.id)}>
        <span className="am-av">
          <ComMoldura steamId={p.id} soEmblema>
            <Foto p={p} />
          </ComMoldura>
        </span>
        <span className="am-txt">
          <span className="am-nome">
            <b>{p.nome || p.id}</b>
          </span>
          <small>{texto}</small>
        </span>
      </a>
      <span className="am-botoes">
        <button type="button" className="am-sim" disabled={ocupado} onClick={aceitar} title={t('Aceitar')} aria-label={t('Aceitar')}>
          ✓
        </button>
        <button type="button" className="am-nao" disabled={ocupado} onClick={recusar} title={t('Recusar')} aria-label={t('Recusar')}>
          ✕
        </button>
      </span>
    </li>
  )
}

// Cargo novo (dado pelo admin ou automático do top do ranking): compara com os últimos cargos vistos neste navegador.
// Na primeira vez só guarda, sem avisar.
function useAvisoCargos(id) {
  // só os cargos dados pelo admin (os automáticos do top mudam com o ranking e repetiam o aviso a cada carregada)
  const ids = usePerfis()[id]?.cargos || []
  const { cargos } = useConfigSite()
  const frescos = usePerfisFrescos()
  const chave = ids.join(',')
  useEffect(() => {
    if (!id || !frescos || !cargos.length) return
    const k = `np_cargos_${id}`
    let antes = null
    try {
      antes = JSON.parse(localStorage.getItem(k) || 'null')
      localStorage.setItem(k, JSON.stringify(ids))
    } catch {
      return
    }
    if (!Array.isArray(antes)) return
    for (const c of cargos.filter((c) => ids.includes(c.id) && !antes.includes(c.id)))
      registrarNotificacao(id, { id: `cargo:${c.id}`, cargo: c.id, titulo: `Você recebeu o cargo ${c.nome}` })
  }, [id, frescos, chave, cargos.length]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Imagem pequena da notificação: gema do nível, arte da insígnia ou selo do cargo
function Emblema({ n, cargos }) {
  if (n.nivel != null) return <SeloNivel nivel={n.nivel} tamanho={34} />
  if (n.insignia) return <img className="nt-ins" src={miniaturaInsignia(n.insignia)} alt="" width="34" height="34" loading="lazy" draggable="false" />
  const c = n.cargo && cargos.find((x) => x.id === n.cargo)
  return c ? <SeloCargo cargo={c} classe="nt-selo" /> : null
}

export default function PainelNotificacoes({ celular = false }) {
  const t = useT()
  const { lista: amigos, eu } = useAmigos()
  const { dados, conta } = useLobby()
  const { lista, naoLidas, marcarLidas, limpar } = useNotificacoes()
  const { cargos } = useConfigSite()
  useAvisoCargos(conta?.id)
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const convites = dados?.convitesRecebidos || []
  const pedidos = amigos?.recebidos || []
  const pendentes = convites.length + pedidos.length
  const total = pendentes + naoLidas

  useEffect(() => {
    if (celular) document.documentElement.classList.toggle('notif-cel-aberto', !!(aberto && conta))
  }, [aberto, conta])

  // Abriu: o que era novidade passa a lida (os convites continuam aparecendo enquanto não forem respondidos)
  useEffect(() => {
    if (aberto) marcarLidas()
  }, [aberto, naoLidas]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !celular && !e.target.closest?.('.nt-painel, .nx-notif-btn') && setAberto(false)
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  if (!conta && !eu) return null
  const naTela = (el) => (celular ? createPortal(el, document.body) : el)

  const rodar = async (fn, depois) => {
    setOcupado(true)
    try {
      await fn()
      depois?.()
    } catch {
      // continua na lista; a pessoa tenta de novo
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <button type="button" className={`nx-config-btn nx-amigos-btn nx-notif-btn${aberto ? ' ativo' : ''}`} aria-expanded={aberto} aria-label={t('Notificações')} onClick={() => setAberto((a) => !a)}>
        <IconeSino />
        {total > 0 && <span className="nx-amigos-pedidos">{total > 9 ? '9+' : total}</span>}
        <span className="nx-dica" aria-hidden="true">
          {t('Notificações')}
        </span>
      </button>
      {aberto &&
        naTela(
          <aside className={`am-painel nt-painel${celular ? ' am-celular' : ''}`} aria-label={t('Notificações')}>
            <div className="am-cab">
              <b>{t('Notificações')}</b>
              <button type="button" className="am-fechar" onClick={() => setAberto(false)} aria-label={t('Fechar')}>
                ×
              </button>
            </div>
            <div className="am-rolagem">
              {convites.length > 0 && (
                <section className="am-grupo am-pedidos">
                  <h4>
                    {t('CONVITES PARA O LOBBY')} — {convites.length}
                  </h4>
                  <ul>
                    {convites.map((c) => (
                      <ComPessoa
                        key={c.lider.id}
                        p={c.lider}
                        texto={t('convidou você para o lobby')}
                        ocupado={ocupado}
                        aceitar={() =>
                          rodar(
                            () => acaoLobby('entrar', c.lider.id),
                            () => {
                              setAberto(false)
                              if (!celular && !location.pathname.startsWith('/lobby')) location.assign('/lobby/')
                            },
                          )
                        }
                        recusar={() => rodar(() => acaoLobby('recusar', c.lider.id))}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {pedidos.length > 0 && (
                <section className="am-grupo am-pedidos">
                  <h4>
                    {t('PEDIDOS DE AMIZADE')} — {pedidos.length}
                  </h4>
                  <ul>
                    {pedidos.map((a) => (
                      <ComPessoa
                        key={a.id}
                        p={a}
                        texto={t('quer ser seu amigo')}
                        ocupado={ocupado}
                        aceitar={() => rodar(() => acaoAmizade('aceitar', a.id))}
                        recusar={() => rodar(() => acaoAmizade('recusar', a.id))}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {lista.length > 0 && (
                <section className="am-grupo">
                  <h4>
                    {t('RECENTES')}
                    <button type="button" className="nt-limpar" onClick={limpar}>
                      {t('Limpar')}
                    </button>
                  </h4>
                  <ul>
                    {lista.map((n) => {
                      const Corpo = n.link ? 'a' : 'div'
                      return (
                        <li key={n.id} className="am-linha nt-item">
                          <Corpo className="nt-corpo" {...(n.link ? { href: n.link } : {})}>
                            <Emblema n={n} cargos={cargos} />
                            <span className="nt-txt">
                              <b>{t(n.titulo)}</b>
                              {n.texto && <small>{t(n.texto)}</small>}
                              <small className="nt-quando">{tempoDesde(n.quando, t)}</small>
                            </span>
                          </Corpo>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
              {!pendentes && !lista.length && <p className="am-vazio">{t('Nada por aqui. Convites para o lobby, pedidos de amizade e avisos de partida aparecem neste painel.')}</p>}
            </div>
          </aside>,
        )}
    </>
  )
}
