import { useCallback, useEffect, useRef, useState } from 'react'
import { chamarApi, lerApi, enderecoApi } from '../../comum/api.js'
import { tokenConta } from '../../comum/conta.js'
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
  const consulta=useRef(0)
  const card=useRef(null), quadro=useRef(0)
  useEffect(()=>()=>cancelAnimationFrame(quadro.current),[])
  const moverCard=e=>{
    if(e.pointerType!=='mouse'||document.documentElement.dataset.desempenho==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const el=card.current, r=el.getBoundingClientRect(), x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))
    cancelAnimationFrame(quadro.current)
    quadro.current=requestAnimationFrame(()=>{el.style.setProperty('--hf-rx',`${(0.5-y)*10}deg`);el.style.setProperty('--hf-ry',`${(x-0.5)*12}deg`);el.style.setProperty('--hf-luz-x',`${x*100}%`);el.style.setProperty('--hf-luz-y',`${y*100}%`)})
  }
  const reporCard=()=>{cancelAnimationFrame(quadro.current);card.current?.removeAttribute('style')}
  const carregar=useCallback(async()=>{
    const versao=++consulta.current
    const d=await(eu?chamarApi('/hall'):lerApi(`/hall/publico?id=${j.steamId}`))
    if(versao===consulta.current)setDados(d)
    return d
  },[j.steamId,eu])
  useEffect(()=>{
    let ativo=true
    carregar().then(d=>{if(ativo)setCamisa(d.camisa||'escura')}).catch(()=>{})
    const atualizar=()=>{if(document.visibilityState==='visible')carregar().catch(()=>{})}
    window.addEventListener('np-hall',atualizar);window.addEventListener('focus',atualizar)
    return()=>{ativo=false;consulta.current++;window.removeEventListener('np-hall',atualizar);window.removeEventListener('focus',atualizar)}
  },[carregar])
  const aguardando=eu&&['pendente','fila','gerando'].includes(dados?.estado)
  useEffect(()=>{
    if(!aguardando)return
    const timer=setInterval(()=>{if(document.visibilityState==='visible')carregar().catch(()=>{})},10000)
    return()=>clearInterval(timer)
  },[aguardando,carregar])
  const selecionar=async(e)=>{setErro('');try{setFoto(await prepararFoto(e.target.files?.[0]))}catch(err){setErro(err.message)}}
  const enviar=async(e)=>{e.preventDefault();if(!foto)return;setEnviando(true);setErro('');consulta.current++;try{setDados(await chamarApi('/hall',{camisa,foto}));setFoto('')}catch{setErro('Não foi possível enviar. Tente novamente.')}finally{setEnviando(false)}}
  const originalRetrato=dados?.foto||dados?.aprovada
  const retrato=useRetratoHall(originalRetrato)
  return <div className="hf-area">
    {eu&&dados?.simulacao&&<p className="hf-aviso-local">{t('Prévia local: geração simulada com a camisa, sem envio de fotos e sem cobrança.')}</p>}
    <div className="hf-card-palco"><article ref={card} className="hf-card" aria-label={t('Hall da Fama')} onPointerMove={moverCard} onPointerLeave={reporCard} onPointerCancel={reporCard}>
      <span className="hf-card-folha" aria-hidden="true"/><span className="hf-card-serial" aria-hidden="true">NP / PLAYER CARD</span>
      <div className="hf-topo"><div><b>{pos>0?pos:'—'}</b><small>{pos>0?t('Posição'):t('Sem rank')}</small><span>LVL {nivel?.nivel ?? '?'}</span></div><strong>HALL<br/><small>DA</small><br/>FAMA</strong></div>
      <div className="hf-retrato">{!(retrato&&dados?.montada)&&<CamisaNeura clara={(dados?.camisaAprovada||camisa)==='clara'}/>} {retrato?<img className={dados?.montada?'hf-foto hf-montagem':'hf-foto'} src={retrato} alt={j.nome}/>:null}</div>
      <h2>{j.nome}</h2><p>{pos>0?`${pos}º ${t('de')} ${total} ${t('jogadores')}`:t('Seu próximo capítulo começa aqui')}</p>
      <dl>{[['RAT',j.mapas?Number(j.rating||0).toFixed(2):'—'],['ADR',j.mapas?Math.round(j.adr||0):'—'],['WIN',j.mapas?Math.round((j.vitorias||0)/j.mapas*100)+'%':'—'],['MAPAS',j.mapas||0]].map(([rotulo,valor])=><div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}</dl>
      <a href="/ranking/">{t('Ver ranking')} →</a>
      <span className="hf-card-edicao">NEURA PROJECT <i aria-hidden="true">✦</i> HALL OF FAME</span>
    </article></div>
    {eu&&<details className="hf-editar"><summary>{t('Foto personalizada')}</summary><form onSubmit={enviar}><p>{t('Escolha a camisa e envie uma foto do rosto. A equipe confere a imagem antes da geração do retrato.')}</p><div className="hf-camisas">{['escura','clara'].map(c=><button type="button" key={c} aria-pressed={camisa===c} onClick={()=>setCamisa(c)}><CamisaNeura clara={c==='clara'}/><span>{c==='clara'?t('Clara'):t('Escura')}</span></button>)}</div><label className="hf-upload">{foto?<img src={foto} alt={t('Prévia da foto')}/>:<span>{t('Escolher foto')}</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selecionar}/></label><small>{t('Foto de frente, bem iluminada. JPG, PNG ou WebP, até 10 MB.')}</small><small>{t('Após a aprovação do admin, sua foto e a camisa escolhida são enviadas à Cloudflare Workers AI para gerar seu retrato. O resultado é salvo e aparece automaticamente no Hall.')}</small><button className="btn btn-primary" disabled={!foto||enviando}>{enviando?t('Enviando…'):t('Enviar foto para revisão')}</button>{dados?.estado==='pendente'&&<p role="status">{t('Foto recebida. Aguardando aprovação da equipe.')}</p>}{dados?.estado==='fila'&&<p role="status">{t('Foto aprovada. Seu retrato está na fila de geração.')}</p>}{dados?.estado==='gerando'&&<p role="status">{t('Gerando seu retrato com a camisa escolhida. Ele aparecerá aqui automaticamente.')}</p>}{dados?.estado==='falhou'&&<p role="status">{t('Não foi possível concluir o retrato. A equipe poderá tentar novamente; seu card anterior foi preservado.')}</p>}{dados?.estado==='aprovada'&&<p role="status">{t('Seu retrato está publicado no card.')}</p>}{dados?.estado==='reprovada'&&<p role="status">{dados.motivo||t('Envie outra foto para revisão.')}</p>}{erro&&<p role="alert">{erro}</p>}</form></details>}
  </div>
}

// A imagem também precisa funcionar para o dono de um perfil privado; o token nunca vai na URL.
function useRetratoHall(src) {
  const [imagem,setImagem]=useState(null)
  useEffect(()=>{
    if(!src){setImagem(null);return}
    let url
    try{url=new URL(src,location.origin)}catch{setImagem(null);return}
    if(url.pathname!=='/hall/imagem'||url.origin!==new URL(enderecoApi()||location.origin).origin){setImagem(src);return}
    const controle=new AbortController();let blobUrl
    const token=tokenConta()
    fetch(url.href,{signal:controle.signal,headers:token?{Authorization:`Bearer ${token}`}:{}}).then(r=>{if(!r.ok)throw new Error('imagem');return r.blob()}).then(blob=>{if(controle.signal.aborted)return;blobUrl=URL.createObjectURL(blob);setImagem(blobUrl)}).catch(()=>{if(!controle.signal.aborted)setImagem(null)})
    return()=>{controle.abort();if(blobUrl)URL.revokeObjectURL(blobUrl)}
  },[src])
  return imagem
}
