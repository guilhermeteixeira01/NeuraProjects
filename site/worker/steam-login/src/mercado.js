/*
 * Mercado entre jogadores: o jogador anuncia uma skin (arma, faca ou luva), um adesivo ou um chaveiro pelo preço que quiser em Neura Pontos (NP) e outro jogador compra.
 * Enquanto está anunciado, o item SAI do inventário (não dá para equipar, trocar nem vender de novo); cancelar devolve o item ao inventário.
 * Quando alguém compra: o comprador paga e recebe o item (as duas coisas juntas, no objeto da loja dele: Loja.comprarDoMercado), o vendedor
 * recebe os NP e uma notificação no sino (gravada na conta dele, aparece em qualquer aparelho).
 *
 * Um Durable Object GLOBAL ("Mercado") guarda os anúncios em SQLite e roda um pedido de cada vez: dois jogadores nunca compram o mesmo anúncio.
 *
 *   GET  /mercado                         (login) -> { anuncios: [{ id, vendedor, vendedorNome, vendedorAvatar, item, preco, ref, criado }] }
 *   POST /mercado/anunciar { id, preco, nome, senha } -> tira o item do inventário e anuncia: { ok, anuncio }
 *   POST /mercado/cancelar { id }                 -> só o vendedor: o item volta para o inventário
 *   POST /mercado/comprar { id }                  -> paga, recebe o item e avisa o vendedor: { ok, saldo }
 */
import { avisarMercado } from './amigos.js'
import { exigirSenha } from './contas.js'
import { ErroConflito, ErroNaoEncontrado, ErroPedido, ErroPermissao } from './erros.js'
import { lerCorpo, reenviar } from './http.js'
import { notificar } from './notificacoes.js'
import { Fila, objetoGlobal, pedirAoJogador, responder, semDerrubar } from './objetos.js'
import { registrar } from './registro.js'
import { lerSkins, novoIdItem } from './skins.js'
import { mexerNoInventario } from './trocas.js'
import { lerUsuarios } from './usuarios.js'
import { valorDe } from './valor.js'

const TIPOS_OK = new Set(['arma', 'faca', 'luva', 'adesivo', 'chaveiro'])
const MAX_POR_VENDEDOR = 30
const MAX_ANUNCIOS = 3000
const PRECO_MAX = 10_000_000
const MAX_DROPS = 2000 // drops guardados (o "top" olha as últimas 24 h dentro deles)
const ATRASO_DROP = 8000 // o drop só aparece no carrossel depois que a roleta de quem abriu termina (sem estragar a surpresa)

export class Mercado {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS anuncios (id TEXT PRIMARY KEY, vendedor TEXT, preco INTEGER, criado INTEGER, dados TEXT)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS anuncios_vendedor ON anuncios (vendedor)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS anuncios_criado ON anuncios (criado)')
    // NP de venda que não chegou ao vendedor (falha entre um objeto e outro): tenta de novo no próximo pedido
    this.sql.exec('CREATE TABLE IF NOT EXISTS creditos (id TEXT PRIMARY KEY, vendedor TEXT, valor INTEGER)')
    // Drops ao vivo (carrossel do topo da loja): o que cada jogador ganhou ao abrir caixas. ts = quando pode aparecer (depois da roleta)
    this.sql.exec('CREATE TABLE IF NOT EXISTS drops (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, r INTEGER, v INTEGER, dados TEXT)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS drops_ts ON drops (ts)')
    this.fila = new Fila()
  }

  fetch(req) {
    return responder(async () => {
      const corpo = await lerCorpo(req)
      return this.fila.rodar(async () => {
        await this.pagarPendentes()
        return this.acao(corpo)
      })
    })
  }

  anuncio(id) {
    const l = this.sql.exec('SELECT id, vendedor, preco, criado, dados FROM anuncios WHERE id = ?', String(id || '')).toArray()[0]
    return l ? { ...JSON.parse(l.dados), id: l.id, vendedor: l.vendedor, preco: l.preco, criado: l.criado } : null
  }

  // Créditos que ficaram para trás: cada um tenta de novo; o que falhar continua na tabela para o próximo pedido
  async pagarPendentes() {
    for (const c of this.sql.exec('SELECT id, vendedor, valor FROM creditos').toArray()) {
      try {
        await pedirAoJogador(this.env, c.vendedor, { acao: 'creditar', valor: c.valor, motivo: 'mercado: venda' })
        this.sql.exec('DELETE FROM creditos WHERE id = ?', c.id)
      } catch (e) {
        console.error('mercado: crédito pendente de', c.vendedor, e)
      }
    }
  }

  acao({ acao, quem, ...p }) {
    switch (acao) {
      case 'listar':
        return this.listar()
      case 'zerar': // src/zerar.js: sem anúncios, sem créditos pendentes e sem drops
        this.ctx.storage.transactionSync(() => {
          for (const tabela of ['anuncios', 'creditos', 'drops']) this.sql.exec(`DELETE FROM ${tabela}`)
        })
        return { ok: true }
      case 'drops-add':
        return this.dropsAdd(p.lista)
      case 'drops':
        return this.drops()
      case 'anunciar':
        return this.anunciar(quem, p)
      case 'cancelar':
        return this.cancelar(quem, p)
      case 'comprar':
        return this.comprar(quem, p)
      default:
        throw new ErroPedido('acao')
    }
  }

  listar() {
    const linhas = this.sql.exec('SELECT id, vendedor, preco, criado, dados FROM anuncios ORDER BY criado DESC LIMIT ?', MAX_ANUNCIOS).toArray()
    return {
      anuncios: linhas.map((l) => {
        const d = JSON.parse(l.dados)
        return { id: l.id, vendedor: l.vendedor, vendedorNome: d.vendedorNome, vendedorAvatar: d.vendedorAvatar, item: d.item, preco: l.preco, ref: valorDe(d.item)?.v ?? null, criado: l.criado }
      }),
    }
  }

  dropsAdd(lista) {
    if (!Array.isArray(lista) || !lista.length) return { ok: true }
    this.ctx.storage.transactionSync(() => {
      let ultimo = 0
      for (const x of lista.slice(0, 20)) ultimo = this.sql.exec('INSERT INTO drops (ts, r, v, dados) VALUES (?, ?, ?, ?) RETURNING id', x.ts, x.r, x.v, JSON.stringify(x)).one().id
      this.sql.exec('DELETE FROM drops WHERE id <= ?', ultimo - MAX_DROPS)
    })
    return { ok: true }
  }

  // Três listas, uma por botão do carrossel: recentes (tudo), bons (Épico para cima) e top (só Lendário/vermelho e Item Raro Especial, os mais valiosos das últimas 24 h)
  drops() {
    const agora = Date.now()
    const ler = (sql, ...args) => this.sql.exec(sql, ...args).toArray().map((l) => ({ ...JSON.parse(l.dados), id: l.id }))
    return {
      agora,
      recentes: ler('SELECT id, dados FROM drops WHERE ts <= ? ORDER BY ts DESC LIMIT 24', agora),
      bons: ler('SELECT id, dados FROM drops WHERE ts <= ? AND r >= 3 ORDER BY ts DESC LIMIT 24', agora),
      top: ler('SELECT id, dados FROM drops WHERE ts <= ? AND ts > ? AND r >= 4 ORDER BY v DESC, ts DESC LIMIT 24', agora, agora - 24 * 3600 * 1000),
    }
  }

  async anunciar(quem, p) {
    const preco = Math.round(Number(p.preco))
    if (!Number.isFinite(preco) || preco < 1 || preco > PRECO_MAX) throw new ErroPedido('preco')
    if (this.sql.exec('SELECT COUNT(*) AS n FROM anuncios WHERE vendedor = ?', quem).one().n >= MAX_POR_VENDEDOR) throw new ErroConflito('muitos-anuncios')
    if (this.sql.exec('SELECT COUNT(*) AS n FROM anuncios').one().n >= MAX_ANUNCIOS) throw new ErroConflito('mercado-cheio')
    const inv = await lerSkins(this.env, quem)
    const item = inv?.itens?.[String(p.id)]
    if (!item || !TIPOS_OK.has(item.t)) throw new ErroConflito('item-invalido')
    try {
      await mexerNoInventario(this.env, quem, [{ id: String(p.id), item }], [])
    } catch (e) {
      throw e instanceof ErroConflito && e.codigo === 'item-mudou' ? new ErroConflito('item-invalido') : e
    }
    const vendedor = (await lerUsuarios(this.env))[quem]
    const anuncio = {
      id: novoIdItem() + novoIdItem().slice(0, 4),
      vendedor: quem,
      preco,
      criado: Date.now(),
      vendedorNome: String(vendedor?.nome || ''),
      vendedorAvatar: String(vendedor?.avatar || ''),
      nome: String(p.nome || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 100),
      item,
    }
    const dados = { vendedorNome: anuncio.vendedorNome, vendedorAvatar: anuncio.vendedorAvatar, nome: anuncio.nome, item }
    this.sql.exec('INSERT INTO anuncios (id, vendedor, preco, criado, dados) VALUES (?, ?, ?, ?, ?)', anuncio.id, quem, preco, anuncio.criado, JSON.stringify(dados))
    return { ok: true, anuncio: { ...anuncio, ref: valorDe(item)?.v ?? null } }
  }

  async cancelar(quem, p) {
    const a = this.anuncio(p.id)
    if (!a) throw new ErroNaoEncontrado('nao-achou')
    if (a.vendedor !== quem) throw new ErroPermissao('nao-pode')
    const [id] = await mexerNoInventario(this.env, quem, [], [{ item: a.item }])
    this.sql.exec('DELETE FROM anuncios WHERE id = ?', a.id)
    return { ok: true, id }
  }

  async comprar(quem, p) {
    const a = this.anuncio(p.id)
    if (!a) throw new ErroNaoEncontrado('nao-achou')
    if (a.vendedor === quem) throw new ErroConflito('proprio')
    const r = await pedirAoJogador(this.env, quem, { acao: 'mercado-comprar', item: a.item, preco: a.preco })
    // pago e entregue: o anúncio sai e o vendedor recebe (se o objeto dele falhar agora, fica na lista de créditos e vai no próximo pedido)
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM anuncios WHERE id = ?', a.id)
      this.sql.exec('INSERT INTO creditos (id, vendedor, valor) VALUES (?, ?, ?)', a.id, a.vendedor, a.preco)
    })
    await this.pagarPendentes()

    const comprador = (await lerUsuarios(this.env))[quem]
    const notif = {
      id: `mercado:${a.id}`,
      titulo: 'Sua skin foi vendida no mercado!',
      texto: `${String(comprador?.nome || 'Alguém')} comprou ${a.nome || 'o seu item'} por ${a.preco.toLocaleString('pt-BR')} NP. Os pontos já estão na sua conta.`,
      link: '/loja/?aba=mercado',
      ...(comprador?.avatar ? { imagem: String(comprador.avatar) } : {}),
      ...(Number.isInteger(valorDe(a.item)?.r) ? { raridade: valorDe(a.item).r } : {}), // o cartão da notificação fica na cor da raridade
      quando: Date.now(),
      lida: false,
    }
    await semDerrubar(notificar(this.env, a.vendedor, notif), 'notificação de venda no mercado')
    await avisarMercado(this.env, a.vendedor)
    return { ok: true, saldo: r.saldo, id: r.id }
  }
}

const objeto = (env) => objetoGlobal(env.MERCADO)
const chamar = (env, corpo) => objeto(env).fetch('https://mercado/', { method: 'POST', body: JSON.stringify(corpo) })

// Depois de uma abertura de caixa (rotaLoja): o que saiu entra no carrossel de drops. resultados = os da Loja.abrir
export function registrarDrops(env, quem, caixa, resultados) {
  const ts = Date.now() + ATRASO_DROP
  const lista = resultados.map((x, k) => {
    const { t, d, p, f, n, i } = x.item
    const item = { t: t || 'arma', d, p, f }
    return {
      ts: ts + k * 400,
      r: x.raridade,
      v: valorDe(item)?.v ?? 0,
      t: item.t,
      d,
      p,
      ...(n ? { n: String(n).slice(0, 80) } : {}),
      ...(i ? { i: String(i).slice(0, 400) } : {}),
      quem: quem.id,
      nome: String(quem.nome || '').slice(0, 40),
      avatar: String(quem.avatar || '').slice(0, 300),
      caixa: caixa?.slug || '',
    }
  })
  return semDerrubar(chamar(env, { acao: 'drops-add', lista }), 'carrossel de drops')
}

// GET /loja/drops (público): as três listas do carrossel. Guardado alguns segundos no cache da borda (todo mundo pergunta a cada poucos segundos)
export async function rotaDrops(req, env, cors, ctx) {
  const cache = caches.default
  const chave = new Request(new URL('/loja/drops', req.url).toString())
  const salvo = await cache.match(chave)
  if (salvo) return reenviar(salvo, cors)
  const r = await chamar(env, { acao: 'drops' })
  const corpo = await r.text()
  if (r.ok) ctx.waitUntil(cache.put(chave, new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3' } })))
  return reenviar(new Response(corpo, { status: r.status }), cors)
}

const FEITO = { anunciar: (p) => `anunciou um item no mercado por ${Number(p.preco).toLocaleString('pt-BR')} NP`, cancelar: () => 'cancelou um anúncio do mercado', comprar: () => 'comprou um anúncio do mercado' }

// Rotas /mercado (login)
export async function rotaMercado(req, env, quem, cors, rota) {
  let pedido
  if (rota === '/mercado' && req.method === 'GET') pedido = { acao: 'listar' }
  else if (req.method === 'POST' && ['/mercado/anunciar', '/mercado/cancelar', '/mercado/comprar'].includes(rota)) {
    const corpo = await lerCorpo(req)
    const acao = rota.slice('/mercado/'.length)
    pedido = { acao, id: corpo.id }
    if (acao === 'anunciar') {
      await exigirSenha(env, quem.id, corpo.senha) // colocar algo à venda pede a senha de segurança (evita golpe)
      pedido = { ...pedido, preco: corpo.preco, nome: corpo.nome }
    }
  } else throw new ErroNaoEncontrado('rota')
  const r = await chamar(env, { ...pedido, quem: quem.id })
  if (r.ok && pedido.acao !== 'listar') await registrar(env, { tipo: 'mercado', quem: quem.id, texto: FEITO[pedido.acao](pedido), dados: { anuncio: String(pedido.id || '').slice(0, 12) } })
  return reenviar(r, cors)
}
