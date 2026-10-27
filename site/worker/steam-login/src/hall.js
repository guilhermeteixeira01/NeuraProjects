import { lerDoc, mudarDoc } from './dados.js'
import { abasDe } from './perfis.js'
import { ErroPedido, ErroPermissao, ErroConflito, ErroServico } from './erros.js'
import { json, lerCorpo } from './http.js'
import { pedir } from './objetos.js'
import { pedidoHall } from './hall-retratos.js'

const idValido = (id) => /^\d{17}$/.test(String(id || ''))
const publico = (d) => ({ foto: d?.aprovada || null, camisa: d?.camisaAprovada || 'escura', montada: !!d?.montada })
const idFila = p => typeof p === 'string' ? p : p.id
const ativo = d => ['pendente', 'fila', 'gerando', 'falhou'].includes(d.estado)
const atual = (env, id) => mudarDoc(env, `hall:${id}`, d => d, {})
export const objetoHall = (env,id) => env.HALL_RETRATOS.get(env.HALL_RETRATOS.idFromName(id))
export async function tirarDaFilaHall(env, id, pedido) {
  await mudarDoc(env, 'hall-pendentes', ids => ids.filter(p => !(idFila(p) === id && (typeof p === 'string' || p.pedido === pedido))), [])
}
export function validarFotoHall(foto) {
  if (typeof foto !== 'string' || foto.length > 180000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(foto)) throw new ErroPedido('foto')
  let bytes
  try { bytes = atob(foto.split(',')[1]) } catch { throw new ErroPedido('foto') }
  if (!(bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.startsWith('\xff\xd8\xff') || (bytes.startsWith('RIFF') && bytes.slice(8,12) === 'WEBP'))) throw new ErroPedido('foto')
  return foto
}
export async function hallPublico(env,id,cors={}) {
  if (!idValido(id)) throw new ErroPedido('id')
  return json(publico(await atual(env,id)),200,{...cors,'Cache-Control':'no-store'})
}
export async function imagemHall(env,url,cors={}) {
  const id=url.searchParams.get('id'),v=url.searchParams.get('v')
  if(!idValido(id)||!v||!env.HALL_RETRATOS)return new Response(null,{status:404,headers:cors})
  const d=await atual(env,id)
  if(d.retratoVersao!==v)return new Response(null,{status:404,headers:cors})
  const r=await objetoHall(env,id).fetch(`https://hall/imagem?v=${encodeURIComponent(v)}`)
  return new Response(r.body,{status:r.status,headers:{...Object.fromEntries(r.headers),...cors,'Cache-Control':'private, no-store','Vary':'Authorization, Origin'}})
}
export async function rotaHall(req,env,quem,config,cors,url) {
  const revisao=url.pathname==='/hall/revisao'
  if(revisao && !(await abasDe(quem.id,env,config)).includes('usuarios')) throw new ErroPermissao('admin')
  if(req.method==='GET') {
    if(revisao) {
      const ids=await lerDoc(env,'hall-pendentes',[])
      const pedidos=await Promise.all(ids.slice(0,40).map(async p=>{const id=idFila(p),d=await atual(env,id);return {id,...d,pedido:pedidoHall(d)}}))
      return json({pedidos:pedidos.filter(ativo),geracaoDisponivel:!!env.OPENAI_API_KEY&&!!env.HALL_RETRATOS},200,{...cors,'Cache-Control':'no-store'})
    }
    const {original,...d}=await atual(env,quem.id)
    return json({estado:'sem-foto',camisa:'escura',...d,pedido:pedidoHall(d)},200,{...cors,'Cache-Control':'no-store'})
  }
  if(req.method!=='POST')throw new ErroPedido('metodo')
  const corpo=await lerCorpo(req)
  if(revisao) {
    if(!idValido(corpo.id)||!['aprovar','reprovar'].includes(corpo.acao))throw new ErroPedido('pedido')
    if(corpo.foto)throw new ErroPedido('montagem-manual')
    if(corpo.acao==='aprovar'&&(!env.OPENAI_API_KEY||!env.HALL_RETRATOS))throw new ErroServico('hall-config',undefined,{indisponivel:true})
    const d=await mudarDoc(env,`hall:${corpo.id}`,d=>{
      if(!d?.original)throw new ErroPedido('pedido')
      if(corpo.pedido!==pedidoHall(d)||!ativo(d))throw new ErroConflito('pedido-alterado')
      if(corpo.acao==='reprovar')return {...d,estado:'reprovada',motivo:String(corpo.motivo||'').slice(0,200),revisada:Date.now()}
      if(['fila','gerando'].includes(d.estado))return d
      if((d.tentativasGeracao||0)>=3)throw new ErroConflito('hall-tentativas')
      return {...d,estado:'fila',aprovadaPor:quem.id,revisada:Date.now(),tentativasGeracao:(d.tentativasGeracao||0)+1,motivo:'',erroGeracao:''}
    },{})
    if(corpo.acao==='reprovar')await tirarDaFilaHall(env,corpo.id,corpo.pedido)
    else {
      try {await pedir(objetoHall(env,corpo.id),{acao:'agendar',id:corpo.id,pedido:pedidoHall(d),origem:url.origin})}
      catch(e){await mudarDoc(env,`hall:${corpo.id}`,p=>pedidoHall(p)===corpo.pedido&&p.estado==='fila'?{...p,estado:'falhou',erroGeracao:'hall-fila'}:p,{});throw e}
    }
    return json({ok:true,estado:d.estado},200,cors)
  }
  const foto=validarFotoHall(corpo.foto)
  if(!['escura','clara'].includes(corpo.camisa))throw new ErroPedido('camisa')
  const versao=crypto.randomUUID()
  const pedido=await mudarDoc(env,`hall:${quem.id}`,d=>({...d,pedido:versao,original:foto,camisa:corpo.camisa,estado:'pendente',enviada:Date.now(),nome:quem.nome||quem.id,motivo:'',erroGeracao:'',tentativasGeracao:0}),{})
  await mudarDoc(env,'hall-pendentes',ids=>[{id:quem.id,pedido:versao},...ids.filter(p=>idFila(p)!==quem.id)].slice(0,500),[])
  const {original,...resposta}=pedido
  return json(resposta,200,cors)
}
