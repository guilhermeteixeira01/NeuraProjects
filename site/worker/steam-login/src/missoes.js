import { MISSOES, anoBrasilia, progressoMissoes, resumoMissao, insigniaMissao } from './missoes-core.js'
import { calendarioEventosInsignias } from '../../../src/comum/eventos.js'
import { lerDoc, gravarDoc } from './dados.js'
import { darInsignias, lerPerfil } from './perfis.js'
import { pedirAoJogador } from './objetos.js'
import { ErroPedido } from './erros.js'
import { json } from './http.js'
import { enderecoDoSite } from './ranking.js'

export function iniciarMissoes(obj) {
  obj.sql.exec('CREATE TABLE IF NOT EXISTS missoes_partidas (chave TEXT PRIMARY KEY, dados TEXT NOT NULL)')
  obj.sql.exec('CREATE TABLE IF NOT EXISTS missoes_concessoes (id TEXT PRIMARY KEY, quando INTEGER NOT NULL, perfilado INTEGER NOT NULL DEFAULT 0, notificada INTEGER NOT NULL DEFAULT 0)')
}
export async function configMissoes(env,agora=Date.now()) {
  const salvo=await lerDoc(env,'missoes-config',{})
  return {ativa:true,...salvo,eventos:{...calendarioEventosInsignias(anoBrasilia(agora)),...salvo.eventos}}
}
export async function historicoMissoes(env,id) {
  const r=await fetch(`${enderecoDoSite(env)}/perfil/historico/${id}.json`,{cf:{cacheTtl:60},signal:AbortSignal.timeout(15000)})
  if(r.status===404)return []
  if(!r.ok)throw new Error('histórico de missões indisponível')
  const dados=await r.json()
  return Array.isArray(dados)?dados.map(m=>m.missoes).filter(Boolean):[]
}
export async function sincronizarMissoes(obj,id,novas=[],buscarHistorico=false,agora=Date.now()) {
  const config=await configMissoes(obj.env,agora)
  let historico=[]
  if(buscarHistorico)try{historico=await historicoMissoes(obj.env,id)}catch{/* progresso confirmado anterior continua disponível; tenta de novo no próximo acesso */}
  const resumos=[...historico,...novas].filter(p=>p?.validada===true&&typeof p.chave==='string'&&p.chave.length<400)
  obj.ctx.storage.transactionSync(()=>{for(const p of resumos)obj.sql.exec('INSERT OR IGNORE INTO missoes_partidas (chave,dados) VALUES (?,?)',p.chave,JSON.stringify(p))})
  const partidas=obj.sql.exec('SELECT dados FROM missoes_partidas').toArray().map(p=>JSON.parse(p.dados))
  const progresso=progressoMissoes(partidas,config,agora),perfil=await lerPerfil(obj.env,id)
  obj.ctx.storage.transactionSync(()=>{for(const m of progresso.lista)if(config.ativa!==false&&m.concluida&&!perfil?.insignias?.[m.id])obj.sql.exec('INSERT OR IGNORE INTO missoes_concessoes (id,quando) VALUES (?,?)',m.id,agora)})
  const entregar=obj.sql.exec('SELECT * FROM missoes_concessoes WHERE perfilado = 0').toArray()
  if(entregar.length) {
    await darInsignias(obj.env,{[id]:Object.fromEntries(entregar.map(m=>[m.id,m.quando]))})
    obj.ctx.storage.transactionSync(()=>{for(const m of entregar)obj.sql.exec('UPDATE missoes_concessoes SET perfilado = 1 WHERE id = ?',m.id)})
  }
  for(const r of obj.sql.exec('SELECT * FROM missoes_concessoes WHERE perfilado = 1 AND notificada = 0 LIMIT 60').toArray()) {
    const m=insigniaMissao(r.id);if(!m)continue
    const texto=m.categoria==='eventos'?`Você recebeu a insígnia ${m.nome.toUpperCase()} da Neura Project, referente a um evento deste ano já encerrado.`:`Você conquistou a insígnia ${m.nome.toUpperCase()} da Neura Project!`
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
export const rotaMissoes = async (env,quem,cors) => json(await pedirAoJogador(env,quem.id,{acao:'missoes-sinc',historico:true}),200,{...cors,'Cache-Control':'no-store'})
export async function lerPainelMissoes(env) {
  const config=await configMissoes(env)
  return {config,...progressoMissoes([],config),catalogo:MISSOES}
}
export async function salvarConfigMissoes(env,c) {
  if(!c || typeof c!=='object'||Array.isArray(c))throw new ErroPedido('config')
  const config={ativa:c.ativa!==false,metaMapas:Math.max(1,Math.min(10000,Math.round(Number(c.metaMapas)||10))),eventos:{},mapas:{}}
  for(const [id,p] of Object.entries(c.eventos||{})) {
    if(!MISSOES.some(m=>m.id===id&&m.categoria==='eventos')||!p||!/^20\d{2}$/.test(String(p.ano))||!/(Z|[+-]\d{2}:\d{2})$/.test(p.inicio||'')||!/(Z|[+-]\d{2}:\d{2})$/.test(p.fim||'')||!(Date.parse(p.fim)>Date.parse(p.inicio)))throw new ErroPedido('evento')
    config.eventos[id]={ano:Number(p.ano),inicio:p.inicio,fim:p.fim}
  }
  for(const [id,p] of Object.entries(c.mapas||{})) {
    if(!MISSOES.some(m=>m.id===`mapa-${id}`)||!p||!['5v5','wingman','corrida-armada','rush'].includes(p.modo)||!/^[a-z0-9_/-]{1,100}$/.test(p.mapa||''))throw new ErroPedido('mapa')
    config.mapas[id]={mapa:p.mapa,modo:p.modo,meta:Math.max(1,Math.min(10000,Math.round(Number(p.meta)||config.metaMapas)))}
  }
  await gravarDoc(env,'missoes-config',config)
  return {ok:true}
}
