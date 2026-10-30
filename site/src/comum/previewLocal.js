import { podeUsarMolduraEvento } from './molduras.js'
import { podeUsarFundoPerfil } from '../../worker/steam-login/src/fundos-perfil.js'
import { estadoDiario } from '../../worker/steam-login/src/diario-core.js'
import { progressoMissoes, ANO_EVENTOS } from '../../worker/steam-login/src/missoes-core.js'
import { calendarioEventosInsignias } from './eventos.js'
// Importado somente pelo servidor de desenvolvimento em loopback. Não autentica no worker real.
import { CONFIG } from './config.js'
import { INSIGNIAS } from './insignias.js'
import { CARDS } from './cardsPerfil.js'
import catalogo from '../../worker/steam-login/src/caixas-iniciais.json'
import { CONFIG_PADRAO as CONFIG_BASE, chancesDaCaixa, aplicarModo, faixasDeDesgaste, sortearAbertura, gerarFaixa, gerarFaixaFacas, valorDoItem, progressoInsignias } from '../../worker/steam-login/src/loja-core.js'
const CONFIG_PADRAO = { ...CONFIG_BASE, porCaixa: true }

export function ativarPreviewLocal() {
  if (window.__npPreviewAtivo) return
  const id = '76561198000000011'
  const nome = 'Jogador de teste'
  const avatar = '/assets/logos/logo-np-64.png'
  // Conquistas de demonstração: existem somente no navegador da prévia local.
  const exemplos = [
    ...INSIGNIAS.filter(i => i.categoria === 'combate').slice(0, 4),
    ...INSIGNIAS.filter(i => i.categoria === 'mapas').slice(0, 3),
    ...INSIGNIAS.filter(i => /^evento-(dia-do-trabalho|dia-da-mulher)-2027$/.test(i.id)),
    ...INSIGNIAS.filter(i => i.loja).slice(0, 2),
    ...INSIGNIAS.filter(i => i.id === 'top3'),
  ]
  const perfisDemo = { [id]: { nick: nome, insignias: Object.fromEntries(exemplos.map(i => [i.id, Date.parse('2026-10-26T12:00:00-03:00')])), vistos: { ins: exemplos.map(i => i.id), nivel: 100 } } }
  const caixas = catalogo.map(c => ({ ...c, chances: chancesDaCaixa(c, CONFIG_PADRAO) }))
  const pessoas = [{id,nome,avatar,st:'online',dono:true,cargo:'membro'}, {id:'76561198000000012',nome:'Luna · teste',avatar,st:'online',cargo:'membro'}, {id:'76561198000000013',nome:'Rafa · teste',avatar,st:'ausente',cargo:'membro'}, {id:'76561198000000014',nome:'Nico · teste',avatar,st:'jogando',cargo:'membro'}]
  const novoId = () => 'demo'+Math.random().toString(36).slice(2,10)
  const itens = Object.fromEntries(caixas[0].itens.slice(0,12).map((it,i)=>['demoitem'+i,{t:it.t||'arma',d:it.d,p:it.p,f:.08+i*.012,s:i*23,st:0,a:[null,null,null,null,null],k:null}]))
  caixas[0].facas.slice(0,2).forEach((it,i)=>{itens['demoraro'+i]={t:it.t||'faca',d:it.d,p:it.p,f:.04,s:100,st:0,a:[null,null,null,null,null]}})
  itens.democaixa={t:'caixa',d:caixas[0].id,p:0}
  let estado={saldo:250000,abertas:36,inv:{v:2,itens,equip:{ct:{},tr:{}},criado:Object.fromEntries(Object.keys(itens).map(k=>[k,Date.now()]))},mensagens:[{id:'demomsg1',de:pessoas[1].id,texto:'Bora jogar com o pessoal hoje?',ts:Date.now()-180000},{id:'demomsg2',de:id,texto:'Bora! Vou montar o grupo.',ts:Date.now()-120000},{id:'demomsg3',de:pessoas[1].id,texto:'Esse é o chat de demonstração.',ts:Date.now()-60000}],chat:[{id:'demochat',de:pessoas[1].id,nome:pessoas[1].nome,texto:'Bem-vindos ao time de teste!',ts:Date.now()-60000}]}
  try { estado=JSON.parse(sessionStorage.getItem('np-preview-dados-v2')||'null')||estado } catch { /* estado inicial */ }
  estado.notificacoes ??= {lista:[{id:'demo-boas-vindas',titulo:'Bem-vindo à prévia local',texto:'Amigos, time, inventário e saldo são dados de demonstração.',link:'/lobby/',imagem:avatar,quando:Date.now()-60000,lida:false},{id:'demo-caixas',titulo:'Caixas prontas para testar',texto:'Abra caixas e veja o resultado no inventário de teste.',link:'/loja/',quando:Date.now()-120000,lida:false}],vistos:[],limpoEm:0}
  if (!estado.notificacoes.lista.some((n) => n.id === 'demo-mercado')) estado.notificacoes.lista.unshift({id:'demo-mercado',titulo:'Sua skin foi vendida no mercado!',texto:'Luna · teste comprou AK-47 | Redline por 450 NP. Os pontos já estão na sua conta.',link:'/loja/?aba=skins',imagem:avatar,raridade:4,quando:Date.now()-30000,lida:false})
  estado.conta ??= {nome:'',sobrenome:'',cpf:'',nascimento:'',discord:'',descricao:'Jogador da comunidade Neura.',faceit:'',privacidade:Object.fromEntries(['perfil','inventario','amigos','conquistas','convites'].map(k=>[k,'todos']))}
  Object.assign(perfisDemo[id], estado.personalizacao || {})
  estado.hall ??= {estado:'sem-foto',camisa:'escura'}
  estado.amigos ??= pessoas.slice(1).map(p => p.id)
  const guardar=()=>{try{sessionStorage.setItem('np-preview-dados-v2',JSON.stringify(estado))}catch{/* sem armazenamento */}}
  const hallDaPrevia=()=>{
    const h=estado.hall
    if(['fila','gerando'].includes(h.estado)){
      const tempo=Date.now()-(h.geracaoLocal||Date.now())
      if(tempo>=2500){h.estado='aprovada';h.aprovada=`/assets/hall/jogador-${h.camisa==='clara'?'clara':'escura'}.webp`;h.camisaAprovada=h.camisa;h.montada=true}
      else if(tempo>=700)h.estado='gerando'
      guardar()
    }
    return {...h,simulacao:true}
  }
  const time={id:'equipe-demo',nome:'Neura Academy · teste',tag:'NRA',logo:avatar,descricao:'Time de demonstração para revisar membros, cargos e chat.',publico:true,criada:Date.now()-86400000*30,minhas:['dono','editar','convidar','expulsar','moderar'],cargos:[{id:'membro',nome:'Membro',cor:'#a6c5ed',permissoes:[]}],membros:pessoas}
  const base = `${location.origin}/__preview-local`
  CONFIG.loginSteam = base
  window.__npPreviewAtivo = true
  window.__npPreviewToken = sessionStorage.getItem('np-preview-saiu') ? null : btoa(JSON.stringify({ id, nome, avatar, exp: Date.now() / 1000 + 86400 })) + '.demonstracao-local'
  const config = { cargos: [], equipe: { dono: id, admins: [] }, selos: { dono: { pick: true, mostrar: false }, admin: { pick: true, mostrar: false } } }
  const respostas = {
    '/config': config,
    '/perfis': perfisDemo,
    '/eu': { id, admin: true, dono: true, painel: true, abas: ['usuarios', 'molduras', 'cards', 'cargos', 'pontos', 'logs', 'servidor'] },
    '/conta/seguranca': { nick: nome, temSenha: true, email: 'teste@example.com', premium: true, podeTrocarNick: true },
    '/amigos': { amigos: pessoas.slice(1), recebidos: [], enviados: [] },
    '/lobby': { eu: id, lider: id, souLider: true, publico: false, max: 5, membros: [{ id, nome, avatar, st: 'online' }], convites: [], convitesRecebidos: [], abertos: [], emLobby: [], emPartida: [], partida: null },
    '/status/cs2': { atualizacao: null, servidor: { online: true, atualizando: false } },
    '/dm': { conversas: [{...pessoas[1],amigo:true,ts:Date.now()-60000,texto:'Esse é o chat de demonstração.',naoLidas:0}] }, '/trocas': { recebidas: [], enviadas: [] },
    '/notificacoes': { doc: { lista: [], vistos: [], limpoEm: 0 } },
    '/equipes/publico': { times: [{ ...time, n: pessoas.length, ids: pessoas.map((p) => p.steamId || p.id).filter(Boolean).slice(0, 5), aberto: true }, { nome: 'Furia Mix', tag: 'FMX', logo: '', n: 5, ids: [], descricao: 'Mix das quartas.', aberto: false, criada: Date.now() - 86400000 * 3 }, { nome: 'Os Brabos', tag: 'BRB', logo: '', n: 2, ids: [], descricao: '', aberto: true, criada: Date.now() - 86400000 * 90 }] }, '/equipes/meu': { time, convites: [], custo: 1000 }, '/equipes': { equipes: [time] },
    '/mercado': { anuncios: [] }, '/skins': { v: 2, itens: {}, equip: { ct: {}, tr: {} }, criado: {} },
    '/loja': { saldo: 5000, pontos: 5000, cfg: { maxQtd: 1 }, caixas, fechadas: {}, insignias: progressoInsignias({ abertas: 37, facas: 1 }, caixas).map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, cor: i.cor, secreta: !!i.secreta, grupo: i.grupo || null, nivel: i.nivel || null, meta: i.meta, atual: i.atual, ganhou: i.ok ? Date.now() : 0 })), ganhas: {} },
    '/loja/saldo': { saldo: 5000 }, '/loja/caixas': caixas, '/loja/drops': { recentes: [], bons: [], top: [], agora: Date.now() },
    '/admin/dados': { usuarios: { [id]: { nome, avatar } }, perfis: {}, config, dono: id },
    '/admin/logs': { logs: [], total: 0 }, '/admin/servidor/status': { estado: 'rodando', total: 0, logs: [] },
  }
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if(url.hostname==='api-public.cs-prod.leetify.com'&&url.pathname==='/v3/profile'&&pessoas.some(p=>p.id===url.searchParams.get('steam64_id')))return Response.json({ranks:{premier:15340}})
    if (!url.href.startsWith(base + '/')) return original(input, init)
    const rota = url.pathname.slice('/__preview-local'.length)
    const metodo = init?.method || (input instanceof Request ? input.method : 'GET')
    let corpo={}
    try{corpo=JSON.parse(init?.body||(input instanceof Request?await input.clone().text():'{}'))}catch{/* leitura */}
    if (rota === '/perfil' && metodo === 'POST') {
      if (corpo.moldura && !podeUsarMolduraEvento(corpo.moldura,perfisDemo[id])) return Response.json({erro:'molduraInsignia'},{status:403})
      if ('fundoPerfil' in corpo && !podeUsarFundoPerfil(corpo.fundoPerfil,perfisDemo[id])) return Response.json({erro:'fundoInsignia'},{status:403})
      estado.personalizacao = {...estado.personalizacao, ...corpo}
      Object.assign(perfisDemo[id], corpo)
      guardar()
      return Response.json({perfis:perfisDemo})
    }
    if(rota==='/loja/premium-partidas') return Response.json({partidas:estado.premiumPartidas || {}})
    if(rota==='/chat/global') {
      estado.chatGlobal??={msgs:[{id:'cg1',de:pessoas[1].id,nome:pessoas[1].nome,avatar,texto:'Alguém pra um mix agora?',ts:Date.now()-240000},{id:'cg2',de:pessoas[2].id,nome:pessoas[2].nome,avatar,texto:'Bora! Falta 1 no lobby.',ts:Date.now()-200000},{id:'cg3',de:pessoas[3].id,nome:pessoas[3].nome,avatar,texto:'Acabei de tirar uma faca na caixa diária 😱',ts:Date.now()-90000}],fixado:{texto:'Torneio 5x5 sábado às 20h — inscrições abertas no Discord!',tom:'torneio',por:id,ts:Date.now()-3600000}}
      const cg=estado.chatGlobal
      if(metodo==='GET')return Response.json({mensagens:cg.msgs,fixado:cg.fixado})
      let msg
      if(corpo.acao==='enviar'){const texto=String(corpo.texto||'').trim().slice(0,240);if(!texto)return Response.json({erro:'mensagem'},{status:400});msg={id:novoId(),de:id,nome,avatar,texto,ts:Date.now()};cg.msgs=[...cg.msgs,msg].slice(-150)}
      else if(corpo.acao==='apagar')cg.msgs=cg.msgs.filter(m=>m.id!==corpo.id)
      else if(corpo.acao==='silenciar')cg.msgs=cg.msgs.filter(m=>m.de!==corpo.id)
      else if(corpo.acao==='fixar')cg.fixado=String(corpo.texto||'').trim()?{texto:String(corpo.texto).trim().slice(0,200),tom:corpo.tom||'aviso',por:id,ts:Date.now()}:null
      guardar();return Response.json({ok:true,...(msg?{msg}:{}),fixado:cg.fixado})
    }
    // Mercado oficial: catálogo de demonstração (o admin edita em /admin/loja-oficial)
    if(rota==='/loja/oficial'||rota==='/loja/oficial/comprar'||rota==='/admin/loja-oficial') {
      const c=estado.consumiveis??={boost:2,freeze:1,ativo:null}
      estado.oficial??={catalogo:{consumiveis:{boost:2500,freeze:1500},itens:[{tipo:'moldura',id:'times/furia',preco:3000},{tipo:'moldura',id:'times/navi',preco:3000},{tipo:'fundo',id:'nuke',preco:1500},{tipo:'card',id:CARDS[0],preco:2000},{tipo:'card',id:CARDS[1],preco:2200}],kits:[{id:'kit-demo',nome:'Kit Neura',card:CARDS[2],moldura:'times/vitality',fundo:'inferno',preco:6000}]},possui:{moldura:[],card:[],fundo:[]}}
      const o=estado.oficial
      if(rota==='/admin/loja-oficial'){if(metodo==='POST'){o.catalogo={...o.catalogo,...corpo};guardar()}return Response.json(o.catalogo)}
      if(rota==='/loja/oficial/comprar'){
        if(['boost','freeze'].includes(corpo.tipo))c[corpo.tipo]+=Number(corpo.qtd)||1
        else{const k=o.catalogo.kits.find(k=>k.id===corpo.id);for(const [t,v] of k?['card','moldura','fundo'].filter(t=>k[t]).map(t=>[t,k[t]]):[[corpo.tipo,corpo.id]])if(!o.possui[t].includes(v))o.possui[t].push(v)}
        guardar();return Response.json({saldo:4321,possui:o.possui,consumiveis:c})
      }
      return Response.json({catalogo:o.catalogo,possui:o.possui,consumiveis:c,saldo:5000})
    }
    if(rota.startsWith('/loja/consumiveis')) {
      const c=estado.consumiveis??={boost:2,freeze:1,ativo:null}
      if(rota.endsWith('/ativar')){if(c.ativo)return Response.json({erro:'ja-ativo'},{status:409});if(!(c[corpo.tipo]>0))return Response.json({erro:'sem-item'},{status:409});c[corpo.tipo]--;c.ativo={tipo:corpo.tipo,desde:Date.now()}}
      if(rota.endsWith('/cancelar')&&c.ativo){c[c.ativo.tipo]++;c.ativo=null}
      guardar();return Response.json(c)
    }
    if(rota==='/loja/diario'||rota==='/loja/diario/pontos'||rota==='/loja/diario/caixa') {
      const diaria=caixas.find(c=>c.slug==='caixa-diaria'), d=estadoDiario(estado.diario||{})
      estado.diario??={}
      let recebido=false
      if(metodo==='POST'&&rota.endsWith('/pontos')&&!d.pontosResgatados){estado.diario.pontosDia=d.dia;estado.diario.sequencia=d.sequencia;estado.saldo+=d.pontos;recebido=true}
      if(metodo==='POST'&&rota.endsWith('/caixa')&&!d.caixaResgatada){const k=novoId();estado.inv.itens[k]={t:'caixa',d:diaria.id,p:0};estado.inv.criado[k]=Date.now();estado.diario.caixaDia=d.dia;recebido=true}
      guardar();return Response.json({...estadoDiario(estado.diario),recebido,caixa:diaria,caixasDisponiveis:Object.values(estado.inv.itens).filter(i=>i.t==='caixa'&&i.d===diaria.id).length})
    }
    if (metodo !== 'GET') {
      if(rota==='/amigos') {
        if(corpo.acao==='remover')estado.amigos=estado.amigos.filter(a=>a!==corpo.id)
        if(corpo.acao==='aceitar')estado.amigos=[...new Set([...estado.amigos,corpo.id])]
        guardar();return Response.json({amigos:pessoas.filter(p=>estado.amigos.includes(p.id)),recebidos:[],enviados:[]})
      }
      if(rota==='/conta/dados'){estado.conta=corpo;guardar();return Response.json(estado.conta)}
      if(rota==='/hall'){estado.hall={...estado.hall,pedido:novoId(),original:corpo.foto,camisa:corpo.camisa,estado:'pendente',nome,motivo:'',tentativasGeracao:0};guardar();return Response.json(hallDaPrevia())}
      if(rota==='/hall/revisao'){
        if(corpo.pedido!==estado.hall.pedido)return Response.json({erro:'pedido-alterado'},{status:409})
        estado.hall={...estado.hall,estado:corpo.acao==='aprovar'?'fila':'reprovada',motivo:corpo.motivo||'',geracaoLocal:Date.now()};guardar()
        if(corpo.acao==='aprovar')for(const tempo of [800,2700])setTimeout(()=>{hallDaPrevia();window.dispatchEvent(new Event('np-hall'))},tempo)
        return Response.json({ok:true,simulacao:true})
      }

      if(rota==='/dm') {
        if(corpo.acao==='apagar-conversa')estado.mensagens=[]
        else if(corpo.acao==='apagar-mensagem')estado.mensagens=estado.mensagens.filter(m=>m.id!==corpo.mensagem)
        else{const msg={id:novoId(),de:id,texto:corpo.texto,ts:Date.now()};estado.mensagens.push(msg);guardar();return Response.json({msg})}
        guardar();return Response.json({ok:true})
      }
      if(rota==='/equipes/chat'){const msg={id:novoId(),de:id,nome,texto:corpo.texto,ts:Date.now()};estado.chat.push(msg);guardar();return Response.json({msg})}
      if(rota==='/skins'){estado.inv=corpo;guardar();return Response.json(estado.inv)}
      if(rota==='/skins/excluir'){delete estado.inv.itens[corpo.id];guardar();return Response.json(estado.inv)}
      if(rota==='/loja/abrir'){
        let cx=caixas.find(c=>c.id===Number(corpo.caixa)||c.slug===corpo.caixa)||caixas[0],cfg=CONFIG_PADRAO
        if(corpo.modo){const m=aplicarModo(cx,cfg,corpo.modo);cx=m.caixa;cfg=m.cfg}
        const resultados=[]
        for(let k=0;k<Math.max(1,Math.min(1,Number(corpo.qtd)||1));k++){
          const ganhou=sortearAbertura(cx,cfg,Math.random),faixa=gerarFaixa(cx,cfg,ganhou,Math.random),item=novoId(),v=valorDoItem(ganhou.item,ganhou.raridade)
          const fechada=Object.keys(estado.inv.itens).find(k=>estado.inv.itens[k].t==='caixa'&&estado.inv.itens[k].d===cx.id)
          const usar=!!fechada&&(cx.arquivada||['inventario','auto'].includes(corpo.origem))
          if(cx.arquivada&&!usar)return Response.json({erro:'sem-caixa'},{status:409})
          if(usar){delete estado.inv.itens[fechada];delete estado.inv.criado[fechada]}else estado.saldo-=cx.preco
          estado.inv.itens[item]={...ganhou.item,st:0,a:[null,null,null,null,null]};estado.inv.criado[item]=Date.now();estado.abertas++
          resultados.push({id:item,raridade:ganhou.raridade,indice:ganhou.indice,item:ganhou.item,faixa:faixa.itens,alvo:faixa.alvo,quase:faixa.quase,v,facas:ganhou.raridade===5?gerarFaixaFacas(cx,ganhou,Math.random):null})
        }
        guardar();return Response.json({saldo:estado.saldo,resultados,restantes:0,aberturasEspecial:estado.abertas,insignias:[]})
      }
      if(rota==='/loja/comprar'){
        const cx=caixas.find(c=>c.id===Number(corpo.caixa)||c.slug===corpo.caixa)||caixas[0],ids=[]
        for(let i=0;i<Math.min(5,Number(corpo.qtd)||1);i++){const k=novoId();estado.inv.itens[k]={t:'caixa',d:cx.id,p:0};estado.inv.criado[k]=Date.now();estado.saldo-=cx.preco;ids.push(k)}guardar();return Response.json({saldo:estado.saldo,ids,insignias:[]})
      }
      if(rota==='/loja/vender'){let total=0;for(const k of corpo.ids||[])if(estado.inv.itens[k]){delete estado.inv.itens[k];total+=100}estado.saldo+=total;guardar();return Response.json({saldo:estado.saldo,total,inv:estado.inv})}
      if(rota==='/notificacoes'){estado.notificacoes=corpo.doc||corpo;guardar();return Response.json({doc:estado.notificacoes})}
      return Response.json({ok:true,saldo:estado.saldo,inv:estado.inv})
    }
    if(rota==='/conta/dados')return Response.json(estado.conta)
    if(rota==='/amigos')return Response.json({amigos:pessoas.filter(p=>estado.amigos.includes(p.id)),recebidos:[],enviados:[]})
    if(rota==='/perfil/amigos')return Response.json({permitido:true,amigos:pessoas.filter(p=>p.id!==url.searchParams.get('id'))})
    if(rota==='/missoes')return Response.json({...progressoMissoes([],{eventos:calendarioEventosInsignias(ANO_EVENTOS)}),partidasValidadas:0,simulacao:true})
    if(rota==='/admin/missoes')return Response.json({config:{ativa:true,metaMapas:10,eventos:calendarioEventosInsignias(ANO_EVENTOS)},...progressoMissoes([],{eventos:calendarioEventosInsignias(ANO_EVENTOS)})})
    if(rota==='/afiliado')return Response.json({cadastrados:2,premios:1,np:1000,caixa:'Caixa Facas',lista:[{...pessoas[1],criado:Date.now()-86400000,entregue:Date.now()-3600000},{...pessoas[2],criado:Date.now()-1800000,entregue:null}]})
    if(rota==='/perfil/publico')return Response.json({permitido:true,descricao:estado.conta.descricao,faceit:estado.conta.faceit,visibilidade:Object.fromEntries(Object.keys(estado.conta.privacidade).map(k=>[k,true])),amigos:pessoas.slice(1)})
    if(rota==='/hall')return Response.json(hallDaPrevia())
    if(rota==='/hall/publico')return Response.json({foto:estado.hall.aprovada,camisa:estado.hall.camisaAprovada,montada:estado.hall.montada})
    if(rota==='/hall/revisao'){const h=hallDaPrevia();return Response.json({pedidos:['pendente','fila','gerando','falhou'].includes(h.estado)?[{id,...h}]:[],geracaoDisponivel:true,simulacao:true})}
    if(rota==='/dm'&&url.searchParams.has('com'))return Response.json({com:{...(pessoas.find(p=>p.id===url.searchParams.get('com'))||pessoas[1]),amigo:true},mensagens:estado.mensagens})
    if(rota==='/equipes/chat')return Response.json({equipe:time.id,mensagens:estado.chat})
    if(rota==='/notificacoes')return Response.json({doc:estado.notificacoes})
    if(rota==='/lobby')return Response.json({...respostas['/lobby'],membros:pessoas.slice(0,3),publico:true})
    if(rota==='/admin/dados')return Response.json({...respostas['/admin/dados'],usuarios:Object.fromEntries(pessoas.map(p=>[p.id,p]))})
    if(rota==='/loja/drops'){const d={id:'demoDrop',ts:Date.now()-60000,r:4,v:14500,t:'arma',d:7,p:282,quem:pessoas[1].id,nome:pessoas[1].nome,avatar,caixa:caixas[0].slug};return Response.json({agora:Date.now(),recentes:[d],bons:[d],top:[d]})}
    if(rota==='/skins')return Response.json(estado.inv)
    if(rota==='/skins/inventario')return Response.json({...estado.inv,valores:Object.fromEntries(Object.keys(estado.inv.itens).map(k=>[k,150])),simulacao:true})
    if(rota==='/loja/saldo')return Response.json({saldo:estado.saldo})
    if(rota==='/loja')return Response.json({...respostas['/loja'],fechadas:Object.fromEntries(caixas.map(c=>[c.id,Object.values(estado.inv.itens).filter(i=>i.t==='caixa'&&i.d===c.id).length])),caixas:caixas.filter(c=>!c.arquivada||c.diaria||Object.values(estado.inv.itens).some(i=>i.t==='caixa'&&i.d===c.id)).map(c=>({...c,foraDeVenda:!!c.arquivada})),saldo:estado.saldo,pontos:estado.saldo,cfg:{...CONFIG_PADRAO,maxQtd:1},aberturasEspecial:estado.abertas})
    if(rota==='/loja/valores')return Response.json({valores:Object.fromEntries(Object.keys(estado.inv.itens).map(k=>[k,{r:3,v:150}]))})
    if(rota==='/mercado')return Response.json({anuncios:[{id:'demoanuncio',vendedor:pessoas[1].id,vendedorNome:pessoas[1].nome,vendedorAvatar:avatar,item:itens.demoitem0,preco:450,ref:500,criado:Date.now()}]})
    if(rota==='/partidas/recentes')return Response.json([])
    if(rota==='/usuarios/buscar')return Response.json({jogadores:pessoas})
    if(rota==='/admin/caixas-lista')return Response.json(catalogo)
    if (rota === '/loja/caixa') {
      const caixa = caixas.find((c) => c.slug === url.searchParams.get('slug') || String(c.id) === url.searchParams.get('id')) || caixas[0]
      const desgastes=it=>faixasDeDesgaste(CONFIG_PADRAO,it.min,it.max).map(f=>({nome:f.nome,p:f.p,v:valorDoItem({f:f.f},it.r||5)}))
      const modos={};for(const modo of ['jester','boost']){const m=aplicarModo(caixa,CONFIG_PADRAO,modo);modos[modo]={preco:Math.round(caixa.preco*(modo==='jester'?2:1.6)),chances:chancesDaCaixa(m.caixa,m.cfg)}}
      return Response.json({itens:caixa.itens.map(desgastes),facas:caixa.facas.map(desgastes),modos})
    }
    return Promise.resolve(Response.json(respostas[rota] ?? {}))
  }
  const SocketReal = window.WebSocket
  window.WebSocket = class extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
    constructor(url, protocolos) {
      super()
      if (!String(url).includes('/__preview-local/')) return new SocketReal(url, protocolos)
      this.readyState = 0
      this.timer = setTimeout(() => { this.readyState = 1; this.onopen?.(new Event('open')); this.receber({ tipo: 'estado', status: Object.fromEntries(pessoas.map(p=>[p.id,{st:p.st,visto:Date.now()}])) }) }, 30)
    }
    receber(dados) { this.onmessage?.(new MessageEvent('message', { data: typeof dados === 'string' ? dados : JSON.stringify(dados) })) }
    send(dados) { if (dados === 'ping') this.receber('pong') }
    close() { clearTimeout(this.timer); this.readyState = 3; this.onclose?.(new Event('close')) }
  }
}
