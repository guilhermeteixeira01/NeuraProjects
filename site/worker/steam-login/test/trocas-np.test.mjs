import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'
const A='76561198000000721', B='76561198000000722', senha='senha-segura-123'
async function fixture() {
  const f=ambiente()
  for (const quem of [A,B]) {
    await f.pedir('GET','/eu',{quem})
    await f.pedir('POST','/conta/senha',{quem,corpo:{senha}})
  }
  const saldo=async quem=>(await f.pedir('GET','/loja/saldo',{quem})).dados.saldo
  const pontos=async (alvo,valor)=>f.pedir('POST','/admin/loja-pontos',{quem:DONO,corpo:{alvo,valor,acao:'adicionar'}})
  const propor=async corpo=>f.pedir('POST','/trocas',{quem:A,corpo:{para:B,senha,...corpo}})
  const aceitar=async id=>f.pedir('POST','/trocas/aceitar',{quem:B,corpo:{id,senha}})
  return {...f,saldo,pontos,propor,aceitar}
}
test('troca somente NP, acima do limite antigo de ajustes, transfere uma vez',async()=>{
  const f=await fixture()
  await f.pontos(A,10000000); await f.pontos(A,10000000)
  const a=await f.saldo(A), b=await f.saldo(B)
  const r=await f.propor({darNP:15000000})
  assert.equal(r.status,200)
  assert.equal(await f.saldo(A),a)
  assert.equal((await f.aceitar(r.dados.id)).status,200)
  assert.equal(await f.saldo(A),a-15000000)
  assert.equal(await f.saldo(B),b+15000000)
  assert.equal((await f.aceitar(r.dados.id)).status,409)
  assert.equal(await f.saldo(B),b+15000000)
})
test('saldo insuficiente no segundo lado estorna primeiro e preserva inventários',async()=>{
  const f=await fixture();await f.pontos(A,1000)
  const a=await f.saldo(A),b=await f.saldo(B)
  const r=await f.propor({darNP:500,pedirNP:b+10000})
  assert.equal(r.status,200)
  assert.equal((await f.aceitar(r.dados.id)).status,409)
  assert.equal(await f.saldo(A),a);assert.equal(await f.saldo(B),b)
})
test('rejeita NP negativos, fracionários e números inexatos',async()=>{
  const f=await fixture()
  for(const darNP of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'100']) assert.equal((await f.propor({darNP})).status,400)
})
test('recusar NP não muda saldos; proposta antiga sem NP ainda funciona',async()=>{
  const f=await fixture();await f.pontos(A,1000)
  const a=await f.saldo(A),b=await f.saldo(B)
  const r=await f.propor({darNP:500})
  assert.equal((await f.pedir('POST','/trocas/recusar',{quem:B,corpo:{id:r.dados.id}})).status,200)
  assert.equal(await f.saldo(A),a);assert.equal(await f.saldo(B),b)
})
test('troca item por NP entrega ambos e debita o lado correto',async()=>{
  const f=await fixture();await f.pontos(B,2000)
  const item=(await f.pedir('POST','/admin/skin',{quem:DONO,corpo:{id:A,item:{t:'arma',d:7,p:44,f:.1,s:40}}})).dados.id
  const a=await f.saldo(A),b=await f.saldo(B)
  const r=await f.propor({dar:[item],pedirNP:1200})
  assert.equal(r.status,200)
  assert.equal((await f.aceitar(r.dados.id)).status,200)
  assert.equal(await f.saldo(A),a+1200);assert.equal(await f.saldo(B),b-1200)
  const ia=(await f.pedir('GET','/skins',{quem:A})).dados.itens
  const ib=(await f.pedir('GET','/skins',{quem:B})).dados.itens
  assert.equal(ia[item],undefined)
  assert.ok(Object.values(ib).some(i=>i.t==='arma'&&i.d===7&&i.p===44))
})
test('ambos os jogadores podem adicionar NP na mesma proposta',async()=>{
  const f=await fixture();await f.pontos(A,2000);await f.pontos(B,2000)
  const a=await f.saldo(A),b=await f.saldo(B)
  const r=await f.propor({darNP:1200,pedirNP:500})
  assert.equal((await f.aceitar(r.dados.id)).status,200)
  assert.equal(await f.saldo(A),a-700);assert.equal(await f.saldo(B),b+700)
})
