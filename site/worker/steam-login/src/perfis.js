/*
 * Perfis dos jogadores (coleção "perfis" do objeto Dados) e a configuração do site (doc "config"): regras de assinatura, cargos,
 * insígnias e o que muda sozinho (cron). As rotas do index.js, os pagamentos e a loja usam daqui.
 *
 *   perfil  { moldura?, molduraLivre? (posta por admin), time?, card?, tema?, idioma?, desempenho?, vistos?, xp? (ajuste do admin),
 *             bloqueado?, cargos?, ocultoRanking?, insignias? { "<insígnia>": quando ganhou (ms) }, sub? { inicio, periodo, meses, expira, pagamentos } }
 *   config  { molduraPorNivel, nivelMoldura, admins, cargos, molduraCargo, molduraSub, cardPorNivel, nivelCard, cardCargo, cardSub, subMeses, selos }
 */
import { avisarPerfil } from './amigos.js'
import { lerColecao, lerDoc, lerItem, mudar } from './dados.js'
import { ordemRanking, lerRanking } from './ranking.js'

export const lerConfig = (env) => lerDoc(env, 'config', {})
export const lerPerfis = (env) => lerColecao(env, 'perfis')
export const lerPerfil = (env, id) => lerItem(env, 'perfis', id)

export const ehAdmin = (id, env, config) => id === env.DONO || (config.admins || []).includes(id)

// Abas do painel de admin. O DONO tem todas; quem é admin tem as do selo "Admins" (o dono edita; sem nada salvo, ABAS_DO_ADMIN);
// qualquer jogador ganha mais abas (ou só as abas) pelos CARGOS dele ("acessos" de cada cargo, que o dono marca).
export const ABAS_ADMIN = ['usuarios', 'molduras', 'cards', 'cargos', 'assinaturas', 'skins', 'caixas', 'pontos', 'logs', 'admins']
const ABAS_DO_ADMIN = ['usuarios', 'molduras', 'cards', 'cargos']
export async function abasDe(id, env, config) {
  if (id === env.DONO) return [...ABAS_ADMIN]
  const dosAdmins = Array.isArray(config.selos?.admin?.acessos) ? config.selos.admin.acessos.filter((a) => ABAS_ADMIN.includes(a)) : ABAS_DO_ADMIN
  const abas = new Set(ehAdmin(id, env, config) ? dosAdmins : [])
  const meus = (await lerPerfil(env, id))?.cargos || []
  for (const c of config.cargos || []) if (meus.includes(c.id)) for (const a of c.acessos || []) if (ABAS_ADMIN.includes(a)) abas.add(a)
  return ABAS_ADMIN.filter((a) => abas.has(a))
}

// Selos da equipe (dono e admins): o dono edita nome, cor, ícone, imagem, se aparecem e se veem a página Pick & Ban (POST /admin/selos)
const SELOS_PADRAO = {
  dono: { nome: 'Dono', cor: '#ff4655', icone: 'coroa', imagem: 'verified.png', mostrar: true, pick: false },
  admin: { nome: 'Admin', cor: '#3498db', icone: 'escudo', imagem: 'verified.png', mostrar: true, pick: false },
}
export const selosDe = (c) => ({ dono: { ...SELOS_PADRAO.dono, ...c.selos?.dono }, admin: { ...SELOS_PADRAO.admin, ...c.selos?.admin } })

// O que o site pode ver da configuração (GET /config); o painel recebe isto + a lista de admins
export const configPublica = (c, env) => ({
  selos: selosDe(c),
  equipe: { dono: env.DONO || null, admins: (c.admins || []).filter((id) => id !== env.DONO) }, // quem recebe os selos acima
  molduraPorNivel: !!c.molduraPorNivel,
  nivelMoldura: c.nivelMoldura || {},
  cardPorNivel: !!c.cardPorNivel, // mesmas regras das molduras, para os cards (banners) do perfil
  nivelCard: c.nivelCard || {}, // { arquivoDoCard: nível }
  cardCargo: c.cardCargo || {}, // { arquivoDoCard: idCargo }: card exclusivo de quem tem o cargo
  cargos: c.cargos || [], // [{ id, nome, cor, icone?, imagem?, top?, numerar?, oculto?, pick?, acessos? }] (ex.: Premium, VIP). top = automático para o top N do ranking
  molduraCargo: c.molduraCargo || {}, // { idMoldura: idCargo }: moldura exclusiva de quem tem o cargo
  subMeses: { ...SUB_MESES_PADRAO, ...c.subMeses }, // meses de assinatura para cada nível do emblema Premium
  molduraSub: c.molduraSub || {}, // { idMoldura: nível mínimo de assinatura (subscriber ... legend) }: moldura só para assinantes
  cardSub: c.cardSub || {}, // { idCard: nível mínimo de assinatura }: card só para assinantes
})
export const configDoPainel = (c, env) => ({ ...configPublica(c, env), admins: c.admins || [] })

// Aplica um "remendo" no perfil (null, false, 0 ou [] tira o campo; perfil vazio sai da coleção). Devolve a coleção inteira (as rotas mandam para o site)
export async function mudarPerfil(env, id, campos) {
  await mudar(env, 'perfis', [id], (perfis) => {
    const p = { ...perfis[id] }
    for (const [k, v] of Object.entries(campos)) {
      if (v === null || v === false || v === 0 || (Array.isArray(v) && !v.length)) delete p[k]
      else p[k] = v
    }
    if (Object.keys(p).length) perfis[id] = p
    else delete perfis[id]
  })
  return lerPerfis(env)
}

// ── Assinatura Premium (emblema no avatar: Subscriber, Gold, Platinum, Diamond, Elite, Legend) ──
// Meses que cada nível exige (o Subscriber é o 1º mês); o admin muda no painel. Igual a src/comum/assinatura.js do site.
export const SUB_MESES_PADRAO = { gold: 3, platinum: 6, diamond: 12, elite: 18, legend: 24 }
export const NIVEIS_SUB = ['gold', 'platinum', 'diamond', 'elite', 'legend']
export const SUB_IDS = ['subscriber', ...NIVEIS_SUB]
const MES_MS = 30.4375 * 24 * 3600 * 1000

// Nível da assinatura (0 = Subscriber ... 5 = Legend; -1 = sem assinatura ativa): sem data (infinita) o tempo corre desde o início; vencida não vale
export function indiceSub(sub, config, agora = Date.now()) {
  if (!sub || typeof sub !== 'object') return -1
  const infinita = sub.expira == null
  if (!infinita && !(Number(sub.expira) > agora)) return -1
  const base = Math.max(0, Math.floor(Number(sub.meses) || 0))
  const desdeInicio = Number(sub.inicio) > 0 ? Math.max(0, Math.floor((agora - Number(sub.inicio)) / MES_MS)) : 0
  const meses = infinita ? Math.max(base, desdeInicio) : base
  const m = { ...SUB_MESES_PADRAO, ...config.subMeses }
  let i = 0
  SUB_IDS.forEach((id, k) => {
    if (k > 0 && meses >= m[id]) i = k
  })
  return i
}
export const subAtiva = (sub) => !!sub && (sub.expira == null || Number(sub.expira) > Date.now())

// A moldura/card exige assinatura? (config.molduraSub / cardSub: { id: nível mínimo }). Dono e admins não têm trava. Devolve o nível que falta ou null
export const faltaSub = (config, tabela, id, perfil, admin) => {
  const minimo = SUB_IDS.indexOf(config[tabela]?.[id])
  return minimo >= 0 && !admin && indiceSub(perfil?.sub, config) < minimo ? SUB_IDS[minimo] : null
}

function somarMeses(ms, n) {
  const d = new Date(ms)
  const dia = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return d.getTime()
}
// Marca curta do pagamento guardada na assinatura: torna a entrega idempotente e permite tirar os meses certos num estorno
async function marcaDoPagamento(pid) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pid))
  return [...new Uint8Array(h)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Assinatura paga (pagamentos.js, depois de conferir no Asaas): soma os meses uma única vez por pagamento. Devolve true se deu agora
export async function concederSub(env, id, meses, pid) {
  const marca = await marcaDoPagamento(pid)
  const { mapa, resultado } = await mudar(env, 'perfis', [id], (perfis) => {
    const perfil = { ...perfis[id] }
    const sub = perfil.sub
    if (sub?.pagamentos?.includes(marca)) return false
    const agora = Date.now()
    let novo
    if (sub && sub.expira == null) novo = { ...sub } // infinita: só registra o pagamento
    else {
      const expira = somarMeses(Math.max(agora, Number(sub?.expira) || 0), meses)
      // periodo = começo da sequência atual (volta a contar se venceu antes de renovar): o bônus de partida do Premium só vale daí em diante
      const vencida = sub && Number(sub.expira) > 0 && Number(sub.expira) < agora
      novo = { inicio: sub?.inicio || agora, periodo: !sub || vencida ? agora : sub.periodo || sub.inicio || agora, meses: (Number(sub?.meses) || 0) + meses, expira }
    }
    novo.pagamentos = [...(sub?.pagamentos || []), marca].slice(-20)
    perfis[id] = { ...perfil, sub: novo }
    return true
  })
  if (resultado) await avisarPerfil(env, id, mapa[id])
  return resultado
}

// Estorno/chargeback: tira os meses que esse pagamento deu (só se a marca dele estiver na assinatura). Devolve true se tirou
export async function revogarSub(env, id, meses, pid) {
  const marca = await marcaDoPagamento(pid)
  const { mapa, resultado } = await mudar(env, 'perfis', [id], (perfis) => {
    const sub = perfis[id]?.sub
    if (!sub?.pagamentos?.includes(marca)) return false
    const pagamentos = sub.pagamentos.filter((x) => x !== marca)
    const perfil = { ...perfis[id] }
    if (sub.expira == null) perfil.sub = { ...sub, pagamentos }
    else {
      const expira = somarMeses(Number(sub.expira), -meses)
      const restantes = Math.max(0, (Number(sub.meses) || 0) - meses)
      if (restantes <= 0 || expira <= Date.now()) delete perfil.sub
      else perfil.sub = { ...sub, meses: restantes, expira, pagamentos }
    }
    if (Object.keys(perfil).length) perfis[id] = perfil
    else delete perfis[id]
    return true
  })
  if (resultado) await avisarPerfil(env, id, mapa[id])
  return resultado
}

// ── Insígnias ──
// Grava as insígnias ganhas ({ id: { insígnia: quando } }) sem repetir as que o perfil já tem (a data de quem já tinha fica) e avisa ao vivo
export async function darInsignias(env, porJogador) {
  const ids = Object.keys(porJogador)
  if (!ids.length) return
  const { mapa, resultado: mudaram } = await mudar(env, 'perfis', ids, (perfis) => {
    const mudaram = []
    for (const id of ids) {
      const tem = perfis[id]?.insignias || {}
      const novas = Object.fromEntries(Object.entries(porJogador[id]).filter(([k]) => !tem[k]))
      if (!Object.keys(novas).length) continue
      perfis[id] = { ...perfis[id], insignias: { ...tem, ...novas } }
      mudaram.push(id)
    }
    return mudaram
  })
  for (const id of mudaram) await avisarPerfil(env, id, mapa[id])
}

// ── Cargos ──
// Os que o admin deu + os automáticos ("top N do ranking": entra e sai sozinho com a posição)
export function cargosDoJogador(id, perfis, config, ranking) {
  const manuais = perfis[id]?.cargos || []
  const automaticos = (config.cargos || []).filter((c) => c.top > 0)
  if (!automaticos.length) return manuais
  const pos = ordemRanking(ranking, perfis).findIndex((j) => j.steamId === id)
  return [...new Set([...manuais, ...automaticos.filter((c) => pos >= 0 && pos < c.top).map((c) => c.id)])]
}
export const precisaDoRanking = (config) => (config.cargos || []).some((c) => c.top > 0)

// Item (moldura/card) exclusivo de um cargo. Além dos cargos do painel: "_dono" (só o dono) e "_admin" (dono e admins).
// Admins usam o que é exclusivo dos cargos comuns, mas não o que é só do dono.
export function podeUsarCargo(cargo, id, env, config, cargos) {
  if (cargo === '_dono') return id === env.DONO
  if (ehAdmin(id, env, config)) return true
  return cargo !== '_admin' && cargos.includes(cargo)
}

// Moldura/card exclusivo de um cargo (ou de um nível de assinatura) que o jogador não tem mais sai do perfil.
// Roda no cron e depois de o admin mudar cargos, assinaturas ou exclusivas. Devolve a coleção.
export async function tirarExclusivasSemCargo(env, config) {
  const exclusivas = config.molduraCargo || {}
  const exclusivosCards = config.cardCargo || {}
  const temExclusiva = (p) => (p.moldura && (exclusivas[p.moldura] || config.molduraSub?.[p.moldura])) || (p.card && (exclusivosCards[p.card] || config.cardSub?.[p.card]))
  const perfis = await lerPerfis(env)
  const candidatos = Object.keys(perfis).filter((id) => temExclusiva(perfis[id]))
  if (!candidatos.length) return perfis
  const ranking = precisaDoRanking(config) ? await lerRanking(env) : null
  await mudar(env, 'perfis', candidatos, (atuais) => {
    for (const id of candidatos) {
      const p = atuais[id] && { ...atuais[id] }
      if (!p) continue
      const admin = ehAdmin(id, env, config)
      const tem = cargosDoJogador(id, { ...perfis, ...atuais }, config, ranking)
      const mantem = (cargo) => podeUsarCargo(cargo, id, env, config, tem)
      if (p.moldura && ((exclusivas[p.moldura] && !mantem(exclusivas[p.moldura])) || faltaSub(config, 'molduraSub', p.moldura, p, admin))) {
        delete p.moldura
        delete p.molduraLivre
      }
      if (p.card && ((exclusivosCards[p.card] && !mantem(exclusivosCards[p.card])) || faltaSub(config, 'cardSub', p.card, p, admin))) delete p.card
      if (Object.keys(p).length) atuais[id] = p
      else delete atuais[id]
    }
  })
  return lerPerfis(env)
}
