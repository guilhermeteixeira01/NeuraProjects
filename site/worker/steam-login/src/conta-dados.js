import { lerDoc, mudarDoc } from './dados.js'
import { conferirToken } from './auth.js'
import { rotaAmigos } from './amigos.js'
import { ErroPedido, ErroPermissao } from './erros.js'
import { json, lerCorpo } from './http.js'

const AREAS=['perfil','inventario','amigos','conquistas','convites']
const OPCOES=['todos','amigos','ninguem']
const PRIVACIDADE=Object.fromEntries(AREAS.map(k=>[k,'todos']))
export function validarCpf(v) {
 const n=String(v||'').replace(/\D/g,'')
 if(!n)return ''
 if(!/^\d{11}$/.test(n)||/^(\d)\1+$/.test(n))throw new ErroPedido('cpf')
 for(let tamanho=9;tamanho<=10;tamanho++){let soma=0;for(let i=0;i<tamanho;i++)soma+=Number(n[i])*(tamanho+1-i);const resto=soma%11,digito=resto<2?0:11-resto;if(Number(n[tamanho])!==digito)throw new ErroPedido('cpf')}
 return n
}
export function validarDadosConta(c) {
 const texto=(k,max)=>{if(typeof(c[k]??'')!=='string'||String(c[k]||'').length>max)throw new ErroPedido(k);return String(c[k]||'').trim()}
 const d={nome:texto('nome',60),sobrenome:texto('sobrenome',80),discord:texto('discord',80),nascimento:texto('nascimento',10),cpf:validarCpf(c.cpf),descricao:texto('descricao',600),faceit:texto('faceit',240)}
 if(d.nascimento){const data=new Date(d.nascimento+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento)||isNaN(data)||data.toISOString().slice(0,10)!==d.nascimento||data>Date.now()||data.getUTCFullYear()<1900)throw new ErroPedido('nascimento')}
 if(d.faceit){let u;try{u=new URL(d.faceit)}catch{throw new ErroPedido('faceit')}if(u.protocol!=='https:'||!['faceit.com','www.faceit.com'].includes(u.hostname)||!/^\/(?:[a-z-]+\/)?players\//i.test(u.pathname))throw new ErroPedido('faceit');d.faceit=u.origin+u.pathname}
 d.privacidade={...PRIVACIDADE}
 for(const k of AREAS){const valor=c.privacidade?.[k]??'todos';if(!OPCOES.includes(valor))throw new ErroPedido('privacidade');d.privacidade[k]=valor}
 return d
}
export async function quemOpcional(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return token?await conferirToken(token,env.SEGREDO):null}
export async function visibilidade(env,alvo,visitante) {
 const p=(await lerDoc(env,`conta-dados:${alvo}`,{})).privacidade||PRIVACIDADE
 let amigo=false
 if(visitante&&visitante!==alvo&&Object.values(p).includes('amigos')) {
   const r=await rotaAmigos(new Request('https://interno/amigos'),env,{id:visitante},{})
   amigo=(await r.json()).amigos?.some(a=>a.id===alvo)||false
 }
 return Object.fromEntries(AREAS.map(k=>[k,visitante===alvo||(p[k]||'todos')==='todos'||(p[k]==='amigos'&&amigo)]))
}
export async function exigirVisibilidade(req,env,alvo,area,visitante) {
 if(!/^\d{17}$/.test(String(alvo||'')))throw new ErroPedido('id')
 const id=visitante??(await quemOpcional(req,env))?.id
 const v=await visibilidade(env,alvo,id)
 if(!v[area])throw new ErroPermissao('privado')
 return v
}
export async function rotaDadosConta(req,env,quem,cors) {
 if(req.method==='GET')return json(await lerDoc(env,`conta-dados:${quem.id}`,{privacidade:PRIVACIDADE}),200,{...cors,'Cache-Control':'no-store'})
 if(req.method!=='POST')throw new ErroPedido('metodo')
 const dados=validarDadosConta(await lerCorpo(req))
 await mudarDoc(env,`conta-dados:${quem.id}`,()=>dados,{})
  await mudarDoc(env,'conta-visibilidades',v=>({...v,[quem.id]:dados.privacidade}),{})
 return json(dados,200,{...cors,'Cache-Control':'no-store'})
}
export async function filtrarConquistasPublicas(resposta,req,env) {
 const mapa=await lerDoc(env,'conta-visibilidades',{})
 if(!Object.keys(mapa).length)return resposta
 const quem=await quemOpcional(req,env)
 let amigos=[]
 if(quem&&Object.values(mapa).some(p=>p.conquistas==='amigos')){const r=await rotaAmigos(new Request('https://interno/amigos'),env,quem,{});amigos=(await r.json()).amigos?.map(a=>a.id)||[]}
 const perfis=await resposta.json()
 for(const [id,p] of Object.entries(perfis)){const regra=mapa[id]?.conquistas||'todos';if(id!==quem?.id&&regra!=='todos'&&!(regra==='amigos'&&amigos.includes(id)))delete p.insignias}
 return json(perfis,200,{'Access-Control-Allow-Origin':'*','Cache-Control':'private, no-store','Vary':'Authorization, Origin'})
}
export async function rotaPerfilPublico(req,env,quem,cors,url) {
 const id=url.searchParams.get('id')||quem.id
 if(!/^\d{17}$/.test(id))throw new ErroPedido('id')
 const v=await visibilidade(env,id,quem.id)
 if(!v.perfil)return json({permitido:false,visibilidade:v},200,{...cors,'Cache-Control':'no-store'})
 const d=await lerDoc(env,`conta-dados:${id}`,{})
 // Nome civil, CPF, nascimento e Discord nunca fazem parte do perfil público.
 let amigos=[]
 if(v.amigos){const r=await rotaAmigos(new Request('https://interno/amigos'),env,{id},{});amigos=((await r.json()).amigos||[]).slice(0,30).map(a=>({id:a.id,nome:a.nome,avatar:a.avatar}))}
 return json({permitido:true,descricao:d.descricao||'',faceit:d.faceit||'',visibilidade:v,amigos},200,{...cors,'Cache-Control':'no-store'})
}
