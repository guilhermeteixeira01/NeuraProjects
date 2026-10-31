// Migração da regra antiga: somente Freeze com ajuste negativo (vitória).
// O perfil guarda a devolução na mesma transação do XP; os demais passos podem ser repetidos.
import { lerColecao, lerDoc, lerItem, mudar, mudarDoc } from './dados.js'
import { avisarPerfil, mandarPara } from './amigos.js'
import { pedirAoJogador } from './objetos.js'
import { docVazio } from './notif-core.js'

const CHAVE = 'freeze-vitorias-reparo-v1'

export async function repararFreezeDoJogador(obj, id) {
  const recibos = await obj.ctx.storage.list({ prefix: 'consumivel-uso:' })
  const consumiveis = (await obj.ctx.storage.get('consumiveis')) || {}
  const notifs = (await obj.ctx.storage.get('notifs')) || docVazio()
  const candidatos = new Map()
  const perfil = await lerItem(obj.env, 'perfis', id)
  for (const [caminho, delta] of Object.entries(perfil?.xpConsumiveis || {})) {
    if (Number(delta) < 0) candidatos.set(caminho, { xp: -Number(delta), origem: 'marca-perfil' })
  }
  for (const [chave, r] of recibos) {
    if (r?.tipo === 'freeze' && Number(r.delta) < 0) candidatos.set(chave.slice('consumivel-uso:'.length), { xp: -Number(r.delta), origem: 'recibo' })
  }
  for (const n of notifs.lista) {
    const m = /^Freeze usado: o ganho de (\d+) XP não contou$/.exec(n.titulo)
    if (!m || !n.id.startsWith('consumivel-uso:')) continue
    const caminho = n.id.slice('consumivel-uso:'.length)
    if (consumiveis.aplicados?.includes(caminho) && !candidatos.has(caminho)) candidatos.set(caminho, { xp: Number(m[1]), origem: 'aviso-legado' })
  }
  // O diário sobrevive à atualização do recibo e permite retomar se um aviso ou doc falhar.
  const diario = (await obj.ctx.storage.get(CHAVE)) || {}
  for (const [caminho, prova] of candidatos) diario[caminho] ??= prova
  await obj.ctx.storage.put(CHAVE, diario)
  let total = 0
  for (const [caminho, prova] of Object.entries(diario)) {
    const { mapa, resultado } = await mudar(obj.env, 'perfis', [id], perfis => {
      const p = perfis[id] || {}
      const anterior = p.freezeVitoriasCorrigidas?.[caminho]
      if (anterior) return anterior
      const aplicado = p.xpConsumiveis?.[caminho]
      // Recibo novo sem marca no perfil: a gravação do XP falhou; cancela a
      // dedução pendente sem inventar um crédito. O legado ainda não tinha marca.
      const xp = aplicado === undefined ? (prova.origem === 'aviso-legado' ? prova.xp : 0) : Math.max(0, -Number(aplicado))
      const reparo = { xp, origem: prova.origem, quando: Date.now() }
      const ajuste = (Number(p.xp) || 0) + xp
      if (ajuste) p.xp = ajuste
      else delete p.xp
      p.xpConsumiveis = { ...p.xpConsumiveis, [caminho]: 0 }
      p.freezeVitoriasCorrigidas = { ...p.freezeVitoriasCorrigidas, [caminho]: reparo }
      perfis[id] = p
      return reparo
    })
    total += resultado.xp
    await obj.ctx.storage.put(`consumivel-uso:${caminho}`, { tipo: 'freeze', delta: 0 })
    const recentes = (await obj.ctx.storage.get('partidasRecentes')) || []
    await obj.ctx.storage.put('partidasRecentes', recentes.map(m => m.caminho === caminho ? { ...m, xp: Number(m.xpBase) || prova.xp, consumivel: 'freeze' } : m))
    await mudarDoc(obj.env, `partida-efeitos:${caminho}`, efeitos => ({ ...efeitos, [id]: { tipo: 'freeze', delta: 0 } }), {})
    await mudarDoc(obj.env, `partida-dados:${caminho}`, d => d ? { ...d, efeitos: { ...d.efeitos, [id]: { tipo: 'freeze', delta: 0 } } } : d, null)
    const atuais = (await obj.ctx.storage.get('notifs')) || docVazio()
    await obj.ctx.storage.put('notifs', { ...atuais, lista: atuais.lista.map(n => n.id === `consumivel-uso:${caminho}` ? { ...n, titulo: `Freeze usado: vitória, +${prova.xp} XP mantidos` } : n) })
    if (resultado.xp) {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(caminho)))].slice(0, 12).map(n => n.toString(16).padStart(2, '0')).join('')
      await obj.notificar({ id: `freeze-reparo:${hash}`, titulo: `Freeze corrigido: +${resultado.xp} XP devolvidos`, texto: 'O Freeze protege somente a derrota. O XP da sua vitória foi restaurado.', link: `/partidas/${caminho}/`, quando: resultado.quando, lida: false })
    }
    await avisarPerfil(obj.env, id, mapa[id])
    await mandarPara(obj.env, [id], { tipo: 'partida', caminho })
  }
  const semRecibo = (consumiveis.aplicados || []).filter(c => !recibos.has(`consumivel-uso:${c}`) && !diario[c] && !notifs.lista.some(n => n.id === `consumivel-uso:${c}`))
  return { corrigidos: Object.keys(diario).length, xp: total, pendentes: semRecibo.length }
}

// Usa o mesmo ponto de manutenção das outras migrações de perfil; lote pequeno
// para caber no orçamento de subrequests. O cron e novas leituras retomam o lote.
export async function corrigirFreezeVitorias(env) {
  const estado = (await lerDoc(env, CHAVE, {}, { fresco: true })) || {}
  if (estado.concluido) return estado
  const [usuarios, perfis] = await Promise.all([lerColecao(env, 'usuarios'), lerColecao(env, 'perfis')])
  const ids = [...new Set([...Object.keys(usuarios), ...Object.keys(perfis)])].filter(id => /^\d{17}$/.test(id))
  const lote = ids.filter(id => !estado.jogadores?.[id]).slice(0, 4)
  const resultados = {}
  for (const id of lote) resultados[id] = await pedirAoJogador(env, id, { acao: 'freeze-reparar-vitorias' })
  return mudarDoc(env, CHAVE, atual => {
    const jogadores = { ...atual.jogadores, ...resultados }
    const resumos = Object.values(jogadores)
    return { jogadores, concluido: ids.every(id => jogadores[id]), verificados: resumos.length,
      corrigidos: resumos.reduce((s, r) => s + r.corrigidos, 0), xp: resumos.reduce((s, r) => s + r.xp, 0), pendentes: resumos.reduce((s, r) => s + r.pendentes, 0) }
  }, {})
}
