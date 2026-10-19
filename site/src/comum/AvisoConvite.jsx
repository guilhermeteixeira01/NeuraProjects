// Convite para o lobby: card no canto de cima, à direita (ao lado da barra da direita), com tempo para aceitar.
// Passou o tempo, o card some sozinho; o convite continua valendo e fica no sino (comum/PainelNotificacoes.jsx).
// Cada convite aparece uma vez por sessão (sessionStorage), então recarregar a página não faz o card voltar.
// O lobby só existe no computador, então no celular/tablet (até 1024px) o card nem aparece (CSS).
import { useEffect, useState } from 'react'
import { useAvatar } from './avatares.js'
import { linkPerfil } from './conta.js'
import { ComMoldura } from './Moldura.jsx'
import { acaoLobby, useLobby } from './lobby.js'
import { useT } from './i18n.js'

const TEMPO = 30 // segundos para aceitar
const chave = (lider) => `np_convite_${lider}`
const jaMostrou = (lider) => {
  try {
    return sessionStorage.getItem(chave(lider)) === '1'
  } catch {
    return false
  }
}
const marcar = (lider) => {
  try {
    sessionStorage.setItem(chave(lider), '1')
  } catch {
    // sem armazenamento: o card pode voltar ao recarregar
  }
}

function Foto({ p }) {
  const src = useAvatar(p.id, p.avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" onError={() => setErro(src)} /> : <span className="am-ini">{(p.nome || '?').slice(0, 2).toUpperCase()}</span>
}

function Convite({ convite, aoSair }) {
  const t = useT()
  const [saindo, setSaindo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const lider = convite.lider

  useEffect(() => {
    if (saindo) {
      const id = setTimeout(aoSair, 250)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setSaindo(true), TEMPO * 1000)
    return () => clearTimeout(id)
  }, [saindo]) // eslint-disable-line react-hooks/exhaustive-deps

  const responder = async (acao) => {
    setOcupado(true)
    try {
      await acaoLobby(acao, lider.id)
      setSaindo(true)
      if (acao === 'entrar' && !location.pathname.startsWith('/lobby')) location.assign('/lobby/')
    } catch {
      setOcupado(false) // continua no card; dá para tentar de novo ou esperar sumir
    }
  }

  return (
    <div className={`nx-convite${saindo ? ' is-saindo' : ''}`} role="alert">
      <a className="nx-convite-foto" href={linkPerfil(lider.id)}>
        <ComMoldura steamId={lider.id} soEmblema>
          <Foto p={lider} />
        </ComMoldura>
      </a>
      <div className="nx-convite-corpo">
        <b>{lider.nome || lider.id}</b>
        <span>{t('convidou você para o lobby')}</span>
        <div className="nx-convite-botoes">
          <button type="button" className="principal" disabled={ocupado} onClick={() => responder('entrar')}>
            {t('Aceitar')}
          </button>
          <button type="button" disabled={ocupado} onClick={() => responder('recusar')}>
            {t('Recusar')}
          </button>
        </div>
      </div>
      <i className="nx-convite-tempo" style={{ animationDuration: `${TEMPO}s` }} aria-hidden="true" />
    </div>
  )
}

export default function AvisoConvite() {
  const { dados, conta } = useLobby()
  const [fila, setFila] = useState([])

  // convite novo (que ainda não foi mostrado nesta sessão) entra na fila
  useEffect(() => {
    if (!conta || !dados) return
    const novos = (dados.convitesRecebidos || []).filter((c) => !jaMostrou(c.lider.id))
    if (!novos.length) return
    novos.forEach((c) => marcar(c.lider.id))
    setFila((f) => [...f, ...novos])
  }, [dados, conta])

  // convite que deixou de existir (aceito em outro lugar, cancelado pelo líder) some junto
  useEffect(() => {
    const vivos = new Set((dados?.convitesRecebidos || []).map((c) => c.lider.id))
    setFila((f) => (f.some((c) => !vivos.has(c.lider.id)) ? f.filter((c) => vivos.has(c.lider.id)) : f))
  }, [dados])

  if (!fila.length) return null
  return (
    <div className="nx-convites">
      {fila.map((c) => (
        <Convite key={c.lider.id} convite={c} aoSair={() => setFila((f) => f.filter((x) => x.lider.id !== c.lider.id))} />
      ))}
    </div>
  )
}
