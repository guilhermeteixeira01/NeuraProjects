// Objeto Dados (src/dados.js): migração do KV, gravação com versão (nenhuma mudança se perde) e leitura.   node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'

const A = '76561198000000011'
const B = '76561198000000012'
const { env } = ambiente({
  perfis: { [A]: { moldura: 'neura/rgb' }, [B]: { tema: 'escuro' } },
  usuarios: { [A]: { nome: 'Ana' } },
  config: { admins: [B] },
})
const { lerColecao, lerDoc, lerItem, mudar, mudarDoc } = await import('../src/dados.js')
const { ErroConflito } = await import('../src/erros.js')

test('primeira leitura traz o que estava no KV (perfis, usuarios e cada doc)', async () => {
  assert.deepEqual(await lerColecao(env, 'perfis'), { [A]: { moldura: 'neura/rgb' }, [B]: { tema: 'escuro' } })
  assert.equal((await lerItem(env, 'usuarios', A)).nome, 'Ana')
  assert.deepEqual(await lerDoc(env, 'config', {}), { admins: [B] })
  assert.deepEqual(await lerDoc(env, 'nao-existe', []), [])
})

test('duas mudanças no mesmo registro ao mesmo tempo: as duas ficam (a segunda relê e refaz)', async () => {
  let segurar
  const travado = new Promise((r) => (segurar = r))
  // a primeira lê, espera a segunda gravar, e só então tenta gravar (conflito de versão -> relê e refaz)
  let vezes = 0
  const primeira = mudar(env, 'perfis', [A], async (p) => {
    vezes++
    if (vezes === 1) await travado
    p[A] = { ...p[A], card: 'neura/fundo.webp' }
  })
  await new Promise((r) => setTimeout(r, 0))
  await mudar(env, 'perfis', [A], (p) => {
    p[A] = { ...p[A], insignias: { top3: 1 } }
  })
  segurar()
  await primeira
  assert.equal(vezes, 2)
  const { mapa } = await mudar(env, 'perfis', [A], () => {})
  assert.deepEqual(mapa[A], { moldura: 'neura/rgb', insignias: { top3: 1 }, card: 'neura/fundo.webp' })
})

test('gravar com versão velha é recusado pelo objeto (ErroConflito "versao")', async () => {
  const stub = env.DADOS.get('global')
  const r = await stub.fetch('https://dados/', { method: 'POST', body: JSON.stringify({ acao: 'gravar', colecao: 'perfis', mudancas: [{ id: A, ver: 1, dados: '{}' }] }) })
  assert.equal(r.status, 409)
  assert.equal((await r.json()).erro, 'versao')
  assert.ok(new ErroConflito('versao') instanceof Error)
})

test('apagar o registro e mudar doc', async () => {
  await mudar(env, 'perfis', [B], (p) => {
    delete p[B]
  })
  const { mapa } = await mudar(env, 'perfis', null, () => {})
  assert.equal(mapa[B], undefined)
  assert.deepEqual(await mudarDoc(env, 'loja-bonus', (l) => [...l, { id: 1 }], []), [{ id: 1 }])
  assert.deepEqual(await mudarDoc(env, 'loja-bonus', (l) => [...l, { id: 2 }], []), [{ id: 1 }, { id: 2 }])
})

test('falha do KV na migração não vira "vazio": vira ErroServico e nada é gravado', async () => {
  const quebrado = ambiente()
  quebrado.env.MOLDURAS.get = async () => {
    throw new Error('KV get() limit exceeded for the day.')
  }
  await assert.rejects(lerDoc(quebrado.env, 'premier', {}), (e) => e.codigo === 'limite-diario' && e.status === 503)
})
