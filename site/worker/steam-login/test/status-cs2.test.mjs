import test from 'node:test'
import assert from 'node:assert/strict'
import { criarConsultaStatusCs2 } from '../src/status-cs2.js'
const env={CS2_AGENTE_URL:'https://agente.test',CS2_AGENTE_TOKEN:'token-de-teste'}
const base={consultarNota:async()=>null,consultarSinal:async()=>0}
test('timeout inicial, erro HTTP e estado desconhecido não confirmam offline ou manutenção',async()=>{
 for(const consultar of [async()=>{throw Error('timeout')},async()=>({status:503,dados:{}}),async()=>({status:200,dados:{estado:'desconhecido'}})]){
  const ler=criarConsultaStatusCs2({...base,consultar})
  const {servidor}=await ler(env)
  assert.equal(servidor.online,null);assert.equal(servidor.atualizando,false);assert.equal(servidor.consultaFalhou,true)
 }
})
test('falha transitória preserva a última confirmação e expira sem inventar manutenção',async()=>{
 let tempo=100000, falhar=false
 const ler=criarConsultaStatusCs2({...base,agora:()=>tempo,consultar:async()=>{if(falhar)throw Error('rede');return {status:200,dados:{estado:'rodando'}}}})
 assert.equal((await ler(env)).servidor.online,true)
 falhar=true;tempo+=10000
 let r=(await ler(env)).servidor
 assert.equal(r.online,true);assert.equal(r.desatualizado,true);assert.equal(r.atualizando,false)
 tempo+=100000;r=(await ler(env)).servidor
 assert.equal(r.online,null);assert.equal(r.verificadoEm,100000)
})
test('offline confirmado e atualização confirmada são estados diferentes; recuperação não fica presa no cache',async()=>{
 let tempo=100000, estado='parado'
 const ler=criarConsultaStatusCs2({...base,agora:()=>tempo,consultar:async()=>({status:200,dados:{estado}})})
 let r=(await ler(env)).servidor;assert.equal(r.online,false);assert.equal(r.atualizando,false)
 estado='atualizando';tempo+=3001;r=(await ler(env)).servidor;assert.equal(r.atualizando,true)
 estado='rodando';tempo+=3001;r=(await ler(env)).servidor;assert.equal(r.online,true);assert.equal(r.desatualizado,false)
})
test('consultas concorrentes compartilham o pedido e notícias lentas não atrasam status',async()=>{
 let liberar, fimNoticia, chamadas=0
 const pendente=new Promise(r=>liberar=r), noticia=new Promise(r=>fimNoticia=r)
 const ler=criarConsultaStatusCs2({...base,consultarNota:()=>noticia,consultar:()=>{chamadas++;return pendente}})
 const tarefas=[];const ctx={waitUntil:p=>tarefas.push(p)}
 const a=ler(env,ctx),b=ler(env,ctx)
 liberar({status:200,dados:{estado:'rodando'}})
 assert.equal((await a).servidor.online,true);assert.equal((await b).servidor.online,true);assert.equal(chamadas,1)
 fimNoticia(null);await Promise.all(tarefas)
})
test('sinal autenticado do plugin confirma online mesmo quando o agente reiniciou ou falhou',async()=>{
 for(const consultar of [async()=>({status:200,dados:{estado:'parado'}}),async()=>{throw Error('agente sem resposta')}]){
  const ler=criarConsultaStatusCs2({...base,agora:()=>100000,consultarSinal:async()=>99000,consultar})
  const r=(await ler(env)).servidor
  assert.equal(r.online,true);assert.equal(r.fonte,'plugin');assert.equal(r.desatualizado,false)
 }
})
test('sinal antigo do plugin não esconde parada real',async()=>{
 const ler=criarConsultaStatusCs2({...base,agora:()=>100000,consultarSinal:async()=>1000,consultar:async()=>({status:200,dados:{estado:'parado'}})})
 assert.equal((await ler(env)).servidor.online,false)
})
