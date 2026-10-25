// Migrações dos objetos que já existem em produção: cada uma abre o objeto com os dados no formato antigo e confere o formato novo.   node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento, ranking } from './ambiente.mjs'

const ID = '76561198000000011'
ranking.jogadores = [{ steamId: ID, pontos: 1000, mapas: 1 }]
const { env } = ambiente()
const { Loja } = await import('../src/loja.js')
const { Trocas } = await import('../src/trocas.js')
const { Registro } = await import('../src/registro.js')

const ctxCom = (storage) => ({ storage, blockConcurrencyWhile: (fn) => fn() })
const pedir = async (objeto, corpo) => {
  const r = await objeto.fetch(new Request('https://objeto/', { method: 'POST', body: JSON.stringify(corpo) }))
  return { status: r.status, dados: await r.json() }
}

test('Loja: depósitos ganham as colunas novas, o saldo vem do total guardado e aberturas sem tipo viram "arma"', async () => {
  const storage = armazenamento()
  // formato antigo: depositos sem tipo/dados/entregue, aberturas de arma com t NULL, movimentos sem tabela de totais
  storage.sql.exec('CREATE TABLE aberturas (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, caixa TEXT, t TEXT, d INTEGER, p INTEGER, r INTEGER, f REAL, q INTEGER)')
  storage.sql.exec('CREATE TABLE depositos (pid TEXT PRIMARY KEY, ts INTEGER, centavos INTEGER, np INTEGER, metodo TEXT, estado TEXT)')
  storage.sql.exec('CREATE TABLE movimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, valor INTEGER, motivo TEXT)')
  storage.sql.exec('INSERT INTO movimentos (ts, valor, motivo) VALUES (1, 300, ?), (2, -50, ?)', 'compra', 'venda')
  storage.sql.exec("INSERT INTO aberturas (ts, caixa, t, d, p, r, f, q) VALUES (1, 'caixa-x', NULL, 7, 44, 4, 0.1, 0), (2, 'caixa-x', 'adesivo', 1, 0, 1, 0, 0)")
  storage.sql.exec("INSERT INTO depositos VALUES ('p1', 1, 500, 2000, 'pix', 'pago')")
  const loja = new Loja(ctxCom(storage), env)
  assert.deepEqual(new Set(storage.sql.exec('PRAGMA table_info(depositos)').toArray().map((c) => c.name)), new Set(['pid', 'ts', 'centavos', 'np', 'metodo', 'estado', 'tipo', 'dados', 'entregue']))
  assert.equal(storage.sql.exec("SELECT COUNT(*) AS n FROM aberturas WHERE t IS NULL").one().n, 0)
  const saldo = await pedir(loja, { id: ID, acao: 'saldo' })
  assert.equal(saldo.dados.saldo, 1000 - 250)
  // o total acompanha cada movimento novo e é igual à soma do histórico
  await pedir(loja, { id: ID, acao: 'cobrar', valor: 100, motivo: 'teste' })
  assert.equal(storage.sql.exec('SELECT valor FROM resumo WHERE chave = ?', 'gasto').one().valor, storage.sql.exec('SELECT SUM(valor) AS s FROM movimentos').one().s)
  // abrir de novo o objeto (ele "acorda") não roda a migração outra vez
  new Loja(ctxCom(storage), env)
  assert.equal(storage.sql.exec('SELECT versao FROM esquema').one().versao, 4)
  assert.equal(loja.abertasParaEspecial(), 1) // inclui a abertura antiga que tinha t NULL
  const perfil = await pedir(loja, { id: ID, acao: 'perfil-publico' })
  assert.equal(perfil.dados.melhor.d, 7) // a arma antiga (que estava sem tipo) entra na melhor queda
  assert.equal(perfil.dados.abertas, 2)
})

test('Trocas: a lista antiga do armazenamento vira tabela (e some do armazenamento)', async () => {
  const storage = armazenamento()
  const antiga = { id: 'abc', de: ID, para: '76561198000000012', dar: [], pedir: [], msg: 'oi', estado: 'pendente', criada: Date.now(), fim: Date.now() + 1e6 }
  await storage.put('trocas', [antiga, { ...antiga, id: 'def', estado: 'recusada' }])
  const trocas = new Trocas(ctxCom(storage), env)
  await trocas.pronto
  assert.equal(await storage.get('trocas'), undefined)
  const lista = await pedir(trocas, { acao: 'listar', quem: ID })
  assert.equal(lista.dados.enviadas[0].msg, 'oi')
  assert.equal(lista.dados.historico[0].id, 'def')
})

test('Registro: "dados" que ficaram cortados (JSON inválido) viram vazio; os novos são sempre JSON válido', async () => {
  const storage = armazenamento()
  storage.sql.exec('CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, tipo TEXT, quem TEXT, alvo TEXT, texto TEXT, dados TEXT)')
  storage.sql.exec("INSERT INTO logs (ts, tipo, quem, alvo, texto, dados) VALUES (1, 'admin', '', '', 'velho', '{\"a\": [1, 2')")
  const registro = new Registro(ctxCom(storage), env)
  await pedir(registro, { acao: 'add', entrada: { tipo: 'admin', texto: 'novo', dados: { grande: 'x'.repeat(5000) } } })
  const { dados } = await pedir(registro, { acao: 'listar' })
  assert.equal(dados.logs.find((l) => l.texto === 'velho').dados, null)
  assert.ok(dados.logs.find((l) => l.texto === 'novo').dados.cortado.startsWith('{"grande"'))
})
