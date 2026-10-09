// Lista de amigos (computador): botão na barra da direita e painel encostado nela, no estilo da lista de membros do
// Discord: Pedidos, Online, Ausente e Offline, com a contagem de cada grupo. Clicar no amigo abre o perfil.
// Abre por cima do site (não empurra a página); fecha com Esc ou clicando fora.
// Aberto/fechado fica guardado no navegador. Dados e presença: comum/amigos.js.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { acaoAmizade, tempoDesde, useAmigos } from './amigos.js'
import { useAvatar } from './avatares.js'
import { linkPerfil } from './conta.js'
import { CargosDe, ComMoldura } from './Moldura.jsx'
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

function Linha({ a, st, visto, children }) {
  const t = useT()
  return (
    <li className={`am-linha am-${st}`}>
      <a className="am-pessoa" href={linkPerfil(a.id)} title={a.nome || a.id}>
        <span className="am-av">
          <ComMoldura steamId={a.id}>
            <Foto a={a} />
          </ComMoldura>
          <i className="am-bolinha" aria-label={t(st === 'online' ? 'Online' : st === 'ausente' ? 'Ausente' : 'Offline')} />
        </span>
        <span className="am-txt">
          <span className="am-nome">
            <b>{a.nome || a.id}</b>
            <InsigniasMini steamId={a.id} max={3} />
          </span>
          {st === 'offline' && visto ? <small>{t('visto {quando}', { quando: tempoDesde(visto, t) })}</small> : <CargosDe steamId={a.id} max={1} classe="am-cargos" />}
        </span>
      </a>
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

// celular: botão na barra de cima e lista em tela cheia (não guarda aberto/fechado nem mexe no computador)
export default function PainelAmigos({ celular = false }) {
  const t = useT()
  const { lista, status, eu } = useAmigos()
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(null)
  const [verEnviados, setVerEnviados] = useState(false)

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
    const fora = (e) => !celular && !e.target.closest?.('.am-painel, .nx-amigos-btn') && setAberto(false)
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  if (!eu) return null
  const amigos = lista?.amigos || []
  const st = (a) => status[a.id]?.st || 'offline'
  const porNome = (x, y) => (x.nome || '').localeCompare(y.nome || '')
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

  return (
    <>
      <button type="button" className={`nx-config-btn nx-amigos-btn${aberto ? ' ativo' : ''}`} aria-expanded={aberto} aria-label={t('Amigos')} onClick={() => setAberto((a) => !a)}>
        <IconeAmigos />
        {recebidos.length > 0 && <span className="nx-amigos-pedidos">{recebidos.length}</span>}
        {!recebidos.length && online.length > 0 && <span className="nx-amigos-on" aria-hidden="true" />}
        <span className="nx-dica" aria-hidden="true">
          {t('Amigos')}
        </span>
      </button>
      {aberto && naTela(
        <aside className={`am-painel${celular ? ' am-celular' : ''}`} aria-label={t('Amigos')} onClick={(e) => celular && e.target.closest('a') && setAberto(false)}>
          <div className="am-cab">
            <b>{t('Amigos')}</b>
            <span className="mono">
              {online.length + ausentes.length}/{amigos.length}
            </span>
            <button type="button" className="am-fechar" onClick={() => setAberto(false)} aria-label={t('Fechar')}>
              ×
            </button>
          </div>
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
            <Grupo titulo={t('ONLINE')} n={online.length}>
              {online.map((a) => (
                <Linha key={a.id} a={a} st="online" />
              ))}
            </Grupo>
            <Grupo titulo={t('AUSENTE')} n={ausentes.length}>
              {ausentes.map((a) => (
                <Linha key={a.id} a={a} st="ausente" />
              ))}
            </Grupo>
            <Grupo titulo={t('OFFLINE')} n={offline.length} classe="am-off">
              {offline.map((a) => (
                <Linha key={a.id} a={a} st="offline" visto={status[a.id]?.visto} />
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
        </aside>,
      )}
    </>
  )
}
