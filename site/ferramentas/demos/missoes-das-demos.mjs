// Recuperação retroativa a partir das demos oficiais, sem estimar estatísticas ausentes.
// Só grava após validar mapa, placar, sequência de rounds e elenco humano 5v5.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { parseHeader,parseEvent,parseEvents,parseTicks } from '@laihoe/demoparser2'
const aqui=path.dirname(fileURLToPath(import.meta.url)),pasta=path.resolve(aqui,'../../../partidas'),cache=path.join(aqui,'cache')
const idOk=id=>/^7656\d{13}$/.test(String(id||''))
const arquivos=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?arquivos(path.join(p,e.name)):e.name==='partida.json'?[path.join(p,e.name)]:[])
const novo=()=>({participou:false,roundsValidos:0,kills:0,headshots:0,assistencias:0,clutches:0,plantios:0,desarmes:0,melhorRound:0,armas:{}})
const lado=w=>w==='CT'||w===3?'CT':w==='T'||w==='TR'||w===2?'TR':null
for(const arquivo of arquivos(pasta)) {
  const d=JSON.parse(fs.readFileSync(arquivo,'utf8').replace(/^\uFEFF/,''))
  if(d.missoes?.versao===1 || !d.demo || !d.serie || d.cancelada || d.treino)continue
  try {
    const url=new URL(d.demo)
    if(url.hostname!=='github.com'||!url.pathname.startsWith('/guilhermeteixeira01/NeuraProjects/releases/download/'))throw Error('origem de demo não autorizada')
    const zip=path.join(cache,path.basename(url.pathname)),dem=zip.replace(/\.zip$/,'.dem')
    fs.mkdirSync(cache,{recursive:true})
    if(!fs.existsSync(zip)) {console.log('BAIXANDO',d.nome);const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error(`demo HTTP ${r.status}`);fs.writeFileSync(zip,Buffer.from(await r.arrayBuffer()))}
    if(!fs.existsSync(dem)){const e=new AdmZip(zip).getEntries().find(e=>e.entryName.endsWith('.dem'));if(!e)throw Error('zip sem demo');fs.writeFileSync(dem,e.getData())}
    console.log('VALIDANDO',d.nome)
    if(parseHeader(dem).map_name!==d.mapa)throw Error('mapa diferente')
    const n=d.placarA+d.placarB
    if(!Number.isInteger(n)||n<1||d.rounds?.length!==n)throw Error('placar não corresponde aos rounds publicados')
    const todos=parseEvent(dem,'round_end',[],['is_warmup_period','total_rounds_played']).filter(e=>!e.is_warmup_period)
    const fim=todos.slice(-n)
    if(fim.length!==n||fim.some((e,i)=>e.total_rounds_played!==i+1||lado(e.winner)!==d.rounds[i].lado))throw Error('sequência/final do placar divergente')
    const conclusao=parseEvent(dem,'cs_win_panel_match')
    if(!conclusao.some(e=>e.tick>=fim.at(-1).tick))throw Error('demo não confirma encerramento completo')
    const freezes=parseEvent(dem,'round_freeze_end',[],['is_warmup_period','total_rounds_played']).filter(e=>!e.is_warmup_period)
    const rounds=fim.map((end,i)=>({end,start:freezes.filter(e=>e.tick<end.tick&&e.total_rounds_played===i).at(-1)}))
    if(rounds.some(r=>!r.start))throw Error('início de round ausente')
    const ticks=[...new Set(rounds.flatMap(r=>[r.start.tick,r.end.tick]))]
    const estados=parseTicks(dem,['team_num','is_alive'],ticks),porTick=new Map(ticks.map(t=>[t,estados.filter(e=>e.tick===t&&[2,3].includes(e.team_num))]))
    const eventos=parseEvents(dem,['player_death','player_disconnect','bomb_planted','bomb_defused'],['team_num'],['is_warmup_period','total_rounds_played']).sort((a,b)=>a.tick-b.tick)
    const totais=new Map(),anotados=new Set()
    let validos=0
    for(const {start,end} of rounds) {
      const campo=porTick.get(start.tick)||[]
      if(campo.length!==10||campo.some(p=>!idOk(p.steamid))||campo.filter(p=>p.team_num===3).length!==5)continue
      validos++
      const elenco=new Set(campo.map(p=>p.steamid)),times=new Map(campo.map(p=>[p.steamid,p.team_num])),vivos=new Set(elenco),vitimas=new Map(),candidatos=new Set(),contas=new Map(campo.map(p=>[p.steamid,novo()]))
      for(const e of eventos.filter(e=>e.tick>=start.tick&&e.tick<=end.tick&&!e.is_warmup_period)) {
        const tag=`${e.event_name}:${e.tick}:${e.user_steamid}:${e.attacker_steamid||''}`
        if(anotados.has(tag))continue
        anotados.add(tag)
        const user=String(e.user_steamid||'')
        if(!elenco.has(user))continue
        if(e.event_name==='player_disconnect'){vivos.delete(user)}
        if(e.event_name==='player_death') {
          if(!vivos.delete(user))continue
          const atacante=String(e.attacker_steamid||'')
          if(elenco.has(atacante)&&atacante!==user&&e.attacker_team_num!==e.user_team_num&&[2,3].includes(e.attacker_team_num)) {
            const c=contas.get(atacante),arma=String(e.weapon||'').replace(/^weapon_/,'')
            c.kills++;if(e.headshot)c.headshots++;c.armas[arma]=(c.armas[arma]||0)+1
            if(!vitimas.has(atacante))vitimas.set(atacante,new Set())
            vitimas.get(atacante).add(user)
            const assist=String(e.assister_steamid||'')
            if(elenco.has(assist)&&assist!==atacante&&assist!==user&&e.assister_team_num===e.attacker_team_num)contas.get(assist).assistencias++
          }
        }
        if(e.event_name==='bomb_planted')contas.get(user).plantios=1
        if(e.event_name==='bomb_defused')contas.get(user).desarmes=1
        for(const time of [2,3]) {
          const meus=[...vivos].filter(id=>times.get(id)===time),outros=[...vivos].filter(id=>times.get(id)!==time)
          if(meus.length===1&&outros.length>=2)candidatos.add(meus[0])
        }
      }
      const finais=porTick.get(end.tick)||[]
      for(const [id,c] of contas) {
        c.participou=true;c.roundsValidos=1;c.melhorRound=vitimas.get(id)?.size||0
        if(candidatos.has(id)&&finais.some(p=>p.steamid===id&&p.is_alive&&lado(p.team_num)===lado(end.winner)))c.clutches=1
        const total=totais.get(id)||novo();total.participou=true
        for(const k of ['roundsValidos','kills','headshots','assistencias','clutches','plantios','desarmes'])total[k]+=c[k]
        total.melhorRound=Math.max(total.melhorRound,c.melhorRound)
        for(const [a,v] of Object.entries(c.armas))total.armas[a]=(total.armas[a]||0)+v
        totais.set(id,total)
      }
    }
    if(!validos)throw Error('nenhum round 5v5 elegível')
    const finais=(porTick.get(fim.at(-1).tick)||[]).filter(p=>idOk(p.steamid))
    const ultimo=d.rounds.at(-1),timeCt=ultimo.lado==='CT'?ultimo.time:ultimo.time==='A'?'B':'A'
    d.missoes={versao:1,validada:true,concluida:true,modo:'5v5',fonte:'demo',elencoFinal:finais.map(p=>p.steamid),timesFinais:Object.fromEntries(finais.map(p=>[p.steamid,p.team_num===3?timeCt:timeCt==='A'?'B':'A'])),sha256:createHash('sha256').update(fs.readFileSync(dem)).digest('hex')}
    for(const p of d.jogadores)p.missoes=totais.get(p.steamId)||novo()
    fs.writeFileSync(arquivo,JSON.stringify(d,null,2).replace(/\n/g,'\r\n'))
    console.log('RECUPERADA',d.nome,validos,'rounds validados,',totais.size,'jogadores')
  }catch(e){console.log('PENDENTE',d.nome,e.message)}
}
