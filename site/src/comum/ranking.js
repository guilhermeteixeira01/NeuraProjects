// Ordem do top do ranking: quem tem pelo menos MIN_MAPAS mapas, por rating e depois kills.
// A mesma regra está no worker (ordemRanking), que usa para os cargos automáticos ("top N do ranking").
import { useEffect, useState } from 'react'

export const MIN_MAPAS = 1 // mapas mínimos para entrar no ranking (suba quando tiver mais partidas)

export const ordenarRanking = (jogadores = []) =>
  jogadores.filter((j) => j.mapas >= MIN_MAPAS).sort((a, b) => b.rating - a.rating || b.kills - a.kills)

// SteamIDs em ordem do ranking (lê o ranking.json uma vez por página, só se ativo)
let ordem = null
let carregando = null
export function useOrdemRanking(ativo = true) {
  const [atual, setAtual] = useState(() => ordem || [])
  useEffect(() => {
    if (!ativo) return
    carregando ??= fetch('/ranking/ranking.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (ordem = ordenarRanking(d?.jogadores || []).map((j) => j.steamId)))
      .catch(() => (ordem = []))
    let vivo = true
    carregando.then((o) => vivo && setAtual(o))
    return () => {
      vivo = false
    }
  }, [ativo])
  return atual
}
