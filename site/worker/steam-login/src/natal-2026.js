/*
 * Natal na Neura 2026 — Operação Presente (regras em natal-2026-core.js).
 *
 * Fonte de verdade das partidas: o registro oficial que o plugin do servidor manda (POST /servidor/partida). Cada partida válida
 * (mesmos critérios das missões: resumoMissao) concluída dentro do período entra UMA vez no doc global "natal-2026-partidas",
 * pela chave (caminho) da partida: { partidas: { <caminho>: { f: conclusão ms, m: mapa, j: [SteamID64 válidos] } }, metaEm }.
 * Reprocessar a mesma partida não cria outra entrada; a conclusão gravada na primeira vez é mantida.
 * Meta coletiva: 100 partidas distintas desse doc (cada partida conta uma vez, não importa quantos participantes).
 *
 * Estado do jogador: objeto dele (Loja), chave "natal-2026" =
 *   { ativadoEm, creditos: { <chave>: { v, ts } }, resgates: { <recompensa>: { custo, ts, entregue, item? } }, dourada: { ts, entregue } }
 * Saldo = soma dos créditos − soma dos custos resgatados. A fila do objeto roda um pedido por vez (cliques repetidos e resgates
 * simultâneos esperam a vez) e cada mudança vai numa gravação só: débito + caixa no inventário + recibo, ou débito + posse da moldura.
 * A insígnia (perfil, objeto Dados) é entregue logo depois com recibo "entregue": se falhar, a próxima sincronização entrega de novo.
 *
 *   GET  /eventos/natal-2026                 (público) -> configuração pública, estado, meta coletiva e recompensas
 *   GET  /eventos/natal-2026/eu              (login)   -> estado do jogador (sincroniza créditos e entregas pendentes)
 *   POST /eventos/natal-2026/ativar          (login)   -> ativa o evento na conta (10 estrelas, uma vez)
 *   POST /eventos/natal-2026/resgatar { recompensa: 'insignia' | 'moldura' | 'caixa' }
 *   GET|POST /admin/natal-2026               (admin)   -> lê / grava a configuração
 */
import {
  CAIXA_NATAL_ID, INSIGNIA_NATAL, INSIGNIA_NATAL_DOURADA, LINK_EVENTO_NATAL, MARCA_MOLDURA_NATAL, META_COLETIVA_NATAL, MISSOES_NATAL, MOLDURA_NATAL, RECOMPENSAS_NATAL,
  calendarioNatal, configNatal, creditosNatal, dentroDoPeriodoNatal, emDivulgacao, estadoNatal, gastoEstrelas, mapaDoDiaNatal, progressoNatal, recompensaNatal, somaEstrelas, validarConfigNatal,
} from './natal-2026-core.js'
import { molduraPorId } from '../../../src/comum/molduras.js'
import { resumoMissao } from './missoes-core.js'
import { inicioDaPartida } from './consumiveis.js'
import { lerDoc, mudar, mudarDoc } from './dados.js'
import { ErroConflito, ErroNaoEncontrado, ErroPedido } from './erros.js'
import { json, lerCorpo } from './http.js'
import { lerCaixas } from './loja.js'
import { lerPosse } from './loja-oficial.js'
import { docVazio, juntar } from './notif-core.js'
import { pedirAoJogador } from './objetos.js'
import { darInsignias } from './perfis.js'
import { avisarPerfil } from './amigos.js'
import { novoIdItem } from './skins.js'

export const DOC_CONFIG_NATAL = 'natal-2026-config'
export const DOC_PARTIDAS_NATAL = 'natal-2026-partidas'
export const DOC_ATIVACOES_NATAL = 'natal-2026-ativacoes'
const DOC_DOURADAS_NATAL = 'natal-2026-douradas' // { id: quando } de quem já recebeu a dourada (o cron não chama de novo)
const CHAVE = 'natal-2026'
const ITENS_MAX = 2000
const ID_STEAM = /^\d{17}$/
const docPartidasVazio = () => ({ partidas: {}, metaEm: null })

export const lerConfigNatal = async (env, fresco = false) => configNatal(await lerDoc(env, DOC_CONFIG_NATAL, null, { fresco }))
const lerPartidasNatal = async (env) => ({ ...docPartidasVazio(), ...(await lerDoc(env, DOC_PARTIDAS_NATAL, null, { fresco: true })) })
const contarMeta = (doc, cfg) => Object.values(doc.partidas || {}).filter((p) => dentroDoPeriodoNatal(p.f, cfg)).length

// Conclusão pelo registro oficial: início gravado pelo plugin (Brasília) + duração. Nunca depois da chegada ao servidor.
export function conclusaoDaPartida(partida, recebidoEm = Date.now()) {
  const inicio = inicioDaPartida(partida), duracao = Number(partida?.duracaoMin)
  const calculada = Number.isFinite(inicio) && Number.isFinite(duracao) && duracao >= 0 && duracao <= 600 ? inicio + duracao * 60000 : NaN
  return Number.isFinite(calculada) ? Math.min(calculada, recebidoEm) : recebidoEm
}

// Disponibilidade das recompensas: a caixa é fixa no código (caixa-natal.js); moldura só com a arte cadastrada no catálogo
export async function disponibilidadeNatal(env, cfg) {
  const caixa = (await lerCaixas(env)).find((c) => c.id === CAIXA_NATAL_ID && c.ativa && c.itens?.length)
  const moldura = molduraPorId(MOLDURA_NATAL)
  return {
    insignia: { ok: true },
    moldura: moldura?.recompensa === MARCA_MOLDURA_NATAL ? { ok: true, moldura: MOLDURA_NATAL } : { ok: false, motivo: 'moldura-pendente' },
    caixa: caixa ? { ok: true, caixa: { id: caixa.id, nome: caixa.nome, img: caixa.img } } : { ok: false, motivo: 'caixa-pendente' },
  }
}

const configPublica = (cfg) => (cfg.configurada ? { habilitado: cfg.habilitado, inicio: cfg.inicio, fim: cfg.fim, resgateAte: cfg.resgateAte, divulgacao: cfg.divulgacao, calendario: calendarioNatal(cfg) } : { habilitado: false })

async function resumoPublico(env, agora = Date.now()) {
  const cfg = await lerConfigNatal(env)
  const estado = estadoNatal(cfg, agora)
  const doc = cfg.habilitado ? await lerPartidasNatal(env) : docPartidasVazio()
  const disp = cfg.habilitado ? await disponibilidadeNatal(env, cfg) : {}
  return {
    cfg, doc,
    publico: {
      agora, estado, divulgacao: emDivulgacao(cfg, agora), config: configPublica(cfg), mapaDoDia: estado === 'ativo' ? mapaDoDiaNatal(agora, cfg) : null,
      meta: { atual: contarMeta(doc, cfg), alvo: META_COLETIVA_NATAL, atingidaEm: doc.metaEm || null },
      missoes: MISSOES_NATAL,
      recompensas: RECOMPENSAS_NATAL.map((r) => ({ ...r, disponivel: !!disp[r.id]?.ok, motivo: disp[r.id]?.motivo || null })),
    },
  }
}

// ── Registro oficial (POST /servidor/partida e a conferência do cron) ──
export async function registrarPartidaNatal(env, chave, partida, recebidoEm = Date.now()) {
  const cfg = await lerConfigNatal(env, true)
  if (!cfg.habilitado || typeof chave !== 'string' || !Array.isArray(partida?.jogadores)) return { registrada: false }
  const validos = [...new Set(partida.jogadores.map((p) => String(p.steamId)).filter((id) => ID_STEAM.test(id) && resumoMissao(partida, id, chave)))]
  if (!validos.length) return { registrada: false }
  const fim = conclusaoDaPartida(partida, recebidoEm)
  let metaAgora = false
  const doc = await mudarDoc(env, DOC_PARTIDAS_NATAL, (d) => {
    d = { ...docPartidasVazio(), ...d }
    const antes = d.partidas[chave]
    const f = antes ? antes.f : fim // reprocessada: mantém a conclusão da primeira vez
    if (!dentroDoPeriodoNatal(f, cfg)) return d // concluída fora do período: não entra
    const j = [...new Set([...(antes?.j || []), ...validos])].sort()
    d.partidas[chave] = { f, m: antes?.m || String(partida.mapa || ''), j }
    metaAgora = !d.metaEm && contarMeta(d, cfg) >= META_COLETIVA_NATAL
    if (metaAgora) d.metaEm = Date.now()
    return d
  }, docPartidasVazio())
  const entrada = doc?.partidas?.[chave]
  if (!entrada) return { registrada: false }
  // cada participante válido recebe os créditos já (sem esperar abrir a página)
  for (const id of entrada.j) await pedirAoJogador(env, id, { acao: 'natal-sinc' }).catch((e) => console.error('natal: sincronizar jogador falhou', e))
  if (metaAgora) await concederDouradas(env, doc)
  return { registrada: true, meta: contarMeta(doc, cfg), metaAgora }
}

// Meta atingida: toda conta que ativou e concluiu ao menos uma partida válida no período recebe a insígnia dourada (no objeto dela)
async function concederDouradas(env, doc) {
  const [ativacoes, entregues] = await Promise.all([lerDoc(env, DOC_ATIVACOES_NATAL, {}, { fresco: true }), lerDoc(env, DOC_DOURADAS_NATAL, {}, { fresco: true })])
  const jogaram = new Set(Object.values(doc.partidas || {}).flatMap((p) => p.j))
  for (const id of Object.keys(ativacoes).filter((id) => jogaram.has(id) && !entregues[id])) await pedirAoJogador(env, id, { acao: 'natal-sinc' }).catch((e) => console.error('natal: dourada falhou', e))
}

// Cron: partidas recentes que não passaram pelo registro do evento (falha no meio do POST) entram agora; e douradas pendentes
export async function conferirNatal(env, agora = Date.now()) {
  const cfg = await lerConfigNatal(env, true)
  const estado = estadoNatal(cfg, agora)
  if (!['ativo', 'resgate'].includes(estado)) return
  const doc = await lerPartidasNatal(env)
  const vistas = new Set(Object.keys(doc.partidas))
  const conferidas = new Set(await lerDoc(env, 'natal-2026-conferidas', [], { fresco: true }))
  const recentes = await lerDoc(env, 'partidas-recentes', [], { fresco: true })
  const novas = []
  for (const item of recentes) {
    const c = item?.caminho
    if (!c || vistas.has(c) || conferidas.has(c)) continue
    const partida = await lerDoc(env, `partida-dados:${c}`, null, { fresco: true })
    if (partida) await registrarPartidaNatal(env, c, partida, agora)
    novas.push(c)
  }
  if (novas.length) await mudarDoc(env, 'natal-2026-conferidas', (l) => [...new Set([...l, ...novas])].slice(-500), [])
  const atual = await lerPartidasNatal(env)
  if (atual.metaEm) await concederDouradas(env, atual)
}

// ── No objeto do jogador (Loja), dentro da fila ──
const estadoVazio = () => ({ ativadoEm: null, creditos: {}, resgates: {}, dourada: null })
const NOMES_CREDITO = { ativacao: 'Evento ativado', 'partidas-dia': 'Dupla do dia', 'mapa-do-dia': 'Mapa do dia', 'dez-partidas': 'Maratona natalina' }

export async function natalDoJogador(obj, id, acao, p = {}) {
  const env = obj.env, agora = Date.now()
  const cfg = await lerConfigNatal(env, true)
  const estado = estadoNatal(cfg, agora)
  const st = { ...estadoVazio(), ...((await obj.ctx.storage.get(CHAVE)) || {}) }
  st.creditos = { ...st.creditos }; st.resgates = { ...st.resgates }
  let mudou = false

  if (acao === 'natal-ativar' && !st.ativadoEm) {
    if (estado !== 'ativo') throw new ErroConflito(estado === 'futuro' ? 'natal-futuro' : 'natal-fechado')
    st.ativadoEm = agora
    mudou = true
  }

  // Créditos pelas partidas do registro oficial (nunca pelo que o navegador manda)
  const doc = cfg.habilitado ? await lerPartidasNatal(env) : docPartidasVazio()
  const minhas = Object.entries(doc.partidas).filter(([, x]) => x.j?.includes(id) && dentroDoPeriodoNatal(x.f, cfg)).map(([chave, x]) => ({ chave, fim: x.f, mapa: x.m }))
  const novos = []
  for (const [k, v] of Object.entries(creditosNatal(minhas, cfg, st.ativadoEm))) {
    if (st.creditos[k]) continue
    st.creditos[k] = { v, ts: agora }
    novos.push(k)
    mudou = true
  }
  if (doc.metaEm && st.ativadoEm && minhas.length && !st.dourada) {
    st.dourada = { ts: agora, entregue: false }
    mudou = true
  }

  const gravar = {}
  let resgatado = null
  if (acao === 'natal-resgatar') {
    const r = recompensaNatal(p.recompensa)
    if (!r) throw new ErroPedido('recompensa')
    if (st.resgates[r.id]) resgatado = { recompensa: r.id, jaResgatado: true } // clique repetido: nada muda
    else {
      if (!['ativo', 'resgate'].includes(estado)) throw new ErroConflito('natal-resgate-fechado')
      if (!st.ativadoEm) throw new ErroConflito('natal-nao-ativado')
      const disp = (await disponibilidadeNatal(env, cfg))[r.id]
      if (!disp?.ok) throw new ErroConflito('natal-indisponivel', { motivo: disp?.motivo })
      if (somaEstrelas(st.creditos) - gastoEstrelas(st.resgates) < r.custo) throw new ErroConflito('natal-saldo')
      const recibo = { custo: r.custo, ts: agora, entregue: false }
      if (r.id === 'caixa') {
        const inv = await obj.invOuVazio(id)
        if (Object.keys(inv.itens).length >= ITENS_MAX) throw new ErroConflito('cheio')
        const item = novoIdItem()
        inv.itens[item] = { t: 'caixa', d: disp.caixa.id, p: 0 }
        inv.criado[item] = agora
        Object.assign(recibo, { entregue: true, item, caixa: disp.caixa.id })
        gravar.inv = inv
        gravar.invv = ((await obj.ctx.storage.get('invv')) || 0) + 1
      }
      if (r.id === 'moldura') {
        const posse = await lerPosse(obj)
        if (!posse.moldura.includes(MOLDURA_NATAL)) posse.moldura = [...posse.moldura, MOLDURA_NATAL]
        gravar.cosmeticos = posse
      }
      st.resgates[r.id] = recibo
      resgatado = { recompensa: r.id, ...(recibo.caixa ? { caixa: recibo.caixa } : {}) }
      mudou = true
    }
  }

  if (novos.length) {
    const total = novos.reduce((s, k) => s + st.creditos[k].v, 0)
    const nomes = [...new Set(novos.map((k) => NOMES_CREDITO[k.split(':')[0]]))].join(' · ')
    const n = { id: `natal-2026:${novos.sort().join(',')}`.slice(0, 180), titulo: `+${total} Estrelas de Natal`, texto: `Operação Presente: ${nomes}.`, link: LINK_EVENTO_NATAL, imagem: '/assets/eventos/natal-2026/estrela-de-natal-64.webp', quando: agora, lida: false }
    gravar.notifs = juntar((await obj.ctx.storage.get('notifs')) || docVazio(), { lista: [n], vistos: [n.id], limpoEm: 0 })
  }
  // Débito, item, posse, recibo e aviso numa gravação só
  if (mudou) await obj.ctx.storage.put({ ...gravar, [CHAVE]: st })

  await entregarPendentes(obj, id, st)
  if (st.ativadoEm && !st.ativacaoGlobal) {
    await mudarDoc(env, DOC_ATIVACOES_NATAL, (a) => (a[id] ? a : { ...a, [id]: st.ativadoEm }), {})
    st.ativacaoGlobal = true
    await obj.ctx.storage.put(CHAVE, st)
  }
  return { ...publicoDoJogador(st, minhas, cfg, estado, agora), ...(resgatado ? { resgatado } : {}) }
}

// Insígnias (comum e dourada) e marca da moldura no perfil: recibo "entregue" só depois de gravar no perfil
async function entregarPendentes(obj, id, st) {
  const dar = {}
  if (st.resgates.insignia && !st.resgates.insignia.entregue) dar[INSIGNIA_NATAL] = st.resgates.insignia.ts
  if (st.dourada && !st.dourada.entregue) dar[INSIGNIA_NATAL_DOURADA] = st.dourada.ts
  const moldura = st.resgates.moldura && !st.resgates.moldura.entregue
  if (!Object.keys(dar).length && !moldura) return
  if (Object.keys(dar).length) await darInsignias(obj.env, { [id]: dar })
  if (moldura) {
    const { mapa, resultado } = await mudar(obj.env, 'perfis', [id], (perfis) => {
      const p = perfis[id] || {}
      if (p.recompensas?.[MARCA_MOLDURA_NATAL]) return false
      perfis[id] = { ...p, recompensas: { ...p.recompensas, [MARCA_MOLDURA_NATAL]: st.resgates.moldura.ts } }
      return true
    })
    if (resultado) await avisarPerfil(obj.env, id, mapa[id])
  }
  const notifs = []
  if (dar[INSIGNIA_NATAL]) { st.resgates.insignia = { ...st.resgates.insignia, entregue: true }; notifs.push({ id: `ins:${INSIGNIA_NATAL}`, titulo: 'Você resgatou a insígnia NATAL NA NEURA 2026!', texto: 'Ela já aparece no seu perfil.', insignia: INSIGNIA_NATAL, link: '/perfil/', quando: st.resgates.insignia.ts, lida: false }) }
  if (dar[INSIGNIA_NATAL_DOURADA]) { st.dourada = { ...st.dourada, entregue: true }; notifs.push({ id: `ins:${INSIGNIA_NATAL_DOURADA}`, titulo: 'Meta coletiva atingida: insígnia dourada!', texto: 'A comunidade completou 100 partidas na Operação Presente.', insignia: INSIGNIA_NATAL_DOURADA, link: LINK_EVENTO_NATAL, quando: st.dourada.ts, lida: false }) }
  if (moldura) { st.resgates.moldura = { ...st.resgates.moldura, entregue: true }; notifs.push({ id: 'natal-2026:moldura', titulo: 'Moldura natalina liberada!', texto: 'Escolha em Perfil → Personalizar.', link: '/perfil/', quando: st.resgates.moldura.ts, lida: false }) }
  const gravar = { [CHAVE]: st }
  if (notifs.length) gravar.notifs = juntar((await obj.ctx.storage.get('notifs')) || docVazio(), { lista: notifs, vistos: notifs.map((n) => n.id), limpoEm: 0 })
  await obj.ctx.storage.put(gravar)
  if (dar[INSIGNIA_NATAL_DOURADA]) await mudarDoc(obj.env, DOC_DOURADAS_NATAL, (d) => (d[id] ? d : { ...d, [id]: st.dourada.ts }), {})
}

function publicoDoJogador(st, minhas, cfg, estado, agora) {
  const creditosPlanos = Object.fromEntries(Object.entries(st.creditos).map(([k, c]) => [k, c.v]))
  const ganho = somaEstrelas(st.creditos), gasto = gastoEstrelas(st.resgates)
  return {
    estado, ativadoEm: st.ativadoEm, saldo: ganho - gasto, ganho, gasto,
    partidas: minhas.length,
    missoes: cfg.habilitado ? progressoNatal(minhas, cfg, creditosPlanos, agora) : [],
    creditos: Object.entries(st.creditos).map(([chave, c]) => ({ chave, estrelas: c.v, ts: c.ts })).sort((a, b) => b.ts - a.ts || a.chave.localeCompare(b.chave)),
    resgates: Object.fromEntries(Object.entries(st.resgates).map(([k, r]) => [k, { ts: r.ts, custo: r.custo, entregue: !!r.entregue, ...(r.caixa ? { caixa: r.caixa } : {}) }])),
    dourada: st.dourada ? { ts: st.dourada.ts, entregue: !!st.dourada.entregue } : null,
  }
}

// ── Rotas ──
export async function rotaNatalPublica(env, cors) {
  const { publico } = await resumoPublico(env)
  return json(publico, 200, { ...cors, 'Cache-Control': 'no-store' })
}

const ACOES = { 'GET /eventos/natal-2026/eu': 'natal-sinc', 'POST /eventos/natal-2026/ativar': 'natal-ativar', 'POST /eventos/natal-2026/resgatar': 'natal-resgatar' }
export async function rotaNatal(req, env, quem, cors, rota) {
  const acao = ACOES[`${req.method} ${rota}`]
  if (!acao) throw new ErroNaoEncontrado('rota')
  const corpo = req.method === 'POST' ? await lerCorpo(req) : {}
  const jogador = await pedirAoJogador(env, quem.id, { acao, recompensa: typeof corpo.recompensa === 'string' ? corpo.recompensa : undefined })
  const { publico } = await resumoPublico(env)
  return json({ ...publico, jogador }, 200, { ...cors, 'Cache-Control': 'no-store' })
}

export async function rotaAdminNatal(env, metodo, corpo) {
  if (metodo === 'POST') {
    const r = validarConfigNatal(corpo)
    if (r.erro) throw new ErroPedido('natal-config', { campo: r.erro })
    await mudarDoc(env, DOC_CONFIG_NATAL, () => r.config)
  }
  const salva = await lerDoc(env, DOC_CONFIG_NATAL, null, { fresco: true })
  const { publico } = await resumoPublico(env)
  return { salva, ...publico }
}
