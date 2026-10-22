// Pontos do jogador (a moeda da loja, que ainda vai abrir). Cada mapa que o jogador termina rende pontos:
// o time que ganha leva PONTOS.vitoria e o que perde (ou empata) leva PONTOS.derrota. O total é a soma de todas as partidas
// registradas (scripts/ranking.mjs calcula no deploy e grava em ranking.json → jogadores[].pontos e historicos[].pontos).
// JavaScript puro: usado pelo deploy e pelo site.
import { useEffect, useState } from 'react'

// Vitória rende 100 e derrota 40. A derrota valia 50 até 21/10/2026: mapas anteriores a essa data continuam valendo 50 (senão o saldo de todo mundo cairia de repente).
export const PONTOS = { vitoria: 100, derrota: 40, derrotaAntiga: 50, mudouEm: '2026-10-22' }
export const pontosDaPartida = (venceu, data) => (venceu ? PONTOS.vitoria : data && String(data) < PONTOS.mudouEm ? PONTOS.derrotaAntiga : PONTOS.derrota)

// ranking.json é lido uma vez por página
let rankingLido = null
let lendo = null
const ler = () => (lendo ??= fetch('/ranking/ranking.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => (rankingLido = d || { jogadores: [] })))

// Pontos de um jogador (0 enquanto carrega ou se ele ainda não jogou nenhum mapa)
export function usePontos(steamId) {
  const [r, setR] = useState(rankingLido)
  useEffect(() => {
    if (rankingLido || !steamId) return
    let vivo = true
    ler().then((d) => vivo && setR(d))
    return () => {
      vivo = false
    }
  }, [steamId])
  return r?.jogadores?.find((j) => j.steamId === steamId)?.pontos || 0
}
