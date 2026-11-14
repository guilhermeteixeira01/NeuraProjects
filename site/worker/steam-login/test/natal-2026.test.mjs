// Natal na Neura 2026 — Operação Presente: configuração, ativação, créditos diários, resgates e meta coletiva.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ambiente, DONO } from './ambiente.mjs'
import {
  configNatal, creditosNatal, diaNatal, estadoNatal, indiceDiaNatal, validarConfigNatal, META_COLETIVA_NATAL, INSIGNIA_NATAL, INSIGNIA_NATAL_DOURADA, ARTES_NATAL,
} from '../src/natal-2026-core.js'
// Depois de ambiente.mjs (ele ensina o Node a importar os JSON do worker)
const { conclusaoDaPartida, registrarPartidaNatal } = await import('../src/natal-2026.js')
const { lerCaixas } = await import('../src/loja.js')
const { mudarDoc } = await import('../src/dados.js')
const { lerPerfil } = await import('../src/perfis.js')
const { pedirAoJogador } = await import('../src/objetos.js')
const { limparSkins } = await import('../src/skins.js')

const DIA = 86400000
const meiaNoiteHoje = () => Date.parse(`${diaNatal(Date.now())}T00:00:00-03:00`)
const iso = (t) => new Date(t).toISOString()
const MAPAS = ['de_mirage', 'de_dust2', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_overpass']
// Evento que começou há `diasAtras` dias (meia-noite de Brasília), 7 dias, resgate até 7 dias depois do fim
function configEm(diasAtras = 2, extra = {}) {
  const inicio = meiaNoiteHoje() - diasAtras * DIA
  return { ativo: true, inicio: iso(inicio), fim: iso(inicio + 7 * DIA), resgateAte: iso(inicio + 14 * DIA), mapas: MAPAS, ...extra }
}
// "YYYY-MM-DD HH:MM" no horário de Brasília (como o plugin grava)
const horaBR = (t) => { const d = new Date(t - 3 * 3600000).toISOString(); return `${d.slice(0, 10)} ${d.slice(11, 16)}` }
// SteamID64 passa de Number.MAX_SAFE_INTEGER: soma em BigInt
const ids = (n, base = 76561198000001000n) => Array.from({ length: n }, (_, i) => String(BigInt(base) + BigInt(i)))
const jogador = (id, time, valido = true) => ({ steamId: id, time, rounds: 18, kills: 5, mortes: 5, assistencias: 1, rating: 1, missoes: { participou: valido, roundsValidos: valido ? 18 : 0, kills: 5, headshots: 1, assistencias: 1, clutches: 0, plantios: 0, desarmes: 0, melhorRound: 1, armas: {} } })
function partida(mapa, inicioMs, jogadores, { validada = true, invalidos = [] } = {}) {
  return {
    mapa, inicio: horaBR(inicioMs), duracaoMin: 30, placarA: 13, placarB: 7, timeA: 'A', timeB: 'B',
    missoes: { versao: 1, validada, concluida: true, modo: '5v5', elencoFinal: jogadores, timesFinais: Object.fromEntries(jogadores.map((id, i) => [id, i % 2 ? 'B' : 'A'])) },
    jogadores: jogadores.map((id, i) => jogador(id, i % 2 ? 'B' : 'A', !invalidos.includes(id))),
  }
}
const enviar = (pedir, caminho, p) => pedir('POST', '/servidor/partida', { corpo: { caminho, item: { nome: caminho }, partida: p }, cabecalhos: { Authorization: 'Bearer token-servidor' } })
const configurar = (pedir, cfg) => pedir('POST', '/admin/natal-2026', { quem: DONO, corpo: cfg })
const CAIXA_ID = 90002 // Presente da Neura (caixa-natal.js)
const saldoDe = async (pedir, quem) => (await pedir('GET', '/eventos/natal-2026/eu', { quem })).dados.jogador.saldo

test('configuração: desativado sem datas; início e fim à meia-noite de Brasília com 7 dias exatos', () => {
  assert.equal(estadoNatal(configNatal(null)), 'desativado')
  assert.equal(estadoNatal(configNatal({ ...configEm(), ativo: false })), 'desativado')
  const ok = configEm()
  assert.ok(validarConfigNatal(ok).config)
  assert.equal(validarConfigNatal({ ...ok, inicio: iso(Date.parse(ok.inicio) + 3600000) }).erro, 'inicio')
  assert.equal(validarConfigNatal({ ...ok, fim: iso(Date.parse(ok.fim) + DIA) }).erro, 'fim')
  assert.equal(validarConfigNatal({ ...ok, resgateAte: iso(Date.parse(ok.fim) - 1) }).erro, 'resgateAte')
  assert.equal(validarConfigNatal({ ...ok, mapas: MAPAS.slice(1) }).erro, 'mapas')
  // Natal real: 18/12 a 25/12 (fim exclusivo) com virada à meia-noite de Brasília (03:00 UTC)
  const cfg = configNatal({ ativo: true, inicio: '2026-12-18T00:00:00-03:00', fim: '2026-12-25T00:00:00-03:00', resgateAte: '2027-01-08T23:59:59-03:00', mapas: MAPAS })
  assert.equal(estadoNatal(cfg, Date.parse('2026-12-18T02:59:59Z')), 'futuro')
  assert.equal(estadoNatal(cfg, Date.parse('2026-12-18T03:00:00Z')), 'ativo')
  assert.equal(indiceDiaNatal(Date.parse('2026-12-19T02:59:59Z'), cfg), 0) // 23:59 de 18/12 em Brasília
  assert.equal(indiceDiaNatal(Date.parse('2026-12-19T03:00:00Z'), cfg), 1) // virada do dia
  assert.equal(estadoNatal(cfg, Date.parse('2026-12-25T03:00:00Z')), 'resgate')
  assert.equal(estadoNatal(cfg, Date.parse('2027-01-09T03:00:00Z')), 'encerrado')
})

test('créditos: ativação 10, 2 partidas no dia 20, mapa do dia 15, 10 partidas 40; uma partida avança tudo', () => {
  const cfg = configNatal({ ativo: true, inicio: '2026-12-18T00:00:00-03:00', fim: '2026-12-25T00:00:00-03:00', resgateAte: '2027-01-08T00:00:00-03:00', mapas: MAPAS })
  const t = (dia, hora) => Date.parse(`2026-12-${dia}T${hora}:00-03:00`)
  assert.deepEqual(creditosNatal([], cfg, null), {})
  assert.deepEqual(creditosNatal([], cfg, t(18, '10:00')), { ativacao: 10 })
  // dia 18 (mapa de_mirage): uma partida no mapa do dia + outra
  const ps = [{ chave: 'a', fim: t(18, '20:00'), mapa: 'de_mirage' }, { chave: 'b', fim: t(18, '23:50'), mapa: 'de_nuke' }, { chave: 'b', fim: t(18, '23:50'), mapa: 'de_nuke' }]
  assert.deepEqual(creditosNatal(ps, cfg, 1), { ativacao: 10, 'partidas-dia:2026-12-18': 20, 'mapa-do-dia:2026-12-18': 15 })
  // 23:59 e 00:01 caem em dias diferentes; partida concluída antes do início não conta
  const virada = [{ chave: 'c', fim: t(19, '23:59'), mapa: 'de_x' }, { chave: 'd', fim: t(20, '00:01'), mapa: 'de_x' }, { chave: 'e', fim: t(17, '23:00'), mapa: 'de_x' }]
  assert.deepEqual(creditosNatal(virada, cfg, 1), { ativacao: 10 })
  const dez = Array.from({ length: 10 }, (_, i) => ({ chave: `p${i}`, fim: t(19 + (i % 5), '15:00'), mapa: 'de_x' }))
  assert.equal(creditosNatal(dez, cfg, 1)['dez-partidas'], 40)
  assert.equal(creditosNatal(dez.slice(1), cfg, 1)['dez-partidas'], undefined)
})

test('conclusão vem do registro oficial: início + duração, nunca depois da chegada ao servidor', () => {
  const inicio = Date.parse('2026-12-18T23:40:00-03:00')
  assert.equal(conclusaoDaPartida({ inicio: '2026-12-18 23:40', duracaoMin: 35 }, inicio + 3 * 3600000), inicio + 35 * 60000)
  assert.equal(conclusaoDaPartida({ inicio: '2026-12-18 23:40', duracaoMin: 35 }, inicio + 60000), inicio + 60000)
  assert.equal(conclusaoDaPartida({}, 123), 123)
})

test('evento desativado até configurar: nada é creditado, ativar é recusado e o admin valida as datas', async () => {
  const { pedir } = ambiente()
  const [a] = ids(1)
  let r = await pedir('GET', '/eventos/natal-2026')
  assert.equal(r.status, 200); assert.equal(r.dados.estado, 'desativado'); assert.equal(r.dados.divulgacao, false)
  r = await pedir('POST', '/eventos/natal-2026/ativar', { quem: a, corpo: {} })
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'natal-fechado')
  r = await configurar(pedir, { ...configEm(), fim: iso(Date.parse(configEm().fim) + 3600000) })
  assert.equal(r.status, 400); assert.equal(r.dados.campo, 'fim')
  r = await pedir('POST', '/admin/natal-2026', { quem: a, corpo: configEm() })
  assert.equal(r.status, 403)
})

test('ativação credita 10 uma vez; partidas oficiais creditam por dia; reprocessar e clicar de novo não duplicam', async () => {
  const { pedir, env } = ambiente()
  const time = ids(10)
  const [a, b] = time
  assert.equal((await configurar(pedir, configEm(2))).status, 200)
  let r = await pedir('GET', '/eventos/natal-2026')
  assert.equal(r.dados.estado, 'ativo'); assert.equal(r.dados.divulgacao, true); assert.equal(r.dados.mapaDoDia, 'de_inferno')
  // cliques repetidos e simultâneos na ativação
  const ativacoes = await Promise.all([1, 2, 3].map(() => pedir('POST', '/eventos/natal-2026/ativar', { quem: a, corpo: {} })))
  assert.ok(ativacoes.every((x) => x.status === 200))
  assert.equal(await saldoDe(pedir, a), 10)
  // hoje (dia 3, mapa de_inferno): duas partidas válidas, uma no mapa do dia
  const hoje = meiaNoiteHoje()
  const p1 = partida('de_inferno', hoje + 60000, time), p2 = partida('de_nuke', hoje + 3600000, time)
  assert.equal((await enviar(pedir, 'neura/md1/natal-1', p1)).status, 200)
  assert.equal(await saldoDe(pedir, a), 25) // 10 + 15 (mapa do dia)
  assert.equal((await enviar(pedir, 'neura/md1/natal-2', p2)).status, 200)
  assert.equal(await saldoDe(pedir, a), 45) // + 20 (2 partidas no dia)
  // a mesma partida reprocessada (o plugin manda de novo) e uma terceira no mesmo dia: créditos diários não se repetem
  await enviar(pedir, 'neura/md1/natal-1', p1)
  await enviar(pedir, 'neura/md1/natal-3', partida('de_inferno', hoje + 7200000, time))
  r = await pedir('GET', '/eventos/natal-2026/eu', { quem: a })
  assert.equal(r.dados.jogador.saldo, 45); assert.equal(r.dados.jogador.partidas, 3)
  assert.equal(r.dados.meta.atual, 3)
  // quem jogou sem ativar não tem estrelas; ao ativar, recebe a ativação e os créditos das partidas oficiais do período
  assert.equal(await saldoDe(pedir, b), 0)
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: b, corpo: {} })
  assert.equal(await saldoDe(pedir, b), 45)
  // aviso no sino com link para a página do evento
  const notifs = await env.LOJA.instancia(a).ctx.storage.get('notifs')
  assert.ok(notifs.lista.some((n) => /Estrelas de Natal/.test(n.titulo) && n.link === '/eventos/natal-2026/'))
})

test('partida inválida (não validada, jogador sem participação ou fora do período) não credita nem conta na meta', async () => {
  const { pedir } = ambiente()
  const time = ids(10, 76561198000002000n)
  await configurar(pedir, configEm(2))
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: time[0], corpo: {} })
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: time[1], corpo: {} })
  const hoje = meiaNoiteHoje()
  await enviar(pedir, 'neura/md1/nao-validada', partida('de_inferno', hoje + 60000, time, { validada: false }))
  await enviar(pedir, 'neura/md1/antes-do-evento', partida('de_inferno', hoje - 3 * DIA, time))
  await enviar(pedir, 'neura/md1/sem-participar', partida('de_inferno', hoje + 120000, time, { invalidos: [time[1]] }))
  const r = await pedir('GET', '/eventos/natal-2026/eu', { quem: time[1] })
  assert.equal(r.dados.jogador.saldo, 10); assert.equal(r.dados.jogador.partidas, 0)
  assert.equal(r.dados.meta.atual, 1) // só a partida válida conta (pelos demais participantes)
  assert.equal(await saldoDe(pedir, time[0]), 25)
})

test('resgate: saldo validado no servidor, uma vez por conta, cliques simultâneos não duplicam e saldo nunca fica negativo', async () => {
  const { pedir, env } = ambiente()
  const time = ids(10, 76561198000003000n)
  const a = time[0]
  await configurar(pedir, configEm(2))
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: a, corpo: {} })
  // 10 estrelas: insígnia (30) recusada sem mudar o saldo
  let r = await pedir('POST', '/eventos/natal-2026/resgatar', { quem: a, corpo: { recompensa: 'insignia' } })
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'natal-saldo')
  assert.equal(await saldoDe(pedir, a), 10)
  const hoje = meiaNoiteHoje()
  await enviar(pedir, 'neura/md1/r1', partida('de_inferno', hoje + 60000, time))
  await enviar(pedir, 'neura/md1/r2', partida('de_inferno', hoje + 3600000, time))
  assert.equal(await saldoDe(pedir, a), 45)
  // 5 cliques ao mesmo tempo: um débito só, uma insígnia só
  const rs = await Promise.all(Array.from({ length: 5 }, () => pedir('POST', '/eventos/natal-2026/resgatar', { quem: a, corpo: { recompensa: 'insignia' } })))
  assert.ok(rs.every((x) => x.status === 200))
  assert.equal(rs.filter((x) => x.dados.jogador && !x.dados.jogador.resgatado?.jaResgatado).length, 1)
  r = await pedir('GET', '/eventos/natal-2026/eu', { quem: a })
  assert.equal(r.dados.jogador.saldo, 15); assert.equal(r.dados.jogador.resgates.insignia.entregue, true)
  assert.ok((await lerPerfil(env, a)).insignias[INSIGNIA_NATAL])
  // recompensa inexistente e saldo insuficiente para a caixa
  assert.equal((await pedir('POST', '/eventos/natal-2026/resgatar', { quem: a, corpo: { recompensa: 'carro' } })).status, 400)
  // não ativou: não resgata
  r = await pedir('POST', '/eventos/natal-2026/resgatar', { quem: time[5], corpo: { recompensa: 'insignia' } })
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'natal-nao-ativado')
})

test('moldura vai para a posse e o perfil; caixa entra no inventário uma vez e, aberta, dá faca ou luva', async () => {
  const { pedir, env } = ambiente()
  const time = ids(10, 76561198000004000n)
  const a = time[0]
  await configurar(pedir, configEm(6)) // hoje é o último dia (mapa de_overpass)
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: a, corpo: {} })
  // 10 partidas oficiais, várias em dias diferentes do período: 10 + 40 (10 partidas) + diários
  const inicio = meiaNoiteHoje() - 6 * DIA
  for (let i = 0; i < 10; i++) await enviar(pedir, `neura/md1/c${i}`, partida(MAPAS[i % 7], inicio + (i % 7) * DIA + 3600000 + i * 60000, time))
  const saldo = await saldoDe(pedir, a)
  // 7 dias com mapa do dia (7×15) + 3 dias com 2 partidas (3×20) + 10 partidas (40) + ativação (10)
  assert.equal(saldo, 10 + 7 * 15 + 3 * 20 + 40)
  let pub = (await pedir('GET', '/eventos/natal-2026')).dados
  assert.equal(pub.recompensas.find((x) => x.id === 'caixa').disponivel, true)
  assert.equal(pub.recompensas.find((x) => x.id === 'moldura').disponivel, true)
  // moldura: débito + posse no mesmo objeto; marca no perfil libera a moldura (trava de podeUsarMolduraEvento)
  const { MOLDURA_NATAL } = await import('../src/natal-2026-core.js')
  const { podeUsarMolduraEvento } = await import('../../../src/comum/molduras.js')
  assert.equal(podeUsarMolduraEvento(MOLDURA_NATAL, await lerPerfil(env, a)), false)
  assert.equal((await pedir('POST', '/eventos/natal-2026/resgatar', { quem: a, corpo: { recompensa: 'moldura' } })).status, 200)
  assert.equal(await saldoDe(pedir, a), saldo - 80)
  assert.ok((await pedirAoJogador(env, a, { acao: 'oficial-posse' })).possui.moldura.includes(MOLDURA_NATAL))
  assert.equal(podeUsarMolduraEvento(MOLDURA_NATAL, await lerPerfil(env, a)), true)
  assert.equal(podeUsarMolduraEvento(MOLDURA_NATAL, await lerPerfil(env, time[1])), false)
  // o jogador consegue equipar a moldura no perfil
  assert.equal((await pedir('POST', '/perfil', { quem: a, corpo: { moldura: MOLDURA_NATAL } })).status, 200)
  assert.equal((await pedir('POST', '/perfil', { quem: time[1], corpo: { moldura: MOLDURA_NATAL } })).status, 403)
  const rs = await Promise.all([1, 2, 3].map(() => pedir('POST', '/eventos/natal-2026/resgatar', { quem: a, corpo: { recompensa: 'caixa' } })))
  assert.ok(rs.every((x) => x.status === 200))
  assert.equal(await saldoDe(pedir, a), saldo - 80 - 120)
  const { inv } = await pedirAoJogador(env, a, { acao: 'inv-ler' })
  assert.equal(Object.values(inv.itens).filter((i) => i.t === 'caixa' && i.d === CAIXA_ID).length, 1)
  // abrir a caixa pelo fluxo normal da loja: sai uma faca ou uma luva, e a caixa sai do inventário
  const aberta = await pedir('POST', '/loja/abrir', { quem: a, corpo: { caixa: CAIXA_ID, qtd: 1, origem: 'inventario' } })
  assert.equal(aberta.status, 200, JSON.stringify(aberta.dados).slice(0, 200))
  const depois = (await pedirAoJogador(env, a, { acao: 'inv-ler' })).inv
  assert.equal(Object.values(depois.itens).filter((i) => i.t === 'caixa' && i.d === CAIXA_ID).length, 0)
  const ganhos = Object.entries(depois.itens).filter(([id, i]) => id !== 'c4' && i.t !== 'caixa').map(([, i]) => i) // c4: a C4 fixa de toda conta
  assert.equal(ganhos.length, 1); assert.ok(['faca', 'luva'].includes(ganhos[0].t), ganhos[0].t)
})

test('caixa Presente da Neura: só facas e luvas, nada mais pode sair no sorteio', async () => {
  const { CAIXA_NATAL } = await import('../src/caixa-natal.js')
  const { sortearAbertura, CONFIG_PADRAO } = await import('../src/loja-core.js')
  assert.equal(CAIXA_NATAL.id, CAIXA_ID); assert.equal(CAIXA_NATAL.facas.length, 0)
  assert.ok(CAIXA_NATAL.itens.length > 0 && CAIXA_NATAL.itens.every((i) => i.t === 'faca' || i.t === 'luva'))
  let n = 0x9e3779b9
  const rnd = () => ((n = (Math.imul(n ^ (n >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296)
  const tipos = new Set()
  for (let k = 0; k < 3000; k++) tipos.add(sortearAbertura(CAIXA_NATAL, CONFIG_PADRAO, rnd).item.t)
  assert.deepEqual([...tipos].sort(), ['faca', 'luva'])
  // fora da loja (arquivada) e sem "Mestre da Caixa"
  assert.equal(CAIXA_NATAL.arquivada, true)
  const { progressoInsignias } = await import('../src/loja-core.js')
  assert.ok(!progressoInsignias({}, [CAIXA_NATAL]).some((i) => String(i.id).includes('presente')))
})

test('inventário cheio: resgate da caixa recusado sem débito', async () => {
  const { pedir, env } = ambiente()
  const time = ids(10, 76561198000005000n)
  const a = time[0]
  await configurar(pedir, configEm(6))
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: a, corpo: {} })
  const inicio = meiaNoiteHoje() - 6 * DIA
  for (let i = 0; i < 10; i++) await enviar(pedir, `neura/md1/cheio${i}`, partida(MAPAS[i % 7], inicio + (i % 7) * DIA + 3600000 + i * 60000, time))
  const antes = await saldoDe(pedir, a)
  const loja = env.LOJA.instancia(a)
  const inv = (await pedirAoJogador(env, a, { acao: 'inv-ler' })).inv || limparSkins({})
  for (let i = 0; i < 2000; i++) { inv.itens[`x${i}`] = { t: 'caixa', d: CAIXA_ID, p: 0 }; inv.criado[`x${i}`] = i }
  await loja.ctx.storage.put('inv', inv)
  const r = await pedir('POST', '/eventos/natal-2026/resgatar', { quem: a, corpo: { recompensa: 'caixa' } })
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'cheio')
  assert.equal(await saldoDe(pedir, a), antes)
})

test('período de resgate: sem novas ativações, resgate continua até o prazo e fecha depois', async () => {
  const { pedir } = ambiente()
  const time = ids(10, 76561198000006000n)
  await configurar(pedir, configEm(2))
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: time[0], corpo: {} })
  const hoje = meiaNoiteHoje()
  await enviar(pedir, 'neura/md1/pr1', partida('de_inferno', hoje + 60000, time))
  await enviar(pedir, 'neura/md1/pr2', partida('de_inferno', hoje + 3600000, time))
  assert.equal(await saldoDe(pedir, time[0]), 45)
  // o admin reconfigura para um período de 7 dias que terminou ontem, com resgate até amanhã
  const passado = hoje - 8 * DIA
  const r0 = await configurar(pedir, { ativo: true, inicio: iso(passado), fim: iso(passado + 7 * DIA), resgateAte: iso(Date.now() + DIA), mapas: MAPAS })
  assert.equal(r0.status, 200); assert.equal(r0.dados.estado, 'resgate')
  let r = await pedir('POST', '/eventos/natal-2026/ativar', { quem: time[1], corpo: {} })
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'natal-fechado')
  // as partidas de hoje ficaram fora do novo período: os créditos já dados não são retirados
  r = await pedir('POST', '/eventos/natal-2026/resgatar', { quem: time[0], corpo: { recompensa: 'insignia' } })
  assert.equal(r.status, 200); assert.equal(r.dados.jogador.saldo, 15)
  await configurar(pedir, { ativo: true, inicio: iso(passado - 10 * DIA), fim: iso(passado - 3 * DIA), resgateAte: iso(passado - 3 * DIA), mapas: MAPAS })
  r = await pedir('POST', '/eventos/natal-2026/resgatar', { quem: time[0], corpo: { recompensa: 'caixa' } })
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'natal-resgate-fechado')
  assert.equal((await pedir('GET', '/eventos/natal-2026')).dados.estado, 'encerrado')
})

test('meta coletiva: 100 partidas distintas (uma vez cada, mesmo com vários participantes) dão a dourada a quem ativou e jogou, inclusive depois', async () => {
  const { pedir, env } = ambiente()
  const time = ids(10, 76561198000007000n)
  const [a, b, , , , , , , , semJogar] = time
  const fora = ids(10, 76561198000008000n)
  await configurar(pedir, configEm(3))
  for (const id of [a, b]) await pedir('POST', '/eventos/natal-2026/ativar', { quem: id, corpo: {} })
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: fora[0], corpo: {} }) // ativou, mas não joga
  const inicio = meiaNoiteHoje() - 3 * DIA
  const elenco = time.slice(0, 9) // semJogar fica fora
  for (let i = 0; i < META_COLETIVA_NATAL - 1; i++) await registrarPartidaNatal(env, `neura/md1/meta${i}`, partida('de_dust2', inicio + (i % 3) * DIA + i * 60000, elenco), Date.now())
  // reprocessar a mesma partida não soma
  await registrarPartidaNatal(env, 'neura/md1/meta0', partida('de_dust2', inicio, elenco), Date.now())
  let pub = (await pedir('GET', '/eventos/natal-2026')).dados
  assert.equal(pub.meta.atual, 99); assert.equal(pub.meta.atingidaEm, null)
  assert.equal((await lerPerfil(env, a))?.insignias?.[INSIGNIA_NATAL_DOURADA], undefined)
  await registrarPartidaNatal(env, 'neura/md1/meta99', partida('de_dust2', inicio + DIA + 7000, elenco), Date.now())
  pub = (await pedir('GET', '/eventos/natal-2026')).dados
  assert.equal(pub.meta.atual, 100); assert.ok(pub.meta.atingidaEm)
  assert.ok((await lerPerfil(env, a)).insignias[INSIGNIA_NATAL_DOURADA])
  assert.ok((await lerPerfil(env, b)).insignias[INSIGNIA_NATAL_DOURADA])
  assert.equal((await lerPerfil(env, fora[0]))?.insignias?.[INSIGNIA_NATAL_DOURADA], undefined) // sem partida válida
  // jogou e ativou depois da meta: também recebe
  const c = time[2]
  assert.equal((await lerPerfil(env, c))?.insignias?.[INSIGNIA_NATAL_DOURADA], undefined)
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: c, corpo: {} })
  assert.ok((await lerPerfil(env, c)).insignias[INSIGNIA_NATAL_DOURADA])
  // ativou antes e jogou a primeira partida depois da meta: recebe
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: semJogar, corpo: {} })
  assert.equal((await lerPerfil(env, semJogar))?.insignias?.[INSIGNIA_NATAL_DOURADA], undefined)
  await enviar(pedir, 'neura/md1/depois', partida('de_dust2', meiaNoiteHoje() + 60000, time))
  assert.ok((await lerPerfil(env, semJogar)).insignias[INSIGNIA_NATAL_DOURADA])
  // uma insígnia dourada por conta, mesmo sincronizando de novo
  await pedir('GET', '/eventos/natal-2026/eu', { quem: a })
  const notifs = (await env.LOJA.instancia(a).ctx.storage.get('notifs')).lista.filter((n) => n.id === `ins:${INSIGNIA_NATAL_DOURADA}`)
  assert.equal(notifs.length, 1)
})

test('artes do evento existem nas versões leves usadas pelo site', () => {
  const site = new URL('../../../public', import.meta.url)
  for (const arte of [ARTES_NATAL.estrela, ARTES_NATAL.estrelaGrande, ARTES_NATAL.caixa, ARTES_NATAL.insignia, ARTES_NATAL.insigniaDourada, ARTES_NATAL.banner, `/assets/insignia/mini/${INSIGNIA_NATAL}.webp`, `/assets/insignia/mini/${INSIGNIA_NATAL_DOURADA}.webp`, '/assets/caixas/web/presente-da-neura.webp']) {
    assert.ok(fs.statSync(new URL(`.${arte}`, `${site}/`)).size > 0, arte)
  }
})

test('cron confere partidas recentes que não passaram pelo registro do evento (sem duplicar)', async () => {
  const { pedir, env } = ambiente()
  const { conferirNatal } = await import('../src/natal-2026.js')
  const time = ids(10, 76561198000009000n)
  await configurar(pedir, configEm(2))
  await pedir('POST', '/eventos/natal-2026/ativar', { quem: time[0], corpo: {} })
  // a partida chegou ao worker (lista de recentes e dados), mas o passo do evento falhou
  const p = partida('de_inferno', meiaNoiteHoje() + 60000, time)
  await mudarDoc(env, 'partida-dados:neura/md1/cron1', () => p, {})
  await mudarDoc(env, 'partidas-recentes', (l) => [{ caminho: 'neura/md1/cron1' }, ...l], [])
  assert.equal(await saldoDe(pedir, time[0]), 10)
  await conferirNatal(env)
  await conferirNatal(env)
  const r = await pedir('GET', '/eventos/natal-2026/eu', { quem: time[0] })
  assert.equal(r.dados.jogador.saldo, 25); assert.equal(r.dados.meta.atual, 1)
})
