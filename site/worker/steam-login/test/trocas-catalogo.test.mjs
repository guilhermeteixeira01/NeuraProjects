import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'
const A='76561198000000821',B='76561198000000822',senha='senha-segura-123'
async function fixture(){
 const f=ambiente()
 for(const quem of [A,B]){await f.pedir('GET','/eu',{quem});await f.pedir('POST','/conta/senha',{quem,corpo:{senha}})}
 const dar=async item=>(await f.pedir('POST','/admin/skin',{quem:DONO,corpo:{id:A,item}})).dados.id
 const propor=async ids=>f.pedir('POST','/trocas',{quem:A,corpo:{para:B,dar:ids,pedir:[],senha}})
 const inventario=async()=>(await f.pedir('GET',`/skins/inventario?id=${A}&troca=1`,{quem:A})).dados.itens
 const equipar=async id=>{const inv=(await f.pedir('GET','/skins',{quem:A})).dados;inv.equip.tr[inv.itens[id].t==='arma'?String(inv.itens[id].d):inv.itens[id].t]=id;assert.equal((await f.pedir('POST','/skins',{quem:A,corpo:inv})).status,200)}
 return {...f,dar,propor,inventario,equipar}
}
test('pins, trilhas e grafites disponíveis podem ser transferidos',async()=>{
 const f=await fixture(),ids=[]
 for(const item of [{t:'emblema',d:6130},{t:'trilha',d:5},{t:'grafite',d:1653,p:3}])ids.push(await f.dar(item))
 const inv=await f.inventario();for(const id of ids)assert.ok(inv[id]);assert.equal(inv.c4,undefined)
 const r=await f.propor(ids);assert.equal(r.status,200)
 assert.equal((await f.pedir('POST','/trocas/aceitar',{quem:B,corpo:{id:r.dados.id,senha}})).status,200)
 const recebido=(await f.pedir('GET','/skins',{quem:B})).dados.itens
 for(const tipo of ['emblema','trilha','grafite'])assert.ok(Object.values(recebido).some(i=>i.t===tipo))
 assert.ok(Object.values(recebido).some(i=>i.t==='grafite'&&i.p===3))
})
test('C4 e equipados não aparecem e são recusados ao propor',async()=>{
 const f=await fixture(),id=await f.dar({t:'arma',d:7,p:44,f:.1,s:40})
 await f.equipar(id);assert.equal((await f.inventario())[id],undefined)
 assert.equal((await f.propor([id])).status,409);assert.equal((await f.propor(['c4'])).status,409)
})
test('equipar depois da proposta impede aceitar sem perder itens',async()=>{
 const f=await fixture(),id=await f.dar({t:'trilha',d:5}),r=await f.propor([id]);assert.equal(r.status,200)
 await f.equipar(id)
 assert.equal((await f.pedir('POST','/trocas/aceitar',{quem:B,corpo:{id:r.dados.id,senha}})).status,409)
 assert.ok((await f.pedir('GET','/skins',{quem:A})).dados.itens[id])
})
