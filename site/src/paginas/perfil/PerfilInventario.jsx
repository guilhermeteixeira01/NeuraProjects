// Topo do perfil do jogador (estilo "perfil de site de caixas"): cartão do jogador, caixa favorita, melhor queda e duas abas:
//  • STATUS      → o que já existia (desempenho recente, ranking, números, gráfico, armas e histórico), vem em `children`;
//  • INVENTÁRIO  → grade com os itens dele (cor da raridade, desgaste, preço em NP, adesivos, chaveiro e selo de padrão raro).
// Clicar num item abre o Inspecionar (3D). Dados públicos: GET /skins/inventario?id= e GET /loja/perfil?id=.
import { useEffect, useMemo, useState } from 'react'
import { CONFIG } from '../../comum/config.js'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { SeloPadrao, nomeDoDesgaste } from '../../comum/CartaoSkin.jsx'
import { InspecionarSkin, podeInspecionar } from '../../comum/InspecionarSkin.jsx'
import { useT } from '../../comum/i18n.js'
import { lerCaixasPublicas } from '../../comum/loja.js'
import { descrever, indicar, urlImg, useCatalogo } from '../../comum/skins.js'
import { padraoRaro } from '../../../worker/steam-login/src/loja-core.js'

const GUARDADOS = new Set(['adesivo', 'chaveiro', 'caixa'])
const base = () => CONFIG.loginSteam.replace(/\/$/, '')
const numero = (n) => Number(n).toLocaleString('pt-BR')
// FN / MW / FT / WW / BS
const sigla = (f) => (f < 0.07 ? 'FN' : f < 0.15 ? 'MW' : f < 0.38 ? 'FT' : f < 0.45 ? 'WW' : 'BS')
const lerJson = (rota) => fetch(`${base()}${rota}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
const abaInicial = () => {
  try {
    return location.hash === '#inventario' ? 'inventario' : 'status'
  } catch {
    return 'status'
  }
}

export default function PerfilInventario({ steamId, nome, resumoStatus, children }) {
  const t = useT()
  const [topo, setTopo] = useState(abaInicial) // 'status' | 'inventario'
  const [inv, setInv] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [erro, setErro] = useState(false)
  const [aba, setAba] = useState('itens')
  const [inspecionando, setInspecionando] = useState(null)
  const [caixasLoja, setCaixasLoja] = useState([])
  const armas = useCatalogo('armas')
  const adesivos = useCatalogo('adesivos', true)
  const chaveiros = useCatalogo('chaveiros', true)

  useEffect(() => {
    let vivo = true
    setInv(null)
    setResumo(null)
    setErro(false)
    lerJson(`/skins/inventario?id=${encodeURIComponent(steamId)}`).then((d) => vivo && setInv(d), () => vivo && setErro(true))
    lerJson(`/loja/perfil?id=${encodeURIComponent(steamId)}`).then((d) => vivo && setResumo(d), () => {})
    lerCaixasPublicas().then((c) => vivo && setCaixasLoja(c))
    return () => {
      vivo = false
    }
  }, [steamId])

  // o botão "Ver inventário" da coluna da esquerda troca para a aba INVENTÁRIO e leva até ela
  useEffect(() => {
    const ouvir = (e) => {
      setTopo(e.detail === 'inventario' ? 'inventario' : 'status')
      setTimeout(() => document.querySelector('.pf-inv-abas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
    window.addEventListener('np-perfil-aba', ouvir)
    return () => window.removeEventListener('np-perfil-aba', ouvir)
  }, [])

  const idx = useMemo(() => indicar(armas.dados?.armas, []), [armas.dados])
  const mapaAd = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const mapaCh = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])

  const todos = useMemo(() => Object.entries(inv?.itens || {}).map(([id, it]) => ({ ...it, __id: id })), [inv])
  const valorDe = (it) => inv?.valores?.[it.__id] ?? 0
  const itens = useMemo(() => todos.filter((i) => !GUARDADOS.has(i.t) && i.t !== 'agente').sort((a, b) => valorDe(b) - valorDe(a)), [todos, inv]) // eslint-disable-line react-hooks/exhaustive-deps
  const guardados = (tipo) => {
    const g = new Map()
    for (const i of todos) if (i.t === tipo) g.set(i.d, (g.get(i.d) || 0) + 1)
    return [...g.entries()].map(([d, n]) => ({ d, n }))
  }
  const listaAdesivos = useMemo(() => guardados('adesivo'), [todos]) // eslint-disable-line react-hooks/exhaustive-deps
  const listaChaveiros = useMemo(() => guardados('chaveiro'), [todos]) // eslint-disable-line react-hooks/exhaustive-deps
  const caixas = useMemo(() => guardados('caixa'), [todos]) // eslint-disable-line react-hooks/exhaustive-deps
  const valorTotal = useMemo(() => itens.reduce((a, i) => a + valorDe(i), 0), [itens, inv]) // eslint-disable-line react-hooks/exhaustive-deps
  const raros = useMemo(() => itens.filter((i) => padraoRaro(i)).length, [itens])

  const subs = [
    ['itens', 'ITENS', itens.length],
    ['adesivos', 'ADESIVOS', listaAdesivos.reduce((a, g) => a + g.n, 0)],
    ['chaveiros', 'CHAVEIROS', listaChaveiros.reduce((a, g) => a + g.n, 0)],
    ['caixas', 'CAIXAS', caixas.reduce((a, g) => a + g.n, 0)],
  ]

  const fav = resumo?.favorita
  const melhor = resumo?.melhor
  const dMelhor = melhor ? descrever({ t: melhor.t, d: melhor.d, p: melhor.p, f: melhor.f }, idx) : null

  const trocar = (id) => {
    setTopo(id)
    try {
      history.replaceState(null, '', id === 'inventario' ? '#inventario' : location.pathname + location.search)
    } catch {
      // sem histórico: só troca a aba
    }
  }

  return (
    <div className="pf-topo-perfil">
      <section className="pf-inv fx-entra" style={{ '--e': 1 }} aria-label={t('Perfil')}>
        <div className="pf-inv-topo">
          <div className="pf-inv-quem">
            {topo === 'status' ? (
              <>
                <span className="pf-inv-rot">{t('JOGADOR')}</span>
                <b>{nome}</b>
                {resumoStatus}
              </>
            ) : (
              <>
                <span className="pf-inv-rot">{t('INVENTÁRIO')}</span>
                <b>{nome}</b>
                <small>{inv ? t('{n} itens', { n: numero(todos.length) }) : '…'}</small>
                {inv && (
                  <div className="pf-resumo-chips">
                    <div className="pf-resumo-chip">
                      <span className="pf-info-rot">{t('VALOR TOTAL')}</span>
                      <span className="pf-info-val pf-inv-valor">{numero(valorTotal)} NP</span>
                    </div>
                    <div className="pf-resumo-chip">
                      <span className="pf-info-rot">{t('PADRÕES RAROS')}</span>
                      <span className="pf-info-val">{raros}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="pf-inv-card pf-inv-fav">
            <div className="pf-inv-card-txt">
              <span className="pf-inv-rot">{t('CAIXA FAVORITA')}</span>
              {fav ? (
                <>
                  <b>{fav.nome}</b>
                  <small>{t('Aberta {n} vezes', { n: numero(fav.vezes) })}</small>
                  <a className="pf-inv-abrir" href={`/loja/?caixa=${encodeURIComponent(fav.slug)}`}>
                    {t('ABRIR')}
                  </a>
                </>
              ) : (
                <small>{resumo ? t('Ainda não abriu caixas') : '…'}</small>
              )}
            </div>
            {fav && <img src={fav.img} alt="" loading="lazy" draggable="false" />}
          </div>
          <div className="pf-inv-card pf-inv-melhor" style={{ '--cor': dMelhor?.cor || '#6b6f76' }}>
            <div className="pf-inv-card-txt">
              <span className="pf-inv-rot">{t('MELHOR QUEDA')}</span>
              {melhor && dMelhor ? (
                <>
                  <small>{dMelhor.titulo}</small>
                  <b>{dMelhor.subtitulo}</b>
                  <span className="pf-inv-preco">{numero(melhor.v)} NP</span>
                </>
              ) : (
                <small>{resumo ? t('Ainda sem quedas') : '…'}</small>
              )}
            </div>
            {melhor && dMelhor?.img && <img src={dMelhor.img} alt="" loading="lazy" draggable="false" />}
          </div>
        </div>

        <nav className="pf-inv-abas" role="tablist">
          <button type="button" role="tab" aria-selected={topo === 'status'} className={topo === 'status' ? 'is-ativo' : ''} onClick={() => trocar('status')}>
            {t('STATUS')}
          </button>
          <button type="button" role="tab" aria-selected={topo === 'inventario'} className={topo === 'inventario' ? 'is-ativo' : ''} onClick={() => trocar('inventario')}>
            {t('INVENTÁRIO')} <small>{inv ? todos.length : '…'}</small>
          </button>
        </nav>
      </section>

      {topo === 'status' ? (
        children
      ) : (
        <section className="pf-inv" aria-label={t('Inventário')}>
          <nav className="pf-inv-sub" role="tablist">
            {subs.map(([id, rotulo, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                className={aba === id ? 'is-ativo' : ''}
                onClick={() => {
                  setAba(id)
                }}
              >
                {t(rotulo)} <small>{n}</small>
              </button>
            ))}
          </nav>

          {erro ? (
            <p className="pf-inv-vazio">{t('Não consegui carregar o inventário agora.')}</p>
          ) : !inv || !armas.dados ? (
            <CarregandoNP pequeno />
          ) : aba === 'itens' ? (
            !itens.length ? (
              <p className="pf-inv-vazio">{t('Nada por aqui.')}</p>
            ) : (
              <>
                <ul className="pf-inv-grade">
                  {itens.map((it) => {
                    const d = descrever(it, idx)
                    const valor = valorDe(it)
                    const f = Number(it.f)
                    const arma = it.t === 'arma'
                    const adesivosColados = arma ? (it.a || []).filter((s) => s?.i) : []
                    const charm = arma && it.k?.i > 0 ? mapaCh.get(it.k.i) : null
                    return (
                      <li key={it.__id}>
                        <button type="button" className="pf-inv-item" style={{ '--cor': d.cor || '#6b6f76' }} onClick={() => podeInspecionar(it) && setInspecionando(it)} title={t('Inspecionar')}>
                          <span className="pf-inv-item-arte">{d.img ? <img src={d.img} alt="" loading="lazy" draggable="false" /> : null}</span>
                          <span className="pf-inv-item-preco">{numero(valor)} NP</span>
                          {it.st ? <span className="pf-inv-item-st">StatTrak™</span> : null}
                          <SeloPadrao item={it} />
                          {(adesivosColados.length > 0 || charm) && (
                            <span className="pf-inv-enf">
                              {charm && <img className="pf-inv-enf-ch" src={urlImg(charm[2], 64)} alt="" loading="lazy" />}
                              {adesivosColados.map((s, k) => (
                                <img key={k} src={urlImg(mapaAd.get(s.i)?.[2], 64)} alt="" loading="lazy" />
                              ))}
                            </span>
                          )}
                          <span className="pf-inv-item-nome">
                            <small>{it.n ? `${d.titulo} «${it.n}»` : d.titulo}</small>
                            <b>
                              <em title={t(nomeDoDesgaste(f))}>({sigla(f)})</em> {d.subtitulo}
                            </b>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )
          ) : (
            <ul className="pf-inv-grade pf-inv-grade-pq">
              {(aba === 'adesivos' ? listaAdesivos : aba === 'chaveiros' ? listaChaveiros : caixas).map((g) => {
                const linha = aba === 'adesivos' ? mapaAd.get(g.d) : aba === 'chaveiros' ? mapaCh.get(g.d) : null
                const cx = aba === 'caixas' ? caixasLoja.find((c) => c.id === g.d) : null
                const nomeG = cx ? cx.nome : linha?.[1] || `#${g.d}`
                const cor = cx?.cor || linha?.[3] || '#6b6f76'
                const imgG = cx ? cx.img : linha ? urlImg(linha[2], 256) : ''
                return (
                  <li key={`${aba}${g.d}`}>
                    <div className="pf-inv-item pf-inv-item-fixo" style={{ '--cor': cor }}>
                      <span className="pf-inv-item-arte">{imgG ? <img src={imgG} alt="" loading="lazy" draggable="false" /> : null}</span>
                      <span className="pf-inv-item-preco">×{g.n}</span>
                      <span className="pf-inv-item-nome">
                        <small>{aba === 'adesivos' ? t('Adesivo') : aba === 'chaveiros' ? t('Chaveiro') : t('Caixa fechada')}</small>
                        <b>{nomeG}</b>
                      </span>
                    </div>
                  </li>
                )
              })}
              {!(aba === 'adesivos' ? listaAdesivos : aba === 'chaveiros' ? listaChaveiros : caixas).length && <li className="pf-inv-vazio">{t('Nada por aqui.')}</li>}
            </ul>
          )}
        </section>
      )}
      {inspecionando && <InspecionarSkin item={inspecionando} aoFechar={() => setInspecionando(null)} />}
    </div>
  )
}
