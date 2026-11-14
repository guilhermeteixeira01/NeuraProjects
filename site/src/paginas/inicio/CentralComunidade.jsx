import PartidaRecente from './PartidaRecente.jsx'
import IconeUI from '../../comum/IconeUI.jsx'
import PremiosDiarios from './PremiosDiarios.jsx'
import { useEffect, useRef, useState } from 'react'
import { useConta, entrar, linkPerfil } from '../../comum/conta.js'
import { lerDrops, useSaldo } from '../../comum/loja.js'
import { mapImage, nomeMapa, getMap } from '../../comum/mapas.js'
import { useT } from '../../comum/i18n.js'
import { FUNDOS, PERSONAGENS } from '../../comum/assetsV2.js'

export default function CentralComunidade({ partidas, ranking }) {
  const t = useT(), conta = useConta(), raiz = useRef(null)
  const [visivel, setVisivel] = useState(false)
  const [drop, setDrop] = useState(null)
  const saldo = useSaldo(conta?.id, visivel)
  const [historico, setHistorico] = useState({ id: null, lista: [], carregando: false, erro: false })
  useEffect(() => {
    const id = conta?.id
    setHistorico({ id, lista: [], carregando: !!id, erro: false })
    if (!id || !visivel) return
    let vivo = true
    const ler = async () => {
      try {
        const resposta = await fetch(`/perfil/historico/${encodeURIComponent(id)}.json`, { cache: 'no-store' })
        if (!resposta.ok && resposta.status !== 404) throw new Error('historico')
        const lista = resposta.status === 404 ? [] : await resposta.json()
        if (!Array.isArray(lista)) throw new Error('historico')
        if (vivo) setHistorico({ id, lista, carregando: false, erro: false })
      } catch {
        if (vivo) setHistorico({ id, lista: [], carregando: false, erro: true })
      }
    }
    ler()
    const timer = setInterval(ler, 30000)
    window.addEventListener('np-partida', ler)
    return () => { vivo = false; clearInterval(timer); window.removeEventListener('np-partida', ler) }
  }, [conta?.id, visivel])
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
  const lista = historico.id === conta?.id ? [...historico.lista].sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 3) : []
  const destaque = [...ranking].filter(j => Number.isFinite(j.rating)).sort((a,b)=>b.rating-a.rating)[0]
  const numero = (v) => Number(v || 0).toLocaleString(t.idioma || 'pt-BR')
  // Como na referência: faixa do login diário; embaixo, últimas partidas (lista) ao lado do card da comunidade; depois as caixas
  return <section className="wrap np-central" ref={raiz}>
    <PremiosDiarios ativo={visivel} />
    <div className="v2-central-baixo">
      <section className="np-painel-partidas">
        <header className="np-bloco-cab"><h2><IconeUI tipo="espadas" tamanho={22}/>{t('Últimas partidas')}</h2><a href={conta ? linkPerfil(conta.id) : '/partidas/'}>{t('Ver todas')} <IconeUI tipo="seta" tamanho={15}/></a></header>
        <div className="np-recentes">
          {lista.slice(0, 3).map(p=><PartidaRecente key={p.caminho || p.nome} partida={p} />)}
          {!lista.length && <p className="np-central-vazio" role="status">{t(!conta ? 'Entre na sua conta para ver suas últimas partidas.' : historico.carregando ? 'Carregando suas partidas…' : historico.erro ? 'Não foi possível carregar suas partidas. Tente novamente em instantes.' : 'Suas partidas aparecerão aqui depois que você jogar.')}</p>}
        </div>
      </section>
      <DestaquesComunidade destaque={destaque} drop={drop} numero={numero} />
    </div>
  </section>
}

// Card "Comunidade" com o mestre de cerimônias à direita e três telas (chamada, maior rating, drop em destaque),
// trocadas pelos pontos embaixo. Tudo com dados reais do ranking e dos drops.
function DestaquesComunidade({ destaque, drop, numero }) {
  const t = useT()
  const [tela, setTela] = useState(0)
  const telas = [
    <>
      <h3 className="v2-dest-titulo">{t('Destaques')}<br /><em>{t('da semana')}</em></h3>
      <p>{t('Os melhores jogadores, partidas e momentos da Neura Project.')}</p>
      <a className="v2-btn v2-btn-ouro" href="/ranking/"><IconeUI tipo="trofeu" tamanho={18} />{t('Ver ranking')}<IconeUI tipo="seta" tamanho={17} /></a>
    </>,
    <>
      <small className="v2-dest-rotulo">{t('Maior rating do ranking')}</small>
      <h3 className="v2-dest-titulo">{destaque?.nome || t('Ranking')}</h3>
      <p>{destaque ? <><b className="v2-dest-num">{destaque.rating.toFixed(2)}</b> {t('rating')} · {numero(destaque.kills)} kills</> : t('Acompanhe a evolução dos jogadores')}</p>
      <a className="v2-btn v2-btn-ouro" href={destaque ? linkPerfil(destaque.steamId || destaque.id) : '/ranking/'}>{t('Ver perfil')}<IconeUI tipo="seta" tamanho={17} /></a>
    </>,
    <>
      <small className="v2-dest-rotulo">{t('Drop em destaque')}</small>
      <h3 className="v2-dest-titulo">{drop?.n || t('Drops da comunidade')}</h3>
      <p>{drop ? <>{drop.nome} · <b className="v2-dest-num">{numero(drop.v)} NP</b></> : t('Veja os itens que os jogadores estão encontrando')}</p>
      <a className="v2-btn v2-btn-ouro" href="/loja/?aba=skins">{t('Mercado da comunidade')}<IconeUI tipo="seta" tamanho={17} /></a>
    </>,
  ]
  return <section className="np-destaques-painel v2-dest" aria-roledescription="carrossel" aria-label={t('Comunidade')}>
    <div className="v2-dest-cenario" aria-hidden="true">
      <img src={FUNDOS.ranking.src} width={FUNDOS.ranking.w} height={FUNDOS.ranking.h} alt="" loading="lazy" decoding="async" draggable="false" />
    </div>
    <div className="v2-dest-camada" aria-hidden="true">
      <img src={PERSONAGENS.tr.src} width={PERSONAGENS.tr.w} height={PERSONAGENS.tr.h} alt="" loading="lazy" decoding="async" />
    </div>
    <header className="np-bloco-cab"><h2><IconeUI tipo="estrela" tamanho={22}/>{t('Comunidade')}</h2><a href="/ranking/">{t('Ver mais')} <IconeUI tipo="seta" tamanho={15}/></a></header>
    <div className="v2-dest-corpo" aria-live="polite">{telas[tela]}</div>
    <div className="v2-dest-pontos" role="group" aria-label={t('Escolher destaque')}>
      {telas.map((_, i) => <button key={i} type="button" aria-label={t('Destaque {n} de {total}', { n: i + 1, total: telas.length })} aria-pressed={i === tela} onClick={() => setTela(i)} />)}
    </div>
  </section>
}
