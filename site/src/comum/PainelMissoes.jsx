import { useCallback,useEffect,useState } from 'react'
import { chamarApi } from './api.js'
import { imagemInsignia } from './insignias.js'
import './missoes.css'

export default function PainelMissoes() {
  const [dados,setDados]=useState(null),[categoria,setCategoria]=useState('combate'),[erro,setErro]=useState('')
  const carregar=useCallback(async()=>{try{setDados(await chamarApi('/missoes'));setErro('')}catch{setErro('Não foi possível conferir as missões. Tente novamente.')}},[])
  useEffect(()=>{carregar();const atualizar=()=>{if(document.visibilityState==='visible')carregar()};window.addEventListener('focus',atualizar);const timer=setInterval(atualizar,60000);return()=>{clearInterval(timer);window.removeEventListener('focus',atualizar)}},[carregar])
  const lista=(dados?.lista||[]).filter(m=>m.categoria===categoria)
  return <section className="ms-painel">
    <h2>Missões e insígnias</h2><p>As conquistas são entregues automaticamente após a confirmação do sistema. O histórico validado também conta.</p>
    {dados?.simulacao&&<p role="status">Prévia local: progresso ilustrativo, sem conceder recompensas reais.</p>}
    <div className="ms-abas" role="tablist" aria-label="Categorias de missões">{[['combate','Combate 5v5'],['mapas','Mapas'],['eventos','Eventos anuais']].map(([id,nome])=><button type="button" key={id} role="tab" aria-selected={categoria===id} onClick={()=>setCategoria(id)}>{nome}</button>)}</div>
    {dados&&categoria!=='eventos'&&<p className="ms-aviso">{dados.partidasValidadas||0} partidas com dados de missões confirmados. Estatísticas que não existem no histórico não são estimadas.</p>}
    {!dados&&!erro&&<p role="status">Conferindo conquistas…</p>}
    <div className="ms-grade">{lista.map(m=><Missao key={m.id} m={m} pendente={(dados.pendencias||[]).some(p=>p.id===m.id||m.id.startsWith(p.id+'-'))}/>)}</div>
    {erro&&<p role="alert">{erro} <button type="button" onClick={carregar}>Tentar novamente</button></p>}
  </section>
}
function Missao({m,pendente}) {
  const [semArte,setSemArte]=useState(false)
  return <article className={`ms-card${m.recebida?' ms-recebida':''}`}>
    <div className="ms-arte">{semArte?<span>{m.nome}</span>:<img src={imagemInsignia(m.id)} alt="" loading="lazy" onError={()=>setSemArte(true)}/>}</div>
    <span className="ms-estado">{m.recebida?'Conquistada':pendente?'Aguardando configuração':'Em progresso'}</span>
    <h3>{m.nome}</h3><p>{m.descricao}</p>
    {m.categoria!=='eventos'&&<><progress value={Math.min(m.atual,m.meta)} max={m.meta} aria-label={`Progresso de ${m.nome}`}/><b>{Math.min(m.atual,m.meta)} / {m.meta}</b></>}
    {m.detalhes&&<details><summary>Ver requisitos</summary><ul>{Object.entries(m.detalhes).map(([id,d])=><li key={id}>{id.replace(/^de_/,'')}: {Math.min(d.atual,d.meta)}/{d.meta}</li>)}</ul></details>}
    {m.recebida&&<small>Recebida em {new Date(m.recebida).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</small>}
  </article>
}
