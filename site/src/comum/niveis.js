// Sistema de níveis (parecido com a FACEIT: 10 níveis, mesmas cores). Cada partida jogada no servidor dá XP
// e o XP só sobe. JavaScript puro: usado pelo deploy (scripts/ranking.mjs calcula o XP de cada jogador),
// pelo site (selo do nível e barra de XP) e pelo worker (confere o nível das molduras liberadas por nível).

// XP mínimo de cada nível (nível 1 = índice 0)
export const NIVEIS = [0, 500, 1100, 1800, 2600, 3500, 4500, 5700, 7100, 8700]
export const NIVEL_MAX = NIVEIS.length

// XP de uma partida: jogar + vencer + desempenho (rating) + MVP da partida
export const XP = { partida: 100, vitoria: 50, mvp: 20, rating: [[1.5, 40], [1.2, 25], [1.0, 10]] }

export function xpDaPartida({ venceu, rating, mvp }) {
  const bonus = XP.rating.find(([min]) => rating >= min)?.[1] || 0
  return XP.partida + (venceu ? XP.vitoria : 0) + bonus + (mvp ? XP.mvp : 0)
}

// Nível e progresso para o próximo a partir do XP total
export function nivelDe(xp) {
  const total = Math.max(0, Math.round(Number(xp) || 0))
  let nivel = 1
  while (nivel < NIVEL_MAX && total >= NIVEIS[nivel]) nivel++
  const base = NIVEIS[nivel - 1]
  const proximo = nivel < NIVEL_MAX ? NIVEIS[nivel] : null
  return {
    nivel,
    xp: total,
    base, // XP onde este nível começa
    proximo, // XP do próximo nível (null no 10)
    falta: proximo === null ? 0 : proximo - total,
    progresso: proximo === null ? 1 : (total - base) / (proximo - base),
  }
}

// Cores da FACEIT: 1 cinza, 2-3 verde, 4-7 amarelo, 8-9 laranja, 10 vermelho
export const corNivel = (nivel) => (nivel >= 10 ? '#fe1f00' : nivel >= 8 ? '#ff6309' : nivel >= 4 ? '#ffc800' : nivel >= 2 ? '#1ce400' : '#eeeeee')
