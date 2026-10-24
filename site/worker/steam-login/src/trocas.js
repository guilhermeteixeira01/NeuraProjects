/*
 * Trocas entre jogadores (como as propostas de troca da Steam): um jogador escolhe itens do inventário dele e do inventário do outro,
 * manda a proposta, e o outro aceita, recusa ou deixa vencer. Itens vão e vêm inteiros (skin com adesivos e chaveiro, adesivo, chaveiro, caixa).
 *
 * Um Durable Object GLOBAL ("Trocas", SQLite) guarda as propostas e roda um pedido de cada vez: assim duas pessoas nunca aceitam a mesma troca
 * ao mesmo tempo, e um item que está numa proposta pendente não pode ser oferecido em outra. Aceitar mexe nos dois inventários (cada um no
 * objeto do jogador: mudarSkins confere a versão); se o segundo falhar, o primeiro é desfeito.
 *
 *   GET  /trocas                    (login) -> { recebidas, enviadas, historico }
 *   POST /trocas { para, dar: [id], pedir: [id], msg, senha }   -> cria a proposta (dar = itens do seu inventário; pedir = do outro)
 *   POST /trocas/aceitar { id, senha } · /trocas/recusar { id } · /trocas/cancelar { id }
 * Proposta: { id, de, para, deNome, deAvatar, paraNome, paraAvatar, dar: [{ id, item }], pedir: [{ id, item }], msg, estado, criada, fim, motivo? }
 *   estado: pendente | aceita | recusada | cancelada | vencida | falhou
 */
import { avisarTroca } from './amigos.js'
import { exigirSenha } from './contas.js'
import { ErroConflito, ErroNaoEncontrado, ErroPedido, ErroPermissao } from './erros.js'
import { lerCorpo, reenviar } from './http.js'
import { Fila, objetoGlobal, responder } from './objetos.js'
import { registrar } from './registro.js'
import { limparSkins, lerSkins, mudarSkins, novoIdItem, tirarItem } from './skins.js'
import { lerUsuarios } from './usuarios.js'

const ID_STEAM = /^\d{17}$/
const MAX_ITENS = 20 // por lado
const MAX_PENDENTES = 20 // por quem envia
const VALIDADE_MS = 7 * 24 * 3600 * 1000
const GUARDAR = 400 // propostas encerradas guardadas (as pendentes ficam sempre)
const TIPOS_OK = new Set(['arma', 'faca', 'luva', 'adesivo', 'chaveiro', 'caixa'])
const ITENS_MAX = 2000

const mesmo = (a, b) => a && b && a.t === b.t && a.d === b.d && a.p === b.p

// Troca os itens de um jogador: tira "sai" (ids com o item esperado) e põe "entra" (itens novos, com id novo). Devolve os ids novos.
// Item que já não está lá (ou mudou): ErroConflito 'item-mudou'; sem espaço: ErroConflito 'cheio'.
export async function mexerNoInventario(env, jogador, sai, entra) {
  const { novosIds } = await mudarSkins(env, jogador, (inv) => {
    for (const { id, item } of sai) if (!mesmo(inv.itens[id], item)) throw new ErroConflito('item-mudou')
    if (Object.keys(inv.itens).length - sai.length + entra.length > ITENS_MAX) throw new ErroConflito('cheio')
    for (const { id } of sai) tirarItem(inv, id)
    const agora = Date.now()
    const novosIds = entra.map(({ item }) => {
      const novo = novoIdItem()
      inv.itens[novo] = structuredClone(item)
      inv.criado[novo] = agora
      return novo
    })
    return { inv: limparSkins(inv), novosIds }
  })
  return novosIds
}

const deLinha = (l) => ({ ...JSON.parse(l.dados), id: l.id, de: l.de, para: l.para, estado: l.estado, criada: l.criada, fim: l.fim, ...(l.motivo ? { motivo: l.motivo } : {}) })

export class Trocas {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS trocas (id TEXT PRIMARY KEY, de TEXT NOT NULL, para TEXT NOT NULL, estado TEXT NOT NULL, criada INTEGER NOT NULL, fim INTEGER NOT NULL, motivo TEXT, dados TEXT NOT NULL)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS trocas_de ON trocas (de, estado)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS trocas_para ON trocas (para, estado)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS trocas_estado ON trocas (estado, fim)')
    this.fila = new Fila()
    this.pronto = ctx.blockConcurrencyWhile(() => this.migrar())
  }

  // As propostas ficavam numa lista só no armazenamento ("trocas"): passam para a tabela (uma vez)
  async migrar() {
    const antigas = await this.ctx.storage.get('trocas')
    if (!Array.isArray(antigas)) return
    this.ctx.storage.transactionSync(() => {
      for (const t of antigas) this.inserir(t)
    })
    await this.ctx.storage.delete('trocas')
  }

  inserir(t) {
    const { id, de, para, estado, criada, fim, motivo, ...dados } = t
    this.sql.exec('INSERT OR REPLACE INTO trocas (id, de, para, estado, criada, fim, motivo, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, de, para, estado, criada, fim, motivo || null, JSON.stringify(dados))
  }

  fetch(req) {
    return responder(async () => {
      const corpo = await lerCorpo(req)
      await this.pronto
      return this.fila.rodar(() => this.acao(corpo))
    })
  }

  encerrar(id, estado, motivo = null) {
    this.sql.exec('UPDATE trocas SET estado = ?, fim = ?, motivo = ? WHERE id = ?', estado, Date.now(), motivo, id)
    // só as GUARDAR encerradas mais recentes ficam
    this.sql.exec("DELETE FROM trocas WHERE estado != 'pendente' AND id NOT IN (SELECT id FROM trocas WHERE estado != 'pendente' ORDER BY fim DESC LIMIT ?)", GUARDAR)
  }

  async acao({ acao, quem, ...p }) {
    if (acao === 'zerar') {
      this.sql.exec('DELETE FROM trocas') // src/zerar.js: nenhuma proposta (nem histórico)
      return { ok: true }
    }
    this.sql.exec("UPDATE trocas SET estado = 'vencida' WHERE estado = 'pendente' AND fim < ?", Date.now())
    if (acao === 'listar') return this.listar(quem)
    if (acao === 'criar') return this.criar(quem, p)

    const linha = this.sql.exec('SELECT * FROM trocas WHERE id = ?', String(p.id || '')).toArray()[0]
    if (!linha) throw new ErroNaoEncontrado('nao-achou')
    const t = deLinha(linha)
    if (t.estado !== 'pendente') throw new ErroConflito('encerrada')
    if (acao === 'cancelar' || acao === 'recusar') {
      if ((acao === 'cancelar' ? t.de : t.para) !== quem) throw new ErroPermissao('nao-pode')
      this.encerrar(t.id, acao === 'cancelar' ? 'cancelada' : 'recusada')
      await avisarTroca(this.env, quem === t.de ? t.para : t.de)
      return { ok: true }
    }
    if (acao !== 'aceitar') throw new ErroPedido('acao')
    if (t.para !== quem) throw new ErroPermissao('nao-pode')
    try {
      await this.aplicar(t)
    } catch (e) {
      if (e instanceof ErroConflito) {
        this.encerrar(t.id, 'falhou', e.codigo)
        await avisarTroca(this.env, t.de)
      }
      throw e
    }
    this.encerrar(t.id, 'aceita')
    await avisarTroca(this.env, t.de)
    return { ok: true }
  }

  listar(quem) {
    const minhas = this.sql.exec('SELECT * FROM trocas WHERE de = ? OR para = ? ORDER BY criada DESC', quem, quem).toArray().map(deLinha)
    const pendente = (x) => x.estado === 'pendente'
    return {
      recebidas: minhas.filter((x) => pendente(x) && x.para === quem),
      enviadas: minhas.filter((x) => pendente(x) && x.de === quem),
      historico: minhas.filter((x) => !pendente(x)).slice(0, 40),
    }
  }

  async criar(quem, p) {
    const para = String(p.para || '')
    if (!ID_STEAM.test(para) || para === quem) throw new ErroPedido('jogador')
    const ids = (v) => [...new Set(Array.isArray(v) ? v.map(String) : [])].slice(0, MAX_ITENS + 1)
    const dar = ids(p.dar)
    const pedir = ids(p.pedir)
    if (dar.length > MAX_ITENS || pedir.length > MAX_ITENS) throw new ErroPedido('muitos-itens')
    if (!dar.length && !pedir.length) throw new ErroPedido('vazia')
    const minhasPendentes = this.sql.exec("SELECT dados FROM trocas WHERE de = ? AND estado = 'pendente'", quem).toArray()
    if (minhasPendentes.length >= MAX_PENDENTES) throw new ErroConflito('muitas-pendentes')

    const usuarios = await lerUsuarios(this.env)
    if (!usuarios[para]) throw new ErroNaoEncontrado('jogador')
    const [invMeu, invDele] = await Promise.all([lerSkins(this.env, quem), lerSkins(this.env, para)])
    const emUso = new Set(minhasPendentes.flatMap((l) => JSON.parse(l.dados).dar.map((i) => i.id)))
    const montar = (lista, inv, checarUso) =>
      lista.map((id) => {
        const item = inv?.itens?.[id]
        if (!item || !TIPOS_OK.has(item.t)) throw new ErroConflito('item-invalido')
        if (checarUso && emUso.has(id)) throw new ErroConflito('item-em-outra-proposta')
        return { id, item }
      })

    const agora = Date.now()
    const t = {
      id: novoIdItem() + novoIdItem().slice(0, 4),
      de: quem,
      para,
      deNome: String(usuarios[quem]?.nome || ''),
      deAvatar: String(usuarios[quem]?.avatar || ''),
      paraNome: String(usuarios[para]?.nome || ''),
      paraAvatar: String(usuarios[para]?.avatar || ''),
      dar: montar(dar, invMeu, true),
      pedir: montar(pedir, invDele, false),
      msg: String(p.msg || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 200),
      estado: 'pendente',
      criada: agora,
      fim: agora + VALIDADE_MS,
    }
    this.inserir(t)
    await avisarTroca(this.env, para)
    return { ok: true, id: t.id }
  }

  // Aplica nos dois inventários; se o segundo falhar, desfaz o primeiro e lança o motivo (ErroConflito) do ponto de vista de quem aceitou
  async aplicar(t) {
    let novosDoPrimeiro
    try {
      novosDoPrimeiro = await mexerNoInventario(this.env, t.de, t.dar, t.pedir) // quem propôs: perde "dar" e recebe "pedir"
    } catch (e) {
      throw e instanceof ErroConflito && e.codigo === 'item-mudou' ? new ErroConflito('item-de-quem-propos-mudou') : e
    }
    try {
      await mexerNoInventario(this.env, t.para, t.pedir, t.dar) // quem aceita: perde "pedir" e recebe "dar"
    } catch (e) {
      // desfaz o primeiro: tira o que entrou e devolve o que saiu
      await mexerNoInventario(
        this.env,
        t.de,
        novosDoPrimeiro.map((id, i) => ({ id, item: t.pedir[i].item })),
        t.dar,
      )
      throw e instanceof ErroConflito && e.codigo === 'item-mudou' ? new ErroConflito('seu-item-mudou') : e
    }
  }
}

const objeto = (env) => objetoGlobal(env.TROCAS)
const ROTAS = { 'GET /trocas': 'listar', 'POST /trocas': 'criar', 'POST /trocas/aceitar': 'aceitar', 'POST /trocas/recusar': 'recusar', 'POST /trocas/cancelar': 'cancelar' }
const FEITO = { aceitar: 'aceitou', recusar: 'recusou', cancelar: 'cancelou' }

// Rotas /trocas (login)
export async function rotaTrocas(req, env, quem, cors, rota) {
  const acao = ROTAS[`${req.method} ${rota}`]
  if (!acao) throw new ErroNaoEncontrado('rota')
  const { senha, ...corpo } = req.method === 'POST' ? await lerCorpo(req) : {}
  // Propor e aceitar troca pedem a senha de segurança (evita golpe: alguém usando a conta aberta no computador de outra pessoa)
  if (acao === 'criar' || acao === 'aceitar') await exigirSenha(env, quem.id, senha)
  const r = await objeto(env).fetch('https://trocas/', { method: 'POST', body: JSON.stringify({ ...corpo, acao, quem: quem.id }) })
  if (r.ok && acao !== 'listar') {
    const texto = acao === 'criar' ? `propôs uma troca: ${(corpo.dar || []).length} item(ns) dele(a) por ${(corpo.pedir || []).length} do outro` : `${FEITO[acao]} a troca ${String(corpo.id || '').slice(0, 12)}`
    await registrar(env, { tipo: 'troca', quem: quem.id, alvo: acao === 'criar' ? String(corpo.para || '') : '', texto })
  }
  return reenviar(r, cors)
}
