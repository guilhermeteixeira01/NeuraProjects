import PartidaRecente from './PartidaRecente.jsx'
import IconeUI from '../../comum/IconeUI.jsx'
import PremiosDiarios from './PremiosDiarios.jsx'
import { useEffect, useRef, useState } from 'react'
import { useConta, entrar, linkPerfil } from '../../comum/conta.js'
import { lerDrops, useSaldo } from '../../comum/loja.js'
import CaixasDestaque from './CaixasDestaque.jsx'
import { mapImage, nomeMapa, getMap } from '../../comum/mapas.js'
import { juntarPartidas, useRecentes } from '../../comum/partidasRecentes.js'
import { useT } from '../../comum/i18n.js'

export default function CentralComunidade({ partidas, ranking }) {
  const t = useT(), conta = useConta(), raiz = useRef(null)
  const [visivel, setVisivel] = useState(false)
  const [drop, setDrop] = useState(null)
  const saldo = useSaldo(conta?.id, visivel)
  const recentes = useRecentes(30000, visivel)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisivel(true); return }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); obs.disconnect() } }, { rootMargin: '180px' })
    if (raiz.current) obs.observe(raiz.current)
    return () => obs.disconnect()
  }, [])
  useEffect(() => {
    if (!visivel) return
    let vivo = true
    lerDrops().then((d) => { if (vivo) setDrop(d.top?.[0] || d.bons?.[0] || null) }).catch(()=>{})
    return () => { vivo = false }
  }, [visivel])
  const lista = (juntarPartidas(partidas, recentes) || []).slice(0,4)
  const destaque = [...ranking].filter(j => Number.isFinite(j.rating)).sort((a,b)=>b.rating-a.rating)[0]
  const numero = (v) => Number(v || 0).toLocaleString(t.idioma || 'pt-BR')
  return <section className="wrap np-central" ref={raiz}>
    <div className="np-central-grade">
      <PremiosDiarios ativo={visivel} />
      <section className="np-destaques-painel">
        <header className="np-bloco-cab"><h2>{t('Destaques da comunidade')}</h2></header>
        <a className="np-destaque-jogador" href={destaque ? linkPerfil(destaque.steamId || destaque.id) : '/ranking/'}><span className="np-destaque-emblema">★</span><span><small>{t('Maior rating do ranking')}</small><b>{destaque?.nome || t('Ranking')}</b><small>{destaque ? `${numero(destaque.kills)} kills` : t('Acompanhe a evolução dos jogadores')}</small></span>{destaque && <strong>{destaque.rating.toFixed(2)}</strong>}</a>
        <a className="np-destaque-drop" href="/loja/"><span className="np-destaque-emblema">◇</span><span><small>{t('Drop em destaque')}</small><b>{drop?.n || t('Drops da comunidade')}</b><small>{drop?.nome || t('Veja os itens que os jogadores estão encontrando')}</small></span>{drop && <strong>{numero(drop.v)} NP</strong>}</a>
        <a className="np-mercado-link" href="/loja/?aba=mercado"><b>{t('Mercado da comunidade')} →</b><span>{t('Explore os itens anunciados pelos jogadores.')}</span></a>
      </section>
      <CaixasDestaque />

    </div>
    <section className="np-painel-partidas">
      <header className="np-bloco-cab"><h2><IconeUI tipo="espadas" tamanho={18}/>{t('Últimas partidas')}</h2><a href="/partidas/">{t('Ver todas')} →</a></header>
      <div className="np-recentes">
        {lista.map(p=><PartidaRecente key={p.caminho || p.nome} partida={p} ativo={visivel} />)}
        {!lista.length && <p className="np-central-vazio">{t('As partidas registradas aparecem aqui.')}</p>}
      </div>
    </section>
  </section>
}
