import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { estadoDiario, PONTOS_DIARIOS } from '../src/diario-core.js'
import { pedirAoJogador } from '../src/objetos.js'
const id='76561198000000941'

test('sequência diária usa meia-noite de Brasília, reinicia após falta e repete ciclo de 7',()=>{
 const antes=estadoDiario({},Date.parse('2026-10-28T02:59:59Z'))
 const depois=estadoDiario({},Date.parse('2026-10-28T03:00:00Z'))
 assert.equal(depois.dia,antes.dia+1)
 assert.equal(estadoDiario({pontosDia:depois.dia-1,sequencia:6},depois.agora).pontos,200)
 assert.equal(estadoDiario({pontosDia:depois.dia-1,sequencia:7},depois.agora).sequencia,1)
 assert.equal(estadoDiario({pontosDia:depois.dia-2,sequencia:6},depois.agora).sequencia,1)
 assert.deepEqual(PONTOS_DIARIOS,[20,30,40,60,80,100,200])
})

test('resgate de NP concorrente só credita uma vez e mantém recibo/notificação',async()=>{
 const {pedir,env}=ambiente()
 const chamadas=await Promise.all(Array.from({length:8},()=>pedir('POST','/loja/diario/pontos',{quem:id,corpo:{pontos:999999,dia:0}})))
 assert.ok(chamadas.every(r=>r.status===200))
 assert.equal(chamadas.filter(r=>r.dados.recebido).length,1)
 assert.equal((await pedir('GET','/loja/saldo',{quem:id})).dados.saldo,20)
 assert.equal((await pedir('GET','/loja/diario',{quem:id})).dados.pontosResgatados,true)
 const n=await pedirAoJogador(env,id,{acao:'notif-sync'})
 assert.equal(n.doc.lista.filter(n=>n.id.startsWith('diario-pontos:')).length,1)
 assert.equal((await pedir('POST','/loja/diario/pontos',{corpo:{}})).status,401)
})

test('caixa diária entrega uma unidade, só abre com estoque e não aceita compra ilimitada',async()=>{
 const {pedir,env}=ambiente()
 const resultados=await Promise.all(Array.from({length:6},()=>pedir('POST','/loja/diario/caixa',{quem:id,corpo:{qtd:100}})))
 assert.equal(resultados.filter(r=>r.dados.recebido).length,1)
 const caixa=resultados[0].dados.caixa
 let inv=(await pedirAoJogador(env,id,{acao:'inv-ler'})).inv
 assert.equal(Object.values(inv.itens).filter(i=>i.t==='caixa'&&i.d===caixa.id).length,1)
 assert.notEqual((await pedir('POST','/loja/comprar',{quem:id,corpo:{caixa:caixa.id,qtd:1}})).status,200)
 const abertura=await pedir('POST','/loja/abrir',{quem:id,corpo:{caixa:caixa.id,qtd:1,origem:'direto'}})
 assert.equal(abertura.status,200)
 assert.equal(abertura.dados.resultados.length,1)
 assert.notEqual((await pedir('POST','/loja/abrir',{quem:id,corpo:{caixa:caixa.id,qtd:1}})).status,200)
 assert.equal((await pedir('GET','/loja/diario',{quem:id})).dados.caixasDisponiveis,0)
 const pagina=(await pedir('GET','/loja',{quem:id})).dados.caixas.find(c=>c.slug==='caixa-diaria')
 assert.ok(pagina?.foraDeVenda, 'mantém a página da caixa após consumir a unidade para não desmontar a roleta')
 assert.equal((await pedir('GET','/loja/saldo',{quem:id})).dados.saldo,0)
})
