// Formatos de veto no padrão de campeonatos de CS2 (pool de 7 mapas).
// Os times alternam a cada ação, começando pelo Time A (ou quem ganhou o sorteio).
export const FORMATS = {
  bo1: {
    label: 'MD1',
    description: 'Ban, Ban, Ban, Ban, Ban, Ban → sobra o mapa',
    actions: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban'],
  },
  bo3: {
    label: 'MD3',
    description: 'Ban, Ban, Pick, Pick, Ban, Ban → decider',
    actions: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban'],
  },
  bo5: {
    label: 'MD5',
    description: 'Ban, Ban, Pick, Pick, Pick, Pick → decider',
    actions: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick'],
  },
}

export const other = (team) => (team === 'A' ? 'B' : 'A')

export const SIDE_LABEL = { ct: 'CT', t: 'TR' }

// Gera a lista completa de etapas. Depois de cada pick, o time adversário
// escolhe o lado inicial (CT/TR), igual ao veto oficial.
export function buildSteps(format, firstTeam) {
  const steps = []
  FORMATS[format].actions.forEach((type, i) => {
    const team = i % 2 === 0 ? firstTeam : other(firstTeam)
    steps.push({ type, team })
    if (type === 'pick') steps.push({ type: 'side', team: other(team) })
  })
  return steps
}

// Deriva o estado do veto a partir do histórico de ações.
export function deriveState(pool, history) {
  const status = {}
  pool.forEach((id) => (status[id] = { state: 'available' }))

  const picks = []
  history.forEach((h) => {
    if (h.type === 'ban') status[h.map] = { state: 'banned', team: h.team }
    if (h.type === 'pick') {
      status[h.map] = { state: 'picked', team: h.team, order: picks.length + 1 }
      picks.push({ map: h.map, pickedBy: h.team })
    }
    if (h.type === 'side') {
      const last = picks[picks.length - 1]
      last.sideBy = h.team
      last.side = h.side
      status[last.map].side = { team: h.team, side: h.side }
    }
  })

  const remaining = pool.filter((id) => status[id].state === 'available')
  return { status, picks, remaining }
}
