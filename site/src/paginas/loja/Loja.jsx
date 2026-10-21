// Loja de caixas: o jogador gasta Neura Pontos (NP) para abrir caixas de skins (na página de cada caixa) ou abre as que já tem no inventário.
// O saldo, as compras, o sorteio e as insígnias são do servidor (worker/steam-login/src/loja.js); aqui só aparece e se anima.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo, lerLoja } from '../../comum/loja.js'
import Abertura, { useAcharItem } from './Abertura.jsx'
import AbaMercado from './Mercado.jsx'
import Deposito from './Deposito.jsx'
import Drops from './Drops.jsx'
import PaginaCaixa, { useFavoritas } from './PaginaCaixa.jsx'
import { prepararSons } from './somLoja.js'

const TIERS = [
  ['todas', 'Todas'],
  ['barata', 'Baratas'],
  ['media', 'Médias'],
  ['premium', 'Premium'],
]
const NOME_TIER = { barata: 'Barata', media: 'Média', premium: 'Premium' }

// Categorias da loja (pelo que a caixa sorteia): separam as caixas temáticas das de arma, de facas, de amuletos e de adesivos
const CATEGORIAS = [
  ['tematicas', 'Caixas temáticas', 'Skins de várias armas, com facas raras.'],
  ['armas', 'Caixas de arma', 'Só skins de uma arma (e as facas raras).'],
  ['facas', 'Facas', 'Só facas: as mais valiosas saem com chance menor.'],
  ['luvas', 'Luvas', 'Só luvas, sem item raro especial: a caixa de luxo.'],
  ['amuletos', 'Amuletos', 'Só chaveiros, para pendurar nas suas armas.'],
  ['adesivos', 'Adesivos', 'Só adesivos, para colar nas suas armas.'],
  ['misto', 'Amuletos e adesivos', 'Chaveiros e adesivos juntos.'],
]
function categoriaDe(c) {
  const t = new Set(c.itens.map((i) => i.t || 'arma'))
  if (t.size === 1 && t.has('faca')) return 'facas'
  if (t.size === 1 && t.has('luva')) return 'luvas'
  if (t.has('chaveiro') && !t.has('adesivo') && t.size === 1) return 'amuletos'
  if (t.has('adesivo') && !t.has('chaveiro') && t.size === 1) return 'adesivos'
  if (t.has('chaveiro') || t.has('adesivo')) return 'misto'
  return new Set(c.itens.map((i) => i.d)).size <= 2 ? 'armas' : 'tematicas' // uma ou duas armas (M4A1-S + M4A4) = caixa de arma
}
const numero = (n) => Number(n).toLocaleString('pt-BR')

function Saldo({ saldo }) {
  const t = useT()
  return (
    <div className="lj-saldo" title={t('Neura Pontos: 100 por mapa vencido e 50 por mapa perdido')}>
      <img src="/assets/logos/logo-np-64.png" alt="" width="26" height="26" />
      <b>{saldo == null ? '…' : numero(saldo)}</b>
      <small>NP</small>
    </div>
  )
}

// ── grade de caixas ──
function CartaoCaixa({ c, tem, aoAbrir }) {
  const t = useT()
  return (
    <li>
      <button type="button" className={`lj-caixa lj-tier-${c.tier}`} style={{ '--cor': c.cor }} onClick={() => aoAbrir(c)}>
        <span className="lj-caixa-arte">
          <img src={c.img} alt="" loading="lazy" draggable="false" />
        </span>
        <b>{c.nome}</b>
        <span className="lj-caixa-preco">
          <img src="/assets/logos/logo-np-64.png" alt="" width="16" height="16" /> {numero(c.preco)}
        </span>
        <small>{t(NOME_TIER[c.tier])}</small>
        {tem > 0 && <em className="lj-tem">{t('Você tem {n}', { n: tem })}</em>}
      </button>
    </li>
  )
}

// ── insígnias das caixas: progresso (37/50), níveis e secretas ──
const GRUPOS = { colecionador: 'Colecionador de Caixas', arsenal: 'Arsenal Afiado' }
const arte = (i, ganha) => {
  const base = i.id.startsWith('mestre-') ? 'mestre-da-caixa' : i.id
  return `/assets/insignia/${ganha ? 'web' : i.secreta ? 'secreta' : 'bloqueada'}/${base}.webp`
}
function Barra({ atual, meta }) {
  return (
    <span className="lj-progresso">
      <i style={{ width: `${Math.min(100, (atual / meta) * 100)}%` }} />
      <small>
        {numero(Math.min(atual, meta))}/{numero(meta)}
      </small>
    </span>
  )
}
function AbaInsignias({ lista }) {
  const t = useT()
  const itens = lista.filter((i) => !i.id.startsWith('mestre-'))
  const mestres = lista.filter((i) => i.id.startsWith('mestre-'))
  const grupos = []
  for (const i of itens) {
    if (i.grupo) {
      const g = grupos.find((x) => x.grupo === i.grupo)
      if (g) g.niveis.push(i)
      else grupos.push({ grupo: i.grupo, niveis: [i] })
    } else grupos.push({ unica: i })
  }
  const unica = (i) => {
    const ganha = i.ganhou > 0
    const oculta = i.secreta && !ganha
    return (
      <li key={i.id} className={`lj-ins${ganha ? ' lj-ganha' : ''}`} style={{ '--cor': i.cor }}>
        <img src={arte(i, ganha)} alt="" loading="lazy" draggable="false" />
        <b>{oculta ? '???' : t(i.nome)}</b>
        <small>{oculta ? t('Insígnia secreta') : t(i.descricao)}</small>
        {!ganha && !oculta && <Barra atual={i.atual} meta={i.meta} />}
        {ganha && <em>{t('Conquistada')}</em>}
      </li>
    )
  }
  return (
    <div className="lj-insignias">
      <ul className="lj-ins-grade">
        {grupos.map((g) => {
          if (g.unica) return unica(g.unica)
          const ganhas = g.niveis.filter((n) => n.ganhou > 0)
          const atual = ganhas[ganhas.length - 1]
          const proximo = g.niveis.find((n) => !(n.ganhou > 0))
          const mostrar = atual || g.niveis[0]
          return (
            <li key={g.grupo} className={`lj-ins lj-ins-grupo${atual ? ' lj-ganha' : ''}`} style={{ '--cor': mostrar.cor }}>
              <img src={arte(mostrar, !!atual)} alt="" loading="lazy" draggable="false" />
              <b>{t(GRUPOS[g.grupo] || g.grupo)}</b>
              <small>{atual ? t('Nível {n} de {total}', { n: atual.nivel, total: g.niveis.length }) : t('Nível 0 de {total}', { total: g.niveis.length })}</small>
              <span className="lj-niveis">
                {g.niveis.map((n) => (
                  <img key={n.id} src={arte(n, n.ganhou > 0)} alt={t(n.nome)} title={`${t(n.nome)} · ${t(n.descricao)}`} loading="lazy" className={n.ganhou > 0 ? 'ok' : ''} />
                ))}
              </span>
              {proximo ? (
                <>
                  <small className="lj-prox">{t('Próximo: {d}', { d: t(proximo.descricao) })}</small>
                  <Barra atual={proximo.atual} meta={proximo.meta} />
                </>
              ) : (
                <em>{t('Nível máximo')}</em>
              )}
            </li>
          )
        })}
      </ul>
      {mestres.length > 0 && (
        <>
          <h3 className="lj-ins-titulo">{t('Mestre da Caixa')}</h3>
          <p className="lj-ins-dica">{t('Consiga todas as skins (as facas não contam) de cada caixa.')}</p>
          <ul className="lj-ins-grade lj-ins-mestres">{mestres.map(unica)}</ul>
        </>
      )}
    </div>
  )
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const achar = useAcharItem()
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState(false)
  const [aba, setAba] = useState(() => (typeof location !== 'undefined' && new URLSearchParams(location.search).get('aba') === 'mercado' ? 'mercado' : 'caixas'))
  const [tier, setTier] = useState('todas')
  const [aberta, setAberta] = useState(null) // id da caixa com a página aberta
  const [abertura, setAbertura] = useState(null) // { caixa, qtd, origem }
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
        history.replaceState(null, '', location.pathname)
        if (c && d.fechadas[abrir] > 0) setAbertura({ caixa: c, qtd: 1, origem: 'inventario', chave: Date.now() })
      } else if (d && q.get('caixa')) {
        const c = d.caixas.find((x) => x.slug === q.get('caixa'))
        if (c) setAberta(c.id)
      }
    })
  }, [conta?.id, carregar])

  const caixas = useMemo(() => (dados?.caixas || []).filter((c) => tier === 'todas' || c.tier === tier), [dados, tier])
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

  const fecharAbertura = () => {
    setAbertura(null)
    carregar()
  }

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
  if (!dados) return <p className="lj-dica">{t('Carregando…')}</p>

  const abertura_ = abertura && <Abertura key={abertura.chave} caixa={abertura.caixa} qtd={abertura.qtd} origem={abertura.origem} maxQtd={dados.cfg.maxQtd} aoFechar={fecharAbertura} aoOutra={(n) => setAbertura({ caixa: abertura.caixa, qtd: n || 1, origem: 'auto', chave: Date.now() })} />

  // Página de uma caixa: o carrossel de drops continua em cima
  if (sel)
    return (
      <>
        <Drops achar={achar} />
        {aviso && (
          <p className="lj-aviso" role="status">
            {aviso} <a href="/inventario/">{t('Ver no inventário')}</a>
          </p>
        )}
        <PaginaCaixa
          key={sel.id}
          c={sel}
          saldo={dados.saldo}
          tem={dados.fechadas[sel.id] || 0}
          maxQtd={dados.cfg.maxQtd}
          achar={achar}
          favorita={fav.includes(sel.slug)}
          aoFavoritar={() => alternarFav(sel.slug)}
          aoVoltar={voltarCaixas}
          aoAbriu={carregar}
        />
        {abertura_}
      </>
    )

  const favoritas = caixas.filter((c) => fav.includes(c.slug))
  return (
    <>
      <Drops achar={achar} />
      <header className="lj-topo">
        <div>
          <h1>{t('Loja')}</h1>
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
        {[
          ['caixas', 'CAIXAS'],
          ['mercado', 'MERCADO'],
          ['insignias', 'INSÍGNIAS'],
        ].map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
            {t(nome)}
          </button>
        ))}
      </nav>
      {aviso && (
        <p className="lj-aviso" role="status">
          {aviso} <a href="/inventario/">{t('Ver no inventário')}</a>
        </p>
      )}

      {aba === 'caixas' ? (
        <>
          <div className="lj-filtros">
            {TIERS.map(([id, nome]) => (
              <button key={id} type="button" className={tier === id ? 'is-ativo' : ''} onClick={() => setTier(id)}>
                {t(nome)}
              </button>
            ))}
            <span className="lj-total-caixas">{t('{n} caixas', { n: caixas.length })}</span>
          </div>
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
          {CATEGORIAS.map(([id, nome, dica]) => {
            const lista = caixas.filter((c) => categoriaDe(c) === id)
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
      ) : aba === 'mercado' ? (
        <AbaMercado saldo={dados.saldo} aoMudarSaldo={carregar} />
      ) : (
        <AbaInsignias lista={dados.insignias} />
      )}

      {abertura_}
    </>
  )
}

export default function Loja() {
  return (
    <Layout pagina="loja">
      <main className="lj-pagina">
        <div className="wrap lj-wrap">
          <Conteudo />
        </div>
      </main>
    </Layout>
  )
}
