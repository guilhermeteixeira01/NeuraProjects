// Ranking: só tem posição quem jogou pelo menos MIN_MAPAS_RANKING (5) partidas; os demais continuam no ranking.json (pontos e XP).
import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_MAPAS_RANKING, ordemRanking } from '../src/ranking.js'
import { MIN_MAPAS, faltamParaRanking, ordenarRanking } from '../../../src/comum/ranking.js'

const jogadores = [
  { steamId: 'a', mapas: 4, rating: 2.0, kills: 90 }, // melhor rating, mas só 4 partidas
  { steamId: 'b', mapas: 5, rating: 1.1, kills: 50 },
  { steamId: 'c', mapas: 12, rating: 1.3, kills: 70 },
]

test('posição no ranking exige 5 partidas, no site e no worker (mesma ordem)', () => {
  assert.equal(MIN_MAPAS_RANKING, 5)
  assert.equal(MIN_MAPAS, MIN_MAPAS_RANKING)
  assert.deepEqual(ordemRanking({ jogadores }).map((j) => j.steamId), ['c', 'b'])
  assert.deepEqual(ordenarRanking(jogadores).map((j) => j.steamId), ['c', 'b'])
  assert.deepEqual(faltamParaRanking(jogadores[0]), 1)
  assert.equal(faltamParaRanking(jogadores[1]), 0)
  assert.equal(faltamParaRanking(undefined), 5)
  // quem se ocultou continua fora, mesmo com partidas suficientes
  assert.deepEqual(ordemRanking({ jogadores }, { c: { ocultoRanking: true } }).map((j) => j.steamId), ['b'])
})
