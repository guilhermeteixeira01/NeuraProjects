import { useEffect, useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { entrar, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { CAIXA_DIARIA_V3 } from '../../comum/assetsV2.js'
import { avisarSaldo, lerSaldo } from '../../comum/loja.js'
import { IconeConta } from '../../comum/ResumoMenuConta.jsx'
import { PONTOS_DIARIOS } from '../../../worker/steam-login/src/diario-core.js'
import './premiosDiarios.css'

export default function PremiosDiarios({ ativo = true }) {
  const conta = useConta(), t = useT()
  const [dados,setDados] = useState(null), [erro,setErro] = useState(''), [ocupado,setOcupado] = useState(''), [aviso,setAviso] = useState(''), [agora,setAgora] = useState(Date.now())
  useEffect(()=>{
    setDados(null); setErro(''); if(!conta?.id || !ativo)return
    let vivo=true
    const ler=()=>chamarApi('/loja/diario').then(d=>{if(vivo)setDados({...d,recebidoEm:Date.now()})}).catch(()=>{if(vivo)setErro(t('Não foi possível carregar os prêmios.'))})
    ler(); window.addEventListener('focus',ler)
    const timer=setInterval(()=>setAgora(Date.now()),1000)
    return()=>{vivo=false;clearInterval(timer);window.removeEventListener('focus',ler)}
  },[conta?.id,ativo])
  useEffect(()=>{
    if(!dados)return
    const espera=Math.max(0,dados.viraEm-dados.agora-(Date.now()-dados.recebidoEm))+100
    const timer=setTimeout(()=>chamarApi('/loja/diario').then(d=>setDados({...d,recebidoEm:Date.now()})).catch(()=>setErro(t('Atualize para conferir os prêmios do novo dia.'))),espera)
    return()=>clearTimeout(timer)
  },[dados])
  const resgatar=async(tipo)=>{
    if(!conta)return entrar()
    setOcupado(tipo);setErro('');setAviso('')
    try{
      const d=await chamarApi(`/loja/diario/${tipo}`,{})
      setDados({...d,recebidoEm:Date.now()})
      if(tipo==='pontos') { setAviso(d.recebido?t('+{n} NP recebidos!',{n:d.pontos})+(d.consumivel?` ${t('+1 {item} para usar no lobby',{item:d.consumivel==='boost'?'Boost':'Freeze'})}`:''):t('Você já resgatou os pontos de hoje.')); const saldo=await lerSaldo();avisarSaldo(saldo.saldo) }
      else if(d.caixasDisponiveis>0)location.assign(`/loja/?abrir=${d.caixa.id}`)
    }catch(e){setErro(t(e?.message==='cheio'?'Seu inventário está cheio. Libere espaço para receber a caixa.':'Não foi possível resgatar agora. Tente novamente.'))}finally{setOcupado('')}
  }
  const segundos=dados?Math.max(0,Math.ceil((dados.viraEm-dados.agora-(agora-dados.recebidoEm))/1000)):0
  const relogio=[Math.floor(segundos/3600),Math.floor(segundos%3600/60),segundos%60].map(n=>String(n).padStart(2,'0')).join(':')
  const pontos=dados?.recompensas || PONTOS_DIARIOS, dia=dados?.sequencia || 1
  // itens de partida do lobby que vêm junto em alguns dias da sequência (o worker manda; sem resposta, o padrão)
  const itensDia=dados?.consumiveisDiario || {4:'freeze',7:'boost'}
  const resgatouHoje = !!dados?.pontosResgatados
  const caixaFeita = !!(dados?.caixaResgatada && !dados.caixasDisponiveis)
  // Faixa do Início (referência: login diário de largura total): título, os 7 dias da sequência e o estado de hoje
  return <section className="pd-faixa" aria-labelledby="pd-titulo">
    <div className="pd-faixa-titulo">
      <span className="pd-faixa-icone"><IconeConta tipo="calendario"/></span>
      <div><h2 id="pd-titulo">{t('Login diário')}</h2><p>{t('Jogue todos os dias e ganhe recompensas.')}</p></div>
    </div>
    <ol className="pd-dias">{pontos.map((np,i)=>{
      const n=i+1, feito=n<dia || (n===dia && resgatouHoje), atual=n===dia
      return <li key={n} className={`${feito?'feito':''}${atual?' atual':''}`} aria-current={atual?'date':undefined}>
        <small>{t('Dia {n}',{n})}</small>
        <span className="pd-dia-icone" aria-hidden="true">{feito?<IconeConta tipo="check"/>:<IconeConta tipo="presente"/>}</span>
        <b>{np} NP</b>
        {itensDia[n]&&<em className={`pd-item pd-item-${itensDia[n]}`} title={t('+1 {item} para usar no lobby',{item:itensDia[n]==='boost'?'Boost':'Freeze'})}>+{itensDia[n]==='boost'?'⚡':'❄'}</em>}
        <span className="sr-only">{feito?t('resgatado'):atual?t('hoje'):''}</span>
      </li>
    })}</ol>
    <div className={`pd-hoje${resgatouHoje?' feito':''}`}>
      <img className="pd-hoje-arte" src={CAIXA_DIARIA_V3.src} alt="" width={CAIXA_DIARIA_V3.w} height={CAIXA_DIARIA_V3.h} loading="lazy" decoding="async" draggable="false"/>
      <span className="pd-hoje-icone" aria-hidden="true"><IconeConta tipo={resgatouHoje?'check':'presente'}/></span>
      <div className="pd-hoje-txt">
        <b>{resgatouHoje?t('Resgatado hoje'):t('Dia {dia} de 7 · +{np} NP',{dia,np:dados?.pontos || pontos[0]})}</b>
        <small>{resgatouHoje?t('Volte amanhã para mais recompensas!'):t('Vira o dia em')+' '+(dados?relogio:'—')}</small>
        <div className="pd-hoje-botoes">
          {!resgatouHoje&&<button type="button" className="pd-btn pd-btn-p" disabled={!!ocupado || (!!conta && !dados)} onClick={()=>resgatar('pontos')}>{ocupado==='pontos'?'…':t('Resgatar')}</button>}
          <button type="button" className="pd-btn" disabled={!!ocupado || (!!conta && (!dados || caixaFeita))} onClick={()=>resgatar('caixa')} title={t('Caixa diária')}>{ocupado==='caixa'?'…':caixaFeita?t('Caixa: amanhã'):t('Caixa diária')}</button>
        </div>
        {resgatouHoje&&<small className="pd-hoje-relogio">{t('Vira o dia em')} <b className="v2-num">{dados?relogio:'—'}</b></small>}
      </div>
    </div>
    {(erro||aviso)&&<p className={erro?'pd-erro':'pd-aviso'} role={erro?'alert':'status'}>{erro||aviso}{erro&&!dados&&conta&&<button className="pd-tentar" onClick={()=>chamarApi('/loja/diario').then(d=>{setDados({...d,recebidoEm:Date.now()});setErro('')}).catch(()=>{})}>{t('Tentar novamente')}</button>}</p>}
  </section>
}
