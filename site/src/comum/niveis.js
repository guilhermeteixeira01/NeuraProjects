// Sistema de níveis (parecido com a FACEIT: 10 níveis, mesmas cores). Como o Elo da FACEIT: vitória ganha XP,
// derrota perde XP, e o desempenho (rating, MVP) aumenta o ganho ou diminui a perda. O XP total nunca fica
// abaixo de 0 e o nível pode cair. JavaScript puro: usado pelo deploy (scripts/ranking.mjs calcula o XP de cada jogador),
// pelo site (selo do nível e barra de XP) e pelo worker (confere o nível das molduras liberadas por nível).

// XP mínimo de cada nível (nível 1 = índice 0). O último é o Elite (11): acima do nível 10, depois de ELITE_XP de XP.
// Aparece como "10+" com a gema colorida e animada (Nivel.jsx → SeloElite). Para mudar o XP do Elite, mude só o último número.
export const ELITE_XP = 6000
export const NIVEIS = [0, 300, 650, 1050, 1500, 2000, 2550, 3150, 3800, 4500, ELITE_XP]
export const NIVEL_MAX = NIVEIS.length
export const NIVEL_ELITE = NIVEL_MAX // 11
// O que mostrar no lugar do número do nível: o Elite é "10+"
export const textoNivel = (n) => (n >= NIVEL_ELITE ? '10+' : n)
// Nome do nível para mostrar em texto: "Nível 5" ou "Elite" (t = função de tradução)
export const rotuloNivel = (t, n) => (n >= NIVEL_ELITE ? t('Elite') : t('Nível {n}', { n }))
// Como a FACEIT: só recebe nível depois de jogar esta quantidade de partidas (antes: "Sem classificação", nível 0)
export const PARTIDAS_CLASSIFICACAO = 10

// XP de uma partida: base da vitória/derrota + desempenho (rating) + MVP da partida.
// Vitória rende pelo menos ganhoMinimo; derrota tira pelo menos perdaMinima (mesmo jogando muito bem).
// Empate (raro: o servidor tem prorrogação) não mexe no XP.
export const XP = {
  vitoria: 100,
  derrota: -60,
  rating: [[1.5, 40], [1.2, 25], [1.0, 10], [0.8, 0], [0, -10]], // [rating mínimo, XP]
  mvp: 20,
  ganhoMinimo: 50,
  perdaMinima: -10,
}

export function xpDaPartida({ venceu, empate, rating, mvp }) {
  if (empate) return 0
  const desempenho = XP.rating.find(([min]) => (Number(rating) || 0) >= min)?.[1] ?? 0
  const bruto = (venceu ? XP.vitoria : XP.derrota) + desempenho + (mvp ? XP.mvp : 0)
  return venceu ? Math.max(XP.ganhoMinimo, bruto) : Math.min(XP.perdaMinima, bruto)
}

// Nível e progresso para o próximo a partir do XP total.
// mapas (partidas jogadas): com menos de PARTIDAS_CLASSIFICACAO o nível é 0 ("Sem classificação"); o XP continua
// contando por trás e o nível aparece de uma vez na 10ª partida. Sem mapas (undefined): só pelo XP.
export function nivelDe(xp, mapas) {
  const total = Math.max(0, Math.round(Number(xp) || 0))
  let nivel = 1
  while (nivel < NIVEL_MAX && total >= NIVEIS[nivel]) nivel++
  const base = NIVEIS[nivel - 1]
  const proximo = nivel < NIVEL_MAX ? NIVEIS[nivel] : null
  const jogadas = Math.max(0, Number(mapas) || 0)
  const classificado = mapas === undefined || jogadas >= PARTIDAS_CLASSIFICACAO
  return {
    nivel: classificado ? nivel : 0,
    nivelXp: nivel, // nível que o XP daria (o que aparece quando completar as partidas)
    classificado,
    partidas: jogadas,
    faltamPartidas: classificado ? 0 : PARTIDAS_CLASSIFICACAO - jogadas,
    xp: total,
    base, // XP onde este nível começa
    proximo, // XP do próximo nível (null no 10)
    falta: proximo === null ? 0 : proximo - total,
    progresso: proximo === null ? 1 : (total - base) / (proximo - base),
  }
}

// Cada nível tem a sua cor e elas sobem em sequência: 1 cinza, 2-3 verde, 4 lima, 5 amarelo, 6 âmbar, 7 laranja,
// 8 laranja-vermelho, 9 vermelho e 10 vermelho vivo
export const CORES_NIVEL = ['#b4bac4', '#6fdc5a', '#1ce400', '#b5e51d', '#ffd400', '#ffae00', '#ff8a00', '#ff6a0d', '#ff4318', '#fe1f00', '#e83cff']
export const corNivel = (nivel) => CORES_NIVEL[Math.min(NIVEL_MAX, Math.max(1, Math.round(Number(nivel) || 1))) - 1]
