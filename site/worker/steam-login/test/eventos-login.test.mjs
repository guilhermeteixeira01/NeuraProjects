import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { sincronizarMissoes } from '../src/missoes.js'
import { progressoMissoes } from '../src/missoes-core.js'
import { calendarioEventosInsignias } from '../../../src/comum/eventos.js'
import { lerPerfil } from '../src/perfis.js'

const badge='evento-halloween-2026',cfg={eventos:calendarioEventosInsignias(2026)}
const inicio=Date.parse(cfg.eventos['evento-halloween'].inicio),fim=Date.parse(cfg.eventos['evento-halloween'].fim)
const evento=(acesso,agora)=>progressoMissoes([],{...cfg,acessosEventos:{[badge]:acesso}},agora).lista.find(m=>m.id===badge)

test('limites do evento em Brasília: primeiro e último instante contam, fora não conta',()=>{
  assert.equal(evento(inicio-1,inicio).concluida,false)
  assert.equal(evento(inicio,inicio).concluida,true)
  assert.equal(evento(fim,fim).concluida,true)
  assert.equal(evento(fim+1,fim+1).concluida,false)
  assert.equal(evento(inicio,inicio-1).concluida,false)
  assert.equal(evento(inicio,fim+1).concluida,true)
})

test('só acesso autenticado concede: data original e aviso únicos persistem depois do encerramento',async()=>{
  const f=ambiente({'missoes-config':{ativa:true}}),id='76561198000000451',a=f.env.LOJA.instancia(id),acesso=inicio+86400000
  await sincronizarMissoes(a,id,[],false,acesso)
  assert.equal((await lerPerfil(f.env,id))?.insignias?.[badge],undefined)
  await sincronizarMissoes(a,id,[],false,acesso,true)
  assert.equal((await lerPerfil(f.env,id)).insignias[badge],acesso)
  assert.equal((await lerPerfil(f.env,id)).insignias['evento-outono-2026'],undefined)
  await sincronizarMissoes(a,id,[],false,acesso+86400000,true)
  await sincronizarMissoes(a,id,[],false,fim+86400000,true)
  assert.equal((await lerPerfil(f.env,id)).insignias[badge],acesso)
  const lista=(await a.ctx.storage.get('notifs')).lista.filter(n=>n.id===`ins:${badge}`)
  assert.equal(lista.length,1);assert.equal(lista[0].quando,acesso)
  assert.match(lista[0].titulo,/durante o evento/)
})

test('primeiro login depois do evento não dá insígnia retroativa',async()=>{
  const f=ambiente({'missoes-config':{ativa:true}}),id='76561198000000452',a=f.env.LOJA.instancia(id)
  await sincronizarMissoes(a,id,[],false,fim+1,true)
  assert.equal((await lerPerfil(f.env,id))?.insignias?.[badge],undefined)
  assert.equal(a.sql.exec('SELECT id FROM missoes_eventos_acessos WHERE id = ?',badge).toArray().length,0)
})

test('concessão pausada guarda acesso legítimo e entrega depois com a data do acesso',async()=>{
  const f=ambiente({'missoes-config':{ativa:true}}),id='76561198000000453',a=f.env.LOJA.instancia(id),acesso=inicio+1000
  const {gravarDoc}=await import('../src/dados.js')
  await gravarDoc(f.env,'missoes-config',{ativa:false})
  await sincronizarMissoes(a,id,[],false,acesso,true)
  assert.equal((await lerPerfil(f.env,id))?.insignias?.[badge],undefined)
  await gravarDoc(f.env,'missoes-config',{ativa:true})
  await sincronizarMissoes(a,id,[],false,fim+1000)
  assert.equal((await lerPerfil(f.env,id)).insignias[badge],acesso)
})

test('rotas autenticadas contam acesso; consulta pública e chamadas internas não contam',async()=>{
  const original=Date.now,acesso=inicio+2000
  Date.now=()=>acesso
  try{
    const f=ambiente({'missoes-config':{ativa:true}}),id='76561198000000454',a=f.env.LOJA.instancia(id)
    await a.acao({acao:'notif-sync',id})
    await f.pedir('GET','/perfis')
    assert.equal((await lerPerfil(f.env,id))?.insignias?.[badge],undefined)
    assert.equal((await f.pedir('GET','/missoes')).status,401)
    assert.equal((await f.pedir('POST','/notificacoes',{quem:id,corpo:{acesso:false,quando:inicio-1,doc:null}})).status,200)
    assert.equal((await lerPerfil(f.env,id)).insignias[badge],acesso)
    assert.equal(a.sql.exec('SELECT quando FROM missoes_eventos_acessos WHERE id = ?',badge).one().quando,acesso)
  }finally{Date.now=original}
})
