import { useEffect, useState } from 'react'
import { lerJson } from './dados.js'
import { idMapa } from './mapas.js'
import { ordenarRanking } from './ranking.js'

// Mapa que o jogador mais jogou, pelo histórico dele (/perfil/historico/<id>.json): { id, vezes } ou null.
// Usado no "Sua temporada" do Lobby e do Início.
export function useMapaMaisJogado(id) {
  const [mapa, setMapa] = useState(null)
  useEffect(() => {
    if (!id) return
    let vivo = true
    lerJson(`/perfil/historico/${id}.json`).then((h) => {
      if (!vivo || !Array.isArray(h) || !h.length) return
      const n = {}
      for (const m of h) n[idMapa(m.mapa)] = (n[idMapa(m.mapa)] || 0) + 1 // histórico: mais recente primeiro
      const [id1, vezes] = Object.entries(n).sort((a, b) => b[1] - a[1])[0]
      setMapa({ id: id1, vezes })
    })
    return () => {
      vivo = false
    }
  }, [id])
  return mapa
}

// Linha do jogador no ranking e a posição dele (na mesma ordem da página do ranking, que respeita quem se ocultou).
// posicao 0 = fora do ranking.
export function posicaoNoRanking(jogadores, perfis, id) {
  if (!id || !Array.isArray(jogadores)) return { jogador: null, posicao: 0 }
  const jogador = jogadores.find((j) => String(j.steamId) === String(id)) || null
  if (!jogador) return { jogador: null, posicao: 0 }
  const ordem = ordenarRanking(jogadores, perfis || {})
  return { jogador, posicao: ordem.findIndex((j) => j.steamId === jogador.steamId) + 1 }
}
