import { lerDoc, mudarDoc } from './dados.js'
import { abasDe } from './perfis.js'
import { ErroPedido, ErroPermissao } from './erros.js'
import { json, lerCorpo } from './http.js'

const idValido = (id) => /^\d{17}$/.test(String(id || ''))
const publico = (d) => ({ foto: d?.aprovada || null, camisa: d?.camisaAprovada || 'escura', montada: !!d?.montada })
export function validarFotoHall(foto) {
  if (typeof foto !== 'string' || foto.length > 180000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(foto)) throw new ErroPedido('foto')
  let bytes
  try { bytes = atob(foto.split(',')[1]) } catch { throw new ErroPedido('foto') }
  if (!(bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.startsWith('\xff\xd8\xff') || (bytes.startsWith('RIFF') && bytes.slice(8,12) === 'WEBP'))) throw new ErroPedido('foto')
  return foto
}
export async function hallPublico(env,id,cors={}) {
  if (!idValido(id)) throw new ErroPedido('id')
  return json(publico(await lerDoc(env,`hall:${id}`,{})),200,{...cors,'Cache-Control':'no-store'})
}
export async function rotaHall(req,env,quem,config,cors,url) {
  const revisao=url.pathname==='/hall/revisao'
  if(revisao && !(await abasDe(quem.id,env,config)).includes('usuarios')) throw new ErroPermissao('admin')
  if(req.method==='GET') {
    if(revisao) {
      const ids=await lerDoc(env,'hall-pendentes',[])
      const pedidos=await Promise.all(ids.slice(0,40).map(async id=>({id,...await lerDoc(env,`hall:${id}`,{})})))
      return json({pedidos:pedidos.filter(p=>p.estado==='pendente')},200,cors)
    }
    return json(await lerDoc(env,`hall:${quem.id}`,{estado:'sem-foto',camisa:'escura'}),200,{...cors,'Cache-Control':'no-store'})
  }
  if(req.method!=='POST')throw new ErroPedido('metodo')
  const corpo=await lerCorpo(req)
  if(revisao) {
    if(!idValido(corpo.id)||!['aprovar','reprovar'].includes(corpo.acao))throw new ErroPedido('pedido')
    const foto=corpo.foto?validarFotoHall(corpo.foto):null
    await mudarDoc(env,`hall:${corpo.id}`,d=>{
      if(!d?.original)throw new ErroPedido('pedido')
      return {...d,estado:corpo.acao==='aprovar'?'aprovada':'reprovada',...(corpo.acao==='aprovar'?{aprovada:foto||d.original,camisaAprovada:d.camisa,montada:!!foto}:{}),motivo:String(corpo.motivo||'').slice(0,200),revisada:Date.now()}
    },{})
    await mudarDoc(env,'hall-pendentes',ids=>ids.filter(id=>id!==corpo.id),[])
    return json({ok:true},200,cors)
  }
  const foto=validarFotoHall(corpo.foto)
  if(!['escura','clara'].includes(corpo.camisa))throw new ErroPedido('camisa')
  const pedido=await mudarDoc(env,`hall:${quem.id}`,d=>({...d,original:foto,camisa:corpo.camisa,estado:'pendente',enviada:Date.now(),nome:quem.nome||quem.id,motivo:''}),{})
  await mudarDoc(env,'hall-pendentes',ids=>[quem.id,...ids.filter(id=>id!==quem.id)].slice(0,500),[])
  return json(pedido,200,cors)
}
