import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento } from './ambiente.mjs'
import { Presenca } from '../src/amigos.js'
const a='76561198000000011', b='76561198000000012'
const usuarios={ [a]:{nome:'Jogador A',avatar:''}, [b]:{nome:'Jogador B',avatar:''} }
test('pedidos de amizade, convite e recusa de lobby aparecem já na próxima leitura com nomes', async()=>{
 const {pedir,env}=ambiente({usuarios})
 const state={storage:armazenamento(),setWebSocketAutoResponse(){},getWebSockets:(id)=>id?[{deserializeAttachment:()=>({id,st:'online',ts:Date.now()}),send(){}}]:[],getWebSocketAutoResponseTimestamp:()=>null}
 const objeto=new Presenca(state,env)
 env.PRESENCA={idFromName:()=> 'global',get:()=>({fetch:(url,init)=>objeto.fetch(new Request(url,init))})}
 let r=await pedir('POST','/amigos',{quem:a,corpo:{acao:'pedir',id:b}})
 assert.equal(r.status,200)
 r=await pedir('GET','/amigos',{quem:b})
 assert.equal(r.dados.recebidos[0].nome,'Jogador A')
 await pedir('POST','/amigos',{quem:b,corpo:{acao:'aceitar',id:a}})
 r=await pedir('POST','/lobby',{quem:a,corpo:{acao:'convidar',id:b}})
 assert.equal(r.status,200)
 r=await pedir('GET','/lobby',{quem:b})
 assert.equal(r.dados.convitesRecebidos[0].lider.nome,'Jogador A')
 await pedir('POST','/lobby',{quem:b,corpo:{acao:'recusar',id:a}})
 r=await pedir('GET','/lobby',{quem:b})
 assert.deepEqual(r.dados.convitesRecebidos,[])
})
test('sincronizar presença devolve estado atualizado sem abrir outro WebSocket',async()=>{
 const objeto=Object.create(Presenca.prototype), enviados=[]
 objeto.estadoPara=async(id)=>({tipo:'estado',status:{[b]:{st:'ausente'}},id})
 objeto.enviar=(id,dados)=>enviados.push({id,dados})
 await objeto.webSocketMessage({deserializeAttachment:()=>({id:a,st:'online'})},'sincronizar')
 assert.equal(enviados[0].id,a)
 assert.equal(enviados[0].dados.status[b].st,'ausente')
})
test('buscar nomes fora da fila não bloqueia o próximo convite',async()=>{
 const {env}=ambiente({usuarios})
 const objeto=new Presenca({storage:armazenamento(),setWebSocketAutoResponse(){},getWebSockets:()=>[],getWebSocketAutoResponseTimestamp:()=>null},env)
 let liberar, iniciou
 const aguardando=new Promise(r=>iniciou=r)
 objeto.comNomes=async(dados)=>{iniciou();await new Promise(r=>liberar=r);return dados}
 const resposta=objeto.fetch(new Request('https://presenca/lobby',{headers:{'X-Id':a}}))
 await aguardando
 let executou=false
 await objeto.exclusivo(async()=>{executou=true})
 assert.equal(executou,true)
 liberar();assert.equal((await resposta).status,200)
})

test('status público usa contato autenticado do plugin e não aceita uma chamada sem token como prova',async()=>{
 const {pedir}=ambiente({usuarios})
 let r=await pedir('GET','/status/cs2')
 assert.equal(r.dados.servidor.online,null)
 r=await pedir('POST','/servidor/proxima',{corpo:{}})
 assert.equal(r.status,401)
 assert.equal((await pedir('GET','/status/cs2')).dados.servidor.online,null)
 r=await pedir('POST','/servidor/proxima',{corpo:{},cabecalhos:{Authorization:'Bearer token-servidor'}})
 assert.equal(r.status,200)
 r=await pedir('GET','/status/cs2')
 assert.equal(r.dados.servidor.online,true)
 assert.equal(r.dados.servidor.fonte,'plugin')
})
