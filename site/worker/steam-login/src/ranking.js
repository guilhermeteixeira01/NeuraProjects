// Ranking publicado no site (ranking/ranking.json, gerado no deploy a partir das partidas): pontos de cada jogador (saldo da loja),
// XP e nível (molduras por nível), posição (cargos automáticos, insígnia top 3) e a lista do Premier.
// Lido uma vez por minuto por worker (o arquivo é o mesmo para todo mundo); se o site não responder, ErroServico: nunca "0 pontos" no lugar.
import { ErroServico } from './erros.js'

const VALIDADE_MS = 60_000
let guardado = { ate: 0, ranking: null, porId: new Map() }

export const enderecoDoSite = (env) => (env.SITE || 'https://neuraproject.com.br').replace(/\/$/, '')

export async function lerRanking(env) {
  if (guardado.ranking && guardado.ate > Date.now()) return guardado.ranking
  let r
  try {
    r = await fetch(`${enderecoDoSite(env)}/ranking/ranking.json`, { cf: { cacheTtl: 60 } })
  } catch (e) {
    throw new ErroServico('ranking', undefined, { indisponivel: true, causa: e })
  }
  if (!r.ok) throw new ErroServico('ranking', { status: r.status }, { indisponivel: true })
  const ranking = await r.json()
  guardado = { ate: Date.now() + VALIDADE_MS, ranking, porId: new Map((ranking.jogadores || []).map((j) => [j.steamId, j])) }
  return ranking
}

export async function jogadorNoRanking(env, id) {
  await lerRanking(env)
  return guardado.porId.get(id) || null
}

// Pontos ganhos nas partidas (100 por vitória, 50 por derrota): a parte "ganha" do saldo da loja
export const pontosGanhos = async (env, id) => Math.max(0, Math.floor(Number((await jogadorNoRanking(env, id))?.pontos) || 0))

// Ordem do top do ranking (a mesma do site, src/comum/ranking.js): quem tem mapa, por rating e depois kills.
// Dono/admin com "Ocultar do ranking" ligado (perfis[id].ocultoRanking) fica de fora: o próximo sobe de posição
export const ordemRanking = (ranking, perfis = {}) => (ranking?.jogadores || []).filter((j) => j.mapas >= 1 && !perfis[j.steamId]?.ocultoRanking).sort((a, b) => b.rating - a.rating || b.kills - a.kills)

// Nível do jogador: XP das partidas + ajuste do admin (perfil.xp). Menos de 10 partidas: "Sem classificação" no site; para as molduras vale nível 1
export async function nivelDoJogador(env, id, perfil) {
  const ranking = await lerRanking(env)
  const niveis = Array.isArray(ranking.niveis) && ranking.niveis.length ? ranking.niveis : [0]
  const jog = guardado.porId.get(id)
  if ((Number(jog?.mapas) || 0) < 10) return 1
  const xp = (Number(jog?.xp) || 0) + (Number(perfil?.xp) || 0)
  let nivel = 1
  while (nivel < niveis.length && xp >= niveis[nivel]) nivel++
  return nivel
}
