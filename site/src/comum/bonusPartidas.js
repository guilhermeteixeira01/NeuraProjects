import { useEffect, useState } from 'react'
import { chamarApi } from './api.js'
import { useConta } from './conta.js'

// Recibos do servidor: não deduz o crédito pela assinatura atual e não muda saldo no cliente.
export function useBonusPartidas(ativo = true) {
  const conta = useConta()
  const id = conta?.id
  const [dados, setDados] = useState(null)
  useEffect(() => {
    if (!ativo || !id) return
    let vivo = true
    chamarApi('/loja/premium-partidas')
      .then(d => { if (vivo) setDados({ id, partidas: d.partidas || {} }) })
      .catch(() => {}) // histórico indisponível: não inventa um bônus
    return () => { vivo = false }
  }, [ativo, id])
  return id && dados?.id === id ? dados.partidas : {}
}
