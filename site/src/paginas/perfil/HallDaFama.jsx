import { useEffect, useState } from 'react'
import { chamarApi, lerApi } from '../../comum/api.js'
import { useT } from '../../comum/i18n.js'
import './hall.css'

export function CamisaNeura({ clara=false }) {
  return <img className="hf-camisa-foto" src={clara?'/assets/hall/jogador-clara.webp':'/assets/hall/jogador-escura.webp'} alt={clara?'Camisa Neura clara':'Camisa Neura escura'} width="640" height="960" loading="lazy"/>
}
export async function prepararFoto(arquivo) {
  if(!arquivo || !['image/png','image/jpeg','image/webp'].includes(arquivo.type) || arquivo.size>10*1024*1024)throw new Error('Use JPG, PNG ou WebP de até 10 MB.')
  const url=URL.createObjectURL(arquivo)
  try {
    const img=await new Promise((ok,falha)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>falha(new Error('Não foi possível ler a foto.'));i.src=url})
    const cv=document.createElement('canvas'),escala=Math.min(1,640/img.width,800/img.height)
    cv.width=Math.max(1,Math.round(img.width*escala));cv.height=Math.max(1,Math.round(img.height*escala));cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height)
    for(const qualidade of [.88,.72,.55,.35]){const foto=cv.toDataURL('image/webp',qualidade);if(foto.length<180000)return foto}
    throw new Error('A imagem ficou muito grande. Escolha uma foto menor.')
  } finally {URL.revokeObjectURL(url)}
}
export default function HallDaFama({j,pos,total,nivel,eu}) {
  const t=useT(),[dados,setDados]=useState(null),[camisa,setCamisa]=useState('escura'),[foto,setFoto]=useState(''),[erro,setErro]=useState(''),[enviando,setEnviando]=useState(false)
  useEffect(()=>{let ativo=true;const consulta=eu?chamarApi('/hall'):lerApi(`/hall/publico?id=${j.steamId}`);consulta.then(d=>{if(ativo){setDados(d);setCamisa(d.camisa||'escura')}}).catch(()=>{});return()=>{ativo=false}},[j.steamId,eu])
  const selecionar=async(e)=>{setErro('');try{setFoto(await prepararFoto(e.target.files?.[0]))}catch(err){setErro(err.message)}}
  const enviar=async(e)=>{e.preventDefault();if(!foto)return;setEnviando(true);setErro('');try{setDados(await chamarApi('/hall',{camisa,foto}));setFoto('')}catch{setErro('Não foi possível enviar. Tente novamente.')}finally{setEnviando(false)}}
  const retrato=dados?.foto||dados?.aprovada
  return <div className="hf-area">
    <article className="hf-card" aria-label={t('Hall da Fama')}>
      <div className="hf-topo"><div><b>{pos>0?pos:'—'}</b><small>{pos>0?t('Posição'):t('Sem rank')}</small><span>LVL {nivel?.nivel ?? '?'}</span></div><strong>HALL<br/><small>DA</small><br/>FAMA</strong></div>
      <div className="hf-retrato"><CamisaNeura clara={(dados?.camisaAprovada||camisa)==='clara'}/>{retrato?<img className={dados?.montada?'hf-foto hf-montagem':'hf-foto'} src={retrato} alt={j.nome}/>:null}</div>
      <h2>{j.nome}</h2><p>{pos>0?`${pos}º ${t('de')} ${total} ${t('jogadores')}`:t('Seu próximo capítulo começa aqui')}</p>
      <dl>{[['RAT',j.mapas?Number(j.rating||0).toFixed(2):'—'],['ADR',j.mapas?Math.round(j.adr||0):'—'],['WIN',j.mapas?Math.round((j.vitorias||0)/j.mapas*100)+'%':'—'],['MAPAS',j.mapas||0]].map(([rotulo,valor])=><div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}</dl>
      <a href="/ranking/">{t('Ver ranking')} →</a>
    </article>
    {eu&&<details className="hf-editar"><summary>{t('Foto personalizada')}</summary><form onSubmit={enviar}><p>{t('Escolha a camisa da Neura e envie uma foto do rosto para a montagem do seu card.')}</p><div className="hf-camisas">{['escura','clara'].map(c=><button type="button" key={c} aria-pressed={camisa===c} onClick={()=>setCamisa(c)}><CamisaNeura clara={c==='clara'}/><span>{c==='clara'?t('Clara'):t('Escura')}</span></button>)}</div><label className="hf-upload">{foto?<img src={foto} alt={t('Prévia da foto')}/>:<span>{t('Escolher foto')}</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selecionar}/></label><small>{t('Foto de frente, bem iluminada. JPG, PNG ou WebP, até 10 MB.')}</small><button className="btn btn-primary" disabled={!foto||enviando}>{enviando?t('Enviando…'):t('Enviar foto')}</button>{dados?.estado==='pendente'&&<p role="status">{t('Foto recebida. A equipe fará a montagem e revisão.')}</p>}{dados?.estado==='aprovada'&&<p role="status">{t('Sua foto está publicada no card.')}</p>}{dados?.estado==='reprovada'&&<p role="status">{dados.motivo||t('Envie outra foto para revisão.')}</p>}{erro&&<p role="alert">{erro}</p>}</form></details>}
  </div>
}
