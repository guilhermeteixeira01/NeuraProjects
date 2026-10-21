/*
 * Trocas entre jogadores (como as propostas de troca da Steam): um jogador escolhe itens do inventário dele e do inventário do outro,
 * manda a proposta, e o outro aceita, recusa ou deixa vencer. Itens vão e vêm inteiros (skin com adesivos e chaveiro, adesivo, chaveiro, caixa).
 *
 * Um Durable Object GLOBAL ("Trocas") guarda as propostas e roda um pedido de cada vez: assim duas pessoas nunca aceitam a mesma troca ao mesmo
 * tempo, e um item que está numa proposta pendente não pode ser oferecido em outra. Aceitar mexe nos dois inventários (cada um num objeto
 * de jogador: mudarSkins confere a versão); se o segundo falhar, o primeiro é desfeito.
 *
 *   GET  /trocas                    (login) -> { recebidas, enviadas, historico }
 *   POST /trocas { para, dar: [id], pedir: [id], msg }   -> cria a proposta (dar = itens do seu inventário; pedir = do outro)
 *   POST /trocas/aceitar|recusar|cancelar { id }
 * Proposta: { id, de, para, deNome, deAvatar, paraNome, paraAvatar, dar: [{ id, item }], pedir: [{ id, item }], msg, estado, criada, fim }
 *   estado: pendente | aceita | recusada | cancelada | vencida | falhou
 */
import { avisarTroca } from './amigos.js'
import { limparSkins, lerSkins, mudarSkins, novoIdItem } from './skins.js'

const ID_STEAM = /^\d{17}$/
const MAX_ITENS = 20 // por lado
const MAX_PENDENTES = 20 // por quem envia
const VALIDADE_MS = 7 * 24 * 3600 * 1000
const GUARDAR = 400 // propostas guardadas
const TIPOS_OK = new Set(['arma', 'faca', 'luva', 'adesivo', 'chaveiro', 'caixa'])
const ITENS_MAX = 2000

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const mesmo = (a, b) => a && b && a.t === b.t && a.d === b.d && a.p === b.p

// Tira o item do inventário (e do que está equipado)
function tirar(inv, id) {
  delete inv.itens[id]
  delete inv.criado[id]
  for (const lado of ['ct', 'tr']) inv.equip[lado] = Object.fromEntries(Object.entries(inv.equip[lado]).filter(([, v]) => v !== id))
  inv.presentes = (inv.presentes || []).filter((q) => q.i !== id)
}

// Troca os itens de um jogador: tira "sai" (ids com o item esperado) e põe "entra" (itens novos, com id novo). Devolve { novosIds } ou { erro }
export async function mexerNoInventario(env, jogador, sai, entra) {
  let novosIds = []
  const r = await mudarSkins(env, jogador, (inv) => {
    novosIds = []
    for (const { id, item } of sai) if (!mesmo(inv.itens[id], item)) return { erro: 'item-mudou', status: 409 } // já não tem (ou mudou)
    if (Object.keys(inv.itens).length - sai.length + entra.length > ITENS_MAX) return { erro: 'cheio', status: 409 }
    for (const { id } of sai) tirar(inv, id)
    const agora = Date.now()
    for (const { item } of entra) {
      const novo = novoIdItem()
      inv.itens[novo] = JSON.parse(JSON.stringify(item))
      inv.criado[novo] = agora
      novosIds.push(novo)
    }
    return { inv: limparSkins(inv) }
  })
  return r.erro ? { erro: r.erro } : { novosIds }
}

export class Trocas {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.fila = Promise.resolve()
  }

  exclusivo(fn) {
    const r = this.fila.then(fn)
    this.fila = r.then(() => {}, () => {})
    return r
  }

  async fetch(req) {
    const corpo = await req.json().catch(() => ({}))
    return this.exclusivo(async () => {
      try {
        return json(await this.acao(corpo))
      } catch (e) {
        const m = /^[a-z-]{2,30}$/.test(e?.message || '') ? e.message : 'falhou'
        return json({ erro: m }, m === 'falhou' ? 500 : 400)
      }
    })
  }

  async lista() {
    const todas = (await this.ctx.storage.get('trocas')) || []
    const agora = Date.now()
    let mudou = false
    for (const p of todas) {
      if (p.estado === 'pendente' && p.fim < agora) {
        p.estado = 'vencida'
        mudou = true
      }
    }
    if (mudou) await this.ctx.storage.put('trocas', todas)
    return todas
  }
  gravar(lista) {
    return this.ctx.storage.put('trocas', lista.slice(0, GUARDAR))
  }

  async acao({ acao, quem, ...p }) {
    const todas = await this.lista()
    if (acao === 'listar') {
      const minhas = todas.filter((x) => x.de === quem || x.para === quem)
      const pendente = (x) => x.estado === 'pendente'
      return {
        recebidas: minhas.filter((x) => pendente(x) && x.para === quem),
        enviadas: minhas.filter((x) => pendente(x) && x.de === quem),
        historico: minhas.filter((x) => !pendente(x)).slice(0, 40),
      }
    }

    if (acao === 'criar') return this.criar(todas, quem, p)

    const t = todas.find((x) => x.id === p.id)
    if (!t) throw new Error('nao-achou')
    if (t.estado !== 'pendente') throw new Error('encerrada')
    if (acao === 'cancelar') {
      if (t.de !== quem) throw new Error('nao-pode')
      t.estado = 'cancelada'
    } else if (acao === 'recusar') {
      if (t.para !== quem) throw new Error('nao-pode')
      t.estado = 'recusada'
    } else if (acao === 'aceitar') {
      if (t.para !== quem) throw new Error('nao-pode')
      const erro = await this.aplicar(t)
      t.estado = erro ? 'falhou' : 'aceita'
      if (erro) t.motivo = erro
      t.fim = Date.now()
      await this.gravar(todas)
      await avisarTroca(this.env, t.de)
      if (erro) throw new Error(erro)
      return { ok: true }
    } else throw new Error('acao')
    t.fim = Date.now()
    await this.gravar(todas)
    await avisarTroca(this.env, quem === t.de ? t.para : t.de)
    return { ok: true }
  }

  async criar(todas, quem, p) {
    const para = String(p.para || '')
    if (!ID_STEAM.test(para) || para === quem) throw new Error('jogador')
    const ids = (v) => [...new Set(Array.isArray(v) ? v.map(String) : [])].slice(0, MAX_ITENS + 1)
    const dar = ids(p.dar)
    const pedir = ids(p.pedir)
    if (dar.length > MAX_ITENS || pedir.length > MAX_ITENS) throw new Error('muitos-itens')
    if (!dar.length && !pedir.length) throw new Error('vazia')
    if (todas.filter((x) => x.estado === 'pendente' && x.de === quem).length >= MAX_PENDENTES) throw new Error('muitas-pendentes')

    const usuarios = (await this.env.MOLDURAS.get('usuarios', 'json').catch(() => null)) || {}
    if (!usuarios[para]) throw new Error('jogador')
    const invMeu = await lerSkins(this.env, quem)
    const invDele = await lerSkins(this.env, para)
    const emUso = new Set(todas.filter((x) => x.estado === 'pendente' && x.de === quem).flatMap((x) => x.dar.map((i) => i.id)))
    const montar = (lista, inv, checarUso) =>
      lista.map((id) => {
        const item = inv?.itens?.[id]
        if (!item || !TIPOS_OK.has(item.t)) throw new Error('item-invalido')
        if (checarUso && emUso.has(id)) throw new Error('item-em-outra-proposta')
        return { id, item }
      })
    const snapDar = montar(dar, invMeu, true)
    const snapPedir = montar(pedir, invDele, false)

    const t = {
      id: novoIdItem() + novoIdItem().slice(0, 4),
      de: quem,
      para,
      deNome: String(usuarios[quem]?.nome || ''),
      deAvatar: String(usuarios[quem]?.avatar || ''),
      paraNome: String(usuarios[para]?.nome || ''),
      paraAvatar: String(usuarios[para]?.avatar || ''),
      dar: snapDar,
      pedir: snapPedir,
      msg: String(p.msg || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 200),
      estado: 'pendente',
      criada: Date.now(),
      fim: Date.now() + VALIDADE_MS,
    }
    await this.gravar([t, ...todas])
    await avisarTroca(this.env, para)
    return { ok: true, id: t.id }
  }

  // Aplica nos dois inventários; devolve null se deu certo ou o motivo do erro (e desfaz o que já tinha feito)
  async aplicar(t) {
    const a = await mexerNoInventario(this.env, t.de, t.dar, t.pedir) // quem propôs: perde "dar" e recebe "pedir"
    if (a.erro) return a.erro === 'item-mudou' ? 'item-de-quem-propos-mudou' : a.erro
    const b = await mexerNoInventario(this.env, t.para, t.pedir, t.dar) // quem aceita: perde "pedir" e recebe "dar"
    if (b.erro) {
      // desfaz o primeiro: tira o que entrou e devolve o que saiu
      await mexerNoInventario(
        this.env,
        t.de,
        a.novosIds.map((id, i) => ({ id, item: t.pedir[i].item })),
        t.dar,
      )
      return b.erro === 'item-mudou' ? 'seu-item-mudou' : b.erro
    }
    return null
  }
}

const objeto = (env) => env.TROCAS.get(env.TROCAS.idFromName('global'))
const chamar = (env, corpo) => objeto(env).fetch('https://trocas/', { method: 'POST', body: JSON.stringify(corpo) })

// Rotas /trocas (login)
export async function rotaTrocas(req, env, quem, cors, rota) {
  let corpo = {}
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}))
  let acao
  if (rota === '/trocas' && req.method === 'GET') acao = 'listar'
  else if (rota === '/trocas' && req.method === 'POST') acao = 'criar'
  else if (req.method === 'POST' && ['/trocas/aceitar', '/trocas/recusar', '/trocas/cancelar'].includes(rota)) acao = rota.split('/').pop().replace(/ar$/, 'ar')
  else return json({ erro: 'rota' }, 404, cors)
  const r = await chamar(env, { acao, quem: quem.id, ...corpo })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
}
