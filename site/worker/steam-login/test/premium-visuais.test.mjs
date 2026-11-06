import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ambiente, DONO } from './ambiente.mjs'
import { mudar, gravarDoc } from '../src/dados.js'
import { MOLDURA_PREMIUM, CARD_PREMIUM } from '../src/premium-visuais.js'
import { lerPerfil, tirarExclusivasSemCargo } from '../src/perfis.js'

const A = '76561198000000991'
const visuais = { moldura: MOLDURA_PREMIUM, card: CARD_PREMIUM }
const ativos = () => ({ inicio: Date.now(), meses: 1, expira: Date.now() + 86400000 })

test('configuração sempre anuncia os dois visuais como Premium desde a primeira assinatura', async () => {
  const f = ambiente()
  await gravarDoc(f.env, 'config', { molduraSub: {}, cardSub: {} })
  const r = await f.pedir('GET', '/config')
  assert.equal(r.dados.molduraSub[MOLDURA_PREMIUM], 'subscriber')
  assert.equal(r.dados.cardSub[CARD_PREMIUM], 'subscriber')
})

test('sem Premium e com assinatura vencida não equipa nenhum dos dois; ativo equipa ambos', async () => {
  const f = ambiente()
  const salvar = corpo => f.pedir('POST', '/perfil', { quem: A, corpo })
  for (const sub of [null, { ...ativos(), expira: Date.now() - 1 }]) {
    await mudar(f.env, 'perfis', [A], p => { p[A] = { sub } })
    for (const [campo, id] of Object.entries(visuais)) assert.equal((await salvar({ [campo]: id })).status, 403)
    assert.equal((await salvar({ card: 'neura-premium-anim.webp' })).status, 403)
  }
  await mudar(f.env, 'perfis', [A], p => { p[A] = { sub: ativos() } })
  assert.equal((await salvar(visuais)).status, 200)
  const p = await lerPerfil(f.env, A)
  assert.equal(p.moldura, MOLDURA_PREMIUM)
  assert.equal(p.card, CARD_PREMIUM)
})

test('administrador sem assinatura também precisa de Premium para os benefícios fixos', async () => {
  const f = ambiente()
  await mudar(f.env, 'perfis', [DONO], p => { p[DONO] = {} })
  for (const [campo, id] of Object.entries(visuais)) assert.equal((await f.pedir('POST', '/perfil', { quem: DONO, corpo: { [campo]: id } })).status, 403)
})

test('vencimento retira card e moldura sem apagar conquistas ou afetar outro visual', async () => {
  const f = ambiente()
  await mudar(f.env, 'perfis', [A, DONO], p => {
    p[A] = { ...visuais, molduraLivre: true, insignias: { staff: 1 }, sub: { ...ativos(), expira: Date.now() - 1 } }
    p[DONO] = { moldura: 'times/furia', card: 'neura/holo.svg' }
  })
  await tirarExclusivasSemCargo(f.env, {})
  const p = await lerPerfil(f.env, A)
  assert.equal(p.moldura, undefined); assert.equal(p.card, undefined)
  assert.equal(p.insignias.staff, 1)
  assert.equal((await lerPerfil(f.env, DONO)).moldura, 'times/furia')
})

test('animações são cópias dos originais e ambas têm alternativas estáticas', () => {
  const assets = new URL('../../../public/assets/', import.meta.url)
  const card = fs.existsSync(new URL('premium/Neura_Premium_Card_Animacao.webp', assets)) ? 'premium/Neura_Premium_Card_Animacao.webp' : 'premium/Neura_Premium_Card_Animado.webp'
  for (const [original, publicado] of [[card, 'cards/premium/neura-premium-anim.webp'], ['premium/moldura_premium.webp', 'molduras/premium/neura-premium.webp']]) assert.deepEqual(fs.readFileSync(new URL(original, assets)), fs.readFileSync(new URL(publicado, assets)))
  for (const arq of ['cards/mini/premium/neura-premium-anim.webp', 'cards/med/premium/neura-premium-anim.webp', 'molduras/premium/neura-premium-mini.webp', 'molduras/premium/neura-premium-parada.webp']) assert.ok(fs.statSync(new URL(arq, assets)).size > 0)
})
