import { useEffect, useState } from 'react'
import AvatarInicio from './AvatarInicio.jsx'
import { chamarApi } from '../../comum/api.js'
import { entrar, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo, lerSaldo } from '../../comum/loja.js'
import { IconeConta } from '../../comum/ResumoMenuConta.jsx'
import { useSeguranca } from '../../comum/seguranca.js'
import { PONTOS_DIARIOS } from '../../../worker/steam-login/src/diario-core.js'
import './premiosDiarios.css'

export default function PremiosDiarios({ ativo = true }) {
  const conta = useConta(), seg = useSeguranca(), t = useT()
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
      if(tipo==='pontos') { setAviso(d.recebido?t('+{n} NP recebidos!',{n:d.pontos}):t('Você já resgatou os pontos de hoje.')); const saldo=await lerSaldo();avisarSaldo(saldo.saldo) }
      else if(d.caixasDisponiveis>0)location.assign(`/loja/?abrir=${d.caixa.id}`)
    }catch(e){setErro(t(e?.message==='cheio'?'Seu inventário está cheio. Libere espaço para receber a caixa.':'Não foi possível resgatar agora. Tente novamente.'))}finally{setOcupado('')}
  }
  const segundos=dados?Math.max(0,Math.ceil((dados.viraEm-dados.agora-(agora-dados.recebidoEm))/1000)):0
  const relogio=[Math.floor(segundos/3600),Math.floor(segundos%3600/60),segundos%60].map(n=>String(n).padStart(2,'0')).join(':')
  const hora=Number(new Intl.DateTimeFormat('pt-BR',{hour:'numeric',hourCycle:'h23',timeZone:'America/Sao_Paulo'}).format(new Date()))
  const pontos=dados?.recompensas || PONTOS_DIARIOS, dia=dados?.sequencia || 1
  return <aside className="pd-card">
    <div className="pd-quem"><span><AvatarInicio id={conta?.id} foto={conta?.avatar}/>{conta&&<i/>}</span><div><small>{t(hora<12?'Bom dia,':hora<18?'Boa tarde,':'Boa noite,')}</small><b>{seg?.nick || conta?.nome || 'Neura Project'}</b></div></div>
    <section className="pd-login"><div className="pd-recompensa"><span className="pd-icone"><IconeConta tipo="presente"/></span><div><h3>{t('Login diário')}</h3><p>{t('Dia {dia} de 7 · +{np} NP',{dia,np:dados?.pontos || pontos[0]})}</p></div><button type="button" disabled={!!ocupado || (!!conta && (!dados || dados.pontosResgatados))} onClick={()=>resgatar('pontos')}>{ocupado==='pontos'?'…':dados?.pontosResgatados?t('Feito'):t('Resgatar')}</button></div>
      <ol className="pd-semana">{pontos.map((np,i)=><li key={np} className={i+1===dia?'atual':i+1<dia?'feito':''}><span>{i===6?<IconeConta tipo="presente"/>:i+1}</span><b>{np}</b></li>)}</ol>
    </section>
    <section className="pd-caixa"><img className="pd-caixa-arte" src="/assets/caixas/neura-projects-caixa-diaria.png" alt="" width="52" height="52"/><div><h3>{t('Caixa diária')}</h3><p>{dados?.caixaResgatada&&!dados.caixasDisponiveis?t('Resgatada hoje'):t('Grátis, uma por dia')}</p></div><button type="button" disabled={!!ocupado || (!!conta && (!dados || (dados.caixaResgatada&&!dados.caixasDisponiveis)))} onClick={()=>resgatar('caixa')}>{ocupado==='caixa'?'…':dados?.caixaResgatada&&!dados.caixasDisponiveis?t('Amanhã'):t('Abrir')}</button></section>
    {erro&&<p className="pd-erro" role="alert">{erro}</p>}{aviso&&<p className="pd-aviso" role="status">{aviso}</p>}
    {erro&&!dados&&conta&&<button className="pd-tentar" onClick={()=>chamarApi('/loja/diario').then(d=>{setDados({...d,recebidoEm:Date.now()});setErro('')}).catch(()=>{})}>{t('Tentar novamente')}</button>}
    <footer className="pd-virada"><span><IconeConta tipo="relogio"/>{t('Vira o dia em')}</span><b>{dados?relogio:'—'}</b><small>{t('Horário de Brasília · sequência reinicia se pular um dia')}</small></footer>
  </aside>
}
