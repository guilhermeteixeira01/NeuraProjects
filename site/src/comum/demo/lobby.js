import { buildSteps, deriveState } from '../../paginas/neurapick/data/veto.js'

// Exclusivo do modo demo: simula os dez aceites e a vez do adversário, sem chamar APIs.
export function criarSimuladorLobby() {
  let timer = null
  const avisar = ctx => { ctx.guardar(); window.dispatchEvent(new Event('np-lobby')) }
  const agendar = (ctx, adversarios) => {
    if (timer) return
    const p = ctx.estado().lobbyPartidaDemo
    if (!p) return
    if (p.fase === 'veto' && buildSteps(p.formato, p.primeiro)[p.historico.length]?.team !== 'B') return
    if (p.fase === 'aceitar' && ![...p.times.A.membros, ...p.times.B.membros].some(j => j.id !== ctx.id && !p.aceitos.includes(j.id))) return
    timer = setTimeout(() => {
      timer = null
      if (ctx.estado().lobbyPartidaDemo !== p) return
      if (p.fase === 'aceitar') {
        const proximo = [...p.times.A.membros, ...p.times.B.membros].find(j => j.id !== ctx.id && !p.aceitos.includes(j.id))
        if (proximo) p.aceitos.push(proximo.id)
        if (p.aceitos.length === 10) { p.fase = 'veto'; p.prazo = Date.now() + 60000 }
      } else if (p.fase === 'veto') {
        const passo = buildSteps(p.formato, p.primeiro)[p.historico.length]
        if (passo?.team === 'B') {
          const livres = deriveState(p.pool, p.historico).remaining
          p.historico.push({ ...passo, ...(passo.type === 'side' ? { side: 'ct' } : { map: livres[0] }) })
          p.prazo = Date.now() + 60000
        }
      }
      avisar(ctx)
      const passo = buildSteps(p.formato, p.primeiro)[p.historico.length]
      if (p.fase === 'aceitar' && p.aceitos.length < 9 || p.fase === 'veto' && passo?.team === 'B') agendar(ctx, adversarios)
    }, p.fase === 'aceitar' ? 220 : 900)
  }
  return (base, metodo, corpo, ctx, adversarios) => {
    const estado = ctx.estado()
    if (metodo === 'POST') {
      if (corpo.acao === 'buscar') {
        const membros = ctx.pessoas.slice(0, 5).map(p => ({ ...p, st: 'online' }))
        estado.lobbyPartidaDemo = { id: `demo-${Date.now()}`, fase: 'aceitar', formato: corpo.valor?.formato || 'bo1', prazo: Date.now() + 30000, agora: Date.now(), meuTime: 'A', primeiro: 'A', pool: ['mirage', 'inferno', 'nuke', 'ancient', 'anubis', 'dust2', 'train'], historico: [], aceitos: [], times: { A: { lider: ctx.id, membros }, B: { lider: adversarios[0].id, membros: adversarios } } }
      }
      const p = estado.lobbyPartidaDemo
      if (corpo.acao === 'aceitar' && p?.fase === 'aceitar' && !p.aceitos.includes(ctx.id)) p.aceitos.push(ctx.id)
      if (p?.fase === 'aceitar' && p.aceitos.length === 10) { p.fase = 'veto'; p.prazo = Date.now() + 60000 }
      if (corpo.acao === 'veto' && p?.fase === 'veto') {
        const passo = buildSteps(p.formato, p.primeiro)[p.historico.length]
        if (passo?.team === 'A') {
          const livres = deriveState(p.pool, p.historico).remaining
          if (passo.type === 'side' && ['ct', 't'].includes(corpo.valor?.lado)) p.historico.push({ ...passo, side: corpo.valor.lado })
          else if (livres.includes(corpo.valor?.mapa)) p.historico.push({ ...passo, map: corpo.valor.mapa })
          p.prazo = Date.now() + 60000
        }
      }
      if (['recusar-partida', 'cancelar-busca', 'sair', 'desfazer'].includes(corpo.acao)) estado.lobbyPartidaDemo = null
      ctx.guardar()
    }
    const p = estado.lobbyPartidaDemo
    if (p) { p.agora = Date.now(); agendar(ctx, adversarios) }
    // A prévia nunca entrega servidor nem avança para uma partida real.
    return { ...base, partida: p ? { ...p, apenasVisual: true, servidor: null } : null }
  }
}
