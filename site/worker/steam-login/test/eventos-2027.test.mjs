import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { corrigirEventosAntecipados } from '../src/missoes.js'
import { lerPerfil,darInsignias } from '../src/perfis.js'
import { mudar } from '../src/dados.js'

test('insígnias de evento de 2026 saem do perfil, junto com a moldura e o fundo do evento',async()=>{
  const id='76561198000000471',f=ambiente({usuarios:{[id]:{nome:'Antigo'}}})
  await darInsignias(f.env,{[id]:{'evento-halloween-2026':Date.now()-1000,'missao-headshot':Date.now()-1000}})
  await mudar(f.env,'perfis',[id],p=>{p[id]={...p[id],moldura:'eventos/halloween',fundoPerfil:'inferno-halloween'}})
  await corrigirEventosAntecipados(f.env)
  const perfil=await lerPerfil(f.env,id)
  assert.equal(perfil.insignias['evento-halloween-2026'],undefined)
  assert.ok(perfil.insignias['missao-headshot'])
  assert.equal(perfil.fundoPerfil,undefined)
  assert.equal(perfil.moldura,undefined)
})
