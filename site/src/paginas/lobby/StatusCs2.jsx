// Lobby: avisos do CS2 no topo da página (atualização do jogo e servidor em manutenção) e o painel de status do servidor.
// Dados: worker GET /status/cs2 (src/status-cs2.js): { atualizacao: {titulo, data, url, gid} | null, servidor: {online, atualizando} }
import { useEffect, useState } from 'react'
import { CONFIG } from '../../comum/config.js'
import { useT } from '../../comum/i18n.js'

const INTERVALO_MS = 60000

export function useStatusCs2() {
  const [dados, setDados] = useState(null)
  useEffect(() => {
    if (!CONFIG.loginSteam) return
    let vivo = true
    const ler = () =>
      fetch(`${CONFIG.loginSteam.replace(/\/$/, '')}/status/cs2`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => vivo && d && setDados(d))
        .catch(() => {})
    ler()
    const id = setInterval(() => document.visibilityState === 'visible' && ler(), INTERVALO_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])
  return dados
}

const guardada = (gid) => {
  try {
    return localStorage.getItem('np_cs2_aviso') === gid
  } catch {
    return false
  }
}

// Faixas no topo: azul quando saiu atualização do CS2 (dá para fechar), amarela quando o servidor está em manutenção
export function AvisosCs2({ status }) {
  const t = useT()
  const [fechado, setFechado] = useState(null)
  const gid = status?.atualizacao?.gid
  const mostrarAtualizacao = !!gid && fechado !== gid && !guardada(gid)
  const srv = status?.servidor
  const manutencao = srv && srv.online === false
  if (!mostrarAtualizacao && !manutencao) return null
  return (
    <div className="lb-faixas">
      {mostrarAtualizacao && (
        <div className="lb-faixa lb-faixa-azul" role="status">
          <IconeInfo />
          <span>
            {t('CS2: saiu uma atualização do jogo. Atualize o seu CS2 para jogar no nosso servidor. Obrigado pela paciência!')}{' '}
            <a href={status.atualizacao.url} target="_blank" rel="noopener">
              {t('Ver novidades')}
            </a>
          </span>
          <button
            type="button"
            className="lb-faixa-x"
            aria-label={t('Fechar aviso')}
            onClick={() => {
              setFechado(gid)
              try {
                localStorage.setItem('np_cs2_aviso', gid)
              } catch {
                // sem armazenamento: o aviso só some até recarregar
              }
            }}
          >
            ×
          </button>
        </div>
      )}
      {manutencao && (
        <div className="lb-faixa lb-faixa-amarela" role="status">
          <IconeInfo />
          <span>{srv.atualizando ? t('O servidor está sendo atualizado. Já volta! Agradecemos a paciência.') : t('Servidor em manutenção. Voltamos em breve — agradecemos a paciência!')}</span>
        </div>
      )}
    </div>
  )
}

const IconeInfo = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
  </svg>
)

// Bandeiras desenhadas aqui mesmo (o Windows não mostra bandeiras em emoji)
function Bandeira({ pais }) {
  return (
    <svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true" className="lb-bandeira">
      {pais === 'br' && (
        <>
          <rect width="48" height="32" fill="#009c3b" />
          <path d="M24 4 44 16 24 28 4 16z" fill="#ffdf00" />
          <circle cx="24" cy="16" r="6.5" fill="#002776" />
          <path d="M18 15.2c4-1.4 8.5-.6 12 2" stroke="#fff" strokeWidth="1.2" fill="none" />
        </>
      )}
      {pais === 'ar' && (
        <>
          <rect width="48" height="32" fill="#74acdf" />
          <rect y="10.7" width="48" height="10.7" fill="#fff" />
          <circle cx="24" cy="16" r="3" fill="#f6b40e" />
        </>
      )}
      {pais === 'cl' && (
        <>
          <rect width="48" height="32" fill="#d52b1e" />
          <rect width="48" height="16" fill="#fff" />
          <rect width="16" height="16" fill="#0039a6" />
          <path d="M8 3.2l1.5 4.4h4.6l-3.7 2.7 1.4 4.4L8 12l-3.8 2.7 1.4-4.4-3.7-2.7h4.6z" fill="#fff" transform="translate(0 -.6) scale(.92) translate(.7 .5)" />
        </>
      )}
      {pais === 'pe' && (
        <>
          <rect width="48" height="32" fill="#d91023" />
          <rect x="16" width="16" height="32" fill="#fff" />
        </>
      )}
    </svg>
  )
}

const REGIOES = [
  ['br', 'Brasil', true],
  ['ar', 'Argentina', false],
  ['cl', 'Chile', false],
  ['pe', 'Peru', false],
]

// Aba SERVIDOR do painel do lobby: só o estado (online/offline) e as bandeiras das regiões
export function PainelServidor({ status }) {
  const t = useT()
  const srv = status?.servidor
  const estado = !srv || srv.online === null ? 'desconhecido' : srv.online ? 'online' : srv.atualizando ? 'manutencao' : 'offline'
  const rotulo = { online: 'Online', offline: 'Offline', manutencao: 'Em manutenção', desconhecido: 'Verificando…' }[estado]
  return (
    <div className="lb-servidor-status">
      <div className={`lb-estado lb-estado-${estado}`} role="status">
        <i aria-hidden="true" /> <b>{t(rotulo)}</b>
      </div>
      {estado === 'offline' && <p>{t('Servidor em manutenção. Voltamos em breve — agradecemos a paciência!')}</p>}
      <ul className="lb-regioes" aria-label={t('Servidores')}>
        {REGIOES.map(([id, nome, ativa]) => (
          <li key={id} className={ativa ? `ativa lb-reg-${estado}` : 'em-breve'} title={ativa ? t(rotulo) : t('Em breve')}>
            <Bandeira pais={id} />
            <b>{nome}</b>
            <small>{ativa ? t(rotulo) : t('Em breve')}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}
