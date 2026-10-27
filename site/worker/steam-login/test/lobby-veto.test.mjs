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
