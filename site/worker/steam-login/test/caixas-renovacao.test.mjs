import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ambiente, ranking } from './ambiente.mjs'
import { removerCaixasAntigas } from '../src/caixas-inventario.js'

const { lerCaixas, limparInventariosCaixasAntigas } = await import('../src/loja.js')
const { gravarDoc, lerDoc } = await import('../src/dados.js')
const { pedirAoJogador } = await import('../src/objetos.js')

const modelos = JSON.parse(fs.readFileSync(new URL('../../../scripts/caixas-modelos-2026.json', import.meta.url)))
const novas = JSON.parse(fs.readFileSync(new URL('../src/caixas-iniciais.json', import.meta.url)))
const ID = '76561198000000011'

test('catálogo novo tem imagens válidas, preços positivos e IDs que não reutilizam caixas antigas', () => {
  const antigos = new Set(modelos.map((c) => c.id))
  assert.equal(novas.length, 35)
  assert.equal(new Set(novas.map((c) => c.id)).size, novas.length)
  for (const c of novas) {
    assert.ok(!antigos.has(c.id))
    assert.ok((c.diaria && c.arquivada && c.preco === 0 || c.preco > 0) && c.itens.length > 0)
    assert.ok(fs.existsSync(new URL(`../../../public${c.img}`, import.meta.url)), c.img)
  }
  assert.equal(novas.filter(c => c.slug.startsWith('caixa-times-')).length, 22)
})

test('revisão 14 preserva IDs, estoque e preços personalizados dos times e atualiza a arte diária', async () => {
  const anteriores = structuredClone(novas.filter(c => c.slug.startsWith('caixa-times-') || c.diaria))
  anteriores.forEach((c, i) => { c.id = 3000 + i })
  anteriores[0].preco = 987
  anteriores.find(c => c.diaria).img = '/assets/caixas/neura-projects-caixa-diaria.png'
  const time = anteriores[0]
  const { env } = ambiente({ [`skins:${ID}`]: JSON.stringify({ v: 2, itens: { time: { t: 'caixa', d: time.id, p: 0 } }, criado: {}, equip: { ct: {}, tr: {} } }) })
  await gravarDoc(env, 'caixas', anteriores)
  await gravarDoc(env, 'caixas-revisao', 13)
  await gravarDoc(env, 'caixas-vistas', anteriores.map(c => c.slug))
  const atualizadas = await lerCaixas(env)
  assert.equal(atualizadas.filter(c => !c.premium).length, 35)
  assert.equal(atualizadas.find(c => c.slug === time.slug).id, time.id)
  assert.equal(atualizadas.find(c => c.slug === time.slug).preco, 987)
  assert.equal(atualizadas.find(c => c.diaria).img, '/assets/caixas/web/caixa-diaria.webp')
  assert.ok(atualizadas.filter(c => !anteriores.some(a => a.slug === c.slug)).every(c => c.id > 3022))
  await limparInventariosCaixasAntigas(env)
  assert.equal((await pedirAoJogador(env, ID, { acao: 'inv-ler' })).inv.itens.time.d, time.id)
  assert.deepEqual(await lerCaixas(env), atualizadas)
})

test('caixas por arma e de luxo contêm os tipos anunciados e preços calculados', () => {
  const defs = { 'ak-47': 7, awp: 9, 'glock-18': 4, 'm4a1-s': 60, m4a4: 16, 'usp-s': 61 }
  for (const [slug, def] of Object.entries(defs)) {
    const c = novas.find(c => c.slug === `caixa-armas-${slug}`)
    assert.ok(c?.itens.length)
    assert.ok(c.itens.every(it => it.d === def))
  }
  for (const [slug, tipo] of [['facas', 'faca'], ['luvas', 'luva']]) {
    const c = novas.find(c => c.slug === `caixa-extras-${slug}`)
    assert.ok(c.itens.length > 0 && c.itens.length <= 300)
    assert.ok(c.itens.every(it => it.t === tipo))
    assert.equal(c.facas.length, 0)
  }
  assert.ok(novas.find(c => c.slug === 'caixa-extras-luvas').preco > novas.find(c => c.slug === 'caixa-extras-facas').preco)
})

test('remoção limpa referências e preserva skins, caixas atuais e dados do inventário', () => {
  const inv = { itens: { antiga: { t: 'caixa', d: 32 }, nova: { t: 'caixa', d: 2000 }, skin: { t: 'arma', d: 32, p: 1 } }, criado: { antiga: 1, skin: 2 }, presentes: [{ i: 'antiga' }, { i: 'skin' }], equip: { ct: { teste: 'antiga', arma: 'skin' } } }
  assert.equal(removerCaixasAntigas(inv, [32]), 1)
  assert.deepEqual(Object.keys(inv.itens), ['nova', 'skin'])
  assert.equal(inv.criado.antiga, undefined)
  assert.deepEqual(inv.presentes, [{ i: 'skin' }])
  assert.deepEqual(inv.equip.ct, { arma: 'skin' })
  assert.equal(removerCaixasAntigas(inv, [32]), 0)
})

test('migração remove caixas inclusive offline, não reembolsa e não reaplica bônus de caixa antiga', async () => {
  const velha = modelos[0]
  ranking.jogadores = [{ steamId: ID, pontos: 1234, mapas: 1 }]
  const { env } = ambiente({ [`skins:${ID}`]: JSON.stringify({ v: 2, itens: { antiga: { t: 'caixa', d: velha.id, p: 0 }, skin: { t: 'arma', d: 7, p: 302, f: .1 } }, criado: { antiga: 1, skin: 2 }, equip: { ct: {}, tr: {} } }) })
  await gravarDoc(env, 'caixas', modelos)
  await gravarDoc(env, 'caixas-revisao', 11)
  await gravarDoc(env, 'caixas-vistas', modelos.map((c) => c.slug))
  await gravarDoc(env, 'loja-bonus', [{ id: 1, caixa: velha.id, qtd: 2, ts: Date.now() }])
  const caixas = await lerCaixas(env)
  assert.equal(caixas.filter(c => !c.premium).length, novas.length)
  assert.ok(caixas.every((c) => !modelos.some((m) => m.id === c.id)))
  await limparInventariosCaixasAntigas(env)
  const r = await pedirAoJogador(env, ID, { acao: 'inv-ler' })
  assert.ok(!r.inv.itens.antiga && r.inv.itens.skin)
  assert.ok(r.ver > 0) // remoção foi gravada, e não só escondida na resposta
  const saldo = await pedirAoJogador(env, ID, { acao: 'saldo' })
  assert.equal(saldo.saldo, 1234)
  assert.ok((await lerDoc(env, 'loja-bonus'))[0].apagado)
  assert.equal((await pedirAoJogador(env, ID, { acao: 'inv-ler' })).inv.itens.antiga, undefined)
  const segunda = await lerCaixas(env)
  assert.deepEqual(segunda.map((c) => c.id), caixas.map((c) => c.id))
})
