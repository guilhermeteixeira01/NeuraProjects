import { useEffect, useState } from 'react'
import { chamarApi } from './api.js'
import { useConta } from './conta.js'

// Recibos do servidor: não deduz o crédito pela assinatura atual e não muda saldo no cliente.
export function usePartidasServidor(ativo = true) {
  const conta = useConta()
  const id = conta?.id
  const [dados, setDados] = useState(null)
  useEffect(() => {
    if (!ativo || !id) return
    let vivo = true
    const carregar = () => chamarApi('/loja/premium-partidas')
      .then(d => { if (vivo) setDados({ id, partidas: d.partidas || {}, recentes: d.recentes || [] }) })
      .catch(() => {}) // histórico indisponível: não inventa um bônus
    carregar()
    const voltar = () => { if (!document.hidden) carregar() }
    window.addEventListener('np-partida', carregar)
    window.addEventListener('np-bonus', carregar)
    window.addEventListener('focus', voltar)
    document.addEventListener('visibilitychange', voltar)
    return () => {
      vivo = false
      window.removeEventListener('np-partida', carregar)
      window.removeEventListener('np-bonus', carregar)
      window.removeEventListener('focus', voltar)
      document.removeEventListener('visibilitychange', voltar)
    }
  }, [ativo, id])
  return id && dados?.id === id ? dados : null
}

export function useBonusPartidas(ativo = true) {
  return usePartidasServidor(ativo)?.partidas || {}
}
