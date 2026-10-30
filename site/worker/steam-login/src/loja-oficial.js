/*
 * Mercado oficial (aba "Loja oficial" do mercado): o site vende por NP os itens de partida (Boost/Freeze) e os enfeites do perfil
 * que o admin pôs à venda (moldura, card e fundo de perfil), soltos ou em kit (card + moldura + fundo, mais barato junto).
 *
 * Catálogo (doc "loja-oficial", o admin edita):
 *   { consumiveis: { boost, freeze } (preço em NP; 0 = fora de venda),
 *     itens: [{ tipo: 'moldura' | 'card' | 'fundo', id, preco }],
 *     kits:  [{ id, nome, moldura?, card?, fundo?, preco }] }
 * Enfeite à venda (solto ou dentro de um kit) fica TRAVADO no Personalizar até o jogador comprar; comprado vale para sempre
 * (passa por cima de nível, cargo, assinatura e insígnia). Posse: objeto do jogador (Loja), chave "cosmeticos": { moldura: [], card: [], fundo: [] }.
 *
 *   GET  /loja/oficial                         (login) -> { catalogo, possui, consumiveis, saldo }
 *   POST /loja/oficial/comprar { tipo, id, qtd } -> { saldo, possui, consumiveis }
 *   GET|POST /admin/loja-oficial                (admin) -> catálogo
 */
import { MOLDURAS } from '../../../src/comum/molduras.js'
import { lerDoc, mudarDoc, mudar } from './dados.js'
import { lerPerfis } from './perfis.js'
import { pedirAoJogador } from './objetos.js'
import { avisarPerfil } from './amigos.js'
import { ErroConflito, ErroNaoEncontrado, ErroPedido } from './erros.js'
import { FUNDOS_PERFIL } from './fundos-perfil.js'
import { TIPOS_CONSUMIVEL, publico as consumiveisPublicos } from './consumiveis.js'

export const TIPOS_ENFEITE = ['moldura', 'card', 'fundo']
export const PRECOS_PADRAO = { boost: 2500, freeze: 1500 }
const PRECO_MAX = 10_000_000
const MAX_ITENS = 500
const MAX_KITS = 60
const MAX_CONSUMIVEL = 99
const CARD_ID = /^([\p{L}0-9_ -]{1,40}\/)?[\p{L}0-9._ -]{1,80}\.(png|webp|avif|svg|jpe?g|gif)$/iu
const IDS_MOLDURA = new Set(MOLDURAS.map((m) => m.id))

const preco = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, PRECO_MAX) : 0
}
const idOk = (tipo, id) => typeof id === 'string' && (tipo === 'moldura' ? IDS_MOLDURA.has(id) : tipo === 'card' ? CARD_ID.test(id) : FUNDOS_PERFIL.includes(id))
const texto = (s, max) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max)

// Valida o que o admin mandou (ou o que estava salvo): descarta o que não existe mais
export function limparCatalogo(c = {}) {
  const consumiveis = {}
  for (const t of TIPOS_CONSUMIVEL) consumiveis[t] = c.consumiveis && t in c.consumiveis ? preco(c.consumiveis[t]) : PRECOS_PADRAO[t]
  const vistos = new Set()
  const itens = (Array.isArray(c.itens) ? c.itens : [])
    .filter((x) => x && TIPOS_ENFEITE.includes(x.tipo) && idOk(x.tipo, x.id) && preco(x.preco) && !vistos.has(`${x.tipo}:${x.id}`) && vistos.add(`${x.tipo}:${x.id}`))
    .slice(0, MAX_ITENS)
    .map((x) => ({ tipo: x.tipo, id: x.id, preco: preco(x.preco) }))
  const ids = new Set()
  const kits = (Array.isArray(c.kits) ? c.kits : [])
    .map((k, i) => {
      if (!k || !preco(k.preco)) return null
      const kit = { id: /^[a-z0-9-]{1,40}$/.test(k.id) && !ids.has(k.id) ? k.id : `kit-${Date.now().toString(36)}-${i}`, nome: texto(k.nome, 60) || 'Kit', preco: preco(k.preco) }
      for (const t of TIPOS_ENFEITE) if (idOk(t, k[t])) kit[t] = k[t]
      if (!TIPOS_ENFEITE.some((t) => kit[t])) return null
      ids.add(kit.id)
      return kit
    })
    .filter(Boolean)
    .slice(0, MAX_KITS)
  return { consumiveis, itens, kits }
}

export const lerCatalogo = async (env) => limparCatalogo((await lerDoc(env, 'loja-oficial')) || {})
export const gravarCatalogo = async (env, c) => {
  const catalogo = await mudarDoc(env, 'loja-oficial', () => limparCatalogo(c))
  await retirarEnfeitesSemCompra(env, catalogo)
  return catalogo
}

// Confere a posse fora da transação; dentro dela revalida os campos atuais para não apagar uma edição concorrente.
export async function retirarEnfeitesSemCompra(env, catalogo, jogador) {
  const venda = aVenda(catalogo)
  if (!venda.size) return
  const campos = { moldura: 'moldura', card: 'card', fundo: 'fundoPerfil' }
  const perfis = await lerPerfis(env)
  for (const [id, perfil] of Object.entries(perfis)) {
    if (jogador && id !== jogador) continue
    if (!TIPOS_ENFEITE.some(t => venda.has(`${t}:${perfil[campos[t]]}`))) continue
    const { possui: posse } = await pedirAoJogador(env, id, { acao: 'oficial-posse' })
    const { mapa, resultado } = await mudar(env, 'perfis', [id], atuais => {
      const p = atuais[id]
      if (!p) return false
      let mudou = false
      for (const t of TIPOS_ENFEITE) {
        const campo = campos[t]
        if (venda.has(`${t}:${p[campo]}`) && !possui(posse, t, p[campo])) {
          delete p[campo]
          if (t === 'moldura') delete p.molduraLivre
          mudou = true
        }
      }
      return mudou
    })
    if (resultado) await avisarPerfil(env, id, mapa[id])
  }
}

// "moldura:times/furia" de tudo que está à venda (solto ou em kit): trava no Personalizar até comprar
export function aVenda(catalogo) {
  const s = new Set(catalogo.itens.map((x) => `${x.tipo}:${x.id}`))
  for (const k of catalogo.kits) for (const t of TIPOS_ENFEITE) if (k[t]) s.add(`${t}:${k[t]}`)
  return s
}

// O que a compra entrega: { preco, motivo, consumivel?: { tipo, qtd }, enfeites?: [{ tipo, id }] }
export function oferta(catalogo, { tipo, id, qtd }) {
  if (TIPOS_CONSUMIVEL.includes(tipo)) {
    const n = Math.round(Number(qtd) || 1)
    if (n < 1 || n > 20) throw new ErroPedido('qtd')
    const unit = catalogo.consumiveis[tipo]
    if (!unit) throw new ErroNaoEncontrado('oferta')
    return { preco: unit * n, motivo: `mercado: ${n}x ${tipo}`, consumivel: { tipo, qtd: n } }
  }
  if (tipo === 'kit') {
    const k = catalogo.kits.find((x) => x.id === id)
    if (!k) throw new ErroNaoEncontrado('oferta')
    return { preco: k.preco, motivo: `mercado: kit ${k.nome}`, enfeites: TIPOS_ENFEITE.filter((t) => k[t]).map((t) => ({ tipo: t, id: k[t] })) }
  }
  const x = catalogo.itens.find((i) => i.tipo === tipo && i.id === id)
  if (!x) throw new ErroNaoEncontrado('oferta')
  return { preco: x.preco, motivo: `mercado: ${tipo} ${id}`.slice(0, 60), enfeites: [{ tipo, id }] }
}

const vazio = () => ({ moldura: [], card: [], fundo: [] })
export const lerPosse = async (obj) => ({ ...vazio(), ...((await obj.ctx.storage.get('cosmeticos')) || {}) })
export const possui = (posse, tipo, id) => !!posse?.[tipo]?.includes(id)

// No objeto do jogador (Loja). acao 'oficial-ler' | 'oficial-comprar' (p = oferta já resolvida pela rota)
export async function oficialDoJogador(obj, acao, saldo, p) {
  const posse = await lerPosse(obj)
  const cons = { boost: 0, freeze: 0, ativo: null, aplicados: [], ...((await obj.ctx.storage.get('consumiveis')) || {}) }
  if (acao === 'oficial-comprar') {
    const custo = Math.round(Number(p.preco))
    if (!(custo > 0)) throw new ErroPedido('oferta')
    const gravar = {}
    if (p.enfeites?.length) {
      const novos = p.enfeites.filter((e) => TIPOS_ENFEITE.includes(e.tipo) && !possui(posse, e.tipo, e.id))
      if (!novos.length) throw new ErroConflito('ja-tem')
      for (const e of novos) posse[e.tipo] = [...posse[e.tipo], e.id]
      gravar.cosmeticos = posse
    }
    if (p.consumivel) {
      const { tipo, qtd } = p.consumivel
      if (!TIPOS_CONSUMIVEL.includes(tipo)) throw new ErroPedido('tipo')
      if (cons[tipo] + qtd > MAX_CONSUMIVEL) throw new ErroConflito('limite')
      cons[tipo] += qtd
      gravar.consumiveis = cons
    }
    if (saldo() < custo) throw new ErroConflito('saldo')
    // NP e item juntos: se o item não gravar, o movimento sai
    const marca = obj.sql.exec('SELECT COALESCE(MAX(id), 0) AS m FROM movimentos').one().m
    obj.ctx.storage.transactionSync(() => obj.movimentar(Date.now(), custo, p.motivo || 'mercado oficial'))
    try {
      await obj.ctx.storage.put(gravar)
    } catch (e) {
      obj.ctx.storage.transactionSync(() => {
        obj.sql.exec('DELETE FROM movimentos WHERE id > ?', marca)
        obj.recalcularResumo()
      })
      throw e
    }
  }
  if (acao === 'oficial-dar') { // admin: dá (ou tira) um enfeite sem cobrar
    const { tipo, id, tirar } = p
    if (!TIPOS_ENFEITE.includes(tipo)) throw new ErroPedido('tipo')
    posse[tipo] = tirar ? posse[tipo].filter((x) => x !== id) : [...new Set([...posse[tipo], id])]
    await obj.ctx.storage.put('cosmeticos', posse)
  }
  return { possui: posse, consumiveis: consumiveisPublicos(cons), ...(acao === 'oficial-posse' ? {} : { saldo: saldo() }) }
}
