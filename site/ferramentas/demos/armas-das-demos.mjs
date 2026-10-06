// Preenche "armas" (kills, headshots, dano e acertos por arma) nos partida.json gravados antes de o plugin contar
// armas, lendo a demo de cada partida (link "demo" do próprio partida.json). Mesmas regras do plugin
// (Relatorio.cs): só inimigos, facas = "faca", molotov/incendiária = "molotov", HE = "he", dano limitado à vida.
//   node armas-das-demos.mjs          só as partidas sem "armas"
//   node armas-das-demos.mjs --tudo   refaz todas
// Antes de gravar, confere se as kills e headshots de cada jogador batem com o partida.json; se não baterem, pula.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import AdmZip from 'adm-zip'
import { parseEvent } from '@laihoe/demoparser2'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const PARTIDAS = path.resolve(aqui, '../../../partidas')
const CACHE = path.join(aqui, 'cache')
fs.mkdirSync(CACHE, { recursive: true })
const TUDO = process.argv.includes('--tudo')

function nomeArma(arma) {
  const n = String(arma || '').trim().toLowerCase().replace('weapon_', '')
  if (!n || n === 'world' || n === 'worldspawn') return null
  if (n.startsWith('knife') || n.startsWith('bayonet')) return 'faca'
  if (n === 'inferno' || n === 'incgrenade') return 'molotov'
  if (n === 'hegrenade') return 'he'
  return n
}

// No dano (player_hurt) o jogo manda a arma "base" das variantes (USP-S vem como hkp2000, M4A1-S como m4a1...);
// a arma na mão de quem atirou diz qual era. Nas kills o nome já vem certo.
const VARIANTES = {
  'hkp2000|USP-S': 'usp_silencer',
  'm4a1|M4A1-S': 'm4a1_silencer',
  'mp7|MP5-SD': 'mp5sd',
  'p250|CZ75-Auto': 'cz75a',
  'deagle|R8 Revolver': 'revolver',
}

function acharPartidas(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(pasta, e.name)
    if (e.isDirectory()) return acharPartidas(p)
    return e.name === 'partida.json' ? [p] : []
  })
}

async function demoDe(d) {
  const zip = path.join(CACHE, `${d.nome}.zip`)
  if (!fs.existsSync(zip)) {
    const r = await fetch(d.demo)
    if (!r.ok) throw new Error(`demo ${r.status}`)
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()))
  }
  const dem = path.join(CACHE, `${d.nome}.dem`)
  if (!fs.existsSync(dem)) {
    const entrada = new AdmZip(zip).getEntries().find((e) => e.entryName.endsWith('.dem'))
    if (!entrada) throw new Error('zip sem .dem')
    fs.writeFileSync(dem, entrada.getData())
  }
  return dem
}

for (const arq of acharPartidas(PARTIDAS)) {
  const d = JSON.parse(fs.readFileSync(arq, 'utf8'))
  if (!d.demo || !Array.isArray(d.jogadores)) continue
  if (!TUDO && d.jogadores.every((j) => j.armas)) continue
  let dem
  try {
    dem = await demoDe(d)
  } catch (e) {
    console.log('SEM DEMO', d.nome, e.message)
    continue
  }

  const armas = new Map() // steamId -> { arma: { kills, headshots, dano, acertos } }
  const arma = (id, nome) => {
    if (!armas.has(id)) armas.set(id, {})
    const a = armas.get(id)
    return (a[nome] ??= { kills: 0, headshots: 0, dano: 0, acertos: 0 })
  }

  const inimigo = (e) => e.attacker_steamid && e.attacker_steamid !== e.user_steamid && e.attacker_team_num !== e.user_team_num
  for (const e of parseEvent(dem, 'player_death', ['team_num'], ['is_warmup_period'])) {
    const nome = nomeArma(e.weapon)
    if (e.is_warmup_period || !inimigo(e) || !nome) continue
    const a = arma(e.attacker_steamid, nome)
    a.kills++
    if (e.headshot) a.headshots++
  }
  // Dano: a vida de cada um volta a 100 no começo do round; o dano não passa da vida que a vítima tinha
  const vida = new Map()
  for (const e of parseEvent(dem, 'player_hurt', ['team_num', 'active_weapon_name'], ['is_warmup_period', 'total_rounds_played'])) {
    if (e.is_warmup_period) continue
    const chave = e.user_steamid
    const antes = vida.get(chave)?.round === e.total_rounds_played ? vida.get(chave).hp : 100
    vida.set(chave, { round: e.total_rounds_played, hp: e.health })
    const nome = VARIANTES[`${e.weapon}|${e.attacker_active_weapon_name}`] || nomeArma(e.weapon)
    if (!inimigo(e) || !nome) continue
    const a = arma(e.attacker_steamid, nome)
    a.dano += Math.max(0, Math.min(antes - e.health, e.dmg_health))
    a.acertos++
  }

  // Confere com o partida.json antes de gravar
  const errados = d.jogadores.filter((j) => {
    const a = Object.values(armas.get(j.steamId) || {})
    return a.reduce((s, x) => s + x.kills, 0) !== j.kills || a.reduce((s, x) => s + x.headshots, 0) !== j.headshots
  })
  if (errados.length) {
    console.log('NÃO BATE', d.nome, errados.map((j) => j.nome).join(', '))
    continue
  }
  for (const j of d.jogadores) {
    const lista = Object.entries(armas.get(j.steamId) || {}).sort((x, y) => y[1].kills - x[1].kills || y[1].dano - x[1].dano)
    j.armas = Object.fromEntries(lista)
  }
  // Mesmo formato que o plugin grava (CRLF, sem quebra de linha no fim): o diff mostra só o que entrou
  fs.writeFileSync(arq, JSON.stringify(d, null, 2).replace(/\n/g, '\r\n'))
  const top = d.jogadores.map((j) => `${j.nome}: ${Object.keys(j.armas)[0] || '-'}`).join(' · ')
  console.log('OK', d.nome, '|', top)
}
