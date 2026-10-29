import { ambiente } from './ambiente.mjs'
import { mudarPerfil } from '../src/perfis.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarPerfil } from '../src/rotas-conta.js'
import { FUNDOS_PERFIL } from '../src/fundos-perfil.js'
test('fundo de perfil aceita apenas mapas do catálogo e pode ser removido', () => {
 for (const fundoPerfil of FUNDOS_PERFIL) assert.deepEqual(validarPerfil({fundoPerfil}), {fundoPerfil})
 assert.deepEqual(validarPerfil({fundoPerfil:null}), {fundoPerfil:null})
 for (const fundoPerfil of ['https://outro.site/foto.jpg','../../arquivo','anime/card.webp',{},false]) assert.throws(()=>validarPerfil({fundoPerfil}))
})

test('fundo de evento exige a insígnia da edição correta, inclusive para administrador', async () => {
 const { env, pedir } = ambiente(), quem = '76561198000000877', fundoPerfil = 'inferno-halloween'
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{fundoPerfil}})).status,403)
 await mudarPerfil(env,quem,{insignias:{'evento-natal-2026':1,'evento-halloween-2025':1}})
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{fundoPerfil}})).status,403)
 await mudarPerfil(env,quem,{insignias:{'evento-halloween-2026':1}})
 const liberado=await pedir('POST','/perfil',{quem,corpo:{fundoPerfil}})
 assert.equal(liberado.status,200)
 assert.equal(liberado.dados.perfis[quem].fundoPerfil,fundoPerfil)
 assert.equal((await pedir('POST','/perfil',{quem:env.DONO,corpo:{fundoPerfil}})).status,403)
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{fundoPerfil:'mirage'}})).status,200)
 assert.equal((await pedir('POST','/perfil',{quem,corpo:{fundoPerfil:null}})).status,200)
})
