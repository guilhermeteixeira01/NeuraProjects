import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { mudar } from '../src/dados.js'
import { concederSub } from '../src/perfis.js'
import { CAIXA_PREMIUM } from '../src/caixa-premium-core.js'
import { progressoInsignias } from '../src/loja-core.js'
const A = '76561198000000951', B = '76561198000000952'
const caixa = inv => Object.values(inv.itens).filter(i => i.t === 'caixa' && i.d === CAIXA_PREMIUM.id)
const ator = f => f.env.LOJA.instancia(A)
const ativa = f => mudar(f.env, 'perfis', [A], p => { p[A] = { sub: { inicio: Date.now(), expira: Date.now() + 86400000 } } })

test('caixa de escolha única não cria missão impossível de colecionar as três armas', () => {
  assert.ok(!progressoInsignias({}, [CAIXA_PREMIUM]).some(i => i.id === 'mestre-caixa-premium'))
})

test('pagamento entrega uma caixa e renovações, reenvios e concorrência não repetem', async () => {
  const f = ambiente()
  await concederSub(f.env, A, 1, 'primeiro')
  await Promise.all([concederSub(f.env, A, 1, 'primeiro'), concederSub(f.env, A, 1, 'segundo'), f.pedir('GET', '/loja', { quem: A })])
  assert.equal(caixa((await ator(f).invLer(A)).inv).length, 1)
  assert.equal((await ator(f).ctx.storage.get('notifs')).lista.filter(n => n.id === 'premium:caixa').length, 1)
})

test('sem Premium não recebe; assinante ativo recebe ao consultar inventário', async () => {
  const f = ambiente()
  await mudar(f.env, 'perfis', [A], p => { p[A] = {} })
  await f.pedir('GET', '/loja', { quem: A })
  assert.equal(await ator(f).ctx.storage.get('caixa-premium'), undefined)
  await ativa(f)
  await f.pedir('GET', '/skins', { quem: A })
  assert.equal(caixa((await ator(f).invLer(A)).inv).length, 1)
})

for (const opcao of CAIXA_PREMIUM.itens) test(`escolha ${opcao.nome} entrega exatamente uma arma e consome a caixa`, async () => {
  const f = ambiente()
  await concederSub(f.env, A, 1, 'primeiro')
  // O presente permanece válido depois do vencimento.
  await mudar(f.env, 'perfis', [A], p => { p[A].sub.expira = Date.now() - 1 })
  const escolher = escolha => f.pedir('POST', '/loja/premium/escolher', { quem: A, corpo: { escolha } })
  const respostas = await Promise.all([escolher(opcao.id), escolher(opcao.id)])
  assert.ok(respostas.every(r => r.status === 200))
  assert.equal(respostas[0].dados.item, respostas[1].dados.item)
  const inv = (await ator(f).invLer(A)).inv
  assert.equal(caixa(inv).length, 0)
  const armas = Object.values(inv.itens).filter(i => i.t === 'arma' && i.d !== 49)
  assert.equal(armas.length, 1)
  assert.deepEqual([armas[0].d, armas[0].p, armas[0].f], [opcao.d, opcao.p, 0.01])
  assert.equal((await escolher(CAIXA_PREMIUM.itens.find(i => i.id !== opcao.id).id)).status, 409)
  await concederSub(f.env, A, 1, 'renovacao')
  assert.equal(caixa((await ator(f).invLer(A)).inv).length, 0)
})

test('recusa escolha inválida, conta alheia, compra e abertura por sorteio', async () => {
  const f = ambiente()
  await concederSub(f.env, A, 1, 'primeiro')
  assert.equal((await f.pedir('POST', '/loja/premium/escolher', { quem: A, corpo: { escolha: 'outra-arma' } })).status, 400)
  assert.equal((await f.pedir('POST', '/loja/premium/escolher', { quem: B, corpo: { escolha: CAIXA_PREMIUM.itens[0].id } })).status, 409)
  for (const rota of ['/loja/comprar', '/loja/abrir']) assert.notEqual((await f.pedir('POST', rota, { quem: A, corpo: { caixa: CAIXA_PREMIUM.id, origem: 'direto' } })).status, 200)
  assert.equal(caixa((await ator(f).invLer(A)).inv).length, 1)
})

test('falha de gravação mantém caixa e escolha disponível para tentar novamente', async () => {
  const f = ambiente()
  await concederSub(f.env, A, 1, 'primeiro')
  const a = ator(f), put = a.ctx.storage.put.bind(a.ctx.storage)
  a.ctx.storage.put = async (k, v) => { if (k?.['caixa-premium']?.escolha) throw new Error('falha'); return put(k, v) }
  assert.equal((await f.pedir('POST', '/loja/premium/escolher', { quem: A, corpo: { escolha: CAIXA_PREMIUM.itens[0].id } })).status, 500)
  assert.equal(caixa((await a.invLer(A)).inv).length, 1)
  a.ctx.storage.put = put
  assert.equal((await f.pedir('POST', '/loja/premium/escolher', { quem: A, corpo: { escolha: CAIXA_PREMIUM.itens[0].id } })).status, 200)
})
