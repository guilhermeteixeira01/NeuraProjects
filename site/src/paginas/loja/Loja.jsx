// Loja de caixas: o jogador gasta Neura Pontos (NP) para abrir caixas de skins (na página de cada caixa) ou abre as que já tem no inventário.
// O saldo, as compras, o sorteio e as insígnias são do servidor (worker/steam-login/src/loja.js); aqui só aparece e se anima.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo, lerLoja } from '../../comum/loja.js'
import { useAcharItem } from './Abertura.jsx'
import MercadoJogadores from './Mercado.jsx'
import MercadoOficial from './MercadoOficial.jsx'
import Deposito from './Deposito.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import PaginaCaixa, { useFavoritas } from './PaginaCaixa.jsx'
import CaixaPremium from './CaixaPremium.jsx'
import { prepararSons } from './somLoja.js'
import { PERSONAGENS, fundoCss } from '../../comum/assetsV2.js'
import IconeUI from '../../comum/IconeUI.jsx'
import { CATEGORIAS_CAIXA, categoriaDaCaixa } from '../../comum/temasCaixa.js'

// Categorias da loja: por franquia/tema (src/comum/temasCaixa.js)
const numero = (n) => Number(n).toLocaleString('pt-BR')

function Saldo({ saldo }) {
  const t = useT()
  return (
    <div className="lj-saldo" title={t('Neura Pontos: 100 por mapa vencido e 40 por mapa perdido')}>
      <img src="/icones/logo-np-64.png" alt="" width="26" height="26" />
      <b>{saldo == null ? '…' : numero(saldo)}</b>
      <small>NP</small>
    </div>
  )
}

// ── grade de caixas: arte grande solta no fundo (brilho na cor da caixa), nome e o preço numa pílula ──
// Imagem que não abriu (rede, ou o navegador guardou uma resposta ruim): tenta uma vez de novo, com um parâmetro novo para furar o cache
function tentarDeNovo(e) {
  const img = e.currentTarget
  if (img.dataset.retentou) return
  img.dataset.retentou = '1'
  img.src = `${img.src.split('&r=')[0]}${img.src.includes('?') ? '&' : '?'}r=${Date.now()}`
}
function CartaoCaixa({ c, tem, aoAbrir }) {
  const t = useT()
  return (
    <li>
      <button type="button" className="lj-caixa" style={{ '--cor': c.cor }} onClick={() => aoAbrir(c)}>
        <span className="lj-caixa-arte">
          <img src={c.img} alt="" loading="lazy" draggable="false" onError={tentarDeNovo} />
        </span>
        <b>{c.nome}</b>
        <span className="lj-caixa-preco">
          <img src="/icones/logo-np-64.png" alt="" width="16" height="16" /> {numero(c.preco)}
        </span>
        {tem > 0 && <em className="lj-tem">{t('Você tem {n}', { n: tem })}</em>}
      </button>
    </li>
  )
}

// Abas da loja: caixas, loja de skins (mercado entre jogadores) e loja geral (mercado oficial).
// ?aba=mercado (links antigos) abre a loja de skins. As insígnias das caixas ficam na aba Missões do perfil.
const ABAS = [
  ['caixas', 'Caixas', 'caixa'],
  ['skins', 'Skins', 'espadas'],
  ['geral', 'Loja geral', 'editar'],
]
function abaDaUrl() {
  if (typeof location === 'undefined') return 'caixas'
  const a = new URLSearchParams(location.search).get('aba')
  if (a === 'personalizacao') return 'geral' // link antigo
  return a === 'mercado' ? 'skins' : ABAS.some(([id]) => id === a) ? a : 'caixas'
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const achar = useAcharItem()
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState(false)
  const [aba, setAba] = useState(abaDaUrl)
  const [aberta, setAberta] = useState(null) // id da caixa com a página aberta
  const [abrirAuto, setAbrirAuto] = useState(null) // id da caixa que veio do inventário para abrir: abre na página dela (roleta embutida)
  const [aviso, setAviso] = useState('')
  const [depositando, setDepositando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const d = await lerLoja()
      setDados(d)
      avisarSaldo(d.saldo)
      return d
    } catch {
      setErroCarga(true)
      return null
    }
  }, [])
  useEffect(() => {
    if (!conta?.id) return
    prepararSons()
    carregar().then((d) => {
      // vindo do inventário (botão "Abrir" da caixa fechada): abre direto
      const q = new URLSearchParams(location.search)
      const abrir = Number(q.get('abrir'))
      if (d && abrir) {
        const c = d.caixas.find((x) => x.id === abrir)
        if (c && d.fechadas[abrir] > 0) {
          history.replaceState(null, '', `${location.pathname}?caixa=${c.slug}`) // sem estado: o "Voltar às caixas" vai para a lista (não volta ao inventário)
          setAberta(c.id)
          setAbrirAuto(c.id)
        } else history.replaceState(null, '', location.pathname)
      } else if (d && q.get('caixa')) {
        const c = d.caixas.find((x) => x.slug === q.get('caixa'))
        if (c) setAberta(c.id)
      }
    })
  }, [conta?.id, carregar])

  // caixas fora da loja (arquivadas) ficam só em dados.caixas, para o "Abrir" do inventário; não entram na grade
  const caixas = useMemo(() => (dados?.caixas || []).filter((c) => !c.foraDeVenda), [dados])
  const sel = dados?.caixas.find((c) => c.id === aberta) || null
  const { fav, alternar: alternarFav } = useFavoritas()

  // Página da caixa: entra no histórico (?caixa=slug), então o "voltar" do navegador também volta para a lista
  const verCaixa = (c) => {
    history.pushState({ caixa: c.slug }, '', `${location.pathname}?caixa=${c.slug}`)
    setAviso('')
    setAberta(c.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const voltarCaixas = () => {
    if (history.state?.caixa) history.back()
    else {
      history.replaceState(null, '', location.pathname)
      setAberta(null)
    }
  }
  useEffect(() => {
    const ouvir = () => {
      const slug = new URLSearchParams(location.search).get('caixa')
      setAberta(slug ? dados?.caixas.find((x) => x.slug === slug)?.id ?? null : null)
    }
    window.addEventListener('popstate', ouvir)
    return () => window.removeEventListener('popstate', ouvir)
  }, [dados])

  if (!loginAtivo() || !conta)
    return (
      <div className="lj-bloqueio" role="status">
        <h1>{t('Loja de caixas')}</h1>
        <p>{t('Entre com a Steam para gastar os seus Neura Pontos em caixas de skins.')}</p>
        {loginAtivo() && (
          <button type="button" className="lj-btn lj-btn-p" onClick={entrar}>
            {t('Entrar com a Steam')}
          </button>
        )}
      </div>
    )
  if (erroCarga) return <p className="lj-dica">{t('Não consegui carregar a loja. Tente de novo mais tarde.')}</p>
  if (!dados) return <CarregandoNP />

  // Página de uma caixa.
  if (sel)
    return (
      <>
        {aviso && (
          <p className="lj-aviso" role="status">
            {aviso} <a href="/inventario/">{t('Ver no inventário')}</a>
          </p>
        )}
        {sel.premium ? <CaixaPremium c={sel} tem={dados.fechadas[sel.id] || 0} achar={achar} aoVoltar={voltarCaixas} aoAbriu={carregar} abrirDoInventario={abrirAuto === sel.id} /> : <PaginaCaixa
          key={sel.id}
          c={sel}
          saldo={dados.saldo}
          tem={dados.fechadas[sel.id] || 0}
          maxQtd={dados.cfg.maxQtd}
          aberturas={dados.aberturasEspecial ?? dados.aberturas ?? 0}
          abrirDoInventario={abrirAuto === sel.id}
          aoAbrirDoInventario={() => setAbrirAuto(null)}
          achar={achar}
          favorita={fav.includes(sel.slug)}
          aoFavoritar={() => alternarFav(sel.slug)}
          aoVoltar={voltarCaixas}
          aoAbriu={carregar}
        />}
      </>
    )

  const favoritas = caixas.filter((c) => fav.includes(c.slug))
  return (
    <>
      <header className="lj-topo">
        <div className="v2-titulo">
          <div>
            <h1>{t('Loja Neura')}</h1>
            <p>{t('Caixas, skins e itens da comunidade, pagos com Neura Pontos.')}</p>
          </div>
        </div>
        <div className="lj-topo-saldo">
          <Saldo saldo={dados.saldo} />
          <button type="button" className="lj-depositar" onClick={() => setDepositando(true)}>
            + {t('Depositar')}
          </button>
        </div>
      </header>
      {depositando && <Deposito aoFechar={() => setDepositando(false)} aoPagar={carregar} />}

      <nav className="lj-abas" role="tablist">
        {ABAS.map(([id, nome, icone]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
            <IconeUI tipo={icone} tamanho={23} />{t(nome)}
          </button>
        ))}
      </nav>

      {/* Hero: três camadas independentes (cenário recortado; arlequim em PNG transparente por cima, saindo pela borda de cima;
          texto e botão à frente). O personagem não captura clique. */}
      <section className="lj-hero" style={fundoCss('loja')} aria-label={t('Destaque da loja')}>
        <div className="lj-hero-cenario" aria-hidden="true" />
        <div className="lj-hero-camada" aria-hidden="true">
          <img src={PERSONAGENS.lojaArlequim.src} width={PERSONAGENS.lojaArlequim.w} height={PERSONAGENS.lojaArlequim.h} alt="" decoding="async" draggable="false" />
        </div>
        <div className="lj-hero-texto">
          <h2>{t('Itens que mudam o seu jogo.')}</h2>
          <p>{t('Abra caixas, compre skins e itens com Neura Pontos.')}</p>
          <a className="v2-btn v2-btn-primario" href="#lj-catalogo">
            {t('Explorar')}
            <IconeUI tipo="seta" tamanho={18} />
          </a>
        </div>
      </section>

      <span id="lj-catalogo" className="lj-ancora" />
      {aviso && (
        <p className="lj-aviso" role="status">
          {aviso} <a href="/inventario/">{t('Ver no inventário')}</a>
        </p>
      )}

      {aba === 'caixas' ? (
        <>
          {dados.caixas.filter(c => c.premium).map(c => <section className="premium-convite" key={c.id}>
            <img src={c.img} alt="Caixa Premium" />
            <div><span className="premium-tag">PRESENTE ÚNICO</span><h2>Caixa Premium</h2><p>AWP Printstream, M4A1-S Printstream ou AK-47 Bloodsport. Escolha a sua.</p></div>
            <button className="lj-btn lj-btn-p" onClick={() => verCaixa(c)}>{dados.fechadas[c.id] > 0 ? 'Abrir minha caixa' : 'Ver benefício Premium'}</button>
          </section>)}
          {favoritas.length > 0 && (
            <section className="lj-categoria" aria-label={t('Favoritas')}>
              <h2>
                ♥ {t('Favoritas')} <em>{favoritas.length}</em>
              </h2>
              <p>{t('As caixas que você marcou com o coração.')}</p>
              <ul className="lj-grade-caixas">
                {favoritas.map((c) => (
                  <CartaoCaixa key={c.id} c={c} tem={dados.fechadas[c.id] || 0} aoAbrir={verCaixa} />
                ))}
              </ul>
            </section>
          )}
          {CATEGORIAS_CAIXA.map(([id, nome, dica]) => {
            const lista = caixas.filter((c) => categoriaDaCaixa(c) === id)
            if (!lista.length) return null
            return (
              <section className="lj-categoria" key={id} aria-label={t(nome)}>
                <h2>
                  {t(nome)} <em>{lista.length}</em>
                </h2>
                <p>{t(dica)}</p>
                <ul className="lj-grade-caixas">
                  {lista.map((c) => (
                    <CartaoCaixa key={c.id} c={c} tem={dados.fechadas[c.id] || 0} aoAbrir={verCaixa} />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      ) : aba === 'skins' ? (
        <MercadoJogadores saldo={dados.saldo} aoMudarSaldo={carregar} />
      ) : (
        <MercadoOficial saldo={dados.saldo} />
      )}

    </>
  )
}

export default function Loja() {
  return (
    <Layout pagina="loja">
      <main className="lj-pagina" style={fundoCss('loja')}>
        <div className="wrap lj-wrap">
          <Conteudo />
        </div>
      </main>
    </Layout>
  )
}
