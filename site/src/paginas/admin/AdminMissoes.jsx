import { useEffect,useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { MAPAS_MISSOES, MISSOES, ANO_EVENTOS } from '../../../worker/steam-login/src/missoes-core.js'
import '../../comum/missoes.css'
const local = s => Number.isFinite(Date.parse(s))?new Date(Date.parse(s)-3*3600000).toISOString().slice(0,19):''
const iso = s => s?`${s.length===16?s+':00':s}-03:00`:''
export default function AdminMissoes() {
  const [dados,setDados]=useState(null),[config,setConfig]=useState(null),[erro,setErro]=useState(''),[salvando,setSalvando]=useState(false),[ok,setOk]=useState('')
  const carregar=async()=>{try{const d=await chamarApi('/admin/missoes');setDados(d);setConfig(d.config)}catch{setErro('Não foi possível carregar as configurações das missões.')}}
  useEffect(()=>{carregar()},[])
  const evento=(id,k,v)=>setConfig(c=>({...c,eventos:{...c.eventos,[id]:{ano:ANO_EVENTOS,...c.eventos?.[id],[k]:v}}}))
  const mapa=(id,k,v)=>setConfig(c=>({...c,mapas:{...c.mapas,[id]:{...MAPAS_MISSOES[id],...c.mapas?.[id],[k]:v}}}))
  const salvar=async e=>{
    e.preventDefault();setErro('');setOk('');setSalvando(true)
    try {
      const eventos=Object.fromEntries(Object.entries(config.eventos||{}).filter(([,p])=>p?.inicio||p?.fim))
      const mapas=Object.fromEntries(Object.entries(config.mapas||{}).filter(([,p])=>p?.mapa))
      await chamarApi('/admin/missoes',{...config,eventos,mapas});await carregar();setOk('Configuração salva. As contas recebem as conquistas elegíveis na próxima verificação automática.')
    }catch{setErro('Confira os identificadores dos mapas, modos e datas completas dos eventos.')}finally{setSalvando(false)}
  }
  return <details className="ms-config"><summary>Missões · metas, mapas e calendário de insígnias</summary>
    {!config?<p>Carregando configuração…</p>:<form onSubmit={salvar}>
      <p>As partidas precisam de dados confirmados do coletor. Não são estimadas estatísticas ausentes no histórico.</p>
      <label>Concessão automática<select value={config.ativa===false?'nao':'sim'} onChange={e=>setConfig(c=>({...c,ativa:e.target.value==='sim'}))}><option value="sim">Ativa</option><option value="nao">Pausada</option></select></label>
      {!!dados?.pendencias?.length&&<ul className="ms-config-pendencias">{dados.pendencias.map(p=><li key={p.id}>{p.id}: {p.motivo}</li>)}</ul>}
      <label>Meta padrão de partidas por mapa<input type="number" min="1" max="10000" value={config.metaMapas||10} onChange={e=>setConfig(c=>({...c,metaMapas:Number(e.target.value)}))}/></label>
      <h3>Mapas</h3><p>Use o identificador exato informado pelo servidor. No Rush, informe o mapa completo Complex, nunca uma arena.</p>
      {MISSOES.filter(m=>m.categoria==='mapas').map(m=>{const id=m.id.replace('mapa-',''),c={...MAPAS_MISSOES[id],...config.mapas?.[id]};return <div className="ms-config-linha" key={id}><label>{m.nome}<input value={c.mapa||''} placeholder="Identificador canônico" onChange={e=>mapa(id,'mapa',e.target.value)}/></label><label>Modo<select value={c.modo||'5v5'} onChange={e=>mapa(id,'modo',e.target.value)}>{['5v5','wingman','corrida-armada','rush'].map(m=><option key={m}>{m}</option>)}</select></label><label>Meta<input type="number" min="1" max="10000" value={c.meta??config.metaMapas??10} onChange={e=>mapa(id,'meta',Number(e.target.value))}/></label></div>})}
      <h3>Eventos anuais</h3><p>Horários de Brasília. Coleção 2026: a concessão ocorre somente após o encerramento do período iniciado em 2026. Ano Novo e Verão atravessam para 2027. Uma data ausente fica pendente.</p>
      {MISSOES.filter(m=>m.categoria==='eventos').map(m=>{const c=config.eventos?.[m.id]||{};return <div className="ms-config-linha" key={m.id}><label>{m.nome} · edição<input aria-label={`Ano de ${m.nome}`} type="number" min={ANO_EVENTOS} max={ANO_EVENTOS} value={c.ano||ANO_EVENTOS} onChange={e=>evento(m.id,'ano',Number(e.target.value))}/></label><label>Início<input type="datetime-local" step="1" value={local(c.inicio)} onChange={e=>evento(m.id,'inicio',iso(e.target.value))}/></label><label>Encerramento<input type="datetime-local" step="1" value={local(c.fim)} onChange={e=>evento(m.id,'fim',iso(e.target.value))}/></label></div>})}
      <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando?'Salvando…':'Salvar missões'}</button>
    </form>}
    {erro&&<p role="alert">{erro}</p>}{ok&&<p role="status">{ok}</p>}
  </details>
}
