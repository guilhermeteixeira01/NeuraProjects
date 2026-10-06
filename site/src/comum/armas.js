// Armas do CS2: nome para mostrar e imagem (public/assets/armas/<nome>.webp, de ferramentas/molduras/armas.mjs).
// O <nome> é o que o plugin grava no partida.json (arma do evento sem "weapon_"; facas = "faca").
export const NOMES_ARMA = {
  ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', awp: 'AWP', famas: 'FAMAS', galilar: 'Galil AR', aug: 'AUG',
  sg556: 'SG 553', ssg08: 'SSG 08', scar20: 'SCAR-20', g3sg1: 'G3SG1', deagle: 'Desert Eagle', glock: 'Glock-18',
  usp_silencer: 'USP-S', hkp2000: 'P2000', p250: 'P250', elite: 'Dual Berettas', fiveseven: 'Five-SeveN', tec9: 'Tec-9',
  cz75a: 'CZ75-Auto', revolver: 'R8 Revolver', mac10: 'MAC-10', mp9: 'MP9', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45',
  p90: 'P90', bizon: 'PP-Bizon', nova: 'Nova', xm1014: 'XM1014', mag7: 'MAG-7', sawedoff: 'Sawed-Off', m249: 'M249',
  negev: 'Negev', taser: 'Zeus x27', faca: 'Faca', he: 'HE', molotov: 'Molotov', flashbang: 'Flashbang',
  smokegrenade: 'Smoke', decoy: 'Decoy',
}

export const nomeArma = (id) => NOMES_ARMA[id] || String(id || '').toUpperCase()
export const urlArma = (id) => (NOMES_ARMA[id] ? `/assets/armas/${id}.webp` : null)

// Soma as armas de todos os mapas do histórico ({ armas: { ak47: { kills, headshots, dano, acertos } } }),
// da que mais matou para a que menos. Mapas antigos sem "armas" ficam de fora.
export function somarArmas(mapas) {
  const total = {}
  let comArmas = 0
  for (const m of mapas || []) {
    if (!m.armas) continue
    comArmas++
    for (const [id, a] of Object.entries(m.armas)) {
      const t = (total[id] ??= { id, kills: 0, headshots: 0, dano: 0, acertos: 0 })
      t.kills += a.kills || 0
      t.headshots += a.headshots || 0
      t.dano += a.dano || 0
      t.acertos += a.acertos || 0
    }
  }
  const lista = Object.values(total)
    .filter((a) => a.kills > 0 || a.dano > 0)
    .sort((x, y) => y.kills - x.kills || y.dano - x.dano)
  return { lista, mapas: comArmas, kills: lista.reduce((s, a) => s + a.kills, 0) }
}
