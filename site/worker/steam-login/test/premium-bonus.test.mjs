import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { mudar } from '../src/dados.js'
import { BONUS_PREMIUM_PARTIDA } from '../src/loja-core.js'
const A='76561198000000841'
const mapas=[{k:'partida-1',ts:Date.now()-3600000},{k:'partida-2',ts:Date.now()-7200000}]
const ator=f=>f.env.LOJA.instancia(A)
const credito=a=>a.sql.exec("SELECT COALESCE(SUM(valor),0) AS v FROM movimentos WHERE motivo = 'Premium: bônus de partida'").one().v * -1 || 0

test('cada mapa Premium paga uma vez e gera notificação não lida com valor',async()=>{
  const f=ambiente(),a=ator(f)
  await Promise.all([a.fila.rodar(()=>a.aplicarPremium(mapas,A)),a.fila.rodar(()=>a.aplicarPremium([...mapas,mapas[0]],A))])
  assert.equal(credito(a),2*BONUS_PREMIUM_PARTIDA)
  const n=(await a.ctx.storage.get('notifs')).lista
  assert.equal(n.length,2);assert.ok(n.every(x=>x.lida===false&&x.titulo.includes('+350 NP')&&x.texto.includes('já está no seu saldo')))
})

test('finalizar mapa entrega Premium e pontos base antes do deploy, sem duplicar após publicação', async () => {
  const f = ambiente(), agora = Date.now(), caminho = 'org/md1/instantaneo'
  await mudar(f.env, 'perfis', [A], p => { p[A] = { sub: { inicio: agora - 86400000, expira: agora + 86400000 } } })
  const d = new Date(agora - 3600000 - 3 * 3600000).toISOString()
  const inicio = `${d.slice(0, 10)} ${d.slice(11, 16)}`
  const corpo = { caminho, item: { data: inicio, mapa: 'de_nuke' }, partida: { inicio, mapa: 'de_nuke', placarA: 13, placarB: 7, jogadores: [{ steamId: A, time: 'A', rounds: 20, kills: 10, mortes: 5, rating: 1.6 }] } }
  const enviar = () => f.pedir('POST', '/servidor/partida', { corpo, cabecalhos: { Authorization: 'Bearer token-servidor' } })
  assert.equal((await enviar()).status, 200)
  assert.equal(credito(ator(f)), 350)
  assert.equal((await f.pedir('GET', '/loja/saldo', { quem: A })).dados.saldo, 450)
  const recibos = (await f.pedir('GET', '/loja/premium-partidas', { quem: A })).dados
  assert.equal(recibos.partidas[caminho], 350)
  assert.equal(recibos.recentes[0].pontos, 100)
  await enviar()
  assert.equal((await f.pedir('GET', '/loja/saldo', { quem: A })).dados.saldo, 450)
  const anterior = globalThis.fetch
  globalThis.fetch = async (url, ...args) => String(url).includes(`/perfil/historico/${A}.json`)
    ? Response.json([{ caminho, data: inicio, pontos: 100, xpTotal: 160, mapasAte: 1 }]) : anterior(url, ...args)
  try {
    assert.equal((await f.pedir('GET', '/loja/saldo', { quem: A })).dados.saldo, 450)
    assert.equal(credito(ator(f)), 350)
  } finally { globalThis.fetch = anterior }
})

test('painel e estatísticas consultam recibos próprios mesmo após vencer o Premium, sem duplicar crédito',async()=>{
  const f=ambiente(),a=ator(f)
  await a.aplicarPremium(mapas,A)
  const r=await f.pedir('GET','/loja/premium-partidas',{quem:A})
  assert.equal(r.status,200)
  assert.deepEqual(r.dados.partidas,{'partida-1':350,'partida-2':350})
  const outro=await f.pedir('GET','/loja/premium-partidas',{quem:'76561198000000842'})
  assert.equal(outro.status,200)
  assert.deepEqual(outro.dados.partidas,{})
  assert.equal(credito(a),700)
})

test('crédito e recibo revertem juntos se a transação falhar',async()=>{
  const f=ambiente(),a=ator(f),mov=a.movimentar.bind(a)
  a.movimentar=(...args)=>{mov(...args);throw Error('falha no crédito')}
  await assert.rejects(a.aplicarPremium(mapas,A))
  assert.equal(credito(a),0);assert.equal(a.sql.exec('SELECT COUNT(*) AS n FROM premium_partidas').one().n,0)
  a.movimentar=mov;await a.aplicarPremium(mapas,A)
  assert.equal(credito(a),700)
})

test('aviso interrompido é retomado sem repetir o crédito nem duplicar notificação',async()=>{
  const f=ambiente(),a=ator(f),notificar=a.notificar.bind(a)
  a.notificar=async n=>{await notificar(n);throw Error('falha depois do aviso')}
  await assert.rejects(a.aplicarPremium([mapas[0]],A));assert.equal(credito(a),350)
  a.notificar=notificar;await a.aplicarPremium([mapas[0]],A)
  assert.equal(credito(a),350);assert.equal((await a.ctx.storage.get('notifs')).lista.length,1)
  assert.equal(a.sql.exec('SELECT notificada FROM premium_partidas').one().notificada,1)
})

test('migração respeita bônus antigos e não paga partidas já recebidas',async()=>{
  const f=ambiente(),a=ator(f)
  await a.ctx.storage.put('premiumFeitas',['partida-1'])
  await a.aplicarPremium(mapas,A)
  assert.equal(credito(a),350)
  await a.aplicarPremium(mapas,A);assert.equal(credito(a),350)
})

test('abrir notificações entrega bônus elegíveis por período e suporta datas com e sem fuso',async()=>{
  const f=ambiente(),agora=Date.now(),inicio=agora-86400000,expira=agora+86400000
  await mudar(f.env,'perfis',[A],p=>{p[A]={sub:{inicio,expira,meses:1}}})
  const data=agora-3600000
  const h=[
    {caminho:'iso',data:new Date(data).toISOString()},
    {caminho:'brasilia',data:new Date(data-3*3600000).toISOString().slice(0,19).replace('T',' ')},
    {caminho:'numero',data},
    {caminho:'iso',data:new Date(data).toISOString()},
    {caminho:'antes',data:inicio-1000},{caminho:'depois',data:expira+1000},
    {caminho:'futura',data:agora+1000},{caminho:'invalida',data:'erro'},
  ]
  const fetchAntes=globalThis.fetch
  globalThis.fetch=async(url,...args)=>String(url).endsWith(`/perfil/historico/${A}.json`)?Response.json(h):fetchAntes(url,...args)
  try {
    const n=await f.pedir('GET','/notificacoes',{quem:A});assert.equal(n.status,200);assert.equal(n.dados.doc.lista.length,3)
    assert.equal(credito(ator(f)),1050)
    await f.pedir('GET','/notificacoes',{quem:A});assert.equal(credito(ator(f)),1050)
    await mudar(f.env,'perfis',[A],p=>{p[A]={}})
    h.push({caminho:'sem-premium',data})
    await f.pedir('GET','/notificacoes',{quem:A});assert.equal(credito(ator(f)),1050)
  } finally {globalThis.fetch=fetchAntes}
})
