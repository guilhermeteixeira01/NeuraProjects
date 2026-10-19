// Partida encontrada: botão de aceitar no centro da tela, em qualquer página do site. Os 10 jogadores (5 de cada time)
// precisam aceitar dentro do prazo; cada aceite acende uma bolinha. Com as 10 acesas todos vão para a sala de Pick & Ban
// (página do lobby). Se alguém não aceitar a partida cai (o time que aceitou inteiro volta para a fila; ver src/amigos.js no worker).
// Só no computador, como o lobby (CSS em site.css).
import { useEffect, useState } from 'react'
import { acaoLobby, msAte, useLobby, useRelogio } from './lobby.js'
import { useT } from './i18n.js'

// Os sons do NeuraPick só são baixados quando uma partida aparece (esta peça está em todas as páginas)
let sonsLidos = null
const sons = () => (sonsLidos ||= import('../paginas/neurapick/data/sounds.js'))

export default function AceitarPartida() {
  const t = useT()
  const { dados, conta } = useLobby()
  const [ocupado, setOcupado] = useState(false)
  const partida = conta ? dados?.partida : null
  const fase = partida?.fase
  useRelogio(fase === 'aceitar')

  // Todos aceitaram: leva para a sala do veto (a página do lobby mostra a sala)
  useEffect(() => {
    if (fase === 'veto' && !location.pathname.startsWith('/lobby')) location.assign('/lobby/')
  }, [fase])

  const aceitei = !!partida && partida.aceitos.includes(dados.eu)
  const segundos = partida ? Math.ceil(msAte(partida.prazo, partida.desvio) / 1000) : 0

  // Bipe a cada segundo enquanto você ainda não aceitou (o mesmo do tempo acabando no veto)
  useEffect(() => {
    if (fase !== 'aceitar' || aceitei || segundos <= 0) return
    sons().then((m) => m.playSound('timer'))
  }, [fase, aceitei, segundos])

  if (!partida || fase !== 'aceitar') return null
  const ids = [...partida.times.A.membros, ...partida.times.B.membros].map((p) => p.id)

  const responder = async (acao) => {
    setOcupado(true)
    try {
      await acaoLobby(acao)
    } catch {
      setOcupado(false) // o aviso do worker chega pela conexão; tenta de novo se foi falha de rede
    }
  }

  return (
    <div className="pt-fundo" role="alertdialog" aria-modal="true" aria-labelledby="pt-titulo">
      <div className="pt-caixa">
        <span className="pt-chip">{t('Fila Brasil 5v5 · CS2')} · {partida.formato === 'bo1' ? 'MD1' : 'MD3'}</span>
        <h2 id="pt-titulo">{t('PARTIDA ENCONTRADA')}</h2>

        <button type="button" className={`pt-aceitar${aceitei ? ' aceito' : ''}`} disabled={aceitei || ocupado} onClick={() => responder('aceitar')}>
          <i className="pt-onda" aria-hidden="true" />
          <i className="pt-onda pt-onda-2" aria-hidden="true" />
          <span>{aceitei ? t('ACEITO') : t('ACEITAR')}</span>
        </button>

        <p className="pt-tempo" aria-live="off">
          {aceitei ? t('Aguardando os outros jogadores…') : t('Aceite em {s}s', { s: segundos })}
        </p>

        <div className="pt-bolinhas" role="progressbar" aria-valuemin={0} aria-valuemax={ids.length} aria-valuenow={partida.aceitos.length}>
          {ids.map((id, i) => (
            <i key={id} className={partida.aceitos.includes(id) ? 'acesa' : ''} style={{ '--i': i }} />
          ))}
        </div>
        <small className="pt-contagem">
          {partida.aceitos.length}/{ids.length}
        </small>

        <button type="button" className="pt-recusar" disabled={ocupado} onClick={() => responder('recusar-partida')}>
          {t('Recusar partida')}
        </button>
      </div>
    </div>
  )
}
