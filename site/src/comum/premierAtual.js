// CS Rating do Premier atual (Leetify). O ranking.json traz o do último deploy; o worker busca de novo de hora em hora
// (GET /premier, cron) e o site usa esse quando tiver. Uma chamada só por página, dividida entre todos os selos.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'

let dados = null // { "<SteamID64>": número | null }
let buscando = null

function buscar() {
  buscando ??= fetch(`${CONFIG.loginSteam.replace(/\/$/, '')}/premier`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (dados = d?.jogadores || {}))
    .catch(() => (dados = {}))
  return buscando
}

// Número do Premier atual do jogador, ou null (ainda carregando, sem conta na Leetify ou fora do ranking)
export function usePremierAtual(id) {
  const [valor, setValor] = useState(() => dados?.[id] ?? null)
  useEffect(() => {
    if (!CONFIG.loginSteam || !id) return
    let vivo = true
    buscar().then(() => vivo && setValor(dados?.[id] ?? null))
    return () => {
      vivo = false
    }
  }, [id])
  return valor
}
