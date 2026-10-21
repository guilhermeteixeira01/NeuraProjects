// Página de uma caixa (dentro da loja, com o carrossel de drops em cima): roleta parada com os itens da caixa, quantidade, "Abrir por X NP",
// os modos (Jester = chances iguais, Boost = itens melhores mais prováveis, Lightning = animação rápida), o som e o conteúdo da caixa.
// Abrir roda a roleta ali mesmo (Abertura embutida). Chances, preços dos modos e valores por desgaste vêm do servidor (GET /loja/caixa).
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../comum/i18n.js'
import { lerDetalhesCaixa } from '../../comum/loja.js'
import { RARIDADES } from '../../../worker/steam-login/src/loja-core.js'
import Abertura, { CartaoItem, dadosDoItem } from './Abertura.jsx'
import { definirPreferencia, preferenciaAtual } from './somLoja.js'

const numero = (n) => Number(n).toLocaleString('pt-BR')
const pct = (n) => `${n >= 1 ? n.toFixed(2).replace(/\.?0+$/, '') : n >= 0.01 ? n.toFixed(3).replace(/0+$/, '') : n.toFixed(4).replace(/0+$/, '')}%`
const SIGLA = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' }

// ── caixas favoritas (coração): ficam neste navegador ──
const CHAVE_FAV = 'np_caixas_fav'
const lerFav = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_FAV) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
export function useFavoritas() {
  const [fav, setFav] = useState([])
  useEffect(() => {
    setFav(lerFav())
    const ouvir = () => setFav(lerFav())
    window.addEventListener('np-caixas-fav', ouvir)
    return () => window.removeEventListener('np-caixas-fav', ouvir)
  }, [])
  const alternar = (slug) => {
    const nova = fav.includes(slug) ? fav.filter((s) => s !== slug) : [...fav, slug]
    try {
      localStorage.setItem(CHAVE_FAV, JSON.stringify(nova))
    } catch {
      // sem armazenamento: vale só até recarregar
    }
    setFav(nova)
    window.dispatchEvent(new Event('np-caixas-fav'))
  }
  return { fav, alternar }
}

// Lightning fica lembrado neste navegador
const lerRapida = () => {
  try {
    return localStorage.getItem('np_loja_rapida') === '1'
  } catch {
    return false
  }
}

// ── botão hexagonal com a dica em cima (Jester, Boost, Lightning, som) ──
function Hex({ ativo, cor, titulo, dica, aoClicar, children, rotulo }) {
  return (
    <span className="lj-hex-caixa">
      <button type="button" className={`lj-hex${ativo ? ' is-ativo' : ''}`} onClick={aoClicar} aria-pressed={ativo} aria-label={rotulo || titulo}>
        <span>{children}</span>
      </button>
      {titulo && (
        <span className="lj-hex-dica" role="tooltip">
          <b style={{ color: cor }}>{titulo}</b>
          {dica}
        </span>
      )}
    </span>
  )
}

const Icone = ({ d, preenchido }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={preenchido ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={preenchido ? 0 : 2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONES = {
  jester: 'M3 8l3.5 9h11L21 8l-4.5 3.5L12 5l-4.5 6.5L3 8Zm3.5 11h11v2h-11z',
  boost: 'M6 13l6-6 6 6M6 19l6-6 6 6',
  raio: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  som: 'M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5Zm2.5 0a7 7 0 0 0-4.5-6.5',
  mudo: 'M4 9v6h4l5 4V5L8 9H4Zm12 .5 5 5m0-5-5 5',
}

// ── roleta parada (antes de abrir): uma amostra dos itens da caixa, com o marcador no meio ──
function RoletaParada({ c, achar }) {
  const amostra = useMemo(() => {
    const lista = []
    const pesos = c.itens.map((it) => Math.max(1, (RARIDADES.length - it.r) * 3))
    const total = pesos.reduce((a, b) => a + b, 0)
    for (let k = 0; k < 11; k++) {
      if (c.facas.length && k === 7) {
        lista.push({ r: 5 })
        continue
      }
      let x = Math.random() * total
      let i = 0
      while (x > pesos[i] && i < pesos.length - 1) x -= pesos[i++]
      lista.push({ r: c.itens[i].r, it: c.itens[i] })
    }
    return lista
  }, [c])
  return (
    <div className="lj-roleta lj-roleta-parada">
      <div className="lj-trilho">
        {amostra.map((x, k) => (x.r === 5 && !x.it ? <CartaoItem key={k} r={5} achar={achar} /> : <CartaoItem key={k} r={x.r} d={x.it.d} p={x.it.p} tipo={x.it.t} n={x.it.n} i={x.it.i} achar={achar} />))}
      </div>
      <i className="lj-marcador" aria-hidden="true" />
    </div>
  )
}

// ── um item do "Conteúdo da caixa": chance no canto; o "i" mostra preço e chance de cada desgaste ──
function ItemConteudo({ r, base, chance, desgastes, achar }) {
  const t = useT()
  const [info, setInfo] = useState(false)
  const x = dadosDoItem(base.t || (r === 5 ? 'faca' : 'arma'), base.d, base.p, base.n, base.i, achar)
  const cor = RARIDADES[r].cor
  const nome = x.enfeite ? x.nome : `${x.nome}${x.skin ? ` | ${x.skin}` : ''}`
  return (
    <li className={`lj-cx-item${info ? ' is-info' : ''}`} style={{ '--cor': cor }}>
      <button type="button" className="lj-cx-i" onClick={() => setInfo((v) => !v)} aria-expanded={info} aria-label={t('Preço e chance por desgaste')}>
        i
      </button>
      <span className="lj-cx-chance">{pct(chance)}</span>
      <svg className="lj-cx-hex" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="50,6 89,28 89,72 50,94 11,72 11,28" />
        <polygon points="50,20 77,35 77,65 50,80 23,65 23,35" />
      </svg>
      <span className="lj-cx-arte">{x.img ? <img src={x.img} alt="" loading="lazy" draggable="false" /> : null}</span>
      <b className="lj-cx-nome">{nome}</b>
      {info && (
        <div className="lj-cx-info" onClick={() => setInfo(false)}>
          <table>
            <thead>
              <tr>
                <th />
                <th>{t('Preço')}</th>
                <th>{t('Chance')}</th>
              </tr>
            </thead>
            <tbody>
              {(desgastes || []).map((d, k) => (
                <tr key={k}>
                  <td>{d.nome ? SIGLA[d.nome] || d.nome : '—'}</td>
                  <td className="lj-cx-preco">{numero(d.v)} NP</td>
                  <td>{pct(chance * d.p)}</td>
                </tr>
              ))}
              {!desgastes && (
                <tr>
                  <td colSpan="3">{t('Carregando…')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}

export default function PaginaCaixa({ c, saldo, tem, maxQtd, ocupado, achar, favorita, aoFavoritar, aoVoltar, aoComprar, aoAbriu }) {
  const t = useT()
  const [qtd, setQtd] = useState(1)
  const [modo, setModo] = useState(null) // null | 'jester' | 'boost'
  const [rapida, setRapida] = useState(false)
  const [somLigado, setSomLigado] = useState(true)
  const [det, setDet] = useState(null) // GET /loja/caixa
  const [abrindo, setAbrindo] = useState(null) // { qtd, origem, chave }

  useEffect(() => {
    setRapida(lerRapida())
    setSomLigado(!preferenciaAtual().mudo)
  }, [])
  useEffect(() => {
    let vivo = true
    setDet(null)
    lerDetalhesCaixa(c.id).then((d) => vivo && setDet(d), () => {})
    return () => {
      vivo = false
    }
  }, [c.id])

  const preco = modo ? det?.modos?.[modo]?.preco ?? null : c.preco
  const chances = modo ? det?.modos?.[modo]?.chances ?? c.chances : c.chances
  const custo = preco == null ? null : preco * qtd
  const falta = custo != null && saldo != null && custo > saldo

  const conteudo = useMemo(() => {
    const l = c.itens.map((it, i) => ({ chave: `i${i}`, r: it.r, base: it, chance: chances.itens[i], desgastes: det?.itens?.[i] }))
    c.facas.forEach((f, i) => l.push({ chave: `f${i}`, r: 5, base: { ...f, t: f.t || 'faca' }, chance: chances.facas[i], desgastes: det?.facas?.[i] }))
    return l.sort((a, b) => b.r - a.r || a.chance - b.chance)
  }, [c, chances, det])

  const alternarModo = (m) => setModo((x) => (x === m ? null : m))
  const alternarRapida = () => {
    setRapida((v) => {
      try {
        localStorage.setItem('np_loja_rapida', v ? '0' : '1')
      } catch {
        // só nesta visita
      }
      return !v
    })
  }
  const alternarSom = () => {
    definirPreferencia({ mudo: somLigado })
    setSomLigado(!somLigado)
  }
  const abrir = (q, origem) => setAbrindo({ qtd: q, origem, chave: Date.now() })

  return (
    <section className="lj-cx" style={{ '--cor': c.cor }} aria-label={c.nome}>
      <header className="lj-cx-topo">
        <button type="button" className="lj-cx-voltar" onClick={aoVoltar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t('Voltar às caixas')}
        </button>
        <div className="lj-cx-titulo">
          <h1>
            <button type="button" className={`lj-cx-fav${favorita ? ' is-ativo' : ''}`} onClick={aoFavoritar} aria-pressed={favorita} aria-label={favorita ? t('Tirar das favoritas') : t('Marcar como favorita')} title={favorita ? t('Tirar das favoritas') : t('Marcar como favorita')}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill={favorita ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9Z" />
              </svg>
            </button>
            {c.nome}
          </h1>
          <p className="lj-cx-preco-topo">{preco == null ? '…' : `${numero(preco)} NP`}</p>
        </div>
      </header>

      <div className="lj-cx-roleta">
        {abrindo ? (
          <Abertura
            key={abrindo.chave}
            embutida
            rapida={rapida}
            modo={modo || undefined}
            caixa={{ ...c, preco: preco ?? c.preco }}
            qtd={abrindo.qtd}
            origem={abrindo.origem}
            maxQtd={maxQtd}
            aoFechar={() => {
              setAbrindo(null)
              aoAbriu()
            }}
            aoOutra={(n) => abrir(n || 1, modo ? 'direto' : 'auto')}
          />
        ) : (
          <RoletaParada c={c} achar={achar} />
        )}
      </div>

      {!abrindo && (
        <div className="lj-cx-controles">
          <div className="lj-cx-qtd" role="group" aria-label={t('Quantidade')}>
            {Array.from({ length: maxQtd }, (_, k) => k + 1).map((n) => (
              <Hex key={n} ativo={qtd === n} aoClicar={() => setQtd(n)} rotulo={t('Abrir {n}', { n })}>
                <b>{n}</b>
              </Hex>
            ))}
          </div>

          <div className="lj-cx-abrir">
            <button type="button" className="lj-cx-btn-abrir" disabled={ocupado || preco == null || falta} onClick={() => abrir(qtd, 'direto')}>
              {preco == null ? t('Carregando…') : t('Abrir por {n} NP', { n: numero(custo) })}
            </button>
            {falta && <small className="lj-cx-falta">{t('Faltam {n} NP', { n: numero(custo - saldo) })}</small>}
            {!modo && (
              <span className="lj-cx-extras">
                {tem > 0 && (
                  <button type="button" className="lj-cx-link" disabled={ocupado} onClick={() => abrir(Math.min(qtd, tem), 'inventario')}>
                    {t('Abrir do inventário ({n})', { n: tem })}
                  </button>
                )}
                <button type="button" className="lj-cx-link" disabled={ocupado || falta} onClick={() => aoComprar(c, qtd)} title={t('Guarda a caixa fechada no seu inventário')}>
                  {t('Comprar e guardar')}
                </button>
              </span>
            )}
          </div>

          <div className="lj-cx-modos">
            <Hex ativo={modo === 'jester'} cor="#d58cff" titulo="Jester Mode" dica={t('Chances iguais para todos os itens ({n} NP)', { n: det ? numero(det.modos.jester.preco) : '…' })} aoClicar={() => alternarModo('jester')}>
              <Icone d={ICONES.jester} preenchido />
            </Hex>
            <Hex ativo={modo === 'boost'} cor="#ff6b5b" titulo="Boost Mode" dica={t('Chances aumentadas para itens melhores ({n} NP)', { n: det ? numero(det.modos.boost.preco) : '…' })} aoClicar={() => alternarModo('boost')}>
              <Icone d={ICONES.boost} />
            </Hex>
            <Hex ativo={rapida} cor="#f5c518" titulo="Lightning" dica={t('Acelere a animação de abertura da caixa')} aoClicar={alternarRapida}>
              <Icone d={ICONES.raio} preenchido />
            </Hex>
            <Hex ativo={somLigado} rotulo={somLigado ? t('Desligar o som') : t('Ligar o som')} aoClicar={alternarSom}>
              <Icone d={somLigado ? ICONES.som : ICONES.mudo} />
            </Hex>
          </div>
        </div>
      )}

      <h2 className="lj-cx-sub">{t('Conteúdo da caixa')}</h2>
      {modo && <p className="lj-cx-modo-aviso">{modo === 'jester' ? t('Jester Mode ligado: todos os itens com a mesma chance.') : t('Boost Mode ligado: chances maiores para os itens melhores.')}</p>}
      <ul className="lj-cx-grade">
        {conteudo.map((x) => (
          <ItemConteudo key={x.chave} r={x.r} base={x.base} chance={x.chance} desgastes={x.desgastes} achar={achar} />
        ))}
      </ul>
    </section>
  )
}
