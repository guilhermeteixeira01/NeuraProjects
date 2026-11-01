/*
 * Fixtures do modo demo (npm run dev:demo). Tudo aqui é inventado e determinístico (gerador pseudoaleatório com semente fixa):
 * jogadores, times e partidas NÃO existem na produção e nunca são misturados com a pasta partidas/ do repositório.
 * Os documentos seguem o mesmo esquema do plugin do servidor (partida.json) e passam pelo MESMO scripts/ranking.mjs do deploy,
 * então ranking.json e perfil/historico/<id>.json saem no formato real. As datas são relativas a "hoje" (as partidas
 * sempre parecem recentes), mas o conteúdo é o mesmo a cada execução.
 */
import { createHash } from 'node:crypto'

const semente = (n) => () => {
  n |= 0; n = (n + 0x6d2b79f5) | 0
  let t = Math.imul(n ^ (n >>> 15), 1 | n)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Avatar sem URL externa: círculo colorido com as iniciais (data URI)
export const avatarSvg = (nome, cor) => {
  const ini = (String(nome).match(/[\p{L}\p{N}]/gu) || []).slice(0, 2).join('').toUpperCase() || '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#06101a"/></linearGradient></defs><rect width="128" height="128" rx="0" fill="url(#g)"/><text x="64" y="82" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-weight="700" font-size="52" fill="#f4f7fc">${ini}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export const ID_DEMO = '76561198000000011' // o mesmo id que previewLocal.js usa para o usuário da prévia

// habilidade (1 = média) decide quem fica no topo: o usuário demo fica em 4º
const TIMES = {
  A: { nome: 'time_Aurora', tag: 'AUR', cor: '#3478f6', jogadores: [
    ['76561198000000011', 'Neura Demo', 1.27], ['76561198000000012', 'Luna', 1.5], ['76561198000000013', 'Rafa', 0.96], ['76561198000000014', 'Nico', 1.18], ['76561198000000015', 'Vini', 0.9],
  ] },
  B: { nome: 'time_Vortex', tag: 'VTX', cor: '#8a5cf6', jogadores: [
    ['76561198000000021', 'Duda', 1.62], ['76561198000000022', 'Theo', 1.3], ['76561198000000023', 'Maya', 1.05], ['76561198000000024', 'Caio', 0.82], ['76561198000000025', 'Bia', 0.78],
  ] },
  C: { nome: 'time_Nimbus', tag: 'NMB', cor: '#1fbf87', jogadores: [
    ['76561198000000031', 'Ravi', 1.1], ['76561198000000032', 'Lara', 0.98], ['76561198000000033', 'Otto', 0.88], ['76561198000000034', 'Yuri', 0.84], ['76561198000000035', 'Zeca', 0.74],
  ] },
}
export const PESSOAS = Object.values(TIMES).flatMap((t) => t.jogadores.map(([id, nome, hab]) => ({ id, nome, hab, time: t.nome, cor: t.cor, avatar: avatarSvg(nome, t.cor) })))
export const TIMES_DEMO = Object.fromEntries(Object.entries(TIMES).map(([k, t]) => [k, { nome: t.nome, tag: t.tag, cor: t.cor }]))

// (mapa, lado A, lado B, placar A, placar B, dias atrás, hora): o usuário demo (time A) joga a maioria
const PARTIDAS = [
  ['de_dust2', 'A', 'B', 13, 3, 0, '18:24'],
  ['de_cache', 'A', 'C', 13, 10, 1, '22:11'],
  ['de_nuke', 'A', 'B', 13, 6, 2, '19:03'],
  ['de_mirage', 'B', 'A', 13, 9, 3, '21:40'],
  ['de_inferno', 'A', 'C', 13, 7, 4, '20:15'],
  ['de_overpass', 'C', 'B', 8, 13, 5, '19:30'],
  ['de_ancient', 'A', 'B', 11, 13, 6, '22:02'],
  ['de_dust2', 'A', 'C', 13, 5, 8, '18:50'],
  ['de_mirage', 'A', 'B', 13, 11, 9, '21:18'],
  ['de_nuke', 'C', 'A', 6, 13, 10, '20:44'],
  ['de_cache', 'B', 'C', 13, 8, 11, '19:12'],
  ['de_inferno', 'A', 'B', 9, 13, 12, '22:30'],
  ['de_overpass', 'A', 'C', 13, 4, 13, '18:05'],
  ['de_ancient', 'B', 'A', 10, 13, 14, '21:00'],
]

const ARMAS = ['ak47', 'm4a1', 'm4a1_silencer', 'awp', 'deagle', 'glock', 'usp_silencer', 'famas', 'galilar', 'mp9', 'mac10']
const p2 = (n) => String(n).padStart(2, '0')

export function gerarFixtures(hoje = new Date()) {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const lista = []
  const docs = {}
  const dados = PARTIDAS.map((p, i) => ({ p, i }))
  for (const { p, i } of dados) {
    const [mapa, la, lb, placarA, placarB, dias, hora] = p
    const rnd = semente(1000 + i * 17)
    const d = new Date(base)
    d.setDate(d.getDate() - dias)
    const data = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hora}`
    const timeA = TIMES[la], timeB = TIMES[lb]
    const nome = `${data.slice(0, 10)}_${hora.replace(':', '-')}_${mapa}_${timeA.nome}-x-${timeB.nome}`
    const caminho = `demo/md1/${nome}`
    const rodadas = placarA + placarB
    // rounds: vencedor de cada um, intercalado de forma determinística; lados trocam depois do 12º
    const seq = [...Array(placarA).fill('A'), ...Array(placarB).fill('B')].sort(() => rnd() - 0.5)
    const rounds = seq.map((time, n) => {
      const ct = (n < 12) === (time === 'A')
      const r = rnd()
      const lado = (n < 12 ? time === 'A' : time === 'B') ? 'CT' : 'TR'
      return { time, lado, motivo: lado === 'CT' ? (r < 0.12 ? 7 : r < 0.2 ? 12 : 8) : r < 0.3 ? 1 : 9, ct }
    }).map(({ ct, ...r }) => r)
    // jogadores: kills pela habilidade; mortes distribuídas para o total do time bater com as kills do outro
    const montar = (time, chave, venceu) => timeSide(time, chave, venceu)
    const timeSide = (time, chave, venceu) => time.jogadores.map(([id, nomeJ, hab]) => {
      const kpr = Math.max(0.3, (0.62 * hab) * (venceu ? 1.06 : 0.94) * (0.85 + rnd() * 0.3))
      return { id, nomeJ, hab, kills: Math.round(kpr * rodadas), peso: (1 / hab) * (0.8 + rnd() * 0.4), chave }
    })
    const ladoA = montar(timeA, 'A', placarA > placarB), ladoB = montar(timeB, 'B', placarB > placarA)
    const distribuir = (lado, mortesTotal) => {
      const soma = lado.reduce((s, j) => s + j.peso, 0)
      let resto = mortesTotal
      lado.forEach((j, n) => { j.mortes = n === lado.length - 1 ? Math.max(1, resto) : Math.max(1, Math.round((j.peso / soma) * mortesTotal)); resto -= j.mortes })
    }
    distribuir(ladoA, ladoB.reduce((s, j) => s + j.kills, 0))
    distribuir(ladoB, ladoA.reduce((s, j) => s + j.kills, 0))
    const jogadores = [...ladoA, ...ladoB].map((j) => {
      const pessoa = PESSOAS.find((x) => x.id === j.id)
      const kills = j.kills, mortes = j.mortes
      const headshots = Math.round(kills * (0.3 + rnd() * 0.3))
      const dano = Math.round(kills * 92 + rnd() * rodadas * 12)
      const kast = Math.min(rodadas, Math.round(rodadas * (0.58 + Math.min(0.3, j.hab * 0.12) + rnd() * 0.08)))
      const k2 = Math.max(0, Math.round(kills / 5 + rnd() * 2)), k3 = Math.round(kills / 12 * rnd() * 1.6), k4 = rnd() < 0.18 * j.hab ? 1 : 0, k5 = rnd() < 0.015 * j.hab ? 1 : 0
      const kpr = kills / rodadas, dpr = mortes / rodadas, adr = dano / rodadas, apr = 0.18
      const impacto = 2.13 * kpr + 0.42 * apr - 0.41
      const rating = Math.round((0.0073 * (100 * kast / rodadas) + 0.3591 * kpr - 0.5329 * dpr + 0.0032 * adr + 0.2372 * impacto + 0.1587) * 10000) / 10000
      const restantes = kills
      const armas = {}
      let sobra = restantes
      const escolhidas = [ARMAS[Math.floor(rnd() * 4)], ARMAS[5 + Math.floor(rnd() * 3)], ARMAS[8 + Math.floor(rnd() * 3)]]
      escolhidas.forEach((a, n) => {
        const k = n === escolhidas.length - 1 ? sobra : Math.min(sobra, Math.round(restantes * (n === 0 ? 0.6 : 0.25)))
        sobra -= k
        const acertos = Math.max(k, Math.round(k * 3.4 + rnd() * 10))
        armas[a] = { kills: k, headshots: Math.min(k, Math.round(k * 0.4)), dano: Math.round(k * 95), acertos }
      })
      const util = { flash: Math.round(8 + rnd() * 14), he: Math.round(2 + rnd() * 5), smoke: Math.round(8 + rnd() * 10), molotov: Math.round(3 + rnd() * 8), decoy: 0, naoUsadosTipo: { flash: 0, he: 0, smoke: 0, molotov: 0, decoy: 0 }, naoUsados: 0, dano: Math.round(20 + rnd() * 90), danoAliados: 0, danoRecebido: Math.round(rnd() * 40), inimigosCegos: Math.round(4 + rnd() * 12), tempoCegoInimigos: Math.round(rnd() * 300) / 10, flashAssists: Math.round(rnd() * 4), aliadosCegos: Math.round(rnd() * 8), tempoCegoAliados: Math.round(rnd() * 200) / 10 }
      return {
        steamId: j.id, nome: j.nomeJ, avatar: pessoa.avatar, time: j.chave, rounds: rodadas, kills, mortes, assistencias: Math.round(kills * 0.4), headshots, dano,
        mvps: Math.round(rnd() * 4), primeirasKills: Math.round(kills / 6), primeirasMortes: Math.round(mortes / 6), kast, k2, k3, k4, k5, rating, util, armas,
        missoes: { participou: true, roundsValidos: rodadas, kills, headshots, assistencias: Math.round(kills * 0.4), clutches: rnd() < 0.3 ? 1 : 0, plantios: Math.round(rnd() * 2), desarmes: rnd() < 0.2 ? 1 : 0, melhorRound: Math.min(5, Math.max(1, Math.round(k2 > 0 ? 2 + rnd() * 2 : 1))), armas: Object.fromEntries(Object.entries(armas).map(([a, v]) => [a, v.kills])) },
      }
    })
    const serieId = `${data.slice(0, 10)}_${hora.replace(':', '-')}_${timeA.nome}-x-${timeB.nome}`
    const vencedor = placarA > placarB ? 'A' : 'B'
    const doc = {
      versao: 1, nome, caminho, organizacao: 'demo', categoria: 'md1', mapa, inicio: data, duracaoMin: 22 + Math.round(rnd() * 16), maxRounds: 24, roundsProrrogacao: 4,
      placarA, placarB, timeA: timeA.nome, timeB: timeB.nome, logoA: null, logoB: null,
      serie: { id: serieId, formato: 'MD1', atual: 0, vitoriasA: vencedor === 'A' ? 1 : 0, vitoriasB: vencedor === 'B' ? 1 : 0, mapas: [{ mapa, faca: true, ct: null, vencedor, placar: `${Math.max(placarA, placarB)}-${Math.min(placarA, placarB)}` }] },
      rounds, jogadores, demo: null, gerado: data,
      missoes: { versao: 1, validada: true, concluida: true, modo: '5v5', fonte: 'demo', elencoFinal: jogadores.map((j) => j.steamId), timesFinais: Object.fromEntries(jogadores.map((j) => [j.steamId, j.time])), sha256: createHash('sha256').update(nome).digest('hex') },
    }
    docs[caminho] = doc
    lista.push({ nome, data, mapa, timeA: timeA.nome, timeB: timeB.nome, placarA, placarB, serie: 'MD1 · mapa 1/1', caminho, categoria: 'md1', serieId, serieTimeA: timeA.nome, serieTimeB: timeB.nome, serieVitoriasA: doc.serie.vitoriasA, serieVitoriasB: doc.serie.vitoriasB, serieMapas: [mapa], serieCancelada: false, logoA: null, logoB: null })
  }
  lista.sort((a, b) => String(b.data).localeCompare(String(a.data)))
  return { lista, docs }
}
