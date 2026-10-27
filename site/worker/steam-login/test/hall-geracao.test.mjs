import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'
import { mudarDoc } from '../src/dados.js'
const worker = (await import('../src/index.js')).default
const A='76561198000000911', B='76561198000000912'
const { foto, binario, retornoImagem, referencia, simularAI } = await import('./hall-fixture.mjs')
let aiAtual
const chave='chave-simulada-nao-e-real'

async function fixture() {
 const a=ambiente();a.env.AI={run:(...args)=>aiAtual.run(...args)}
 const enviar=async(camisa='escura')=>{
  const r=await a.pedir('POST','/hall',{quem:A,corpo:{foto,camisa}});assert.equal(r.status,200);return r.dados.pedido
 }
 const aprovar=(pedido)=>a.pedir('POST','/hall/revisao',{quem:DONO,corpo:{id:A,pedido,acao:'aprovar'}})
 const estado=async()=>(await a.pedir('GET','/hall',{quem:A})).dados
 return {...a,enviar,aprovar,estado,ator:()=>a.env.HALL_RETRATOS.instancia(A)}
}
async function comApi(fn,provedor=async()=>Response.json(retornoImagem)) {
 const anterior=globalThis.fetch, chamadas=[]
 globalThis.fetch=async(url,init)=>{
  const u=String(url)
  if(u.includes('/assets/hall/'))return new Response(referencia,{headers:{'Content-Type':'image/png'}})
  return anterior(url,init)
 }
 aiAtual=simularAI(chamadas,provedor)
 try {return await fn(chamadas)}finally{globalThis.fetch=anterior;aiAtual=null}
}

test('gera somente após admin aprovar; salva imagem binária e publica no Hall sem expor original/chave',async()=>{
 const f=await fixture(), pedido=await f.enviar('clara')
 await comApi(async chamadas=>{
  await f.ator().alarm();assert.equal(chamadas.length,0)
  assert.equal((await f.pedir('POST','/hall/revisao',{quem:B,corpo:{id:A,pedido,acao:'aprovar'}})).status,403)
  assert.equal((await f.aprovar(pedido)).status,200)
  assert.equal((await f.estado()).estado,'fila');assert.equal((await f.pedir('GET','/hall/publico?id='+A)).dados.foto,null)
  assert.ok(await f.ator().ctx.storage.getAlarm())
  await f.ator().alarm();assert.equal(chamadas.length,1)
  const form=chamadas[0].body
  assert.equal(form.get('width'),'768');assert.equal(form.get('height'),'1152');assert.equal(form.get('seed'),'114702')
  assert.ok(form.get('input_image_0'));assert.ok(form.get('input_image_1'));assert.equal(chamadas[0].model,'@cf/black-forest-labs/flux-2-klein-4b')
  assert.match(form.get('prompt'),/facial identity/)
  const d=await f.estado();assert.equal(d.estado,'aprovada');assert.equal(d.camisaAprovada,'clara');assert.equal(d.original,undefined)
  const p=(await f.pedir('GET','/hall/publico?id='+A)).dados
  assert.equal(p.foto,d.aprovada);assert.equal(p.montada,true);assert.equal(p.original,undefined);assert.ok(!JSON.stringify(p).includes(chave))
  const r=await worker.fetch(new Request(d.aprovada),f.env,{waitUntil(){}})
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/png')
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),binario)
  assert.equal((await f.pedir('GET','/hall/revisao',{quem:DONO})).dados.pedidos.length,0)
 })
})

test('aprovação e alarmes concorrentes geram uma única chamada',async()=>{
 const f=await fixture(),pedido=await f.enviar()
 await Promise.all([f.aprovar(pedido),f.aprovar(pedido),f.aprovar(pedido)])
 assert.equal((await f.estado()).tentativasGeracao,1)
 await comApi(async chamadas=>{await Promise.all([f.ator().alarm(),f.ator().alarm()]);await f.ator().alarm();assert.equal(chamadas.length,1)})
 assert.equal((await f.aprovar(pedido)).status,409)
})

test('sem binding AI não agenda, não publica original e não gasta tentativa',async()=>{
 const f=await fixture(),pedido=await f.enviar();delete f.env.AI
 assert.equal((await f.aprovar(pedido)).status,503)
 const d=await f.estado();assert.equal(d.estado,'pendente');assert.equal(d.tentativasGeracao,0)
 assert.equal((await f.pedir('GET','/hall/publico?id='+A)).dados.foto,null)
 assert.equal((await f.pedir('GET','/hall/revisao',{quem:DONO})).dados.geracaoDisponivel,false)
})

test('revisão antiga não aprova uma foto substituída e trabalho antigo não gera',async()=>{
 const f=await fixture(),antigo=await f.enviar();await f.aprovar(antigo)
 const novo=await f.enviar('clara')
 assert.equal((await f.aprovar(antigo)).status,409)
 await comApi(async chamadas=>{await f.ator().alarm();assert.equal(chamadas.length,0)})
 assert.equal((await f.estado()).pedido,novo);assert.equal((await f.estado()).estado,'pendente')
})

test('foto substituída durante geração não recebe o retrato antigo',async()=>{
 const f=await fixture(),antigo=await f.enviar();await f.aprovar(antigo)
 let novo
 await comApi(async chamadas=>{await f.ator().alarm();assert.equal(chamadas.length,1)},async()=>{novo=await f.enviar('clara');return Response.json(retornoImagem)})
 const d=await f.estado();assert.equal(d.pedido,novo);assert.equal(d.estado,'pendente');assert.equal(d.aprovada,undefined)
 assert.equal((await f.ator().imagem(antigo)).status,404)
})

test('falha da API preserva o card anterior; nova tentativa exige aprovação explícita',async()=>{
 const f=await fixture(),primeiro=await f.enviar();await f.aprovar(primeiro)
 await comApi(async()=>f.ator().alarm())
 const anterior=(await f.estado()).aprovada
 const segundo=await f.enviar('clara');await f.aprovar(segundo)
 await comApi(async chamadas=>{await f.ator().alarm();await f.ator().alarm();assert.equal(chamadas.length,1)},async()=>new Response('{}',{status:429}))
 let d=await f.estado();assert.equal(d.estado,'falhou');assert.equal(d.aprovada,anterior)
 assert.equal((await f.aprovar(segundo)).status,200)
 await comApi(async()=>f.ator().alarm())
 d=await f.estado();assert.equal(d.estado,'aprovada');assert.notEqual(d.aprovada,anterior)
 assert.equal((await f.ator().imagem(primeiro)).status,404)
})

test('publicação interrompida retoma a imagem salva sem cobrar outra geração',async()=>{
 const f=await fixture(),pedido=await f.enviar();await f.aprovar(pedido)
 const get=f.env.DADOS.get.bind(f.env.DADOS)
 let falhar=true
 f.env.DADOS.get=id=>{const stub=get(id);return{fetch:async(url,init)=>{
  const c=JSON.parse(init.body)
  if(falhar&&c.acao==='gravar'&&c.mudancas?.some(m=>m.id===`hall:${A}`&&m.dados&&JSON.parse(m.dados).estado==='aprovada')){falhar=false;throw new Error('publicação interrompida no teste')}
  return stub.fetch(url,init)
 }}}
 await comApi(async chamadas=>{
  await assert.rejects(f.ator().alarm());assert.equal((await f.ator().ctx.storage.get('trabalho')).estado,'pronto')
  await f.ator().alarm();assert.equal(chamadas.length,1)
 })
 assert.equal((await f.estado()).estado,'aprovada')
})

test('interrupção durante processamento exige nova revisão, sem regenerar sozinha',async()=>{
 const f=await fixture(),pedido=await f.enviar();await f.aprovar(pedido)
 const trabalho=await f.ator().ctx.storage.get('trabalho')
 await f.ator().ctx.storage.put('trabalho',{...trabalho,estado:'gerando'})
 await mudarDoc(f.env,`hall:${A}`,d=>({...d,estado:'gerando'}),{})
 await comApi(async chamadas=>{await f.ator().alarm();assert.equal(chamadas.length,0)})
 assert.equal((await f.estado()).estado,'falhou')
})

test('retratos respeitam privacidade; upload e campos extras não publicam sem aprovação',async()=>{
 const f=await fixture(),pedido=await f.enviar()
 assert.equal((await f.pedir('POST','/hall/revisao',{quem:DONO,corpo:{id:A,pedido,acao:'aprovar',foto}})).status,400)
 await f.aprovar(pedido);await comApi(async()=>f.ator().alarm())
 const d=await f.estado(),path=new URL(d.aprovada).pathname+new URL(d.aprovada).search
 await f.pedir('POST','/conta/dados',{quem:A,corpo:{privacidade:{perfil:'ninguem'}}})
 assert.equal((await f.pedir('GET',path)).status,403)
 assert.equal((await f.pedir('GET',path,{quem:B})).status,403)
 assert.equal((await f.pedir('GET',path,{quem:A})).status,200)
})

test('recusa informa motivo e não chama a API; limite de três tentativas protege cobranças',async()=>{
 const f=await fixture(),pedido=await f.enviar()
 assert.equal((await f.pedir('POST','/hall/revisao',{quem:DONO,corpo:{id:A,pedido,acao:'reprovar',motivo:'Envie uma foto de frente.'}})).status,200)
 assert.equal((await f.estado()).motivo,'Envie uma foto de frente.')
 assert.equal((await f.aprovar(pedido)).status,409)
 const novo=await f.enviar()
 await comApi(async chamadas=>{
  for(let i=0;i<3;i++){assert.equal((await f.aprovar(novo)).status,200);await f.ator().alarm()}
  assert.equal((await f.aprovar(novo)).status,409);assert.equal(chamadas.length,3)
 },async()=>new Response('{}',{status:500}))
})
