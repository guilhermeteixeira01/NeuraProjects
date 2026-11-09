import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento } from './ambiente.mjs'
import { Presenca } from '../src/amigos.js'
import { DEFAULT_POOL } from '../../../src/paginas/neurapick/data/maps.js'
import { buildSteps, deriveState } from '../../../src/paginas/neurapick/data/veto.js'

async function sala(formato) {
 const ids=Array.from({length:10},(_,i)=>String(76561198000000010n+BigInt(i)))
 const usuarios=Object.fromEntries(ids.map((id,i)=>[id,{nome:'Jogador '+i,avatar:''}]))
 const {env,pedir}=ambiente({usuarios});env.SERVIDOR_CONECTAR='servidor.test:27015'
 const storage=armazenamento()
 const objeto=new Presenca({storage,setWebSocketAutoResponse(){},getWebSockets:()=>[],getWebSocketAutoResponseTimestamp:()=>null},env)
 env.PRESENCA={idFromName:()=> 'global',get:()=>({fetch:(url,init)=>objeto.fetch(new Request(url,init))})}
 const partida={id:'teste-veto',fase:'aceitar',prazo:Date.now()+30000,times:{A:{lider:ids[0],membros:ids.slice(0,5)},B:{lider:ids[5],membros:ids.slice(5)}},aceitos:[],formato,pool:[...DEFAULT_POOL],primeiro:'A',historico:[]}
 await storage.put('partidas',{[partida.id]:partida})
 await storage.put('lobbies',Object.fromEntries([0,5].map(i=>[ids[i],{membros:ids.slice(i+1,i+5),convites:[],publico:false,busca:null}])))
 for(const quem of ids){const r=await pedir('POST','/lobby',{quem,corpo:{acao:'aceitar'}});assert.equal(r.status,200,JSON.stringify(r.dados))}
 return {ids,storage,objeto,pedir}
}
for(const formato of ['bo1','bo3'])test('5x5 '+formato+': dez aceites, veto, entrega unica e confirmacao do servidor',async()=>{
 const {ids,pedir}=await sala(formato)
 let p=(await pedir('GET','/lobby',{quem:ids[0]})).dados.partida
 assert.equal(p.fase,'veto')
 for(const passo of buildSteps(formato,'A')){
  const valor=passo.type==='side'?{lado:'ct'}:{mapa:deriveState(p.pool,p.historico).remaining[0]}
  const r=await pedir('POST','/lobby',{quem:ids[passo.team==='A'?0:5],corpo:{acao:'veto',valor}})
  assert.equal(r.status,200,JSON.stringify(r.dados));p=r.dados.partida
 }
 assert.equal(p.fase,'pronto');assert.equal(p.servidor.estado,'fila')
 assert.equal((await pedir('POST','/servidor/proxima',{corpo:{}})).status,401)
 const cabecalhos={Authorization:'Bearer token-servidor'}
 const r=await pedir('POST','/servidor/proxima',{corpo:{},cabecalhos})
 assert.equal(r.status,200,JSON.stringify(r.dados));assert.equal(r.dados.partidaId,p.id)
 assert.equal(r.dados.mapas.length,formato==='bo1'?1:3);assert.equal(Object.keys(r.dados.elenco).length,10)
 assert.equal((await pedir('GET','/lobby',{quem:ids[0]})).dados.partida.servidor.estado,'entregue')
 assert.equal((await pedir('POST','/servidor/proxima',{corpo:{},cabecalhos})).dados.nenhuma,true)
 assert.equal((await pedir('POST','/servidor/estado',{corpo:{partidaId:p.id,estado:'carregada'},cabecalhos})).status,200)
 assert.equal((await pedir('GET','/lobby',{quem:ids[0]})).dados.partida.servidor.estado,'carregada')
})

// ── Fila mista (solo a 5): grupos sorteados em dois times de 5 ──
import { escolherGrupos } from '../src/amigos.js'

async function fila(tamanhos) {
 const total=tamanhos.reduce((s,n)=>s+n,0)
 const ids=Array.from({length:total},(_,i)=>String(76561198000000100n+BigInt(i)))
 const usuarios=Object.fromEntries(ids.map((id,i)=>[id,{nome:'Jogador '+i,avatar:''}]))
 const {env,pedir}=ambiente({usuarios});env.EXIGIR_SERVIDOR_LIVRE='0'
 const storage=armazenamento()
 const objeto=new Presenca({storage,setWebSocketAutoResponse(){},getWebSockets:()=>[],getWebSocketAutoResponseTimestamp:()=>null,setAlarm(){},deleteAlarm(){}},env)
 env.PRESENCA={idFromName:()=> 'global',get:()=>({fetch:(url,init)=>objeto.fetch(new Request(url,init))})}
 const grupos=[];let i=0
 for(const n of tamanhos){grupos.push(ids.slice(i,i+n));i+=n}
 await storage.put('lobbies',Object.fromEntries(grupos.filter(g=>g.length>1).map(g=>[g[0],{membros:g.slice(1),convites:[],publico:false,busca:null}])))
 return {ids,grupos,pedir,storage}
}

test('escolherGrupos: prioriza a fila e nao separa grupos',()=>{
 const tam={a:2,b:2,c:3,d:3,e:4}
 assert.deepEqual(escolherGrupos(['a','b','c','d'],l=>tam[l]),['a','b','c','d'])
 assert.equal(escolherGrupos(['a','b','e'],l=>tam[l]),null) // 2+2+4 = 8
 assert.equal(escolherGrupos(['e','a','b','e2'],l=>({...tam,e2:2})[l]),null) // 4+2+2+2: nao divide 5/5
 assert.equal(escolherGrupos(Array.from({length:9},(_,i)=>'s'+i),()=>1),null)
 assert.equal(escolherGrupos(Array.from({length:30},(_,i)=>'s'+i),()=>1).length,10)
})

test('dez solos buscando viram uma partida 5x5 e a fila conta os jogadores',async()=>{
 const {ids,pedir}=await fila(Array(10).fill(1))
 for(const [k,quem] of ids.entries()){
  const r=await pedir('POST','/lobby',{quem,corpo:{acao:'buscar',valor:{formato:'bo1'}}})
  assert.equal(r.status,200,JSON.stringify(r.dados))
  if(k<9){assert.equal(r.dados.partida,null);assert.equal(r.dados.fila.bo1,k+1)}
 }
 const p=(await pedir('GET','/lobby',{quem:ids[0]})).dados
 assert.equal(p.partida.fase,'aceitar');assert.equal(p.fila.bo1,0)
 assert.equal(p.partida.times.A.membros.length,5);assert.equal(p.partida.times.B.membros.length,5)
 assert.deepEqual([...p.partida.times.A.membros,...p.partida.times.B.membros].map(x=>x.id).sort(),[...ids].sort())
})

test('grupos 3+2+2+3 ficam juntos no mesmo time',async()=>{
 const {grupos,pedir}=await fila([3,2,2,3])
 for(const g of grupos){const r=await pedir('POST','/lobby',{quem:g[0],corpo:{acao:'buscar',valor:{formato:'bo1'}}});assert.equal(r.status,200,JSON.stringify(r.dados))}
 const p=(await pedir('GET','/lobby',{quem:grupos[0][0]})).dados.partida
 const timeDe=id=>p.times.A.membros.some(m=>m.id===id)?'A':'B'
 for(const g of grupos)assert.equal(new Set(g.map(timeDe)).size,1)
 for(const t of ['A','B'])assert.equal(p.times[t].membros.length,5)
 // capitao = lider do maior grupo do time (os trios)
 assert.ok([grupos[0][0],grupos[3][0]].includes(p.times.A.lider));assert.ok([grupos[0][0],grupos[3][0]].includes(p.times.B.lider))
})

test('recusa: quem aceitou volta para a fila, quem recusou sai',async()=>{
 const {ids,pedir,storage}=await fila(Array(10).fill(1))
 for(const quem of ids)await pedir('POST','/lobby',{quem,corpo:{acao:'buscar',valor:{formato:'bo1'}}})
 for(const quem of ids.slice(0,9))await pedir('POST','/lobby',{quem,corpo:{acao:'aceitar'}})
 const r=await pedir('POST','/lobby',{quem:ids[9],corpo:{acao:'recusar-partida'}})
 assert.equal(r.status,200,JSON.stringify(r.dados));assert.equal(r.dados.partida,null);assert.equal(r.dados.busca,null)
 assert.equal(r.dados.fila.bo1,9)
 const lobbies=await storage.get('lobbies')
 assert.ok(ids.slice(0,9).every(id=>lobbies[id]?.busca))
})
