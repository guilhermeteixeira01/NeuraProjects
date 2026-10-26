// Rotas do worker de ponta a ponta (fetch -> roteador -> Durable Objects com SQLite de verdade): erros tipados com o status certo,
// loja, perfil, conta, trocas, mercado, times e painel.   node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { DONO, ambiente, ranking } from './ambiente.mjs'

const ANA = '76561198000000011'
const BIA = '76561198000000012'
ranking.jogadores = [
  { steamId: ANA, pontos: 50000, mapas: 20, xp: 0, rating: 1.2, kills: 100 },
  { steamId: BIA, pontos: 50000, mapas: 20, xp: 0, rating: 1.1, kills: 90 },
]
const { env, pedir } = ambiente()

test('sem login: 401 "login"; origem de fora: 403; rota que não existe: 404', async () => {
  assert.deepEqual(await pedir('GET', '/loja'), { status: 401, dados: { erro: 'login' } })
  const fora = await pedir('GET', '/loja', { quem: ANA, cabecalhos: { Origin: 'https://outro.site' } })
  assert.equal(fora.status, 403)
  assert.equal(fora.dados.erro, 'origem')
  assert.equal((await pedir('GET', '/nao-existe', { quem: ANA })).status, 404)
  // caminho exato: POST /skins/publico não cai na rota que salva o inventário
  assert.equal((await pedir('POST', '/skins/publico', { quem: ANA, corpo: {} })).status, 404)
})

test('corpo quebrado: 400 "corpo" (não segue como objeto vazio)', async () => {
  assert.deepEqual(await pedir('POST', '/perfil', { quem: ANA, corpo: '{quebrado' }), { status: 400, dados: { erro: 'corpo' } })
  assert.deepEqual(await pedir('POST', '/perfil', { quem: ANA, corpo: '[1,2]' }), { status: 400, dados: { erro: 'corpo' } })
})

test('/eu registra a visita e /perfil grava (campo inválido: 400 com o nome do campo)', async () => {
  const eu = await pedir('GET', '/eu', { quem: ANA })
  assert.equal(eu.status, 200)
  assert.equal(eu.dados.painel, false)
  assert.deepEqual(await pedir('POST', '/perfil', { quem: ANA, corpo: { tema: 'neon' } }), { status: 400, dados: { erro: 'tema' } })
  const ok = await pedir('POST', '/perfil', { quem: ANA, corpo: { tema: 'escuro', vistos: { ins: ['top3'] } } })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.dados.perfis[ANA], { tema: 'escuro', vistos: { ins: ['top3'] } })
  const publicos = await pedir('GET', '/perfis')
  assert.equal(publicos.dados[ANA].tema, 'escuro')
})

test('loja: comprar, abrir, vender; saldo sempre igual a pontos - gastos', async () => {
  const estado = await pedir('GET', '/loja', { quem: ANA })
  assert.equal(estado.status, 200)
  assert.equal(estado.dados.saldo, 50000)
  const caixa = estado.dados.caixas.find((c) => c.preco <= 5000 && c.itens.every((it) => !it.t)) // caixa de armas (a melhor queda é de arma, faca ou luva)
  const compra = await pedir('POST', '/loja/comprar', { quem: ANA, corpo: { caixa: caixa.id, qtd: 2 } })
  assert.equal(compra.status, 200)
  assert.equal(compra.dados.saldo, 50000 - caixa.preco) // pedido antigo em lote continua limitado a uma caixa
  const aberta = await pedir('POST', '/loja/abrir', { quem: ANA, corpo: { caixa: caixa.id, qtd: 2, origem: 'inventario' } })
  assert.equal(aberta.status, 200)
  assert.equal(aberta.dados.resultados.length, 1)
  assert.equal(aberta.dados.saldo, 50000 - caixa.preco) // abriu a que já tinha: não pagou de novo
  assert.equal(aberta.dados.insigniasTs, undefined) // o que é só do worker não vai para o site
  // sem caixa no inventário: 409 "sem-caixa"
  assert.deepEqual(await pedir('POST', '/loja/abrir', { quem: ANA, corpo: { caixa: caixa.id, qtd: 1, origem: 'inventario' } }), { status: 409, dados: { erro: 'sem-caixa' } })
  const vendidos = aberta.dados.resultados.map((r) => r.id)
  const venda = await pedir('POST', '/loja/vender', { quem: ANA, corpo: { ids: vendidos } })
  assert.equal(venda.status, 200)
  const total = aberta.dados.resultados.reduce((a, r) => a + r.v, 0)
  assert.equal(venda.dados.total, total)
  assert.equal(venda.dados.saldo, 50000 - caixa.preco + total)
  const saldo = await pedir('GET', '/loja/saldo', { quem: ANA })
  assert.equal(saldo.dados.saldo, venda.dados.saldo)
  const depois = await pedir('GET', '/loja', { quem: ANA })
  assert.equal(depois.dados.aberturas, 1)
  const perfil = await pedir('GET', `/loja/perfil?id=${ANA}`)
  assert.equal(perfil.dados.abertas, 1)
  assert.equal(perfil.dados.favorita.slug, caixa.slug)
  assert.equal(perfil.dados.melhor.v, Math.max(...aberta.dados.resultados.map((r) => r.v)))
  assert.ok(depois.dados.recentes.every((l) => l.t)) // toda abertura gravada com o tipo (arma também)
})

test('saldo insuficiente: 409 "saldo"', async () => {
  const caras = (await pedir('GET', '/loja', { quem: BIA })).dados.caixas.sort((a, b) => b.preco - a.preco)
  const muitas = Math.ceil(50001 / caras[0].preco)
  let saldo = 50000
  for (let i = 0; saldo >= caras[0].preco && i < muitas; i++) saldo = (await pedir('POST', '/loja/comprar', { quem: BIA, corpo: { caixa: caras[0].id, qtd: 3 } })).dados.saldo
  const r = await pedir('POST', '/loja/comprar', { quem: BIA, corpo: { caixa: caras[0].id, qtd: 3 } })
  assert.deepEqual(r, { status: 409, dados: { erro: 'saldo' } })
})

test('conta: apelido único, senha e senha errada com tentativas restantes', async () => {
  assert.equal((await pedir('POST', '/conta/nick', { quem: ANA, corpo: { nick: 'Ana Neura' } })).status, 200)
  assert.deepEqual(await pedir('POST', '/conta/nick', { quem: BIA, corpo: { nick: 'ana neura' } }), { status: 409, dados: { erro: 'nick-em-uso' } })
  assert.equal((await pedir('POST', '/conta/senha', { quem: ANA, corpo: { senha: 'senha-da-ana' } })).status, 200)
  assert.equal((await pedir('POST', '/conta/senha', { quem: BIA, corpo: { senha: 'senha-da-bia' } })).status, 200)
  const seg = await pedir('GET', '/conta/seguranca', { quem: ANA })
  assert.equal(seg.dados.nick, 'Ana Neura')
  assert.equal(seg.dados.temSenha, true)
  // o apelido vale no lugar do nome da Steam (e no /nicks público)
  assert.deepEqual((await pedir('GET', `/nicks?ids=${ANA}`)).dados, { [ANA]: 'Ana Neura' })
})

test('trocas: senha exigida, proposta, aceite e os itens mudam de dono', async () => {
  await pedir('GET', '/eu', { quem: BIA }) // Bia entra no site (só quem já entrou recebe proposta)
  const dar = await pedir('POST', '/admin/skin', { quem: DONO, corpo: { id: ANA, item: { t: 'arma', d: 7, p: 44, f: 0.1, s: 661 } } })
  assert.equal(dar.status, 200)
  const item = dar.dados.id
  assert.deepEqual(await pedir('POST', '/trocas', { quem: ANA, corpo: { para: BIA, dar: [item], pedir: [] } }), { status: 428, dados: { erro: 'senha-pedir' } })
  const errada = await pedir('POST', '/trocas', { quem: ANA, corpo: { para: BIA, dar: [item], pedir: [], senha: 'errada' } })
  assert.equal(errada.status, 403)
  assert.equal(errada.dados.erro, 'senha-errada')
  assert.equal(errada.dados.restantes, 4)
  const proposta = await pedir('POST', '/trocas', { quem: ANA, corpo: { para: BIA, dar: [item], pedir: [], senha: 'senha-da-ana' } })
  assert.equal(proposta.status, 200)
  // o mesmo item em outra proposta: 409
  assert.deepEqual(await pedir('POST', '/trocas', { quem: ANA, corpo: { para: BIA, dar: [item], pedir: [], senha: 'senha-da-ana' } }), { status: 409, dados: { erro: 'item-em-outra-proposta' } })
  const lista = await pedir('GET', '/trocas', { quem: BIA })
  assert.equal(lista.dados.recebidas.length, 1)
  assert.deepEqual(await pedir('POST', '/trocas/cancelar', { quem: BIA, corpo: { id: proposta.dados.id } }), { status: 403, dados: { erro: 'nao-pode' } })
  assert.equal((await pedir('POST', '/trocas/aceitar', { quem: BIA, corpo: { id: proposta.dados.id, senha: 'senha-da-bia' } })).status, 200)
  const invBia = await pedir('GET', '/skins', { quem: BIA })
  assert.ok(Object.values(invBia.dados.itens).some((it) => it.t === 'arma' && it.d === 7 && it.s === 661))
  const invAna = await pedir('GET', '/skins', { quem: ANA })
  assert.equal(invAna.dados.itens[item], undefined)
  assert.equal((await pedir('GET', '/trocas', { quem: ANA })).dados.historico[0].estado, 'aceita')
})

test('mercado: anunciar (com senha), comprar e o vendedor recebe', async () => {
  const inv = await pedir('GET', '/skins', { quem: BIA })
  const [id] = Object.keys(inv.dados.itens).filter((k) => inv.dados.itens[k].t === 'arma')
  const anuncio = await pedir('POST', '/mercado/anunciar', { quem: BIA, corpo: { id, preco: 1234, nome: 'AK', senha: 'senha-da-bia' } })
  assert.equal(anuncio.status, 200)
  assert.ok(anuncio.dados.anuncio.ref > 1234) // blue gem tier 1: o valor de referência leva o multiplicador
  assert.deepEqual(await pedir('POST', '/mercado/comprar', { quem: BIA, corpo: { id: anuncio.dados.anuncio.id } }), { status: 409, dados: { erro: 'proprio' } })
  const antes = (await pedir('GET', '/loja/saldo', { quem: BIA })).dados.saldo
  const compra = await pedir('POST', '/mercado/comprar', { quem: ANA, corpo: { id: anuncio.dados.anuncio.id } })
  assert.equal(compra.status, 200)
  assert.equal((await pedir('GET', '/loja/saldo', { quem: BIA })).dados.saldo, antes + 1234)
  assert.deepEqual(await pedir('POST', '/mercado/comprar', { quem: ANA, corpo: { id: anuncio.dados.anuncio.id } }), { status: 404, dados: { erro: 'nao-achou' } })
})

test('times: criar cobra NP, nome repetido é 409 e quem tem time não cria outro', async () => {
  const saldo = (await pedir('GET', '/loja/saldo', { quem: ANA })).dados.saldo
  const criado = await pedir('POST', '/equipes/criar', { quem: ANA, corpo: { nome: 'Os Neura', tag: 'NRA' } })
  assert.equal(criado.status, 200)
  assert.equal(criado.dados.saldo, saldo - 10000)
  assert.deepEqual(await pedir('POST', '/equipes/criar', { quem: ANA, corpo: { nome: 'Outro Time' } }), { status: 409, dados: { erro: 'ja-tem-time' } })
  assert.deepEqual(await pedir('POST', '/equipes/criar', { quem: BIA, corpo: { nome: 'os neura' } }), { status: 409, dados: { erro: 'nome-em-uso' } })
  assert.equal((await pedir('POST', '/equipes/entrar', { quem: BIA, corpo: { id: criado.dados.id } })).status, 200)
  const meu = await pedir('GET', '/equipes/meu', { quem: BIA })
  assert.equal(meu.dados.time.membros.length, 2)
  const publico = await pedir('GET', '/equipes/publico')
  assert.equal(publico.dados.times[0].nome, 'Os Neura')
})

test('painel: sem aba é 403, o dono pode e cada ação certa vira linha no log', async () => {
  assert.deepEqual(await pedir('GET', '/admin/dados', { quem: ANA }), { status: 403, dados: { erro: 'admin' } })
  const cfg = await pedir('POST', '/admin/config', { quem: DONO, corpo: { molduraPorNivel: true, nivelMoldura: { 'neura/rgb': 5 } } })
  assert.equal(cfg.status, 200)
  assert.deepEqual(cfg.dados.config.nivelMoldura, { 'neura/rgb': 5 })
  assert.deepEqual(await pedir('POST', '/admin/config', { quem: DONO, corpo: { nivelMoldura: { 'neura/rgb': 99 } } }), { status: 400, dados: { erro: 'nivelMoldura' } })
  // moldura de nível 5 para quem tem nível 1: 403 com o nível que precisa
  assert.deepEqual(await pedir('POST', '/perfil', { quem: BIA, corpo: { moldura: 'neura/rgb' } }), { status: 403, dados: { erro: 'nivel', precisa: 5, nivel: 1 } })
  const logs = await pedir('GET', '/admin/logs', { quem: DONO })
  assert.ok(logs.dados.logs.some((l) => l.texto.startsWith('mudou as configurações')))
  assert.ok(!logs.dados.logs.some((l) => l.texto.includes('nivelMoldura') && l.texto.includes('99'))) // a que falhou não entra
  // pontos para todos: bônus aparece no saldo de cada um na próxima vez
  const antes = (await pedir('GET', '/loja/saldo', { quem: BIA })).dados.saldo
  assert.equal((await pedir('POST', '/admin/loja-pontos', { quem: DONO, corpo: { alvo: 'todos', acao: 'adicionar', valor: 500, motivo: 'teste' } })).status, 200)
  assert.equal((await pedir('GET', '/loja/saldo', { quem: BIA })).dados.saldo, antes + 500)
  assert.equal((await pedir('GET', '/loja/saldo', { quem: BIA })).dados.saldo, antes + 500) // uma vez só
})

test('serviço (plugin): token errado é 401 e o certo lê as skins', async () => {
  assert.equal((await pedir('POST', '/servidor/skins', { corpo: { ids: [ANA] }, cabecalhos: { Authorization: 'Bearer errado' } })).status, 401)
  const ok = await pedir('POST', '/servidor/skins', { corpo: { ids: [ANA, BIA] }, cabecalhos: { Authorization: 'Bearer token-servidor' } })
  assert.equal(ok.status, 200)
})

test('o KV antigo não é mais gravado (tudo vai para os objetos)', async () => {
  assert.deepEqual([...env.MOLDURAS.dados.keys()], [])
})
