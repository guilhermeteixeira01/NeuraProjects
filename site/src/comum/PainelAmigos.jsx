// Lista de amigos (computador): botão na barra da direita e painel encostado nela, no estilo da lista de membros do
// Discord: Pedidos, Online, Ausente e Offline, com a contagem de cada grupo. Clicar no amigo abre o perfil.
// Abre por cima do site (não empurra a página); fecha com Esc ou clicando fora.
// Aberto/fechado fica guardado no navegador. Dados e presença: comum/amigos.js.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { acaoAmizade, buscarJogadores, relacaoCom, tempoDesde, useAmigos } from './amigos.js'
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

function Linha({ a, st, visto, children }) {
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

// Adicionar amigo: por SteamID / link do perfil, ou pelo nome (quem já jogou no servidor, lista do ranking)
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
        .catch(() => vivo && setDoSite([]))
    }, 250)
    return () => {
      vivo = false
      clearTimeout(espera)
    }
  }, [termo, id])
  let achados = []
  if (id) achados = id === eu ? [] : [{ id, nome: (jogadores || []).find((j) => j.steamId === id)?.nome || '', avatar: (jogadores || []).find((j) => j.steamId === id)?.avatar || '' }]
  else if (termo.length >= 2) {
    const q = semAcento(termo)
    const doRanking = (jogadores || []).filter((j) => j.steamId !== eu && semAcento(j.nome).includes(q)).map((j) => ({ id: j.steamId, nome: j.nome, avatar: j.avatar }))
    const vistos = new Set()
    achados = [...doRanking, ...doSite.filter((j) => j.id !== eu)].filter((a) => !vistos.has(a.id) && vistos.add(a.id)).slice(0, 8)
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
        placeholder={t('Adicionar por nome ou SteamID')}
        aria-label={t('Adicionar amigo por nome ou SteamID')}
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
      {termo.length >= 2 && !id && jogadores !== null && achados.length === 0 && <p className="am-vazio">{t('Ninguém encontrado. Tente o SteamID ou o link do perfil.')}</p>}
      {erro && <p className="am-erro">{erro}</p>}
    </div>
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
    const fora = (e) => !celular && !e.target.closest?.('.am-painel:not(.nt-painel):not(.pp-painel), .nx-amigos-btn:not(.nx-notif-btn):not(.nx-partidas-btn)') && setAberto(false)
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

  return (
    <>
      <button type="button" className={`nx-config-btn nx-amigos-btn${aberto ? ' ativo' : ''}`} aria-expanded={aberto} aria-label={t('Amigos')} onClick={() => setAberto((a) => !a)}>
        <IconeAmigos />
        {recebidos.length > 0 && <span className="nx-amigos-pedidos">{recebidos.length}</span>}
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
        <aside className={`am-painel${celular ? ' am-celular' : ''}`} aria-label={t('Amigos')} onClick={(e) => celular && e.target.closest('a') && setAberto(false)}>
          <div className="am-cab">
            <b>{t('Amigos')}</b>
            <span className="mono">
              {jogando.length + online.length + ausentes.length}/{amigos.length}
            </span>
            <button type="button" className="am-fechar" onClick={() => setAberto(false)} aria-label={t('Fechar')}>
              ×
            </button>
          </div>
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
                <Linha key={a.id} a={a} st="jogando" />
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
