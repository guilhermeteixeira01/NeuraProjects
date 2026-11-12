// Ordem do top do ranking: quem tem pelo menos MIN_MAPAS mapas, por rating e depois kills.
// A mesma regra está no worker (ordemRanking), que usa para os cargos automáticos ("top N do ranking").
import { useEffect, useState } from 'react'
import { MIN_MAPAS_RANKING } from '../../worker/steam-login/src/ranking.js'

// Partidas mínimas para ter posição no ranking: um número só para o site e o worker (worker/steam-login/src/ranking.js)
export const MIN_MAPAS = MIN_MAPAS_RANKING
// Quantas partidas faltam para o jogador entrar no ranking (0 = já está)
export const faltamParaRanking = (j) => Math.max(0, MIN_MAPAS - (Number(j?.mapas) || 0))

// perfis (do worker): dono/admin com "Ocultar do ranking" ligado (ocultoRanking) fica de fora e o próximo sobe
export const ordenarRanking = (jogadores = [], perfis = {}) =>
  jogadores.filter((j) => j.mapas >= MIN_MAPAS && !perfis[j.steamId]?.ocultoRanking).sort((a, b) => b.rating - a.rating || b.kills - a.kills)

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
