/*
 * Mercado entre jogadores: o jogador anuncia uma skin (arma, faca ou luva), um adesivo ou um chaveiro pelo preço que quiser em Neura Pontos (NP) e outro jogador compra.
 * Enquanto está anunciado, o item SAI do inventário (não dá para equipar, trocar nem vender de novo); cancelar devolve o item ao inventário.
 * Quando alguém compra: o comprador paga e recebe o item (as duas coisas juntas, no objeto da loja dele: Loja.comprarDoMercado), o vendedor
 * recebe os NP e uma notificação no sino (gravada na conta dele, aparece em qualquer aparelho).
 *
 * Um Durable Object GLOBAL ("Mercado") guarda os anúncios em SQLite e roda um pedido de cada vez: dois jogadores nunca compram o mesmo anúncio.
 *
 *   GET  /mercado                         (login) -> { anuncios: [{ id, vendedor, vendedorNome, vendedorAvatar, item, preco, ref, criado }] }
 *   POST /mercado/anunciar { id, preco, nome }    -> tira o item do inventário e anuncia: { ok, anuncio }
 *   POST /mercado/cancelar { id }                 -> só o vendedor: o item volta para o inventário
 *   POST /mercado/comprar { id }                  -> paga, recebe o item e avisa o vendedor: { ok, saldo }
 */
import { avisarMercado } from './amigos.js'
import { lerSkins, novoIdItem } from './skins.js'
import { mexerNoInventario } from './trocas.js'
import { pontosGanhos, valorDe } from './loja.js'

const TIPOS_OK = new Set(['arma', 'faca', 'luva', 'adesivo', 'chaveiro'])
const MAX_POR_VENDEDOR = 30
const MAX_ANUNCIOS = 3000
const PRECO_MAX = 10_000_000

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const loja = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))
const chamarLoja = async (env, id, corpo) => (await loja(env, id).fetch('https://loja/', { method: 'POST', body: JSON.stringify({ id, ...corpo }) })).json()

export class Mercado {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS anuncios (id TEXT PRIMARY KEY, vendedor TEXT, preco INTEGER, criado INTEGER, dados TEXT)')
    // NP de venda que não chegou ao vendedor (falha entre um objeto e outro): tenta de novo no próximo pedido
    this.sql.exec('CREATE TABLE IF NOT EXISTS creditos (id TEXT PRIMARY KEY, vendedor TEXT, valor INTEGER)')
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
        await this.pagarPendentes()
        return json(await this.acao(corpo))
      } catch (e) {
        const m = /^[a-z-]{2,30}$/.test(e?.message || '') ? e.message : 'falhou'
        return json({ erro: m }, m === 'falhou' ? 500 : 400)
      }
    })
  }

  anuncio(id) {
    const l = this.sql.exec('SELECT id, vendedor, preco, criado, dados FROM anuncios WHERE id = ?', String(id || '')).toArray()[0]
    return l ? { ...JSON.parse(l.dados), id: l.id, vendedor: l.vendedor, preco: l.preco, criado: l.criado } : null
  }

  async pagarPendentes() {
    for (const c of this.sql.exec('SELECT id, vendedor, valor FROM creditos').toArray()) {
      const r = await chamarLoja(this.env, c.vendedor, { acao: 'creditar', pontos: 0, valor: c.valor, motivo: 'mercado: venda' }).catch(() => null)
      if (r && !r.erro) this.sql.exec('DELETE FROM creditos WHERE id = ?', c.id)
    }
  }

  async acao({ acao, quem, ...p }) {
    if (acao === 'listar') {
      const linhas = this.sql.exec('SELECT id, vendedor, preco, criado, dados FROM anuncios ORDER BY criado DESC LIMIT ?', MAX_ANUNCIOS).toArray()
      return {
        anuncios: linhas.map((l) => {
          const d = JSON.parse(l.dados)
          return { id: l.id, vendedor: l.vendedor, vendedorNome: d.vendedorNome, vendedorAvatar: d.vendedorAvatar, item: d.item, preco: l.preco, ref: valorDe(d.item)?.v ?? null, criado: l.criado }
        }),
      }
    }
    if (acao === 'anunciar') return this.anunciar(quem, p)
    if (acao === 'cancelar') return this.cancelar(quem, p)
    if (acao === 'comprar') return this.comprar(quem, p)
    throw new Error('acao')
  }

  async anunciar(quem, p) {
    const preco = Math.round(Number(p.preco))
    if (!Number.isFinite(preco) || preco < 1 || preco > PRECO_MAX) throw new Error('preco')
    const meus = Number(this.sql.exec('SELECT COUNT(*) AS n FROM anuncios WHERE vendedor = ?', quem).one().n)
    if (meus >= MAX_POR_VENDEDOR) throw new Error('muitos-anuncios')
    if (Number(this.sql.exec('SELECT COUNT(*) AS n FROM anuncios').one().n) >= MAX_ANUNCIOS) throw new Error('mercado-cheio')
    const inv = await lerSkins(this.env, quem)
    const item = inv?.itens?.[String(p.id)]
    if (!item || !TIPOS_OK.has(item.t)) throw new Error('item-invalido')

    const tirou = await mexerNoInventario(this.env, quem, [{ id: String(p.id), item }], [])
    if (tirou.erro) throw new Error(tirou.erro === 'item-mudou' ? 'item-invalido' : tirou.erro)

    const usuarios = (await this.env.MOLDURAS.get('usuarios', 'json').catch(() => null)) || {}
    const anuncio = {
      id: novoIdItem() + novoIdItem().slice(0, 4),
      vendedor: quem,
      preco,
      criado: Date.now(),
      vendedorNome: String(usuarios[quem]?.nome || ''),
      vendedorAvatar: String(usuarios[quem]?.avatar || ''),
      nome: String(p.nome || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 100),
      item,
    }
    const dados = { vendedorNome: anuncio.vendedorNome, vendedorAvatar: anuncio.vendedorAvatar, nome: anuncio.nome, item }
    this.sql.exec('INSERT INTO anuncios (id, vendedor, preco, criado, dados) VALUES (?, ?, ?, ?, ?)', anuncio.id, quem, preco, anuncio.criado, JSON.stringify(dados))
    return { ok: true, anuncio: { ...anuncio, ref: valorDe(item)?.v ?? null } }
  }

  async cancelar(quem, p) {
    const a = this.anuncio(p.id)
    if (!a) throw new Error('nao-achou')
    if (a.vendedor !== quem) throw new Error('nao-pode')
    const volta = await mexerNoInventario(this.env, quem, [], [{ item: a.item }])
    if (volta.erro) throw new Error(volta.erro)
    this.sql.exec('DELETE FROM anuncios WHERE id = ?', a.id)
    return { ok: true, id: volta.novosIds[0] }
  }

  async comprar(quem, p) {
    const a = this.anuncio(p.id)
    if (!a) throw new Error('nao-achou')
    if (a.vendedor === quem) throw new Error('proprio')
    const r = await chamarLoja(this.env, quem, { acao: 'mercado-comprar', pontos: p.pontos, bonus: p.bonus, item: a.item, preco: a.preco })
    if (r.erro) throw new Error(r.erro)
    // pago e entregue: o anúncio sai e o vendedor recebe (se o objeto dele falhar agora, fica na lista de créditos e vai no próximo pedido)
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM anuncios WHERE id = ?', a.id)
      this.sql.exec('INSERT INTO creditos (id, vendedor, valor) VALUES (?, ?, ?)', a.id, a.vendedor, a.preco)
    })
    await this.pagarPendentes()

    const usuarios = (await this.env.MOLDURAS.get('usuarios', 'json').catch(() => null)) || {}
    const comprador = String(usuarios[quem]?.nome || 'Alguém')
    const preco = a.preco.toLocaleString('pt-BR')
    const notif = {
      id: `mercado:${a.id}`,
      titulo: 'Sua skin foi vendida no mercado!',
      texto: `${comprador} comprou ${a.nome || 'o seu item'} por ${preco} NP. Os pontos já estão na sua conta.`,
      link: '/loja/?aba=mercado',
      ...(usuarios[quem]?.avatar ? { imagem: String(usuarios[quem].avatar) } : {}),
      quando: Date.now(),
      lida: false,
    }
    await chamarLoja(this.env, a.vendedor, { acao: 'notif-sync', doc: { lista: [notif], vistos: [notif.id], limpoEm: 0 } }).catch(() => null)
    await avisarMercado(this.env, a.vendedor)
    return { ok: true, saldo: r.saldo, id: r.id }
  }
}

const objeto = (env) => env.MERCADO.get(env.MERCADO.idFromName('global'))
const chamar = (env, corpo) => objeto(env).fetch('https://mercado/', { method: 'POST', body: JSON.stringify(corpo) })

// Rotas /mercado (login)
export async function rotaMercado(req, env, quem, cors, rota) {
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  let pedido
  if (rota === '/mercado' && req.method === 'GET') pedido = { acao: 'listar' }
  else if (rota === '/mercado/anunciar' && req.method === 'POST') pedido = { acao: 'anunciar', id: corpo.id, preco: corpo.preco, nome: corpo.nome }
  else if (rota === '/mercado/cancelar' && req.method === 'POST') pedido = { acao: 'cancelar', id: corpo.id }
  else if (rota === '/mercado/comprar' && req.method === 'POST') {
    const [pontos, bonus] = await Promise.all([pontosGanhos(env, quem.id), env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)])
    pedido = { acao: 'comprar', id: corpo.id, pontos, bonus: bonus || [] }
  } else return json({ erro: 'rota' }, 404, cors)
  const r = await chamar(env, { ...pedido, quem: quem.id })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
}
