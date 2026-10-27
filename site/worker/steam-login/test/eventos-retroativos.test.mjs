import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente } from './ambiente.mjs'
import { distribuirEventosPassados2026,sincronizarMissoes } from '../src/missoes.js'
import { lerPerfil,darInsignias } from '../src/perfis.js'
import { gravarDoc,lerDoc,mudar } from '../src/dados.js'

test('liberação única concede eventos já passados a contas existentes, sem incluir futuros nem contas novas',async()=>{
  const original=Date.now,agora=Date.parse('2026-10-27T15:00:00Z')
  Date.now=()=>agora
  try{
    const id='76561198000000461',novo='76561198000000462',f=ambiente({
      usuarios:{[id]:{nome:'Existente'}},
      'missoes-config':{ativa:true,eventos:{
        'evento-dia-do-gamer':{ano:2026,inicio:'2026-08-29T03:00:00Z',fim:'2026-08-30T02:59:59Z'},
        'evento-consciencia-negra':{ano:2026,inicio:'2026-11-20T03:00:00Z',fim:'2026-11-21T02:59:59Z'},
      }},
    })
    await darInsignias(f.env,{[id]:{'missao-headshot':agora-1000}})
    const campanha=await distribuirEventosPassados2026(f.env,agora)
    assert.ok(campanha.eventos.includes('evento-dia-do-gamer-2026'))
    for(const futuro of ['natal','halloween','primavera','consciencia-negra','ano-novo','verao'])assert.ok(!campanha.eventos.includes(`evento-${futuro}-2026`))
    const perfil=await lerPerfil(f.env,id)
    assert.equal(perfil.insignias['evento-dia-do-gamer-2026'],agora)
    assert.equal(perfil.insignias['missao-headshot'],agora-1000)
    assert.equal(perfil.insignias['evento-halloween-2026'],undefined)
    const a=f.env.LOJA.instancia(id),avisos=(await a.ctx.storage.get('notifs')).lista
    assert.match(avisos.find(n=>n.id==='ins:evento-dia-do-gamer-2026').titulo,/liberação dos eventos passados/)
    assert.equal(a.sql.exec('SELECT id FROM missoes_eventos_acessos').toArray().length,0)
    await distribuirEventosPassados2026(f.env,agora+1000)
    assert.equal((await a.ctx.storage.get('notifs')).lista.length,avisos.length)
    assert.equal((await lerPerfil(f.env,id)).insignias['evento-dia-do-gamer-2026'],agora)
    await mudar(f.env,'usuarios',[novo],p=>{p[novo]={nome:'Novo'}})
    await distribuirEventosPassados2026(f.env,agora+2000)
    await sincronizarMissoes(f.env.LOJA.instancia(novo),novo,[],false,agora+2000,true)
    assert.equal((await lerPerfil(f.env,novo))?.insignias?.['evento-dia-do-gamer-2026'],undefined)
    const salvo=await lerDoc(f.env,'missoes-eventos-retroativos-2026')
    assert.deepEqual(salvo.usuarios,[id]);assert.deepEqual(salvo.concluidos,[id])
    // Mesmo um evento que encerre depois do corte não entra na campanha antiga.
    Date.now=()=>Date.parse('2026-12-28T15:00:00Z')
    await distribuirEventosPassados2026(f.env,Date.now())
    await sincronizarMissoes(a,id)
    assert.equal((await lerPerfil(f.env,id)).insignias['evento-natal-2026'],undefined)
  }finally{Date.now=original}
})
