import { MOLDURAS, urlMiniatura } from './molduras.js'
import { FUNDOS_EVENTO, imagemFundoPerfil } from '../../worker/steam-login/src/fundos-perfil.js'
import { useT } from './i18n.js'
import './recompensasInsignia.css'

export const recompensasDaInsignia = id => [
 ...MOLDURAS.filter(m => m.insignia === id).map(m => ({id:m.id,tipo:'Moldura',nome:m.nome,imagem:urlMiniatura(m.id)})),
 ...FUNDOS_EVENTO.filter(f => f.insignia === id).map(f => ({id:f.id,tipo:'Fundo do perfil',nome:f.evento,imagem:imagemFundoPerfil(f.id)})),
]
export default function RecompensasInsignia({ id, conquistada=false }) {
 const t=useT(),recompensas=recompensasDaInsignia(id)
 if (!recompensas.length) return null
 return <div className={`ins-recompensas${conquistada ? ' ins-recompensas-liberadas' : ' ins-recompensas-bloqueadas'}`}><h4>{t(conquistada?'Recompensas liberadas':'Ao conquistar, você libera')}</h4><ul>{recompensas.map(r=><li key={r.id}><img src={r.imagem} alt="" loading="lazy" className={r.tipo==='Moldura'?'ins-recompensa-moldura':'ins-recompensa-fundo'} /><span><b>{t(r.tipo)}</b><small>{r.nome}</small></span></li>)}</ul></div>
}
