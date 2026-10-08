/*
 * Ranking dos jogadores: soma as estatísticas de TODAS as partidas registradas (partida.json de cada uma).
 * Roda no deploy (scripts/gerar-site.mjs), então cada partida nova que o plugin envia já atualiza o ranking.
 * CS Rating do Premier: não é buscado aqui (deixava o deploy lento). O worker busca na Leetify de hora em hora
 * (GET /premier) e o site mostra de lá (src/comum/premierAtual.js).
 */
import fs from 'node:fs'
import path from 'node:path'
import { NIVEIS, XP, nivelDe, xpDaPartida } from '../src/comum/niveis.js'

const ULTIMOS = 5 // forma recente: últimos mapas de cada jogador

// Mesmo filtro e MVP da página da partida
const jogaram = (d) => (d.jogadores || []).filter((e) => e.time && (e.rounds > 0 || e.kills + e.mortes > 0))
const mvpDa = (lista) => lista.reduce((m, e) => (m === null || e.rating > m.rating ? e : m), null)
const kastPct = (e) => (100 * e.kast) / Math.max(1, e.rounds)

// pasta = pasta "partidas" (com partidas.json e <caminho>/partida.json)
export async function gerarRanking(pasta) {
  const arquivoLista = path.join(pasta, 'partidas.json')
  const lista = fs.existsSync(arquivoLista) ? JSON.parse(fs.readFileSync(arquivoLista, 'utf8')) : []
  const jogadores = new Map()
  let mapasLidos = 0

  // Mais antiga primeiro: nome, avatar e time de cada jogador ficam os da partida mais recente
  for (const p of [...lista].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    const arquivo = path.join(pasta, p.caminho || p.nome, 'partida.json')
    if (!fs.existsSync(arquivo)) continue
    const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    const rounds = Math.max(1, (Number(d.placarA) || 0) + (Number(d.placarB) || 0))
    const vencedor = d.placarA > d.placarB ? 'A' : d.placarB > d.placarA ? 'B' : null
    const doMapa = jogaram(d)
    const mvp = mvpDa(doMapa)
    let leu = false

    for (const e of doMapa) {
      if (!e.steamId || e.steamId === '0') continue // bots não entram no ranking
      const j = jogadores.get(e.steamId) || {
        steamId: e.steamId, nome: '', avatar: '', time: '', logoTime: '',
        mapas: 0, vitorias: 0, rounds: 0, kills: 0, mortes: 0, assist: 0, hs: 0, dano: 0, kastRounds: 0,
        fk: 0, fd: 0, k5: 0, k4: 0, k3: 0, k2: 0, mvps: 0, mvpPartida: 0, ratingSoma: 0, melhorRating: 0, xp: 0, ultimos: [], historico: [],
      }
      const venceu = vencedor === e.time
      j.nome = e.nome || j.nome
      j.avatar = e.avatar || j.avatar
      j.time = (e.time === 'A' ? d.timeA : d.timeB) || j.time
      j.logoTime = (e.time === 'A' ? d.logoA : d.logoB) || ''
      j.mapas++
      j.vitorias += venceu ? 1 : 0
      j.rounds += rounds
      j.kills += e.kills
      j.mortes += e.mortes
      j.assist += e.assistencias
      j.dano += e.dano
      j.hs += e.headshots
      j.kastRounds += (kastPct(e) / 100) * rounds
      j.fk += e.primeirasKills
      j.fd += e.primeirasMortes
      j.k5 += e.k5
      j.k4 += e.k4
      j.k3 += e.k3
      j.k2 += e.k2
      j.mvps += e.mvps
      j.mvpPartida += e === mvp ? 1 : 0
      j.ratingSoma += e.rating * rounds
      j.melhorRating = Math.max(j.melhorRating, e.rating)
      j.ultimos.push({ rating: e.rating, venceu, mapa: String(d.mapa || '').replace(/^de_/, ''), data: p.data, caminho: p.caminho || p.nome })
      if (j.ultimos.length > ULTIMOS) j.ultimos.shift()
      // Histórico completo (página de perfil): um arquivo por jogador, fora do ranking.json
      // XP como o Elo da FACEIT: em ordem de data, vitória soma e derrota tira (nunca abaixo de 0)
      const xpMapa = xpDaPartida({ venceu, empate: !vencedor, rating: e.rating, mvp: e === mvp })
      j.xp = Math.max(0, j.xp + xpMapa)
      const meu = e.time === 'A' ? 'A' : 'B'
      j.historico.push({
        caminho: p.caminho || p.nome,
        data: p.data,
        mapa: d.mapa,
        serie: p.serie || '',
        time: meu === 'A' ? d.timeA : d.timeB,
        adversario: meu === 'A' ? d.timeB : d.timeA,
        placar: meu === 'A' ? [d.placarA, d.placarB] : [d.placarB, d.placarA],
        venceu,
        mvp: e === mvp,
        rating: e.rating,
        kills: e.kills,
        mortes: e.mortes,
        assist: e.assistencias,
        adr: Math.round((10 * e.dano) / rounds) / 10,
        hs: e.kills ? Math.round((100 * e.headshots) / e.kills) : 0,
        xp: xpMapa, // ganho (+) ou perda (-) nesta partida
        xpTotal: j.xp, // XP total depois dela
        mapasAte: j.mapas, // partidas jogadas até esta (nível só depois de 10)
        ...(e.armas ? { armas: e.armas } : {}), // por arma (partidas do plugin novo): { ak47: { kills, headshots, dano, acertos } }
      })
      jogadores.set(e.steamId, j)
      leu = true
    }
    if (leu) mapasLidos++
  }


  const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas
  const ranking = [...jogadores.values()]
    .map((j) => ({
      steamId: j.steamId,
      nome: j.nome,
      avatar: j.avatar,
      time: j.time,
      logoTime: j.logoTime,
      premier: null, // vem do worker (premierAtual.js)
      mapas: j.mapas,
      vitorias: j.vitorias,
      rounds: j.rounds,
      kills: j.kills,
      mortes: j.mortes,
      assist: j.assist,
      fk: j.fk,
      fd: j.fd,
      multi: { k5: j.k5, k4: j.k4, k3: j.k3, k2: j.k2 },
      mvps: j.mvps,
      mvpPartida: j.mvpPartida,
      rating: arred(j.ratingSoma / j.rounds),
      melhorRating: arred(j.melhorRating),
      adr: arred(j.dano / j.rounds, 1),
      kast: arred((100 * j.kastRounds) / j.rounds, 1),
      hsPct: arred(j.kills ? (100 * j.hs) / j.kills : 0, 1),
      kd: arred(j.mortes ? j.kills / j.mortes : j.kills),
      kr: arred(j.kills / j.rounds),
      winRate: arred((100 * j.vitorias) / j.mapas, 1),
      xp: j.xp, // XP das partidas (o site soma o ajuste do admin, se houver)
      nivel: nivelDe(j.xp, j.mapas).nivel, // 0 = sem classificação (menos de 10 partidas)
      ultimos: j.ultimos.reverse(), // mais recente primeiro
    }))
    .sort((a, b) => b.rating - a.rating || b.kills - a.kills)

  // historicos: { steamId: [mapas, mais recente primeiro] } (gerar-site grava em perfil/historico/<id>.json)
  const historicos = Object.fromEntries([...jogadores.values()].map((j) => [j.steamId, j.historico.reverse()]))
  // niveis/xpRegras: tabela usada (o worker lê daqui para conferir o nível das molduras)
  return { atualizado: new Date().toISOString(), partidas: mapasLidos, niveis: NIVEIS, xpRegras: XP, jogadores: ranking, historicos }
}
