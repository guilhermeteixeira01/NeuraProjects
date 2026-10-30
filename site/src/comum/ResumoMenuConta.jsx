import IconeUI from './IconeUI.jsx'
import { useEffect, useState } from 'react'
import { linkPerfil, sair } from './conta.js'
import { ComMoldura } from './Moldura.jsx'
import { InsigniasMini } from './Insignias.jsx'
import { useInsignias } from './insignias.js'
import { SeloNivel, useNivelDe } from './Nivel.jsx'
import { CONFIG } from './config.js'
import { useT } from './i18n.js'
import './resumoMenuConta.css'

export function IconeConta({ tipo }) { return <IconeUI tipo={tipo} tamanho={18}/> }

export default function ResumoMenuConta({ conta, nome, avatar, conectado, seg, aoFechar, aoTrocarNick }) {
  const t = useT(), ins = useInsignias(conta.id)
  const [j, setJ] = useState(null)
  const nivel = useNivelDe({ ...j, steamId: conta.id })
  useEffect(() => { let vivo = true; fetch('/ranking/ranking.json').then(r => r.ok ? r.json() : null).then(d => { if(vivo) setJ(d?.jogadores?.find(j => j.steamId === conta.id) || null) }).catch(()=>{}); return () => { vivo = false } }, [conta.id])
  const link = linkPerfil(conta.id), jogou = j?.mapas > 0
  return <>
    <header className="nc-topo"><ComMoldura steamId={conta.id} emblema><img src={avatar || '/assets/logos/logo-np-64.png'} alt="" width="52" height="52"/></ComMoldura><div className="nc-nome"><b>{nome}</b><span className={conectado?'online':''}>{conectado?t('Online'):t('Offline')}</span></div><SeloNivel nivel={nivel.nivel} tamanho={32}/><button type="button" className="nc-fechar" onClick={aoFechar} aria-label={t('Fechar')}>×</button></header>
    <div className="nc-conquistas"><a href={link+'#insignias'}>{ins.length ? <InsigniasMini steamId={conta.id} max={3}/> : t('Sem medalhas')}</a><a href={link}>{jogou?t('{n} partidas',{n:j.mapas}):t('Sem partidas')}</a></div>
    <dl className="nc-stats"><div><dt>K/D</dt><dd>{jogou?Number(j.kd||0).toFixed(2):'—'}</dd></div><div><dt>{t('Vitórias')}</dt><dd>{jogou?j.vitorias:'—'}</dd></div><div><dt>HS</dt><dd>{jogou?`${Math.round(j.hsPct||0)}%`:'—'}</dd></div></dl>
    <div className="nc-principais"><a href={link}>{t('Ver perfil')}</a><a href={link+'&conta=1'}><IconeConta tipo="configuracoes"/>{t('Configurações')}</a></div>
    <nav className="nc-links" aria-label={t('Atalhos da conta')}>
      <a href={link+'#inventario'}><IconeConta tipo="inventario"/>{t('Inventário')}</a><a href={link+'#amigos'}><IconeConta tipo="amigos"/>{t('Amigos')}</a>
      <a href={link+'#afiliado'}><IconeConta tipo="presente"/>{t('Indicar amigos')}</a><button type="button" disabled={!seg?.podeTrocarNick} onClick={aoTrocarNick} title={seg?.podeTrocarNick?'':t('A troca de apelido segue as regras da sua assinatura.')}><IconeConta tipo="editar"/>{t('Trocar nick')}</button>
      {CONFIG.comunidade && <a href={CONFIG.comunidade} target="_blank" rel="noopener"><IconeConta tipo="suporte"/>{t('Suporte')}</a>}<button type="button" className="nc-sair" onClick={()=>sair({irParaInicio:true})}><IconeConta tipo="sair"/>{t('Sair')}</button>
    </nav>
  </>
}
