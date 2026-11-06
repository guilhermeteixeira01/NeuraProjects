import CATALOGO from './missoes-catalogo.js'
import { calendarioEventosInsignias, inicioEdicao } from '../../../src/comum/eventos.js'
const DOZE_MESES = 366 * 86400000
// O período é da edição: termina depois do início dela e começa antes de 12 meses depois (src/comum/eventos.js)
export const periodoDaEdicao = (inicio, fim, ano) => fim >= inicioEdicao(ano) && inicio < inicioEdicao(ano) + DOZE_MESES
export const ANO_EVENTOS = 2027
export const MISSOES = CATALOGO
export const EXPLORADOR = ['de_dust2','de_mirage','de_inferno','de_nuke','de_ancient','de_anubis','de_overpass']
export const MAPAS_MISSOES = Object.fromEntries([
  ...['dust2','nuke','ancient','mirage','anubis','train','inferno','overpass','cache','vertigo','fachwerk','boulder'].map(m=>[m,{mapa:`de_${m}`,modo:'5v5'}]),
  ...['italy','office','shelter'].map(m=>[m,{mapa:`cs_${m}`,modo:'5v5'}]),
  ['debris',{mapa:'de_debris',modo:'wingman'}],['el-dorado',{mapa:'de_eldorado',modo:'wingman'}],
  ...['baggage','shoots','pool-day'].map(m=>[m,{mapa:`ar_${m.replaceAll('-','_')}`,modo:'corrida-armada'}]),
  ['complex-rush',{mapa:null,modo:'rush'}],
])
const CATEGORIAS = {
  pistolas:['glock','hkp2000','usp_silencer','p250','elite','fiveseven','tec9','cz75a','deagle','revolver'],
  submetralhadoras:['mac10','mp9','mp7','mp5sd','ump45','p90','bizon'],
  rifles:['ak47','m4a1','m4a1_silencer','famas','galilar','aug','sg556'],
  escopetas:['nova','xm1014','mag7','sawedoff'],
  precisao:['awp','ssg08','scar20','g3sg1'],
}
export const categoriaArma = arma => Object.keys(CATEGORIAS).find(c=>CATEGORIAS[c].includes(String(arma).replace(/^weapon_/,''))) || null
export const numeroMissao = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : 0
export const anoBrasilia = agora => Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date(agora)))
export const idEventoMissao = (id,ano) => `${id}-${ano}`
export function insigniaMissao(id) {
  const base=String(id).replace(/-\d{4}$/,'')
  const m=MISSOES.find(m=>m.id===base)
  if(!m || (m.categoria==='eventos' && !/^evento-.+-20\d{2}$/.test(id)))return null
  return {...m,id,nome:m.categoria==='eventos'?`${m.nome} ${String(id).slice(-4)}`:m.nome}
}

// Dados consolidados do coletor autenticado, nunca estatísticas enviadas pelo navegador.
export function resumoMissao(partida,id,chave) {
  const meta=partida?.missoes
  if(meta?.versao!==1 || meta.concluida!==true || meta.validada!==true || !Array.isArray(meta.elencoFinal) || !Array.isArray(partida.jogadores) || !['5v5','wingman','corrida-armada','rush'].includes(meta.modo) || partida.cancelada || partida.treino || partida.aquecimento)return null
  const p=partida.jogadores?.find(p=>String(p.steamId)===id)
  if(!p || p.bot || !p.time || p.missoes?.participou!==true)return null
  if(meta.modo==='5v5'&&numeroMissao(p.missoes?.roundsValidos)<1)return null
  const presenteFinal=(meta.elencoFinal||[]).includes(id)
  const timeFinal = meta.timesFinais?.[id] || p.time
  const companheiros = [...new Set(partida.jogadores.filter(j => String(j.steamId) !== id && !j.bot && j.missoes?.participou === true && numeroMissao(j.missoes?.roundsValidos) > 0 && meta.elencoFinal.includes(String(j.steamId)) && (meta.timesFinais?.[j.steamId] || j.time) === timeFinal).map(j => String(j.steamId)))].slice(0, 4)
  const s=p.missoes || {},armas={}
  for(const [nome,v] of Object.entries(s.armas||{}))armas[nome]=numeroMissao(v)
  return {chave,mapa:String(partida.mapa||''),modo:meta.modo,presenteFinal,companheiros,venceu:presenteFinal&&(partida.placarA>partida.placarB?'A':partida.placarB>partida.placarA?'B':null)===(meta.timesFinais?.[id]||p.time),
    kills:numeroMissao(s.kills),headshots:numeroMissao(s.headshots),assistencias:numeroMissao(s.assistencias),clutches:numeroMissao(s.clutches),plantios:numeroMissao(s.plantios),desarmes:numeroMissao(s.desarmes),melhorRound:Math.min(5,numeroMissao(s.melhorRound)),armas}
}

export function progressoMissoes(partidas,config={},agora=Date.now()) {
  const amigos = new Set((config.amigos || []).filter(id => /^\d{17}$/.test(id)))
  const duplas = {}, partidasSquad = []
  const cont={kills:0,headshots:0,assistencias:0,clutches:0,plantios:0,desarmes:0,melhorRound:0,vitorias:0,awp:0,he:0,fogo:0,pistolas:0,submetralhadoras:0,rifles:0,escopetas:0,precisao:0},vitorias=new Set(),mapas={}
  const vistos=new Set()
  for(const p of partidas) {
    if(!p?.chave || vistos.has(p.chave))continue
    vistos.add(p.chave)
    if(p.presenteFinal===true)mapas[`${p.modo}:${p.mapa}`]=(mapas[`${p.modo}:${p.mapa}`]||0)+1
    if(p.modo!=='5v5')continue
    if (p.presenteFinal === true) {
      const juntos = [...new Set(p.companheiros || [])].filter(id => amigos.has(id))
      for (const id of juntos) duplas[id] = (duplas[id] || 0) + 1
      if (juntos.length >= 4) partidasSquad.push(p.chave)
    }
    for(const k of ['kills','headshots','assistencias','clutches','plantios','desarmes'])cont[k]+=numeroMissao(p[k])
    cont.melhorRound=Math.max(cont.melhorRound,numeroMissao(p.melhorRound))
    if(p.venceu){cont.vitorias++;vitorias.add(p.mapa)}
    for(const [arma,qtd] of Object.entries(p.armas||{})) {
      const n=numeroMissao(qtd),nome=arma.replace(/^weapon_/,'')
      const categoria=categoriaArma(nome);if(categoria)cont[categoria]+=n
      if(nome==='awp')cont.awp+=n
      if(['hegrenade','he'].includes(nome))cont.he+=n
      if(['inferno','molotov','incgrenade'].includes(nome))cont.fogo+=n
    }
  }
  const regras={headshot:['headshots',100],sniper:['awp',50],clutch:['clutches',10],ace:['melhorRound',5],demolidor:['plantios',25],desarmador:['desarmes',25],suporte:['assistencias',100],veterano:['vitorias',100],'primeira-vitoria':['vitorias',1],pistoleiro:['pistolas',100],rajada:['submetralhadoras',100],granadeiro:['he',10],incendiario:['fogo',10],implacavel:['kills',1000]}
  const ano=ANO_EVENTOS,pendencias=[],calendario=calendarioEventosInsignias(ano)
  const lista=MISSOES.map(m=>{
    let atual=0,meta=1,id=m.id,detalhes,evento
    if(m.categoria==='combate') {
      const r=regras[m.id.replace('missao-','')]
      if(r){atual=cont[r[0]];meta=r[1]}
      if(m.id==='missao-versatil'){detalhes=Object.fromEntries(Object.keys(CATEGORIAS).map(c=>[c,{atual:cont[c],meta:20}]));atual=Object.values(detalhes).filter(d=>d.atual>=20).length;meta=5}
      if(m.id==='missao-explorador'){detalhes=Object.fromEntries(EXPLORADOR.map(c=>[c,{atual:vitorias.has(c)?1:0,meta:1}]));atual=EXPLORADOR.filter(c=>vitorias.has(c)).length;meta=7}
    } else if(m.categoria==='amizades') {
      if (m.id === 'amizade-primeira') { atual = amigos.size; meta = 1 }
      if (m.id === 'amizade-circulo') { atual = amigos.size; meta = 10 }
      if (m.id === 'amizade-dupla-inseparavel') { atual = Math.max(0, ...Object.values(duplas)); meta = 10 }
      if (m.id === 'amizade-squad-unido') { atual = partidasSquad.length; meta = 1 }
    } else if(m.categoria==='mapas') {
      const chave=m.id.replace('mapa-',''),cfg={...MAPAS_MISSOES[chave],...config.mapas?.[chave]}
      meta=Math.max(1,Math.min(10000,Math.round(Number(cfg.meta??config.metaMapas)||10)))
      atual=mapas[`${cfg.modo}:${cfg.mapa}`]||0
      if(!cfg.mapa || !cfg.modo)pendencias.push({id,motivo:'Configure o identificador canônico e o modo do mapa.'})
    } else {
      id=idEventoMissao(m.id,ano)
      const periodo=config.eventos?.[m.id]
      if(!periodo || periodo.ano!==ano || !Number.isFinite(Date.parse(periodo.inicio)) || !Number.isFinite(Date.parse(periodo.fim)) || !periodoDaEdicao(Date.parse(periodo.inicio),Date.parse(periodo.fim),ano) || Date.parse(periodo.fim)<=Date.parse(periodo.inicio) || (calendario[m.id]&&Math.floor(Date.parse(periodo.fim)/1000)<Math.floor(Date.parse(calendario[m.id].fim)/1000)))pendencias.push({id:m.id,motivo:`Configure o período da edição ${ano}, sem antecipar seu encerramento.`})
      else {
        const inicio=Date.parse(periodo.inicio),fim=Date.parse(periodo.fim),acesso=Number(config.acessosEventos?.[id])
        evento={inicio:periodo.inicio,fim:periodo.fim,eventoAtivo:agora>=inicio&&agora<=fim,estadoEvento:agora<inicio?'aguardando':agora>fim?'encerrado':'ativo'}
        atual=Number.isFinite(acesso)&&acesso>=inicio&&acesso<=fim&&acesso<=agora?1:0
      }
    }
    return {...m,id,atual,meta,concluida:atual>=meta,...(detalhes?{detalhes}:{}),...(evento||{})}
  })
  return {lista,pendencias}
}
