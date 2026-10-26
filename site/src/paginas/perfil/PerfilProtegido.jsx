import { useEffect,useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { useConta } from '../../comum/conta.js'

export default function PerfilProtegido({id,children}) {
 const conta=useConta(),[dados,setDados]=useState(null)
 useEffect(()=>{if(!id||!conta)return;let vivo=true;setDados(null);const carregar=()=>chamarApi(`/perfil/publico?id=${id}`).then(d=>{if(vivo)setDados(d)}).catch(()=>{if(vivo)setDados({permitido:false,erro:true})});carregar();window.addEventListener('np-conta-dados',carregar);return()=>{vivo=false;window.removeEventListener('np-conta-dados',carregar)}},[id,conta?.id])
 if(!conta||!id)return children
 if(!dados)return <div className="wrap" style={{paddingBlock:40}}>Carregando perfil…</div>
 if(dados.permitido===false)return <section className="wrap" style={{paddingBlock:60}}><h1>{dados.erro?'Não foi possível verificar o perfil':'Perfil privado'}</h1><p>{dados.erro?'Tente novamente em instantes.':'Este jogador restringiu a visualização do perfil.'}</p><a className="btn btn-ghost" href="/ranking/">Voltar ao ranking</a></section>
 return <div className={`pf-visibilidade${dados.visibilidade?.conquistas===false?' pf-sem-conquistas':''}${dados.visibilidade?.inventario===false?' pf-sem-inventario':''}`}>
 {(dados.descricao||dados.faceit||dados.amigos?.length>0)&&<section className="wrap pf-apresentacao"><div>{dados.descricao&&<p>{dados.descricao}</p>}{dados.faceit&&<a href={dados.faceit} target="_blank" rel="noopener">Perfil na FACEIT ↗</a>}</div>{dados.amigos?.length>0&&<div className="pf-amigos-publicos"><h2>Amigos</h2>{dados.amigos.map(a=><a key={a.id} href={'/perfil/?id='+a.id}>{a.nome||a.id}</a>)}</div>}</section>}
 {children}
 </div>
}
