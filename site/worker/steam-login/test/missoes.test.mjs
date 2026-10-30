import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ambiente, DONO } from './ambiente.mjs'
import { progressoMissoes,resumoMissao,anoBrasilia,categoriaArma,MISSOES,MAPAS_MISSOES } from '../src/missoes-core.js'
import { sincronizarMissoes } from '../src/missoes.js'
import { calendarioEventosInsignias } from '../../../src/comum/eventos.js'
import { lerPerfil } from '../src/perfis.js'
import { darInsignias } from '../src/perfis.js'
import { juntar } from '../src/notif-core.js'

test('coleção 2027 não usa Ano Novo e Verão iniciados em 2026 nem antecipa eventos futuros',()=>{
  const cfg={eventos:calendarioEventosInsignias(2027)},hoje=Date.parse('2027-10-27T12:00:00Z')
  const lista=progressoMissoes([],cfg,hoje).lista
  for(const id of ['ano-novo','verao','natal','halloween','black-friday','primavera'])assert.equal(lista.find(m=>m.id===`evento-${id}-2027`).concluida,false,id)
  for(const id of ['ano-novo','verao'])assert.equal(anoBrasilia(Date.parse(cfg.eventos[`evento-${id}`].inicio)),2027)
  const legado={eventos:{...cfg.eventos,'evento-ano-novo':{ano:2027,inicio:'2026-12-27T03:00:00Z',fim:'2027-01-07T03:00:00Z'}}}
  assert.equal(progressoMissoes([],legado,hoje).lista.find(m=>m.id==='evento-ano-novo-2027').concluida,false)
  const natalAntecipado={eventos:{...cfg.eventos,'evento-natal':{ano:2027,inicio:'2027-01-01T03:00:00Z',fim:'2027-01-02T03:00:00Z'}}}
  assert.equal(progressoMissoes([],natalAntecipado,hoje).lista.find(m=>m.id==='evento-natal-2027').concluida,false)
  assert.equal(progressoMissoes([],cfg,Date.parse('2028-04-01T12:00:00Z')).lista.find(m=>m.id==='evento-verao-2027').concluida,false)
})

test('retira concessões antecipadas e avisos; entrega no acesso durante o evento e preserva após encerrar',async()=>{
  const id='76561198000000429',f=ambiente({'missoes-config':{ativa:true}}),a=f.env.LOJA.instancia(id),hoje=Date.parse('2027-10-27T12:00:00Z')
  const badge='evento-ano-novo-2027',aviso={id:`ins:${badge}`,insignia:badge,titulo:'Antecipada',quando:hoje-1000}
  await darInsignias(f.env,{[id]:{[badge]:hoje-1000,'missao-headshot':hoje-1000,'evento-outono-2027':hoje-1000}})
  a.sql.exec('INSERT INTO missoes_concessoes (id,quando,perfilado,notificada) VALUES (?,?,1,1)',badge,hoje-1000)
  const antigo={lista:[aviso],vistos:[aviso.id],limpoEm:0};await a.ctx.storage.put('notifs',antigo)
  await sincronizarMissoes(a,id,[],false,hoje)
  let perfil=await lerPerfil(f.env,id)
  assert.equal(perfil.insignias[badge],undefined);assert.ok(perfil.insignias['missao-headshot']);assert.ok(perfil.insignias['evento-outono-2027'])
  assert.equal(a.sql.exec('SELECT id FROM missoes_concessoes WHERE id = ?',badge).toArray().length,0)
  let doc=await a.ctx.storage.get('notifs');assert.ok(!doc.lista.some(n=>n.id===aviso.id))
  assert.ok(!juntar(antigo,doc).lista.some(n=>n.id===aviso.id))
  const acesso=Date.parse('2027-12-30T12:00:00Z')
  await sincronizarMissoes(a,id,[],false,acesso,true)
  perfil=await lerPerfil(f.env,id);assert.equal(perfil.insignias[badge],acesso)
  doc=await a.ctx.storage.get('notifs');assert.equal(doc.lista.filter(n=>n.id===aviso.id).length,1)
  await sincronizarMissoes(a,id,[],false,Date.parse('2028-01-08T12:00:00Z'))
  assert.equal((await lerPerfil(f.env,id)).insignias[badge],acesso)
})

test('todas as 64 artes possuem imagem válida para exibição e miniatura',()=>{
  const pasta=new URL('../../../public/assets/insignia/',import.meta.url)
  for(const m of MISSOES)for(const tamanho of ['web','mini'])assert.ok(fs.statSync(fs.existsSync(new URL(`${tamanho}/${m.id}.webp`,pasta)) ? new URL(`${tamanho}/${m.id}.webp`,pasta) : new URL(m.arte,pasta)).size>0,`${tamanho}/${m.id}`)
})

test('seis demos históricas preservam 133 rounds e participantes confirmados',()=>{
  const raiz=new URL('../../../../partidas/',import.meta.url)
  const arquivos=fs.readdirSync(raiz,{recursive:true}).filter(f=>f.endsWith('partida.json'))
  let mapas=0,rounds=0,resumos=0
  for(const arquivo of arquivos){
    const p=JSON.parse(fs.readFileSync(new URL(arquivo.split(path.sep).join('/'),raiz),'utf8'))
    if(p.missoes?.fonte!=='demo')continue
    mapas++;rounds+=p.rounds.length
    assert.equal(p.missoes.validada,true)
    for(const j of p.jogadores){const r=resumoMissao(p,String(j.steamId),arquivo);if(!r)continue;resumos++;assert.ok(r.headshots<=r.kills);assert.ok(r.melhorRound<=5);assert.ok(r.kills<=j.kills)}
  }
  assert.equal(mapas,6);assert.equal(rounds,133);assert.ok(resumos>=60)
})
const agora=Date.parse('2027-10-27T12:00:00Z')
const partida=(chave='a',mudar={})=>({chave,validada:true,presenteFinal:true,modo:'5v5',mapa:'de_dust2',venceu:false,kills:0,headshots:0,assistencias:0,clutches:0,plantios:0,desarmes:0,melhorRound:0,armas:{},...mudar})
const obter=(ps,id,c={})=>progressoMissoes(ps,c,agora).lista.find(m=>m.id===id)

test('catálogo tem exatamente 16 missões, 27 eventos e 21 mapas sem IDs repetidos',()=>{
  assert.equal(new Set(MISSOES.map(m=>m.id)).size,64)
  for(const [c,n] of [['combate',16],['eventos',27],['mapas',21]])assert.equal(MISSOES.filter(m=>m.categoria===c).length,n)
})
test('metas de combate são cumulativas, exclusivas de 5v5 e idempotentes por partida',()=>{
  const casos=[['headshot','headshots',100],['clutch','clutches',10],['ace','melhorRound',5],['demolidor','plantios',25],['desarmador','desarmes',25],['suporte','assistencias',100],['implacavel','kills',1000]]
  for(const [id,k,meta] of casos) {
    assert.equal(obter([partida('a',{[k]:meta-1})],`missao-${id}`).concluida,false)
    const p=partida('a',{[k]:meta})
    assert.equal(obter([p,p],`missao-${id}`).atual,meta)
    assert.equal(obter([p],`missao-${id}`).concluida,true)
    assert.equal(obter([{...p,modo:'wingman'}],`missao-${id}`).atual,0)
  }
  assert.equal(obter(Array.from({length:100},(_,i)=>partida(String(i),{venceu:true})),'missao-veterano').concluida,true)
  assert.equal(obter([partida('a',{venceu:true})],'missao-primeira-vitoria').concluida,true)
  assert.equal(obter([partida('a')],'missao-primeira-vitoria').concluida,false)
})
test('armas têm categorias disjuntas e Versátil exige as cinco; utilitários não substituem armas',()=>{
  assert.equal(categoriaArma('awp'),'precisao');assert.equal(categoriaArma('knife'),null)
  const armas={awp:50,ak47:20,nova:20,glock:100,mp9:100,hegrenade:10,inferno:5,molotov:5,knife:999}
  const p=partida('a',{armas})
  for(const id of ['sniper','pistoleiro','rajada','granadeiro','incendiario','versatil'])assert.equal(obter([p],`missao-${id}`).concluida,true)
  assert.equal(obter([partida('a',{armas:{...armas,nova:19}})],'missao-versatil').concluida,false)
  assert.equal(obter([partida('a',{armas:{awp:100}})],'missao-versatil').atual,1)
})
test('Explorador exige vitória nos sete mapas fixos sem substituir pelo pool atual',()=>{
  const mapas=['dust2','mirage','inferno','nuke','ancient','anubis','overpass']
  const ps=mapas.map(m=>partida(m,{mapa:`de_${m}`,venceu:true}))
  assert.equal(obter(ps,'missao-explorador').atual,7)
  assert.equal(obter(ps.slice(1),'missao-explorador').concluida,false)
  assert.equal(obter([...ps.slice(1),partida('cache',{mapa:'de_cache',venceu:true})],'missao-explorador').concluida,false)
})
test('mapas contam derrotas, distinguem modo e mapa e respeitam meta individual',()=>{
  for(const [id,m] of Object.entries(MAPAS_MISSOES).filter(([,m])=>m.mapa)) {
    const ps=Array.from({length:10},(_,i)=>partida(String(i),{mapa:m.mapa,modo:m.modo}))
    assert.equal(obter(ps,`mapa-${id}`).concluida,true)
    assert.equal(obter([...ps.slice(0,9),ps[0]],`mapa-${id}`).atual,9)
    assert.equal(obter(ps.map(p=>({...p,mapa:p.mapa+'2'})),`mapa-${id}`).atual,0)
    assert.equal(obter(ps.map(p=>({...p,presenteFinal:false})),`mapa-${id}`).atual,0)
  }
  const cfg={metaMapas:4,mapas:{dust2:{meta:2},'complex-rush':{mapa:'workshop/123/complex',modo:'rush',meta:3}}}
  assert.equal(obter([partida(),partida('b')],'mapa-dust2',cfg).concluida,true)
  assert.equal(obter([partida('rush',{mapa:'workshop/123/complex',modo:'rush'})],'mapa-complex-rush',cfg).atual,1)
})
test('eventos exigem acesso no período de Brasília, sem exigir partidas ou inventar datas',()=>{
  assert.equal(anoBrasilia(Date.parse('2028-01-01T01:00:00Z')),2027)
  const cfg={eventos:calendarioEventosInsignias(2027)}
  assert.equal(obter([],'evento-outono-2027',cfg).concluida,false)
  assert.equal(obter([],'evento-outono-2027',{...cfg,acessosEventos:{'evento-outono-2027':Date.parse('2027-05-01T12:00:00Z')}}).concluida,true)
  assert.equal(obter([],'evento-halloween-2027',cfg).concluida,false)
  assert.equal(obter([],'evento-natal-2027',cfg).concluida,false)
  const r=progressoMissoes([],cfg,agora)
  assert.ok(!r.pendencias.some(p=>p.id==='evento-dia-do-gamer'))
  assert.equal(obter([],'evento-natal-2027',{eventos:{'evento-natal':{ano:2026,inicio:'2026-01-01T00:00:00Z',fim:'2026-01-02T00:00:00Z'}}}).concluida,false)
})
test('resumo rejeita fonte não validada, cancelamento, bots e ausência de participação; vencedor precisa de elenco final',()=>{
  const id='76561198000000411',d={mapa:'de_mirage',placarA:13,placarB:7,missoes:{versao:1,concluida:true,validada:true,modo:'5v5',elencoFinal:[id]},jogadores:[{steamId:id,time:'A',missoes:{participou:true,roundsValidos:20,kills:10}}]}
  assert.equal(resumoMissao(d,id,'chave').venceu,true)
  for(const extra of [{cancelada:true},{treino:true},{aquecimento:true},{missoes:null},{missoes:{...d.missoes,validada:false}}])assert.equal(resumoMissao({...d,...extra},id,'chave'),null)
  assert.equal(resumoMissao({...d,jogadores:[{...d.jogadores[0],bot:true}]},id,'chave'),null)
  const saiu=resumoMissao({...d,missoes:{...d.missoes,elencoFinal:[]}},id,'chave')
  assert.equal(saiu.venceu,false);assert.equal(saiu.presenteFinal,false);assert.equal(saiu.kills,10)
})
test('entrega retroativa é idempotente, persiste no perfil e só notifica após confirmar',async()=>{
  const id='76561198000000421',f=ambiente({'missoes-config':{ativa:true}}),a=f.env.LOJA.instancia(id)
  const resumo=partida('passada',{venceu:true,headshots:100})
  await sincronizarMissoes(a,id,[resumo],false,agora)
  const perfil=await lerPerfil(f.env,id),quando=perfil.insignias['missao-headshot']
  assert.ok(quando);assert.ok(perfil.insignias['missao-primeira-vitoria']);assert.equal(perfil.insignias['evento-outono-2027'],undefined)
  const antes=(await a.ctx.storage.get('notifs')).lista.length
  await sincronizarMissoes(a,id,[resumo],false,agora+1000)
  assert.equal((await lerPerfil(f.env,id)).insignias['missao-headshot'],quando)
  assert.equal((await a.ctx.storage.get('notifs')).lista.length,antes)
  assert.equal(a.sql.exec('SELECT COUNT(*) AS n FROM missoes_partidas').one().n,1)
  assert.ok((await a.ctx.storage.get('notifs')).lista.some(n=>n.id==='ins:missao-headshot'))
})
test('falha ao notificar retoma entrega sem duplicar perfil nem conquista',async()=>{
  const id='76561198000000422',f=ambiente({'missoes-config':{ativa:true}}),a=f.env.LOJA.instancia(id),notificar=a.notificar.bind(a)
  a.notificar=async()=>{throw Error('falhou notificação')}
  await assert.rejects(sincronizarMissoes(a,id,[partida('antiga',{headshots:100})],false,agora))
  const quando=(await lerPerfil(f.env,id)).insignias['missao-headshot'];assert.ok(quando)
  a.notificar=notificar
  await sincronizarMissoes(a,id,[],false,agora+1000)
  assert.equal((await lerPerfil(f.env,id)).insignias['missao-headshot'],quando)
  const ids=(await a.ctx.storage.get('notifs')).lista.map(n=>n.id);assert.equal(ids.length,new Set(ids).size)
})
test('API de missões é da própria conta e só admin pode ajustar regras',async()=>{
  const f=ambiente(),id='76561198000000423'
  assert.equal((await f.pedir('GET','/missoes')).status,401)
  assert.equal((await f.pedir('POST','/missoes',{quem:id,corpo:{kills:99999}})).status,404)
  assert.equal((await f.pedir('GET','/admin/missoes',{quem:id})).status,403)
  const p=await f.pedir('GET','/admin/missoes',{quem:DONO});assert.equal(p.status,200);assert.equal(p.dados.catalogo.length,64)
  assert.equal((await f.pedir('POST','/admin/missoes',{quem:DONO,corpo:{eventos:{'evento-natal':{ano:2027,inicio:'2027-01-02',fim:'2027-01-01'}}}})).status,400)
  assert.equal((await f.pedir('POST','/admin/missoes',{quem:DONO,corpo:{metaMapas:7,mapas:{dust2:{mapa:'de_dust2',modo:'5v5',meta:4}}}})).status,200)
  assert.equal((await f.pedir('POST','/admin/missoes',{quem:DONO,corpo:{eventos:{'evento-ano-novo':{ano:2027,inicio:'2026-12-27T03:00:00Z',fim:'2027-01-07T03:00:00Z'}}}})).status,400)
  assert.equal((await f.pedir('POST','/admin/perfil',{quem:DONO,corpo:{id,insignias:['evento-natal-2027']}})).status,400)
})

test('consulta pública corrige insígnias antecipadas mesmo de uma conta offline',async()=>{
  const id='76561198000000430',f=ambiente()
  await darInsignias(f.env,{[id]:{'evento-verao-2027':Date.now(),'missao-headshot':Date.now()}})
  const r=await f.pedir('GET','/perfis')
  assert.equal(r.status,200);assert.equal(r.dados[id].insignias['evento-verao-2027'],undefined)
  assert.ok((await lerPerfil(f.env,id)).insignias['missao-headshot'])
})
