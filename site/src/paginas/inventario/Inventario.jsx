import { useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { CATEGORIAS, inventarioVazio, lerInventario, salvarInventario, urlImg, useCatalogo } from '../../comum/skins.js'
import { useT } from '../../comum/i18n.js'

// Inventário de skins: o jogador escolhe skins de armas, faca, luvas, agentes e adesivos; o plugin BaseComp aplica no servidor ao conectar.
// O catálogo vem de /assets/skins/*.json (ferramentas/skins/gerar-catalogo.mjs) e o inventário é salvo no worker (src/skins.js).

const LADOS = [
  ['ct', 'CT'],
  ['tr', 'TR'],
]
const ABAS = [
  ['armas', 'Armas'],
  ['facas', 'Facas'],
  ['luvas', 'Luvas'],
  ['agentes', 'Agentes'],
]

// ── peças pequenas ──
function Imagem({ src, alt = '', classe = '' }) {
  const [erro, setErro] = useState(false)
  return src && !erro ? <img className={classe} src={src} alt={alt} loading="lazy" onError={() => setErro(true)} /> : <span className={`inv-sem-img ${classe}`} aria-hidden="true" />
}

function Lados({ lado, aoMudar }) {
  return (
    <div className="inv-lados" role="tablist">
      {LADOS.map(([id, nome]) => (
        <button key={id} type="button" role="tab" aria-selected={lado === id} className={lado === id ? 'is-ativo' : ''} onClick={() => aoMudar(id)}>
          {nome}
        </button>
      ))}
    </div>
  )
}

// Grade de skins de uma arma (mais a opção "sem skin"/"padrão")
function GradeSkins({ skins, paint, aoEscolher, rotuloVazio }) {
  const t = useT()
  const [busca, setBusca] = useState('')
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? skins.filter((s) => s[1].toLowerCase().includes(q)) : skins
  }, [skins, busca])
  return (
    <div className="inv-grade-caixa">
      <input type="search" className="inv-busca" placeholder={t('Pesquisar skin')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <ul className="inv-grade">
        <li>
          <button type="button" className={`inv-skin inv-skin-vazio${!paint ? ' is-ativo' : ''}`} onClick={() => aoEscolher(null)}>
            <span className="inv-skin-img">
              <span className="inv-vazio-x">∅</span>
            </span>
            <b>{t(rotuloVazio)}</b>
          </button>
        </li>
        {lista.map((s) => (
          <li key={s[0]}>
            <button type="button" className={`inv-skin${paint === s[0] ? ' is-ativo' : ''}`} style={{ '--cor': s[2] || 'var(--border-2)' }} onClick={() => aoEscolher(s)} title={s[1]}>
              <span className="inv-skin-img">
                <Imagem src={urlImg(s[6])} />
              </span>
              <b>{s[1]}</b>
            </button>
          </li>
        ))}
        {!lista.length && <li className="inv-nada">{t('Nenhuma skin encontrada.')}</li>}
      </ul>
    </div>
  )
}

// Janela para escolher um adesivo (10 mil: filtra pelo nome e mostra os primeiros)
function SeletorAdesivo({ aoEscolher, aoFechar }) {
  const t = useT()
  const { dados, erro } = useCatalogo('adesivos')
  const [busca, setBusca] = useState('')
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  const lista = useMemo(() => {
    if (!dados) return []
    const q = busca.trim().toLowerCase()
    const achados = q ? dados.filter((s) => s[1].toLowerCase().includes(q)) : dados
    return achados.slice(0, 90)
  }, [dados, busca])
  return (
    <div className="lb-fundo" onClick={aoFechar}>
      <div className="lb-janela inv-janela" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="lb-janela-cab">
          <h2>{t('Escolher adesivo')}</h2>
          <button type="button" className="lb-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <input type="search" className="lb-busca" placeholder={t('Pesquisar adesivo (ex.: Katowice, holo, Navi)')} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
        <ul className="inv-adesivos">
          {lista.map((s) => (
            <li key={s[0]}>
              <button type="button" onClick={() => aoEscolher(s[0])} title={s[1]}>
                <Imagem src={urlImg(s[2], 128)} />
                <small>{s[1]}</small>
              </button>
            </li>
          ))}
          {erro && <li className="inv-nada">{t('Não consegui carregar os adesivos.')}</li>}
          {!dados && !erro && <li className="inv-nada">{t('Carregando…')}</li>}
          {dados && !lista.length && <li className="inv-nada">{t('Nenhum adesivo encontrado.')}</li>}
        </ul>
      </div>
    </div>
  )
}

// Ajustes da skin escolhida: desgaste (float), seed, StatTrak e adesivos
function Editor({ skin, valor, aoMudar, adesivos = false }) {
  const t = useT()
  const [escolhendo, setEscolhendo] = useState(-1)
  const [min, max] = [skin[3], skin[4]]
  const f = Math.min(max, Math.max(min, valor.f ?? min))
  const nomeDesgaste = f < 0.07 ? 'Factory New' : f < 0.15 ? 'Minimal Wear' : f < 0.38 ? 'Field-Tested' : f < 0.45 ? 'Well-Worn' : 'Battle-Scarred'
  const catalogoAdesivos = useCatalogo('adesivos', adesivos)
  const porId = useMemo(() => new Map((catalogoAdesivos.dados || []).map((s) => [s[0], s])), [catalogoAdesivos.dados])
  return (
    <div className="inv-editor">
      <div className="inv-editor-topo">
        <span className="inv-editor-img" style={{ '--cor': skin[2] || 'var(--border-2)' }}>
          <Imagem src={urlImg(skin[6], 360)} />
        </span>
        <div>
          <b>{skin[1]}</b>
          <small>{t(nomeDesgaste)}</small>
        </div>
      </div>

      <label className="inv-campo">
        <span>{t('Desgaste (float)')}</span>
        <input type="range" min={min} max={max} step="0.0001" value={f} onChange={(e) => aoMudar({ f: Number(e.target.value) })} />
        <input type="number" min={min} max={max} step="0.0001" value={f} onChange={(e) => aoMudar({ f: Math.min(max, Math.max(min, Number(e.target.value) || min)) })} />
      </label>
      <label className="inv-campo">
        <span>{t('Padrão (seed)')}</span>
        <input type="number" min="0" max="1000" step="1" value={valor.s ?? 0} onChange={(e) => aoMudar({ s: Math.min(1000, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })} />
      </label>
      {skin[5] === 1 && valor.st !== undefined && (
        <label className="inv-check">
          <input type="checkbox" checked={!!valor.st} onChange={(e) => aoMudar({ st: e.target.checked ? 1 : 0 })} />
          <span>StatTrak™</span>
        </label>
      )}

      {adesivos && (
        <div className="inv-adesivos-slots">
          <span>{t('Adesivos')}</span>
          <div>
            {[0, 1, 2, 3].map((i) => {
              const id = valor.a?.[i] || 0
              const s = porId.get(id)
              return (
                <span key={i} className="inv-slot">
                  <button type="button" onClick={() => setEscolhendo(i)} title={s ? s[1] : t('Adicionar adesivo')}>
                    {s ? <Imagem src={urlImg(s[2], 128)} /> : <span className="inv-mais">+</span>}
                  </button>
                  {id > 0 && (
                    <button type="button" className="inv-slot-x" aria-label={t('Tirar adesivo')} onClick={() => aoMudar({ a: (valor.a || [0, 0, 0, 0]).map((x, k) => (k === i ? 0 : x)) })}>
                      ×
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}
      {escolhendo >= 0 && (
        <SeletorAdesivo
          aoFechar={() => setEscolhendo(-1)}
          aoEscolher={(id) => {
            aoMudar({ a: [0, 1, 2, 3].map((k) => (k === escolhendo ? id : valor.a?.[k] || 0)) })
            setEscolhendo(-1)
          }}
        />
      )}
    </div>
  )
}

const novaSkin = (s, extra = {}) => ({ p: s[0], f: Math.max(s[3], 0.0001), s: 0, st: 0, a: [0, 0, 0, 0], l: s[7] ? 1 : 0, ...extra })

// ── Armas ──
function AbaArmas({ catalogo, inv, mudar }) {
  const t = useT()
  const armas = catalogo.filter((a) => CATEGORIAS.some(([c]) => c === a.c))
  const [categoria, setCategoria] = useState('rifles')
  const [def, setDef] = useState(7)
  const arma = armas.find((a) => a.d === def) || armas[0]
  const atual = inv.armas[arma.d]
  const skin = atual ? arma.s.find((s) => s[0] === atual.p) : null
  const escolher = (s) =>
    mudar((i) => {
      const armasNovas = { ...i.armas }
      if (!s) delete armasNovas[arma.d]
      else armasNovas[arma.d] = novaSkin(s, atual?.a ? { a: atual.a } : {})
      return { ...i, armas: armasNovas }
    })
  const ajustar = (parte) => mudar((i) => ({ ...i, armas: { ...i.armas, [arma.d]: { ...i.armas[arma.d], ...parte } } }))
  return (
    <div className="inv-layout">
      <aside className="inv-lista">
        <div className="inv-cats">
          {CATEGORIAS.map(([id, nome]) => (
            <button key={id} type="button" className={categoria === id ? 'is-ativo' : ''} onClick={() => setCategoria(id)}>
              {t(nome)}
            </button>
          ))}
        </div>
        <ul>
          {armas
            .filter((a) => a.c === categoria)
            .map((a) => (
              <li key={a.d}>
                <button type="button" className={`${a.d === arma.d ? 'is-ativo' : ''}${inv.armas[a.d] ? ' tem' : ''}`} onClick={() => setDef(a.d)}>
                  {a.n}
                </button>
              </li>
            ))}
        </ul>
      </aside>
      <section className="inv-centro">
        <h2>{arma.n}</h2>
        <GradeSkins skins={arma.s} paint={atual?.p} aoEscolher={escolher} rotuloVazio="Padrão do jogo" />
      </section>
      <aside className="inv-lateral">{skin ? <Editor skin={skin} valor={atual} aoMudar={ajustar} adesivos /> : <p className="inv-dica">{t('Escolha uma skin para ajustar desgaste, seed, StatTrak e adesivos.')}</p>}</aside>
    </div>
  )
}

// ── Facas e luvas (por lado) ──
function AbaPecas({ catalogo, inv, mudar, grupo, rotuloPadrao, comStatTrak }) {
  const t = useT()
  const pecas = catalogo.filter((a) => a.c === grupo)
  const [lado, setLado] = useState('ct')
  const atual = inv[grupo === 'facas' ? 'facas' : 'luvas'][lado]
  const chave = grupo === 'facas' ? 'facas' : 'luvas'
  const [def, setDef] = useState(null)
  const d = def ?? atual?.d ?? pecas[0]?.d
  const peca = pecas.find((a) => a.d === d) || pecas[0]
  const skin = atual && atual.d === peca.d ? peca.s.find((s) => s[0] === atual.p) : null
  const escolherTipo = (novo) => {
    setDef(novo)
    // trocar o tipo mantém a escolha do lado só se for o mesmo; senão o lado fica sem skin até escolher uma
  }
  const escolher = (s) =>
    mudar((i) => {
      const novo = { ...i[chave] }
      if (!s && grupo === 'luvas') delete novo[lado]
      else if (!s) novo[lado] = { d: peca.d, p: 0, f: 0.0001, s: 0, st: 0, l: 0 }
      else novo[lado] = { d: peca.d, p: s[0], f: Math.max(s[3], 0.0001), s: 0, st: 0, l: s[7] ? 1 : 0 }
      return { ...i, [chave]: novo }
    })
  const ajustar = (parte) => mudar((i) => ({ ...i, [chave]: { ...i[chave], [lado]: { ...i[chave][lado], ...parte } } }))
  return (
    <div className="inv-layout">
      <aside className="inv-lista">
        <Lados lado={lado} aoMudar={(l) => { setLado(l); setDef(null) }} />
        <ul>
          {pecas.map((a) => (
            <li key={a.d}>
              <button type="button" className={`${a.d === peca.d ? 'is-ativo' : ''}${atual?.d === a.d ? ' tem' : ''}`} onClick={() => escolherTipo(a.d)}>
                {a.n}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="inv-centro">
        <h2>
          {peca.n} <small>{lado === 'ct' ? 'CT' : 'TR'}</small>
        </h2>
        <GradeSkins skins={peca.s} paint={atual && atual.d === peca.d ? atual.p || undefined : undefined} aoEscolher={escolher} rotuloVazio={rotuloPadrao} />
      </section>
      <aside className="inv-lateral">
        {skin && atual?.p ? (
          <Editor skin={skin} valor={comStatTrak ? atual : { ...atual, st: undefined }} aoMudar={ajustar} />
        ) : (
          <p className="inv-dica">{atual?.d === peca.d && grupo === 'facas' ? t('Faca lisa (sem pintura) neste lado.') : t('Escolha uma skin para ajustar desgaste e seed.')}</p>
        )}
      </aside>
    </div>
  )
}

// ── Agentes ──
function AbaAgentes({ inv, mudar }) {
  const t = useT()
  const { dados, erro } = useCatalogo('agentes')
  const [lado, setLado] = useState('ct')
  const [busca, setBusca] = useState('')
  const lista = (dados || []).filter((a) => a.t === lado && a.n.toLowerCase().includes(busca.trim().toLowerCase()))
  const atual = inv.agentes[lado]?.d
  const escolher = (a) =>
    mudar((i) => {
      const novo = { ...i.agentes }
      if (!a) delete novo[lado]
      else novo[lado] = { d: a.d, m: a.m }
      return { ...i, agentes: novo }
    })
  if (erro) return <p className="inv-dica">{t('Não consegui carregar os agentes.')}</p>
  return (
    <div className="inv-layout inv-layout-2">
      <aside className="inv-lista">
        <Lados lado={lado} aoMudar={setLado} />
      </aside>
      <section className="inv-centro">
        <input type="search" className="inv-busca" placeholder={t('Pesquisar agente')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="inv-grade inv-grade-agentes">
          <li>
            <button type="button" className={`inv-skin inv-skin-vazio${!atual ? ' is-ativo' : ''}`} onClick={() => escolher(null)}>
              <span className="inv-skin-img">
                <span className="inv-vazio-x">∅</span>
              </span>
              <b>{t('Agente padrão')}</b>
            </button>
          </li>
          {lista.map((a) => (
            <li key={a.d}>
              <button type="button" className={`inv-skin${atual === a.d ? ' is-ativo' : ''}`} style={{ '--cor': a.c || 'var(--border-2)' }} onClick={() => escolher(a)} title={a.n}>
                <span className="inv-skin-img">
                  <Imagem src={urlImg(a.i, 360)} />
                </span>
                <b>{a.n}</b>
              </button>
            </li>
          ))}
          {!dados && <li className="inv-nada">{t('Carregando…')}</li>}
        </ul>
      </section>
    </div>
  )
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const [inv, setInv] = useState(null)
  const [salvo, setSalvo] = useState('')
  const [aba, setAba] = useState('armas')
  const [estado, setEstado] = useState('') // '' | 'salvando' | 'salvo' | 'erro'
  const [erroCarga, setErroCarga] = useState(false)
  const catalogo = useCatalogo('armas')

  useEffect(() => {
    if (!conta?.id) return
    let vivo = true
    lerInventario().then(
      (d) => {
        if (!vivo) return
        const base = { ...inventarioVazio(), ...d }
        setInv(base)
        setSalvo(JSON.stringify(base))
      },
      () => vivo && setErroCarga(true),
    )
    return () => {
      vivo = false
    }
  }, [conta?.id])

  const sujo = inv && JSON.stringify(inv) !== salvo
  // aviso do navegador se sair com alteração não salva
  useEffect(() => {
    if (!sujo) return
    const aviso = (e) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sujo])

  if (!loginAtivo() || !conta)
    return (
      <div className="inv-bloqueio" role="status">
        <h1>{t('Inventário de skins')}</h1>
        <p>{t('Entre com a Steam para escolher as skins que vão aparecer para você no servidor.')}</p>
        {loginAtivo() && (
          <button type="button" className="lb-btn lb-btn-p" onClick={entrar}>
            {t('Entrar com a Steam')}
          </button>
        )}
      </div>
    )
  if (erroCarga) return <p className="inv-dica">{t('Não consegui carregar o seu inventário. Tente de novo mais tarde.')}</p>
  if (!inv || !catalogo.dados) return <p className="inv-dica">{catalogo.erro ? t('Não consegui carregar o catálogo de skins.') : t('Carregando…')}</p>

  const mudar = (f) => {
    setEstado('')
    setInv(f)
  }
  const salvar = async () => {
    setEstado('salvando')
    try {
      const d = await salvarInventario(inv)
      const novo = { ...inventarioVazio(), ...d }
      setInv(novo)
      setSalvo(JSON.stringify(novo))
      setEstado('salvo')
    } catch {
      setEstado('erro')
    }
  }
  const total = Object.keys(inv.armas).length + Object.keys(inv.facas).length + Object.keys(inv.luvas).length + Object.keys(inv.agentes).length
  return (
    <>
      <header className="inv-cab">
        <div>
          <h1>{t('Inventário de skins')}</h1>
          <p>{t('Escolha o que você quer usar. As skins são aplicadas quando você entra no servidor (e valem a cada round).')}</p>
        </div>
        <div className="inv-acoes">
          <span className="inv-total">{t('{n} itens', { n: total })}</span>
          {estado === 'salvo' && !sujo && <span className="inv-ok">{t('Salvo!')}</span>}
          {estado === 'erro' && <span className="inv-erro">{t('Não deu para salvar.')}</span>}
          <button type="button" className="lb-btn lb-btn-p" disabled={!sujo || estado === 'salvando'} onClick={salvar}>
            {estado === 'salvando' ? t('Salvando…') : t('Salvar')}
          </button>
        </div>
      </header>
      <nav className="inv-abas" role="tablist">
        {ABAS.map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
            {t(nome)}
          </button>
        ))}
      </nav>
      {aba === 'armas' && <AbaArmas catalogo={catalogo.dados.armas} inv={inv} mudar={mudar} />}
      {aba === 'facas' && <AbaPecas key="facas" catalogo={catalogo.dados.armas} inv={inv} mudar={mudar} grupo="facas" rotuloPadrao="Faca lisa" comStatTrak />}
      {aba === 'luvas' && <AbaPecas key="luvas" catalogo={catalogo.dados.armas} inv={inv} mudar={mudar} grupo="luvas" rotuloPadrao="Luva padrão" />}
      {aba === 'agentes' && <AbaAgentes inv={inv} mudar={mudar} />}
    </>
  )
}

export default function Inventario() {
  return (
    <Layout pagina="inventario">
      <main className="inv-pagina">
        <div className="wrap inv-wrap">
          <Conteudo />
        </div>
      </main>
    </Layout>
  )
}
