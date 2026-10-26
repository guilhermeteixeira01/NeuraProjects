import { useState } from 'react'
import { CONFIG } from '../../comum/config.js'
import { IconeDiscord } from '../../comum/Icones.jsx'
import { useT } from '../../comum/i18n.js'
import skins from './skinsRodape.json'
import './central.css'

export default function RodapeComunidade() {
  const t = useT()
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText('https://neuraproject.com.br/'); setCopiado(true); setErro(false) }
    catch { setErro(true) }
  }
  return <footer className="np-rodape" id="comunidade">
    <div className="np-rodape-skins" aria-hidden="true">{skins.map((skin,i)=><img className={`np-rodape-skin np-rodape-skin-${i}`} key={skin.nome} src={skin.imagem} alt="" loading="lazy" decoding="async" width="512" height="384" />)}</div>
    <div className="wrap">
      {CONFIG.comunidade && <a className="np-discord-faixa" href={CONFIG.comunidade} target="_blank" rel="noopener">
        <IconeDiscord tamanho={34} /><span><b>{t('Seu próximo time começa com uma conversa.')}</b><small>{t('Encontre pessoas para jogar, compartilhe experiências e evolua com a comunidade.')}</small></span><strong>{t('Entrar no Discord')} →</strong>
      </a>}
      <div className="np-rodape-grade">
        <div className="np-rodape-marca"><img src="/assets/logos/logo-np-64.png" alt="" width="46" height="46" /><b>NEURA PROJECT</b><p>{t('Uma comunidade para evoluir, criar amizades e construir o futuro no competitivo.')}</p><button type="button" onClick={copiar}>{copiado ? t('Link copiado') : t('Compartilhar a comunidade')}</button>{erro && <small role="status">neuraproject.com.br</small>}</div>
        {[
          ['Competir', [['Jogar','/lobby/'],['Partidas','/partidas/'],['Ranking','/ranking/']]],
          ['Coleção', [['Inventário','/inventario/'],['Loja','/loja/'],['Mercado','/loja/?aba=mercado']]],
          ['Comunidade', [['Times','/times/'],['Sobre','/#sobre'],['Nossos projetos','/#projetos']]],
        ].map(([titulo,links])=><nav key={titulo} aria-label={t(titulo)}><h3>{t(titulo)}</h3>{links.map(([texto,href])=><a key={href} href={href}>{t(texto)}</a>)}</nav>)}
      </div>
      <div className="np-rodape-base"><span>© {new Date().getFullYear()} Neura Project</span><span>{t('Comunidade independente, sem afiliação com a Valve ou a Steam.')}</span><a href="/termos-de-uso.pdf" target="_blank" rel="noopener">{t('Termos de uso')}</a></div>
    </div>
  </footer>
}
