import { MISSOES, ANO_EVENTOS, anoBrasilia, progressoMissoes, resumoMissao, insigniaMissao } from './missoes-core.js'
import { calendarioEventosInsignias } from '../../../src/comum/eventos.js'
import { lerDoc, gravarDoc, mudar, mudarDoc } from './dados.js'
import { lerUsuarios } from './usuarios.js'
import { darInsignias, lerPerfil, lerPerfis } from './perfis.js'
import { avisarPerfil } from './amigos.js'
import { juntar,docVazio } from './notif-core.js'
import { pedirAoJogador } from './objetos.js'
import { ErroPedido } from './erros.js'
import { json } from './http.js'
import { enderecoDoSite } from './ranking.js'

export function iniciarMissoes(obj) {
  obj.sql.exec('CREATE TABLE IF NOT EXISTS missoes_partidas (chave TEXT PRIMARY KEY, dados TEXT NOT NULL)')
  obj.sql.exec('CREATE TABLE IF NOT EXISTS missoes_concessoes (id TEXT PRIMARY KEY, quando INTEGER NOT NULL, perfilado INTEGER NOT NULL DEFAULT 0, notificada INTEGER NOT NULL DEFAULT 0)')
  obj.sql.exec('CREATE TABLE IF NOT EXISTS missoes_eventos_acessos (id TEXT PRIMARY KEY, quando INTEGER NOT NULL)')
}
export async function configMissoes(env,agora=Date.now()) {
  const salvo=await lerDoc(env,'missoes-config',{})
  return {ativa:true,...salvo,eventos:{...calendarioEventosInsignias(ANO_EVENTOS),...salvo.eventos}}
}
export async function historicoMissoes(env,id) {
  const r=await fetch(`${enderecoDoSite(env)}/perfil/historico/${id}.json`,{cf:{cacheTtl:60},signal:AbortSignal.timeout(15000)})
  if(r.status===404)return []
  if(!r.ok)throw new Error('histórico de missões indisponível')
  const dados=await r.json()
  return Array.isArray(dados)?dados.map(m=>m.missoes).filter(Boolean):[]
}
export async function sincronizarMissoes(obj,id,novas=[],buscarHistorico=false,agora=Date.now(),acessoAutenticado=false) {
  const config=await configMissoes(obj.env,agora)
  let historico=[]
  if(buscarHistorico)try{historico=await historicoMissoes(obj.env,id)}catch{/* progresso confirmado anterior continua disponível; tenta de novo no próximo acesso */}
  const resumos=[...historico,...novas].filter(p=>p?.validada===true&&typeof p.chave==='string'&&p.chave.length<400)
  obj.ctx.storage.transactionSync(()=>{for(const p of resumos)obj.sql.exec('INSERT OR IGNORE INTO missoes_partidas (chave,dados) VALUES (?,?)',p.chave,JSON.stringify(p))})
  const partidas=obj.sql.exec('SELECT dados FROM missoes_partidas').toArray().map(p=>JSON.parse(p.dados))
  if(acessoAutenticado){
    const ativos=progressoMissoes([],config,agora).lista.filter(m=>m.categoria==='eventos'&&m.eventoAtivo)
    obj.ctx.storage.transactionSync(()=>{for(const m of ativos)obj.sql.exec('INSERT OR IGNORE INTO missoes_eventos_acessos (id,quando) VALUES (?,?)',m.id,agora)})
  }
  const acessosEventos=Object.fromEntries(obj.sql.exec('SELECT id,quando FROM missoes_eventos_acessos').toArray().map(r=>[r.id,r.quando]))
  const progresso=progressoMissoes(partidas,{...config,acessosEventos},agora)
  const retro=await lerDoc(obj.env,'missoes-eventos-retroativos-2026',null)
  if(retro?.usuarios?.includes(id))for(const m of progresso.lista){
    if(m.categoria==='eventos'&&retro.eventos.includes(m.id)&&m.estadoEvento==='encerrado'&&Date.parse(m.fim)<=retro.quando&&retro.quando<=agora){m.concluida=true;m.atual=1;m.quandoRetroativo=retro.quando}
  }
  let perfil=await lerPerfil(obj.env,id)
  const bloqueadas=new Set(progresso.lista.filter(m=>m.categoria==='eventos'&&(!m.inicio||Date.parse(m.inicio)>agora)).map(m=>m.id))
  const revogar=new Set([...Object.keys(perfil?.insignias||{}),...obj.sql.exec('SELECT id FROM missoes_concessoes').toArray().map(r=>r.id)].filter(id=>bloqueadas.has(id)))
  if(revogar.size){
    const {mapa}=await mudar(obj.env,'perfis',[id],atuais=>{if(!atuais[id])return;const insignias={...atuais[id].insignias};for(const k of revogar)delete insignias[k];atuais[id]={...atuais[id],insignias}})
    perfil=mapa[id];await avisarPerfil(obj.env,id,perfil)
    obj.ctx.storage.transactionSync(()=>{for(const k of revogar)obj.sql.exec('DELETE FROM missoes_concessoes WHERE id = ?',k)})
  }
  const avisos=await obj.ctx.storage.get('notifs')||docVazio()
  const apagar=[...new Set([...revogar,...avisos.lista.filter(n=>bloqueadas.has(n.insignia)||bloqueadas.has(n.id.replace(/^ins:/,''))).map(n=>n.insignia||n.id.replace(/^ins:/,''))])]
  if(apagar.length)await obj.ctx.storage.put('notifs',juntar(avisos,{removidas:Object.fromEntries(apagar.map(k=>[`ins:${k}`,agora]))}))
  obj.ctx.storage.transactionSync(()=>{for(const m of progresso.lista)if(config.ativa!==false&&m.concluida&&!perfil?.insignias?.[m.id])obj.sql.exec('INSERT OR IGNORE INTO missoes_concessoes (id,quando) VALUES (?,?)',m.id,m.quandoRetroativo||(m.categoria==='eventos'?acessosEventos[m.id]:agora))})
  const entregar=obj.sql.exec('SELECT * FROM missoes_concessoes WHERE perfilado = 0').toArray()
  if(entregar.length) {
    await darInsignias(obj.env,{[id]:Object.fromEntries(entregar.map(m=>[m.id,m.quando]))})
    obj.ctx.storage.transactionSync(()=>{for(const m of entregar)obj.sql.exec('UPDATE missoes_concessoes SET perfilado = 1 WHERE id = ?',m.id)})
  }
  for(const r of obj.sql.exec('SELECT * FROM missoes_concessoes WHERE perfilado = 1 AND notificada = 0 LIMIT 60').toArray()) {
    const m=insigniaMissao(r.id);if(!m)continue
    const retroativa=retro?.usuarios?.includes(id)&&retro.eventos.includes(r.id)&&r.quando===retro.quando
    const texto=m.categoria==='eventos'?(retroativa?`Você recebeu a insígnia ${m.nome.toUpperCase()} na liberação dos eventos passados de 2026!`:`Você recebeu a insígnia ${m.nome.toUpperCase()} por acessar a Neura Project durante o evento!`):`Você conquistou a insígnia ${m.nome.toUpperCase()} da Neura Project!`
    await obj.notificar({id:`ins:${r.id}`,titulo:texto,texto:m.descricao,insignia:r.id,quando:r.quando,lida:false,link:'/perfil/#missoes'})
    obj.sql.exec('UPDATE missoes_concessoes SET notificada = 1 WHERE id = ?',r.id)
  }
  const recebidas={...perfil?.insignias,...Object.fromEntries(obj.sql.exec('SELECT id,quando FROM missoes_concessoes WHERE perfilado = 1').toArray().map(m=>[m.id,m.quando]))}
  return {...progresso,lista:progresso.lista.map(m=>({...m,recebida:recebidas[m.id]||null})),partidasValidadas:partidas.length}
}
export async function registrarMissoesPartida(env,chave,partida) {
  if(!partida?.missoes || !Array.isArray(partida.jogadores))return
  for(const id of [...new Set((partida.jogadores||[]).map(p=>String(p.steamId)).filter(id=>/^\d{17}$/.test(id)))]) {
    const resumo=resumoMissao(partida,id,chave)
    if(resumo)await pedirAoJogador(env,id,{acao:'missoes-sinc',partidas:[{...resumo,validada:true}]})
  }
}
// Repara também contas offline; não depende de o jogador abrir a aba de missões.
export async function corrigirEventosAntecipados(env,agora=Date.now()) {
  await distribuirEventosPassados2026(env,agora)
  const config=await configMissoes(env,agora),progresso=progressoMissoes([],config,agora)
  const bloqueadas=new Set(progresso.lista.filter(m=>m.categoria==='eventos'&&(!m.inicio||Date.parse(m.inicio)>agora)).map(m=>m.id))
  for(const [id,p] of Object.entries(await lerPerfis(env)))if(Object.keys(p.insignias||{}).some(k=>bloqueadas.has(k)))await pedirAoJogador(env,id,{acao:'missoes-sinc'})
}
// Uma única fotografia do calendário e das contas existentes. Eventos futuros
// e contas criadas depois continuam exigindo acesso autenticado no período.
export async function distribuirEventosPassados2026(env,agora=Date.now()) {
  const config=await configMissoes(env,agora)
  if(config.ativa===false)return
  let campanha=await lerDoc(env,'missoes-eventos-retroativos-2026',null)
  if(!campanha){
    const eventos=progressoMissoes([],config,agora).lista.filter(m=>m.categoria==='eventos'&&m.estadoEvento==='encerrado').map(m=>m.id)
    const usuarios=[...new Set([...Object.keys(await lerUsuarios(env)),...Object.keys(await lerPerfis(env))])]
    campanha=await mudarDoc(env,'missoes-eventos-retroativos-2026',atual=>atual||{quando:agora,eventos,usuarios,concluidos:[]})
  }
  for(const id of campanha.usuarios.filter(id=>!campanha.concluidos.includes(id)).slice(0,20)){
    await pedirAoJogador(env,id,{acao:'missoes-sinc'})
    await mudarDoc(env,'missoes-eventos-retroativos-2026',c=>({...c,concluidos:[...new Set([...c.concluidos,id])]}))
  }
  return campanha
}
export const rotaMissoes = async (env,quem,cors) => json(await pedirAoJogador(env,quem.id,{acao:'missoes-sinc',historico:true,acesso:true}),200,{...cors,'Cache-Control':'no-store'})
export async function lerPainelMissoes(env) {
  const config=await configMissoes(env)
  return {config,...progressoMissoes([],config),catalogo:MISSOES}
}
export async function salvarConfigMissoes(env,c) {
  if(!c || typeof c!=='object'||Array.isArray(c))throw new ErroPedido('config')
  const config={ativa:c.ativa!==false,metaMapas:Math.max(1,Math.min(10000,Math.round(Number(c.metaMapas)||10))),eventos:{},mapas:{}}
  for(const [id,p] of Object.entries(c.eventos||{})) {
    const base=calendarioEventosInsignias(ANO_EVENTOS)[id]
    if(!MISSOES.some(m=>m.id===id&&m.categoria==='eventos')||!p||Number(p.ano)!==ANO_EVENTOS||!/(Z|[+-]\d{2}:\d{2})$/.test(p.inicio||'')||!/(Z|[+-]\d{2}:\d{2})$/.test(p.fim||'')||!(Date.parse(p.fim)>Date.parse(p.inicio))||anoBrasilia(Date.parse(p.inicio))!==ANO_EVENTOS||(base&&Date.parse(p.fim)<Date.parse(base.fim)))throw new ErroPedido('evento')
    config.eventos[id]={ano:Number(p.ano),inicio:p.inicio,fim:p.fim}
  }
  for(const [id,p] of Object.entries(c.mapas||{})) {
    if(!MISSOES.some(m=>m.id===`mapa-${id}`)||!p||!['5v5','wingman','corrida-armada','rush'].includes(p.modo)||!/^[a-z0-9_/-]{1,100}$/.test(p.mapa||''))throw new ErroPedido('mapa')
    config.mapas[id]={mapa:p.mapa,modo:p.modo,meta:Math.max(1,Math.min(10000,Math.round(Number(p.meta)||config.metaMapas)))}
  }
  await gravarDoc(env,'missoes-config',config)
  return {ok:true}
}
