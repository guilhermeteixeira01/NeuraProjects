// Itens de partida do lobby: Boost (vitória na próxima partida vale XP em dobro) e Freeze (a próxima partida não ganha nem perde XP).
// Ficam no objeto do jogador (Loja), chave "consumiveis": { boost, freeze, ativo: { tipo, desde } | null, aplicados: [caminho] }.
// Ativar gasta 1 na hora; cancelar antes da partida devolve. Compra no mercado oficial (src/loja-oficial.js) e resgate diário; não saem em caixa.
//
// Efeito: quando o plugin manda a partida (POST /servidor/partida), quem tinha um item ativado ANTES do início dela recebe o efeito
// no ajuste de XP do perfil (perfil.xp, o mesmo do admin, somado ao XP das partidas no site e no worker). O ranking.json continua
// sendo só das partidas: Boost soma o ganho de novo; Freeze desfaz o ganho ou a perda. Ativar no meio de uma partida vale só para a próxima.
import { xpDaPartida } from '../../../src/comum/niveis.js'
import { mudar } from './dados.js'
import { ErroConflito, ErroPedido } from './erros.js'
import { docVazio, juntar } from './notif-core.js'
import { pedirAoJogador } from './objetos.js'

export const TIPOS_CONSUMIVEL = ['boost', 'freeze']
export const NOME_CONSUMIVEL = { boost: 'Boost', freeze: 'Freeze' }
const MAX_POR_TIPO = 99
const MAX_APLICADOS = 30 // partidas já processadas (o plugin pode mandar a mesma partida de novo)
// resgate diário: no dia 4 da sequência vem 1 Freeze, no dia 7 vem 1 Boost
export const CONSUMIVEL_DIARIO = { 4: 'freeze', 7: 'boost' }

const vazio = () => ({ boost: 0, freeze: 0, ativo: null, aplicados: [] })
const ler = async (obj) => ({ ...vazio(), ...((await obj.ctx.storage.get('consumiveis')) || {}) })
export const publico = (c) => ({ boost: c.boost, freeze: c.freeze, ativo: c.ativo })
const tipoOk = (tipo) => {
  if (!TIPOS_CONSUMIVEL.includes(tipo)) throw new ErroPedido('tipo')
  return tipo
}

const notificacao = (id, titulo, texto) => ({ id, titulo, texto, link: '/lobby/', quando: Date.now(), lida: false })
async function gravarComAviso(obj, c, n) {
  const gravar = { consumiveis: c }
  if (n) gravar.notifs = juntar((await obj.ctx.storage.get('notifs')) || docVazio(), { lista: [n], vistos: [n.id], limpoEm: 0 })
  await obj.ctx.storage.put(gravar)
}

// GET /loja/consumiveis, POST /loja/consumiveis/ativar { tipo }, POST /loja/consumiveis/cancelar
export async function consumiveisDoJogador(obj, acao, p) {
  const c = await ler(obj)
  if (acao === 'consumivel-ativar') {
    const tipo = tipoOk(p.tipo)
    if (c.ativo) throw new ErroConflito('ja-ativo')
    if (!(c[tipo] > 0)) throw new ErroConflito('sem-item')
    c[tipo]--
    c.ativo = { tipo, desde: Date.now() }
    await obj.ctx.storage.put('consumiveis', c)
  }
  // admin (POST /admin/consumiveis): qtd > 0 dá, < 0 tira (nunca abaixo de 0)
  if (acao === 'consumivel-dar') {
    const tipo = tipoOk(p.tipo)
    const qtd = Math.round(Number(p.qtd) || 0)
    if (!qtd || Math.abs(qtd) > MAX_POR_TIPO) throw new ErroPedido('qtd')
    c[tipo] = Math.max(0, Math.min(MAX_POR_TIPO, c[tipo] + qtd))
    await gravarComAviso(obj, c, qtd > 0 && p.aviso ? notificacao(`consumivel:${tipo}:${Date.now()}`, `Você recebeu ${qtd} ${NOME_CONSUMIVEL[tipo]}`, 'Use no lobby antes da partida.') : null)
  }
  if (acao === 'consumivel-cancelar' && c.ativo) {
    c[c.ativo.tipo] = Math.min(MAX_POR_TIPO, c[c.ativo.tipo] + 1)
    c.ativo = null
    await obj.ctx.storage.put('consumiveis', c)
  }
  return publico(c)
}

// Dá itens ao jogador (resgate diário). aviso: texto da notificação (opcional)
export async function ganharConsumivel(obj, tipo, qtd = 1, aviso) {
  const c = await ler(obj)
  c[tipoOk(tipo)] = Math.min(MAX_POR_TIPO, c[tipo] + qtd)
  await gravarComAviso(obj, c, aviso && notificacao(`consumivel:${tipo}:${Date.now()}`, aviso, tipo === 'boost' ? 'Ative no lobby antes da partida: se vencer, o XP ganho vale em dobro.' : 'Ative no lobby antes da partida: ela não ganha nem perde XP.'))
  return publico(c)
}

// A partida terminou: o item ativado antes do início dela é gasto e devolve quanto XP corrigir no perfil
export async function aplicarNaPartida(obj, p) {
  const c = await ler(obj)
  if (c.aplicados.includes(p.caminho)) return { delta: 0 }
  if (!c.ativo || !(c.ativo.desde < p.inicio)) return { delta: 0 }
  const { tipo } = c.ativo
  const xp = Math.round(Number(p.xp) || 0)
  const delta = tipo === 'boost' ? Math.max(0, xp) : -xp
  c.ativo = null
  c.aplicados = [...c.aplicados, p.caminho].slice(-MAX_APLICADOS)
  const titulo = tipo === 'boost' ? (delta > 0 ? `Boost usado: +${delta} XP extra` : 'Boost usado: sem vitória, sem bônus') : xp > 0 ? `Freeze usado: o ganho de ${xp} XP não contou` : xp < 0 ? `Freeze usado: você não perdeu ${-xp} XP` : 'Freeze usado'
  await gravarComAviso(obj, c, notificacao(`consumivel-uso:${p.caminho}`, titulo, `Partida em ${String(p.mapa || '').replace(/^de_/, '')}.`))
  return { tipo, delta }
}

// "2026-10-28 23:32" (horário de Brasília, como o plugin grava) -> ms
export function inicioDaPartida(partida) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(partida?.inicio || ''))
  return m ? Date.parse(`${m[1]}T${m[2]}:00-03:00`) : NaN
}

// Mesmo XP do scripts/ranking.mjs (quem jogou, vencedor e MVP da partida)
export function xpPorJogador(partida) {
  const jogaram = (partida.jogadores || []).filter((e) => e.time && (e.rounds > 0 || e.kills + e.mortes > 0))
  const vencedor = partida.placarA > partida.placarB ? 'A' : partida.placarB > partida.placarA ? 'B' : null
  const mvp = jogaram.reduce((m, e) => (m === null || e.rating > m.rating ? e : m), null)
  const xp = new Map()
  for (const e of jogaram) if (/^\d{17}$/.test(String(e.steamId))) xp.set(String(e.steamId), xpDaPartida({ venceu: vencedor === e.time, empate: !vencedor, rating: e.rating, mvp: e === mvp }))
  return xp
}

// POST /servidor/partida: aplica Boost/Freeze de quem jogou e corrige o ajuste de XP (perfil.xp) de uma vez
export async function aplicarConsumiveisPartida(env, caminho, partida) {
  const inicio = inicioDaPartida(partida)
  if (!Number.isFinite(inicio)) return {}
  const deltas = {}
  for (const [id, xp] of xpPorJogador(partida)) {
    const r = await pedirAoJogador(env, id, { acao: 'consumivel-partida', caminho, inicio, xp, mapa: partida.mapa })
    if (r?.delta) deltas[id] = r.delta
  }
  const ids = Object.keys(deltas)
  if (ids.length)
    await mudar(env, 'perfis', ids, (perfis) => {
      for (const id of ids) {
        const p = { ...perfis[id] }
        const xp = (Number(p.xp) || 0) + deltas[id]
        if (xp) p.xp = xp
        else delete p.xp
        if (Object.keys(p).length) perfis[id] = p
        else delete perfis[id]
      }
    })
  return deltas
}
