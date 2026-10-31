import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { mudar, lerDoc } from '../src/dados.js'
import { lerPerfil } from '../src/perfis.js'
import { pedirAoJogador } from '../src/objetos.js'

const A = '76561198000000731'
const caminho = 'org/md1/vitoria-antiga'
const corrigir = env => pedirAoJogador(env, A, { acao: 'freeze-reparar-vitorias' })

test('legado devolve XP de vitória com Freeze, preserva ajustes e item ativo e atualiza recibos', async () => {
  const { env } = ambiente()
  await mudar(env, 'perfis', [A], p => { p[A] = { xp: -120, tema: 'claro' } }) // -160 do Freeze e +40 de outro ajuste
  const obj = env.LOJA.instancia(A)
  const ativo = { tipo: 'boost', desde: 123 }
  await obj.ctx.storage.put({ consumiveis: { boost: 2, freeze: 3, ativo, aplicados: [caminho] },
    notifs: { lista: [{ id: `consumivel-uso:${caminho}`, titulo: 'Freeze usado: o ganho de 160 XP não contou', quando: Date.now(), lida: false }], vistos: [], limpoEm: 0 },
    partidasRecentes: [{ caminho, xp: 0, xpBase: 160, consumivel: 'freeze' }] })
  assert.deepEqual(await corrigir(env), { corrigidos: 1, xp: 160, pendentes: 0, semRecibo: [], reconstruidos: 0 })
  assert.equal((await lerPerfil(env, A)).xp, 40)
  assert.equal((await lerPerfil(env, A)).tema, 'claro')
  assert.deepEqual((await obj.ctx.storage.get('consumiveis')).ativo, ativo)
  assert.equal((await obj.ctx.storage.get('partidasRecentes'))[0].xp, 160)
  assert.deepEqual((await lerDoc(env, `partida-efeitos:${caminho}`))[A], { tipo: 'freeze', delta: 0 })
  await corrigir(env)
  assert.equal((await lerPerfil(env, A)).xp, 40)
  assert.equal((await obj.ctx.storage.get('notifs')).lista.filter(n => n.id.startsWith('freeze-reparo:')).length, 1)
})

test('recibo com dedução aplicada devolve somente o ajuste marcado no perfil, uma vez', async () => {
  const { env } = ambiente()
  await mudar(env, 'perfis', [A], p => { p[A] = { xp: -145, xpConsumiveis: { [caminho]: -145 } } })
  await env.LOJA.instancia(A).ctx.storage.put(`consumivel-uso:${caminho}`, { tipo: 'freeze', delta: -145 })
  await Promise.all([corrigir(env), corrigir(env)])
  assert.equal((await lerPerfil(env, A)).xp, undefined)
  assert.equal((await lerPerfil(env, A)).xpConsumiveis[caminho], 0)
  assert.equal((await lerPerfil(env, A)).freezeVitoriasCorrigidas[caminho].xp, 145)
})

test('falha antiga antes de aplicar a dedução não gera crédito; derrotas e Boost não mudam', async () => {
  const { env } = ambiente(), obj = env.LOJA.instancia(A)
  await mudar(env, 'perfis', [A], p => { p[A] = { xp: 90 } })
  await obj.ctx.storage.put({
    [`consumivel-uso:${caminho}`]: { tipo: 'freeze', delta: -160 },
    'consumivel-uso:org/md1/derrota': { tipo: 'freeze', delta: 60 },
    'consumivel-uso:org/md1/boost': { tipo: 'boost', delta: 160 },
  })
  assert.equal((await corrigir(env)).xp, 0)
  assert.equal((await lerPerfil(env, A)).xp, 90)
  assert.deepEqual(await obj.ctx.storage.get('consumivel-uso:org/md1/derrota'), { tipo: 'freeze', delta: 60 })
  assert.deepEqual(await obj.ctx.storage.get('consumivel-uso:org/md1/boost'), { tipo: 'boost', delta: 160 })
})

test('falha depois de devolver XP retoma a publicação sem pagar novamente', async () => {
  const { env } = ambiente(), obj = env.LOJA.instancia(A)
  await mudar(env, 'perfis', [A], p => { p[A] = { xp: -100, xpConsumiveis: { [caminho]: -100 } } })
  await obj.ctx.storage.put(`consumivel-uso:${caminho}`, { tipo: 'freeze', delta: -100 })
  const put = obj.ctx.storage.put.bind(obj.ctx.storage)
  let falhar = true
  obj.ctx.storage.put = async (key, value) => {
    if (key === `consumivel-uso:${caminho}` && falhar) { falhar = false; throw Error('falha simulada no recibo') }
    return put(key, value)
  }
  await assert.rejects(corrigir(env))
  await corrigir(env)
  assert.equal((await lerPerfil(env, A)).xp, undefined)
  assert.equal((await lerPerfil(env, A)).freezeVitoriasCorrigidas[caminho].xp, 100)
})

test('Boosts antigos confirmados recuperam recibos sem somar novamente os 285 XP existentes', async () => {
  const { env } = ambiente(), id = '76561199151150360'
  const caminhos = ['neura-project/md1/2026-10-30_22-37_de_cache_time_Te1xe1ra-x-time_777', 'neura-project/md1/2026-10-30_23-26_de_dust2_time_Cafefps-x-time_777']
  await mudar(env, 'perfis', [id], p => { p[id] = { xp: 285 } })
  await env.LOJA.instancia(id).ctx.storage.put('consumiveis', { aplicados: caminhos })
  for (let i = 0; i < 2; i++) {
    const r = await pedirAoJogador(env, id, { acao: 'freeze-reparar-vitorias' })
    assert.equal(r.reconstruidos, 2)
    assert.equal(r.pendentes, 0)
    assert.equal((await lerPerfil(env, id)).xp, 285)
  }
  assert.deepEqual((await lerDoc(env, `partida-efeitos:${caminhos[0]}`))[id], { tipo: 'boost', delta: 160 })
  assert.deepEqual((await lerDoc(env, `partida-efeitos:${caminhos[1]}`))[id], { tipo: 'boost', delta: 125 })
})
