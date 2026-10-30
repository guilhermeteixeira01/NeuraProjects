import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'
import { chamarContas } from '../src/contas.js'
import { aplicarApelido } from '../src/rotas-conta.js'
import { lerUsuarios } from '../src/usuarios.js'

test('limpar nick libera nova escolha sem Premium, remove apelido público e mantém segurança',async()=>{
 const {env,pedir}=ambiente(),id='76561198000000875',outro='76561198000000876'
 await chamarContas(env,{acao:'nick',steam:id,nick:'NickAntigo875'})
 await aplicarApelido(env,id,'NickAntigo875')
 const sql=env.CONTAS.instancia('global').sql
 sql.exec('UPDATE contas SET sal = ?, hash = ?, email = ? WHERE steam = ?','sal-preservado','hash-preservado','teste@example.com',id)
 assert.equal((await chamarContas(env,{acao:'estado',steam:id})).podeTrocarNick,false)
 assert.equal((await pedir('POST','/admin/nick-reset',{quem:outro,corpo:{id}})).status,403)
 const r=await pedir('POST','/admin/nick-reset',{quem:DONO,corpo:{id}})
 assert.equal(r.status,200);assert.equal(r.dados.nick,null);assert.equal(r.dados.podeTrocarNick,true);assert.equal(r.dados.proximaTroca,0);assert.equal(r.dados.temSenha,true)
 assert.equal((await lerUsuarios(env))[id].apelido,undefined)
 const conta=sql.exec('SELECT sal,hash,email,chave,nick_em FROM contas WHERE steam = ?',id).toArray()[0]
 assert.equal(conta.sal,'sal-preservado');assert.equal(conta.hash,'hash-preservado');assert.equal(conta.email,'teste@example.com');assert.equal(conta.chave,null);assert.equal(conta.nick_em,null)
 assert.equal((await chamarContas(env,{acao:'livre',steam:outro,nick:'NickAntigo875'})).livre,true)
 assert.equal((await pedir('POST','/conta/nick',{quem:id,corpo:{nick:'NickNovo875'}})).status,200)
 assert.equal((await pedir('POST','/conta/nick',{quem:id,corpo:{nick:'MaisOutro875'}})).status,403)
})
