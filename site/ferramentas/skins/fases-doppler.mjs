// Nome das fases do Doppler: o catálogo traz várias skins com o mesmo nome "Doppler" / "Gamma Doppler" (cada uma é uma fase ou pedra rara).
// Troca para "Doppler (Phase 1)", "Doppler (Ruby)", "Gamma Doppler (Emerald)"... pelo número da pintura (paint kit).
//   node ferramentas/skins/fases-doppler.mjs       (aplica em public/assets/skins/armas.json; o gerar-catalogo.mjs chama o mesmo código)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DOPPLER = { 415: 'Ruby', 416: 'Sapphire', 417: 'Black Pearl', 418: 'Phase 1', 419: 'Phase 2', 420: 'Phase 3', 421: 'Phase 4' }
const GAMMA = { 568: 'Emerald', 569: 'Phase 1', 570: 'Phase 2', 571: 'Phase 3', 572: 'Phase 4' }
const GAMMA_GLOCK = { 1119: 'Emerald', 1120: 'Phase 1', 1121: 'Phase 2', 1122: 'Phase 3', 1123: 'Phase 4' }
// Butterfly e Shadow Daggers usam outros números para parte das fases; Talon também
const DOPPLER_BUTTERFLY = { 415: 'Ruby', 617: 'Black Pearl', 619: 'Sapphire', 418: 'Phase 1', 618: 'Phase 2', 420: 'Phase 3', 421: 'Phase 4' }
const DOPPLER_TALON = { 415: 'Ruby', 416: 'Sapphire', 417: 'Black Pearl', 852: 'Phase 1', 853: 'Phase 2', 854: 'Phase 3', 855: 'Phase 4' }

export function nomearFases(armas) {
  for (const a of armas) {
    for (const s of a.s) {
      const nome = s[1]
      let tabela
      if (nome === 'Doppler') tabela = /Butterfly|Shadow Daggers/.test(a.n) ? DOPPLER_BUTTERFLY : /Talon/.test(a.n) ? DOPPLER_TALON : DOPPLER
      else if (nome === 'Gamma Doppler') tabela = a.n === 'Glock-18' ? GAMMA_GLOCK : GAMMA
      const fase = tabela?.[s[0]]
      if (fase) s[1] = `${nome} (${fase})`
    }
  }
  return armas
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arq = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets/skins/armas.json')
  const j = JSON.parse(fs.readFileSync(arq, 'utf8'))
  nomearFases(j.armas)
  fs.writeFileSync(arq, JSON.stringify(j))
  console.log('fases nomeadas em', arq)
}
