import { ambiente } from './ambiente.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calendarioEventosInsignias } from '../../../src/comum/eventos.js'
import { MOLDURAS, urlMoldura } from '../../../src/comum/molduras.js'
import { MISSOES } from '../src/missoes-core.js'
import { FUNDOS_EVENTO } from '../src/fundos-perfil.js'
import { mudarPerfil } from '../src/perfis.js'

test('todos os eventos, fundos e molduras têm correspondência na edição 2027',()=>{
 const eventos=MISSOES.filter(m=>m.categoria==='eventos'),cal=calendarioEventosInsignias(2027),ids=new Set(eventos.map(m=>m.id+'-2027'))
 assert.equal(eventos.length,27)
 assert.equal(MOLDURAS.length,236)
 for(const m of eventos){assert.ok(cal[m.id],m.id);assert.ok(fs.existsSync(new URL('../../../public/assets/insignia/'+m.arte,import.meta.url)))}
 for(const m of MOLDURAS){assert.ok(fs.existsSync(new URL('../../../public'+decodeURI(urlMoldura(m.id)),import.meta.url)));if(m.colecao==='Eventos')assert.ok(ids.has(m.insignia),m.id)}
 assert.equal(FUNDOS_EVENTO.length,27)
 for(const f of FUNDOS_EVENTO)assert.ok(ids.has(f.insignia),f.id)
 assert.equal(cal['evento-holi'].inicio,'2027-03-22T03:00:00.000Z')
 assert.equal(cal['evento-ano-novo-lunar'].inicio,'2027-02-06T03:00:00.000Z')
 assert.equal(cal['evento-diwali'].inicio,'2026-11-08T03:00:00.000Z')
 assert.equal(cal['evento-oktoberfest'].inicio,'2027-09-18T03:00:00.000Z')
 assert.equal(cal['evento-oktoberfest'].fim,'2027-10-04T02:59:59.999Z')
 assert.equal(calendarioEventosInsignias(2028)['evento-holi'],undefined)
})

test('moldura de evento exige insígnia correspondente e não permite bypass de admin',async()=>{
 const {env,pedir}=ambiente(),quem='76561198000000988',moldura='eventos/holi'
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{moldura}})).status,403)
 await mudarPerfil(env,quem,{insignias:{'evento-holi-2026':1,'evento-diwali-2027':1}})
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{moldura}})).status,403)
 await mudarPerfil(env,quem,{insignias:{'evento-holi-2027':1}})
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{moldura}})).status,200)
 assert.equal((await pedir('POST','/perfil',{quem:env.DONO,corpo:{moldura}})).status,403)
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{moldura:'times/furia'}})).status,200)
})
