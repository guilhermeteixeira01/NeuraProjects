import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'

const A='76561198000000701', B='76561198000000702', C='76561198000000703', senha='senha-segura-123'
async function fixture() {
  const f=ambiente()
  for(const quem of [A,B,C]) {
    await f.pedir('GET','/eu',{quem})
    assert.equal((await f.pedir('POST','/conta/senha',{quem,corpo:{senha}})).status,200)
  }
  const item=async id=>(await f.pedir('POST','/admin/skin',{quem:DONO,corpo:{id,item:{t:'arma',d:7,p:44,f:.1,s:40}}})).dados.id
  const a=await item(A),b=await item(B)
  const propor=(quem,para,dar,pedir)=>f.pedir('POST','/trocas',{quem,corpo:{para,dar,pedir,senha}})
  const inventario=async id=>(await f.pedir('GET',`/skins/inventario?id=${id}&troca=1`,{quem:id})).dados.itens
  return {...f,a,b,propor,inventario}
}

test('oferecidos e pedidos somem de novas trocas; servidor impede reutilizar em qualquer direção',async()=>{
  const f=await fixture(),t=await f.propor(A,B,[f.a],[f.b]);assert.equal(t.status,200)
  assert.equal((await f.inventario(A))[f.a],undefined);assert.equal((await f.inventario(B))[f.b],undefined)
  assert.ok((await f.pedir('GET','/skins',{quem:A})).dados.itens[f.a])
  for(const [quem,para,dar,pedir] of [[A,C,[f.a],[]],[B,C,[f.b],[]],[C,A,[],[f.a]],[C,B,[],[f.b]]]) {
    const r=await f.propor(quem,para,dar,pedir)
    assert.equal(r.status,409);assert.equal(r.dados.erro,'item-em-outra-proposta')
  }
  await f.pedir('POST','/trocas/cancelar',{quem:A,corpo:{id:t.dados.id}})
  assert.ok((await f.inventario(A))[f.a]);assert.ok((await f.inventario(B))[f.b])
})

test('propostas trazem cotações oficiais dos dois lados sem movimentar NP',async()=>{
  const f=await fixture()
  const va=(await f.pedir('GET',`/skins/inventario?id=${A}`,{quem:A})).dados.valores[f.a]
  const vb=(await f.pedir('GET',`/skins/inventario?id=${B}`,{quem:B})).dados.valores[f.b]
  const saldo=(await f.pedir('GET','/loja/saldo',{quem:A})).dados.saldo
  assert.equal((await f.propor(A,B,[f.a],[f.b])).status,200)
  const enviadas=(await f.pedir('GET','/trocas',{quem:A})).dados.enviadas[0]
  const recebidas=(await f.pedir('GET','/trocas',{quem:B})).dados.recebidas[0]
  assert.equal(enviadas.dar[0].valor,va)
  assert.equal(enviadas.pedir[0].valor,vb)
  assert.deepEqual(recebidas.dar,enviadas.dar)
  assert.deepEqual(recebidas.pedir,enviadas.pedir)
  assert.equal((await f.pedir('GET','/loja/saldo',{quem:A})).dados.saldo,saldo)
})

test('recusa e expiração liberam reservas; concorrência permite apenas uma proposta',async()=>{
  const f=await fixture()
  const propostas=await Promise.all([f.propor(A,B,[f.a],[f.b]),f.propor(A,C,[f.a],[])])
  assert.equal(propostas.filter(r=>r.status===200).length,1)
  const t=propostas.find(r=>r.status===200).dados
  await f.pedir('POST','/trocas/recusar',{quem:propostas[0].status===200?B:C,corpo:{id:t.id}})
  assert.ok((await f.inventario(A))[f.a])
  assert.equal((await f.propor(A,B,[f.a],[f.b])).status,200)
  f.env.TROCAS.instancia('global').sql.exec("UPDATE trocas SET fim = ? WHERE estado = 'pendente'",Date.now()-1000)
  assert.ok((await f.inventario(A))[f.a]);assert.ok((await f.inventario(B))[f.b])
})

test('venda instantânea exige senha no servidor; falhas preservam inventário e saldo',async()=>{
  const f=await fixture(),antes=(await f.pedir('GET','/loja/saldo',{quem:A})).dados.saldo
  const vender=corpo=>f.pedir('POST','/loja/vender',{quem:A,corpo:{ids:[f.a],...corpo}})
  assert.equal((await vender({})).status,428)
  const errada=await vender({senha:'incorreta'});assert.equal(errada.status,403);assert.equal(errada.dados.erro,'senha-errada')
  assert.ok((await f.pedir('GET','/skins',{quem:A})).dados.itens[f.a])
  assert.equal((await f.pedir('GET','/loja/saldo',{quem:A})).dados.saldo,antes)
  const r=await vender({senha});assert.equal(r.status,200);assert.ok(r.dados.total>0)
  assert.equal(r.dados.inv.itens[f.a],undefined);assert.equal(r.dados.saldo,antes+r.dados.total)
  const repetida=await vender({senha});assert.equal(repetida.status,409)
  assert.equal((await f.pedir('GET','/loja/saldo',{quem:A})).dados.saldo,r.dados.saldo)
})
