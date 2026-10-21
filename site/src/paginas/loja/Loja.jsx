// Loja de caixas: o jogador gasta Neura Pontos (NP) para comprar caixas de skins (vão fechadas para o inventário) ou abrir na hora.
// O saldo, as compras, o sorteio e as insígnias são do servidor (worker/steam-login/src/loja.js); aqui só aparece e se anima.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo, comprarCaixa, lerLoja } from '../../comum/loja.js'
import { RARIDADES } from '../../../worker/steam-login/src/loja-core.js'
import Abertura, { CartaoItem, useAcharItem } from './Abertura.jsx'
import { prepararSons, som } from './somLoja.js'

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
const pct = (n) => (n >= 1 ? n.toFixed(2) : n >= 0.1 ? n.toFixed(2) : n.toFixed(3)).replace(/\.?0+$/, (m) => (m === '.0' ? '' : m)) + '%'

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

// ── página de uma caixa: itens por raridade com as chances, quantidade, comprar e abrir ──
function PaginaCaixa({ c, saldo, tem, maxQtd, aoFechar, aoComprar, aoAbrir, ocupado, achar }) {
  const t = useT()
  const [qtd, setQtd] = useState(1)
  const custo = c.preco * qtd
  const falta = custo > saldo
  const porRaridade = useMemo(() => {
    const r = [[], [], [], [], []]
    c.itens.forEach((it, i) => r[it.r].push({ ...it, chance: c.chances.itens[i] }))
    r.forEach((l) => l.sort((a, b) => a.chance - b.chance))
    return r
  }, [c])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])

  return (
    <div className="lj-fundo" onClick={aoFechar}>
      <div className="lj-janela" role="dialog" aria-modal="true" aria-label={c.nome} style={{ '--cor': c.cor }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lj-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
          ×
        </button>
        <div className="lj-janela-corpo">
          <aside className="lj-lado">
            <span className="lj-lado-arte">
              <img src={c.img} alt="" draggable="false" />
            </span>
            <h2>{c.nome}</h2>
            <small className="lj-tier">{t(NOME_TIER[c.tier])}</small>
            <div className="lj-preco-grande">
              <img src="/assets/logos/logo-np-64.png" alt="" width="22" height="22" /> {numero(c.preco)} <small>NP</small>
            </div>

            <div className="lj-qtd" role="group" aria-label={t('Quantidade')}>
              {Array.from({ length: maxQtd }, (_, k) => k + 1).map((n) => (
                <button key={n} type="button" className={qtd === n ? 'is-ativo' : ''} onClick={() => setQtd(n)} aria-pressed={qtd === n}>
                  {n}
                </button>
              ))}
            </div>
            <p className="lj-total">
              {t('Total')}: <b>{numero(custo)} NP</b>
            </p>
            <p className={`lj-seu-saldo${falta ? ' lj-falta' : ''}`}>
              {t('Seu saldo')}: <b>{numero(saldo)} NP</b>
              {falta && <span> · {t('faltam {n} NP', { n: numero(custo - saldo) })}</span>}
            </p>

            <div className="lj-acoes">
              <button type="button" className="lj-btn lj-btn-p" disabled={falta || ocupado} onClick={() => aoAbrir(c, qtd, 'direto')}>
                {t('Abrir agora')}
              </button>
              <button type="button" className="lj-btn" disabled={falta || ocupado} onClick={() => aoComprar(c, qtd)}>
                {t('Comprar')}
              </button>
              {tem > 0 && (
                <button type="button" className="lj-btn lj-btn-v" disabled={ocupado} onClick={() => aoAbrir(c, Math.min(qtd, tem), 'inventario')}>
                  {t('Abrir do inventário ({n})', { n: tem })}
                </button>
              )}
            </div>
            <small className="lj-nota">{t('"Comprar" guarda a caixa fechada no seu inventário. O sorteio é feito pelo servidor, antes da animação.')}</small>
          </aside>

          <section className="lj-itens">
            <h3>{t('O que pode sair')}</h3>
            <ul className="lj-chances">
              {[5, 4, 3, 2, 1, 0].filter((r) => c.chances.raridades[r] > 0).map((r) => (
                <li key={r} style={{ '--cor': RARIDADES[r].cor }}>
                  <i />
                  <span>{t(RARIDADES[r].nome)}</span>
                  <b>{pct(c.chances.raridades[r])}</b>
                </li>
              ))}
            </ul>

            {c.facas.length > 0 && (
              <details className="lj-bloco lj-bloco-faca" style={{ '--cor': RARIDADES[5].cor }}>
                <summary>
                  <span className="lj-interroga lj-interroga-p">?</span>
                  <b>{t('Item Raro Especial')}</b>
                  <em>{t('{n} facas · {p} no total', { n: c.facas.length, p: pct(c.chances.raridades[5]) })}</em>
                </summary>
                <ul className="lj-grade">
                  {c.facas
                    .map((f, i) => ({ ...f, chance: c.chances.facas[i] }))
                    .sort((a, b) => a.chance - b.chance)
                    .map((f) => (
                      <li key={`${f.d}:${f.p}`}>
                        <CartaoItem r={5} d={f.d} p={f.p} achar={achar}>
                          <em className="lj-chance">{pct(f.chance)}</em>
                        </CartaoItem>
                      </li>
                    ))}
                </ul>
              </details>
            )}

            {[4, 3, 2, 1, 0].map((r) =>
              porRaridade[r].length ? (
                <div className="lj-bloco" key={r} style={{ '--cor': RARIDADES[r].cor }}>
                  <h4>
                    <i /> {t(RARIDADES[r].nome)} <em>{pct(c.chances.raridades[r])}</em>
                  </h4>
                  <ul className="lj-grade">
                    {porRaridade[r].map((it) => (
                      <li key={`${it.d}:${it.p}`}>
                        <CartaoItem r={r} d={it.d} p={it.p} tipo={it.t} n={it.n} i={it.i} achar={achar}>
                          <em className="lj-chance">{pct(it.chance)}</em>
                        </CartaoItem>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </section>
        </div>
      </div>
    </div>
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
  const [aba, setAba] = useState('caixas')
  const [tier, setTier] = useState('todas')
  const [aberta, setAberta] = useState(null) // id da caixa com a página aberta
  const [abertura, setAbertura] = useState(null) // { caixa, qtd, origem }
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

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

  const comprar = async (c, qtd) => {
    setOcupado(true)
    try {
      const r = await comprarCaixa(c.id, qtd)
      som('abrir')
      avisarSaldo(r.saldo)
      setAviso(t('{n} caixa(s) guardada(s) no seu inventário.', { n: qtd }))
      await carregar()
    } catch (e) {
      setAviso(e.message === 'saldo' ? t('Você não tem Neura Pontos suficientes.') : e.message === 'cheio' ? t('O seu inventário está cheio.') : t('Não deu para comprar agora. Tente de novo.'))
    } finally {
      setOcupado(false)
    }
  }
  const abrirCaixa = (c, qtd, origem) => {
    setAberta(null)
    setAviso('')
    setAbertura({ caixa: c, qtd, origem, chave: Date.now() })
  }
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

  return (
    <>
      <header className="lj-topo">
        <div>
          <h1>{t('Loja')}</h1>
          <p>{t('Gaste seus Neura Pontos em caixas de skins. Sem dinheiro de verdade: os pontos vêm das partidas (100 por vitória, 50 por derrota).')}</p>
        </div>
        <Saldo saldo={dados.saldo} />
      </header>

      <nav className="lj-abas" role="tablist">
        {[
          ['caixas', 'CAIXAS'],
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
                    <CartaoCaixa key={c.id} c={c} tem={dados.fechadas[c.id] || 0} aoAbrir={(x) => setAberta(x.id)} />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      ) : (
        <AbaInsignias lista={dados.insignias} />
      )}

      {sel && <PaginaCaixa c={sel} saldo={dados.saldo} tem={dados.fechadas[sel.id] || 0} maxQtd={dados.cfg.maxQtd} aoFechar={() => setAberta(null)} aoComprar={comprar} aoAbrir={abrirCaixa} ocupado={ocupado} achar={achar} />}
      {abertura && <Abertura key={abertura.chave} caixa={abertura.caixa} qtd={abertura.qtd} origem={abertura.origem} maxQtd={dados.cfg.maxQtd} aoFechar={fecharAbertura} aoOutra={(n) => setAbertura({ caixa: abertura.caixa, qtd: n || 1, origem: 'auto', chave: Date.now() })} />}
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
