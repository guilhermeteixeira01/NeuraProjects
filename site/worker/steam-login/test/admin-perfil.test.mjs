import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO } from './ambiente.mjs'
import { lerPerfil, mudarPerfil } from '../src/perfis.js'

test('edição administrativa salva XP e insígnias, inclusive evento iniciado, sem liberar futuros',async()=>{
 const {env,pedir}=ambiente(),id='76561198000000977'
 await mudarPerfil(env,id,{moldura:'antiga/apagada',card:'funcoes/awper.avif'})
 const evento='evento-holi-2026'
 const r=await pedir('POST','/admin/perfil',{quem:DONO,corpo:{id,xp:250,insignias:['staff',evento]}})
 assert.equal(r.status,200,JSON.stringify(r.dados))
 let p=await lerPerfil(env,id);assert.equal(p.xp,250);assert.ok(p.insignias.staff);assert.ok(p.insignias[evento]);assert.equal(p.moldura,'antiga/apagada')
 const quando=p.insignias.staff
 assert.equal((await pedir('POST','/admin/perfil',{quem:DONO,corpo:{id,insignias:['staff']}})).status,200)
 p=await lerPerfil(env,id);assert.equal(p.insignias.staff,quando);assert.equal(p.insignias[evento],undefined)
 assert.equal((await pedir('POST','/admin/perfil',{quem:DONO,corpo:{id,insignias:['evento-natal-2026']}})).status,400)
 assert.equal((await pedir('POST','/admin/perfil',{quem:DONO,corpo:{id,insignias:['top3']}})).status,400)
 assert.equal((await pedir('POST','/admin/perfil',{quem:id,corpo:{id,xp:999}})).status,403)
})

test('migração remove somente top3, é persistente e preserva missões, eventos e personalização',async()=>{
 const id='76561198000000978',perfil={xp:30,moldura:'times/furia',insignias:{top3:1,staff:2,'evento-holi-2026':3,'missao-clutch':4}}
 const {env}=ambiente();const sql=env.DADOS.instancia('global').sql;sql.exec('INSERT INTO itens (colecao,id,dados,ver) VALUES (?,?,?,1)','perfis',id,JSON.stringify(perfil));sql.exec('INSERT INTO migradas (chave) VALUES (?)','perfis')
 const ler=async()=>JSON.parse((await env.DADOS.instancia('global').ler('perfis',[id])).itens[0][2]);const p=await ler();assert.equal(p.insignias.top3,undefined);assert.equal(p.insignias.staff,2);assert.equal(p.insignias['evento-holi-2026'],3);assert.equal(p.insignias['missao-clutch'],4);assert.equal(p.moldura,perfil.moldura);assert.deepEqual(await ler(),p)
})
