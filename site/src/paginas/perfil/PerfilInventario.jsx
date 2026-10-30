// Topo do perfil do jogador (estilo "perfil de site de caixas"): cartão do jogador, caixa favorita, melhor queda e duas abas:
//  • STATUS      → o que já existia (desempenho recente, ranking, números, gráfico, armas e histórico), vem em `children`;
//  • INVENTÁRIO  → grade com os itens dele (cor da raridade, desgaste, preço em NP, adesivos, chaveiro e selo de padrão raro).
// Clicar num item abre o Inspecionar (3D). Dados públicos: GET /skins/inventario?id= e GET /loja/perfil?id=.
import { useEffect, useMemo, useState } from 'react'
import { lerApi, seForErroApi } from '../../comum/api.js'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import IconeUI from '../../comum/IconeUI.jsx'
import CartaoSkin from '../../comum/CartaoSkin.jsx'
import { InspecionarSkin, podeInspecionar } from '../../comum/InspecionarSkin.jsx'
import { useT } from '../../comum/i18n.js'
import { useConta } from '../../comum/conta.js'
import { BotaoTrocas } from '../../comum/Trocas.jsx'
import { lerCaixasPublicas } from '../../comum/loja.js'
import { corEnfeite, descrever, indicar, useCatalogo } from '../../comum/skins.js'
import { RARIDADES_CS, raridadeCsDaCor } from '../../../worker/steam-login/src/loja-core.js'
import { padraoRaro } from '../../../worker/steam-login/src/padroes.js'

const GUARDADOS = new Set(['adesivo', 'chaveiro', 'caixa'])
// Abas de itens (as mesmas do inventário do jogador) e ordenação
const ABAS_ITENS = ['tudo', 'arma', 'faca', 'luva']
const ORDENS = [
  ['valor', 'Mais caro'],
  ['raridade', 'Raridade'],
  ['recente', 'Mais recentes'],
  ['nome', 'Nome'],
]
const numero = (n) => Number(n).toLocaleString('pt-BR')
const abaInicial = () => {
  try {
    return location.hash === '#inventario' ? 'inventario' : 'status'
  } catch {
    return 'status'
  }
}

export default function PerfilInventario({ steamId, nome, resumoStatus, children, abaPerfil, aoTrocarAba, somenteInventario = false }) {
  const conta = useConta()
  const t = useT()
  const [topoLocal, setTopoLocal] = useState(abaInicial)
  const topo = abaPerfil ?? topoLocal
  const setTopo = aoTrocarAba ?? setTopoLocal
  const [inv, setInv] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [erro, setErro] = useState(false)
  const [aba, setAba] = useState('tudo')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('valor')
  const [rar, setRar] = useState('todas') // filtro de raridade (0..6 como no jogo)
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
    lerApi(`/skins/inventario?id=${encodeURIComponent(steamId)}`).then((d) => vivo && setInv(d), seForErroApi(() => vivo && setErro(true)))
    lerApi(`/loja/perfil?id=${encodeURIComponent(steamId)}`).then((d) => vivo && setResumo(d), seForErroApi())
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
  const rarDe = (it) => (it.t === 'faca' || it.t === 'luva' ? 6 : raridadeCsDaCor(descrever(it, idx).cor))
  // todos os itens de arma, do mais valioso para o mais barato
  const todosItens = useMemo(() => todos.filter((i) => !GUARDADOS.has(i.t) && i.t !== 'agente').sort((a, b) => valorDe(b) - valorDe(a)), [todos, inv]) // eslint-disable-line react-hooks/exhaustive-deps
  const q = busca.trim().toLowerCase()
  const daAba = useMemo(() => todosItens.filter((i) => aba === 'tudo' || i.t === aba), [todosItens, aba])
  const contagemRar = useMemo(() => {
    const c = Array(7).fill(0)
    for (const i of daAba) c[rarDe(i)]++
    return c
  }, [daAba, idx]) // eslint-disable-line react-hooks/exhaustive-deps
  const itens = useMemo(() => {
    const nome = (i) => descrever(i, idx).titulo || ''
    const lista = daAba.filter((i) => (rar === 'todas' || rarDe(i) === rar) && (!q || `${descrever(i, idx).titulo} ${descrever(i, idx).subtitulo} ${i.n || ''}`.toLowerCase().includes(q)))
    return lista.sort((a, b) => {
      if (ordem === 'raridade') return rarDe(b) - rarDe(a) || valorDe(b) - valorDe(a)
      if (ordem === 'recente') return (inv?.criado?.[b.__id] || 0) - (inv?.criado?.[a.__id] || 0)
      if (ordem === 'nome') return nome(a).localeCompare(nome(b))
      return valorDe(b) - valorDe(a) || nome(a).localeCompare(nome(b))
    })
  }, [daAba, rar, q, ordem, idx]) // eslint-disable-line react-hooks/exhaustive-deps
  const guardados = (tipo) => {
    const g = new Map()
    // id: uma das unidades (o valor de adesivo/chaveiro vem por item do worker; todas as unidades valem o mesmo)
    for (const i of todos) if (i.t === tipo) g.set(i.d, { n: (g.get(i.d)?.n || 0) + 1, id: g.get(i.d)?.id || i.__id })
    return [...g.entries()].map(([d, x]) => ({ d, n: x.n, id: x.id }))
  }
  const listaAdesivos = useMemo(() => guardados('adesivo'), [todos]) // eslint-disable-line react-hooks/exhaustive-deps
  const listaChaveiros = useMemo(() => guardados('chaveiro'), [todos]) // eslint-disable-line react-hooks/exhaustive-deps
  // raridade e contagem por raridade dos adesivos/chaveiros da aba aberta
  const rarEnf = (d) => raridadeCsDaCor(corEnfeite(aba === 'adesivos' ? 'adesivo' : 'chaveiro', (aba === 'adesivos' ? mapaAd : mapaCh).get(d)))
  const contagemEnf = useMemo(() => {
    const c = Array(7).fill(0)
    if (aba === 'adesivos' || aba === 'chaveiros') for (const g of aba === 'adesivos' ? listaAdesivos : listaChaveiros) c[rarEnf(g.d)] += 1
    return c
  }, [aba, listaAdesivos, listaChaveiros, mapaAd, mapaCh]) // eslint-disable-line react-hooks/exhaustive-deps
  const caixas = useMemo(() => guardados('caixa'), [todos]) // eslint-disable-line react-hooks/exhaustive-deps
  const valorTotal = useMemo(() => todosItens.reduce((a, i) => a + valorDe(i), 0), [todosItens, inv]) // eslint-disable-line react-hooks/exhaustive-deps
  const raros = useMemo(() => todosItens.filter((i) => padraoRaro(i)).length, [todosItens])

  const contaTipo = (tipo) => todosItens.filter((i) => tipo === 'tudo' || i.t === tipo).length
  const subs = [
    ['tudo', 'TUDO', contaTipo('tudo')],
    ['arma', 'ARMAS', contaTipo('arma')],
    ['faca', 'FACAS', contaTipo('faca')],
    ['luva', 'LUVAS', contaTipo('luva')],
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
      {!somenteInventario && <section className="pf-inv fx-entra" style={{ '--e': 1 }} aria-label={t('Perfil')}>
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

        {abaPerfil === undefined && <nav className="pf-inv-abas" role="tablist">
          <button type="button" role="tab" aria-selected={topo === 'status'} className={topo === 'status' ? 'is-ativo' : ''} onClick={() => trocar('status')}>
            {t('STATUS')}
          </button>
          <button type="button" role="tab" data-aba="inventario" aria-selected={topo === 'inventario'} className={topo === 'inventario' ? 'is-ativo' : ''} onClick={() => trocar('inventario')}>
            {t('INVENTÁRIO')} <small>{inv ? todos.length : '…'}</small>
          </button>
          {/* perfil de outro jogador (logado): propor troca direto daqui */}
          {conta && conta.id !== steamId && (
            <span className="pf-inv-troca">
              <BotaoTrocas para={{ id: steamId, nome }} classe="inv-btn inv-btn-p" />
            </span>
          )}
        </nav>}
        {abaPerfil !== undefined && conta && conta.id !== steamId && (
          <div className="pf-inv-troca"><BotaoTrocas para={{ id: steamId, nome }} classe="inv-btn inv-btn-p" /></div>
        )}
      </section>}

      {topo === 'status' ? (
        children
      ) : (
        <section className="pf-inv" aria-label={t('Inventário')}>
          {somenteInventario && <header className="pf-inventario-cabecalho"><div><h2>{t('Inventário')}</h2><p>{inv ? t('{n} itens', { n: numero(todos.length) }) : '…'}</p></div>{conta && conta.id !== steamId && <BotaoTrocas para={{ id: steamId, nome }} classe="inv-btn inv-btn-p" />}</header>}
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
                  setRar('todas')
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
          ) : ABAS_ITENS.includes(aba) ? (
            <>
              <div className="pf-inv-barra">
                <label className="pf-inv-busca">
                  <IconeUI tipo="busca" tamanho={16} />
                  <input type="search" placeholder={t('Pesquisar no inventário')} value={busca} onChange={(e) => setBusca(e.target.value)} />
                </label>
                <span className="pf-inv-total">{t('{n} itens', { n: numero(itens.length) })}</span>
                <select className="pf-inv-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label={t('Ordenar')}>
                  {ORDENS.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {t(nome)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="inv-rar pf-inv-rar" role="group" aria-label={t('Filtrar por raridade')}>
                <button type="button" className={rar === 'todas' ? 'is-ativo' : ''} onClick={() => setRar('todas')}>
                  {t('Todas')}
                </button>
                {[...RARIDADES_CS].reverse().map((r) =>
                  contagemRar[r.id] ? (
                    <button key={r.id} type="button" className={rar === r.id ? 'is-ativo' : ''} style={{ '--cor': r.cor }} onClick={() => setRar(rar === r.id ? 'todas' : r.id)}>
                      <i /> {r.curto} <em>{contagemRar[r.id]}</em>
                    </button>
                  ) : null,
                )}
              </div>
            {!itens.length ? (
              <p className="pf-inv-vazio">{t('Nada por aqui.')}</p>
            ) : (
              <>
                <ul className="inv-itens pf-inv-cartoes">
                  {itens.map((it) => (
                    <CartaoSkin key={it.__id} item={it} idx={idx} adesivos={mapaAd} chaveiros={mapaCh} valor={valorDe(it)} aoAbrirMenu={() => podeInspecionar(it) && setInspecionando(it)} />
                  ))}
                </ul>
              </>
            )}
            </>
          ) : (
            <>
            {aba !== 'caixas' && contagemEnf.some(Boolean) && (
              <div className="inv-rar pf-inv-rar" role="group" aria-label={t('Filtrar por raridade')}>
                <button type="button" className={rar === 'todas' ? 'is-ativo' : ''} onClick={() => setRar('todas')}>
                  {t('Todas')}
                </button>
                {[...RARIDADES_CS].reverse().map((r) =>
                  contagemEnf[r.id] ? (
                    <button key={r.id} type="button" className={rar === r.id ? 'is-ativo' : ''} style={{ '--cor': r.cor }} onClick={() => setRar(rar === r.id ? 'todas' : r.id)}>
                      <i /> {r.curto} <em>{contagemEnf[r.id]}</em>
                    </button>
                  ) : null,
                )}
              </div>
            )}
            <ul className="inv-itens pf-inv-cartoes">
              {[...(aba === 'adesivos' ? listaAdesivos : aba === 'chaveiros' ? listaChaveiros : caixas)]
                .filter((g) => aba === 'caixas' || rar === 'todas' || rarEnf(g.d) === rar)
                .sort((a, b) => aba === 'caixas' ? 0 : rarEnf(b.d) - rarEnf(a.d))
                .map((g) => {
                // valor de uma unidade: a caixa vale o preço dela na loja; adesivo/chaveiro, o valor de mercado que o worker manda
                const qtd = g.n > 1 && <span className="pf-inv-qtd">×{g.n}</span>
                if (aba !== 'caixas') {
                  const item = { t: aba === 'adesivos' ? 'adesivo' : 'chaveiro', d: g.d, p: 0, __id: g.id }
                  return <CartaoSkin key={`${aba}${g.d}`} item={item} idx={idx} adesivos={mapaAd} chaveiros={mapaCh} valor={inv?.valores?.[g.id]} aoAbrirMenu={() => setInspecionando(item)} extra={qtd} />
                }
                const cx = caixasLoja.find((c) => c.id === g.d)
                return (
                  <li key={`caixa${g.d}`}>
                    <div className="inv-cartao inv-cartao-fixo" style={{ '--cor': cx?.cor || '#6b6f76' }}>
                      <span className="inv-cartao-arte">
                        <span className="inv-arma-box">{cx?.img ? <img className="inv-arma-img" src={cx.img} alt="" loading="lazy" draggable="false" /> : <span className="inv-sem-img inv-arma-img" aria-hidden="true" />}</span>
                      </span>
                      <span className="inv-cartao-nome">
                        <b>{cx ? cx.nome : `#${g.d}`}</b>
                        <small>{t('Caixa fechada')}</small>
                        {cx?.preco != null && (
                          <span className="inv-cartao-valor">
                            <img src="/assets/logos/logo-np-64.png" alt="" width="14" height="14" />
                            {numero(cx.preco)} NP
                          </span>
                        )}
                      </span>
                    </div>
                    {qtd}
                  </li>
                )
              })}
              {!(aba === 'adesivos' ? listaAdesivos : aba === 'chaveiros' ? listaChaveiros : caixas).length && <li className="pf-inv-vazio">{t('Nada por aqui.')}</li>}
            </ul>
            </>
          )}
        </section>
      )}
      {inspecionando && <InspecionarSkin item={inspecionando} aoFechar={() => setInspecionando(null)} />}
    </div>
  )
}
