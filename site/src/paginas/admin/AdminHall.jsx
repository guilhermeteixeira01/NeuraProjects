import { useEffect,useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { prepararFoto } from '../perfil/HallDaFama.jsx'

export default function AdminHall(){
 const [lista,setLista]=useState([]),[fotos,setFotos]=useState({}),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false)
 const carregar=()=>chamarApi('/hall/revisao').then(d=>setLista(d.pedidos||[])).catch(()=>setErro('Não foi possível carregar as fotos.'))
 useEffect(()=>{carregar()},[])
 const revisar=async(p,acao)=>{setOcupado(true);setErro('');try{await chamarApi('/hall/revisao',{id:p.id,acao,...(fotos[p.id]?{foto:fotos[p.id]}:{})});await carregar()}catch{setErro('Não foi possível salvar a revisão.')}finally{setOcupado(false)}}
 return <section className="caixa" style={{padding:24,marginBottom:24}}><h2>Hall da Fama · fotos para revisão</h2><p>A foto original só aparece para o jogador e a equipe. Envie a montagem final ou aprove a foto com a camisa do card.</p>{!lista.length&&<p>Nenhuma foto aguardando revisão.</p>}<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:18}}>{lista.map(p=><article key={p.id} className="caixa" style={{padding:18}}><h3>{p.nome||p.id}</h3><p>Camisa {p.camisa}</p><img src={fotos[p.id]||p.original} alt="Foto enviada para revisão" style={{width:'100%',height:240,objectFit:'contain'}}/><label>Montagem final<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{try{const foto=await prepararFoto(e.target.files?.[0]);setFotos(v=>({...v,[p.id]:foto}))}catch(err){setErro(err.message)}}}/></label><div style={{display:'flex',gap:8,marginTop:12}}><button className="btn btn-primary" disabled={ocupado} onClick={()=>revisar(p,'aprovar')}>Publicar</button><button className="btn btn-ghost" disabled={ocupado} onClick={()=>revisar(p,'reprovar')}>Pedir outra foto</button></div></article>)}</div>{erro&&<p role="alert">{erro}</p>}</section>
}
