// Perfil de outro jogador: botão de amizade (como na FACEIT) e, se for amigo, se está online agora.
import { useState } from 'react'
import { acaoAmizade, relacaoCom, tempoDesde, useAmigos } from '../../comum/amigos.js'
import { IconeAmigos } from '../../comum/PainelAmigos.jsx'
import { useT } from '../../comum/i18n.js'

export function BotaoAmizade({ id }) {
  const t = useT()
  const { lista, eu } = useAmigos()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false) // remover amigo pede um segundo clique
  if (!eu || eu === id || !lista) return null
  const rel = relacaoCom(lista, id)
  const fazer = async (acao) => {
    setOcupado(true)
    setErro('')
    try {
      await acaoAmizade(acao, id)
      setConfirmar(false)
    } catch (e) {
      setErro(e.message === 'limite' ? t('Você chegou ao limite de amigos.') : t('Não deu certo. Tente de novo.'))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <>
      {rel === 'nada' && (
        <button type="button" className="btn btn-primary pf-amizade" disabled={ocupado} onClick={() => fazer('pedir')}>
          <IconeAmigos tamanho={16} /> {t('Adicionar amigo')}
        </button>
      )}
      {rel === 'enviado' && (
        <button type="button" className="btn btn-ghost pf-amizade" disabled={ocupado} onClick={() => fazer('cancelar')} title={t('Clique para cancelar o pedido')}>
          <IconeAmigos tamanho={16} /> {t('Pedido enviado')} · {t('cancelar')}
        </button>
      )}
      {rel === 'recebido' && (
        <span className="pf-amizade-par">
          <button type="button" className="btn btn-primary pf-amizade" disabled={ocupado} onClick={() => fazer('aceitar')}>
            ✓ {t('Aceitar pedido')}
          </button>
          <button type="button" className="btn btn-ghost pf-amizade" disabled={ocupado} onClick={() => fazer('recusar')}>
            {t('Recusar')}
          </button>
        </span>
      )}
      {rel === 'amigo' &&
        (confirmar ? (
          <span className="pf-amizade-par">
            <button type="button" className="btn btn-ghost pf-amizade adm-perigo" disabled={ocupado} onClick={() => fazer('remover')}>
              {t('Remover amigo')}
            </button>
            <button type="button" className="btn btn-ghost pf-amizade" onClick={() => setConfirmar(false)}>
              {t('Cancelar')}
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost pf-amizade pf-sao-amigos" onClick={() => setConfirmar(true)} title={t('Clique para remover')}>
            <IconeAmigos tamanho={16} /> {t('Amigos')} ✓
          </button>
        ))}
      {erro && <span className="pf-amizade-erro">{erro}</span>}
    </>
  )
}

// "Online agora" / "Ausente" / "Visto há 2 h" (só aparece para amigos)
export function StatusAmigo({ id }) {
  const t = useT()
  const { lista, status } = useAmigos()
  if (relacaoCom(lista, id) !== 'amigo') return null
  const s = status[id] || { st: 'offline' }
  return (
    <span className={`pf-status pf-status-${s.st}`}>
      <i aria-hidden="true" />
      {s.st === 'online' ? t('Online agora') : s.st === 'ausente' ? t('Ausente') : s.visto ? t('Visto {quando}', { quando: tempoDesde(s.visto, t) }) : t('Offline')}
    </span>
  )
}
