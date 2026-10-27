import { createContext,useContext,useEffect,useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'

const DadosPublicosPerfil = createContext(null)
export function ApresentacaoPerfil() {
 const dados=useContext(DadosPublicosPerfil),t=useT()
 if(!dados?.descricao&&!dados?.faceit)return null
 return <section className="pf-profile-about" aria-labelledby="pf-sobre-titulo"><h2 id="pf-sobre-titulo">{t('Sobre o jogador')}</h2>{dados.descricao&&<p>{dados.descricao}</p>}{dados.faceit&&<a href={dados.faceit} target="_blank" rel="noopener">{t('Perfil na FACEIT')} ↗</a>}</section>
}

export default function PerfilProtegido({id,children}) {
 const conta=useConta(),[dados,setDados]=useState(null)
 useEffect(()=>{if(!id||!conta)return;let vivo=true;setDados(null);const carregar=()=>chamarApi(`/perfil/publico?id=${id}`).then(d=>{if(vivo)setDados(d)}).catch(()=>{if(vivo)setDados({permitido:false,erro:true})});carregar();window.addEventListener('np-conta-dados',carregar);return()=>{vivo=false;window.removeEventListener('np-conta-dados',carregar)}},[id,conta?.id])
 if(!conta||!id)return children
 if(!dados)return <div className="wrap" style={{paddingBlock:40}}>Carregando perfil…</div>
 if(dados.permitido===false)return <section className="wrap" style={{paddingBlock:60}}><h1>{dados.erro?'Não foi possível verificar o perfil':'Perfil privado'}</h1><p>{dados.erro?'Tente novamente em instantes.':'Este jogador restringiu a visualização do perfil.'}</p><a className="btn btn-ghost" href="/ranking/">Voltar ao ranking</a></section>
 return <DadosPublicosPerfil.Provider value={dados}><div className={`pf-visibilidade${dados.visibilidade?.conquistas===false?' pf-sem-conquistas':''}${dados.visibilidade?.inventario===false?' pf-sem-inventario':''}`}>
 {children}
 </div></DadosPublicosPerfil.Provider>
}
