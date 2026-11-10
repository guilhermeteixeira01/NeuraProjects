// Sistema de upgrade de skins: aposte itens do inventário para tentar ganhar um item de maior valor.
// Chance = min(90%, totalApostado / valorAlvo * 95%). Usa RNG criptográfico no servidor.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo, lerValores } from '../../comum/loja.js'
import { useCatalogo, descrever, indicar, urlImgArma } from '../../comum/skins.js'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { chamarApi, lerApi } from '../../comum/api.js'

const DURACAO_GIRO = 7200
const VOLTAS_GIRO = 6
const LIMITE_ITENS = 12
const RAZAO_MINIMA = 1.2
const MULTIPLICADORES = [1.2, 1.5, 2, 5, 10]
const DESGASTES = ['FN', 'MW', 'FT', 'WW', 'BS']

const numero = (n) => Number(n).toLocaleString('pt-BR')
const pct = (v) => (v * 100).toFixed(2) + '%'

const mesmoAlvo = (a, b) => a.d === b.d && a.p === b.p && a.w === b.w

function siglaDesgaste(f) {
  if (!Number.isFinite(f)) return ''
  if (f < 0.07) return 'FN'
  if (f < 0.15) return 'MW'
  if (f < 0.38) return 'FT'
  if (f < 0.45) return 'WW'
  return 'BS'
}

// Uma entrada por skin e desgaste, com o preço que o servidor cobra por ela
function useCatalogoAlvo(armas) {
  const [precos, setPrecos] = useState(null)
  useEffect(() => {
    lerApi('/loja/valores-catalogo').then(setPrecos).catch(() => setPrecos({}))
  }, [])
  const itens = useMemo(() => {
    if (!armas || !precos) return null
    const lista = []
    for (const arma of armas) {
      for (const skin of arma.s || []) {
        const linha = precos[`${arma.d}:${skin[0]}`] || []
        linha.forEach((v, w) => {
          if (v > 0) lista.push({ d: arma.d, p: skin[0], w, v, arma: arma.n, nome: skin[1], cor: skin[2], img: skin[6] ? urlImgArma(skin[6], 256) : '' })
        })
      }
    }
    return lista
  }, [armas, precos])
  return itens
}

function NP({ v, classe = '' }) {
  return <span className={`upg-np ${classe}`}><img src="/icones/logo-np-64.png" alt="" width="14" height="14" /> {numero(v)}</span>
}

// Fuzil de assalto de perfil, cano para a direita (caixa 200 × 60, linha do cano em y ≈ 22):
// coronha com soleira, punho, ferrolho com mira traseira, carregador curvo, guarda-mão, tubo de gás, massa de mira e quebra-chamas.
const RIFLE =
  'M2 17L8 16 40 21 46 18H92L94 15H104L106 18H124L126 16H152L154 19H178L180 15H183L184 19H192V17H198V25H192V24H154L152 27H126L118 30' + // topo e cano
  'Q120 42 128 52L114 58Q104 46 100 31H86L84 34Q82 40 76 40H70' + // carregador curvo e guarda-mato
  'L66 48Q65 52 61 52H55Q52 52 53 48L57 31H48L40 33 8 44 2 43Z' // punho e coronha
const RIFLE_DETALHES = 'M10 19.5V41M46 18V31M126 19H152M128 23H150M132 19V27M138 19V27M144 19V27M100 31L118 30M70 34H82'

function RiflesCruzados() {
  const rifle = (transform) => (
    <g transform={transform}>
      <path className="upg-rifle-corpo" d={RIFLE} />
      <path className="upg-rifle-detalhe" d={RIFLE_DETALHES} />
    </g>
  )
  return (
    <svg className="upg-rifles" viewBox="0 0 200 130" aria-hidden="true">
      <defs>
        <linearGradient id="upg-rifle-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f5f9e" />
          <stop offset="1" stopColor="#12305c" />
        </linearGradient>
      </defs>
      {rifle('translate(100 66) rotate(-30) scale(.9) translate(-100 -24)')}
      {rifle('translate(100 66) scale(-1 1) rotate(-30) scale(.9) translate(-100 -24)')}
      {/* emblema de upgrade no cruzamento */}
      <g className="upg-rifles-emblema" transform="translate(100 66)">
        <polygon points="0,-17 15,-8.5 15,8.5 0,17 -15,8.5 -15,-8.5" />
        <path d="M-7 1 0-6 7 1M-7 8 0 1 7 8" />
      </g>
    </svg>
  )
}

function MolduraAsa() {
  return (
    <svg className="upg-asa-moldura" viewBox="0 0 540 300" preserveAspectRatio="none" aria-hidden="true">
      <path className="upg-asa-fundo" d="M60 1H540V260H400L385 299H205L190 260H60L1 220V41Z" />
      <path className="upg-asa-linha" d="M540 15H66L15 49V212L66 246H540" />
    </svg>
  )
}

function Hexagono({ selecionado }) {
  return (
    <svg className="upg-hex" viewBox="0 0 100 110" aria-hidden="true">
      <polygon className="upg-hex-fora" points="50,2 98,29 98,81 50,108 2,81 2,29" />
      <polygon className="upg-hex-dentro" points="50,20 82,38 82,72 50,90 18,72 18,38" />
      {selecionado && <path className="upg-hex-check" d="M36 56 46 66 66 45" />}
    </svg>
  )
}

function Icone({ tipo }) {
  const caminhos = {
    busca: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    abaixo: <path d="M12 4v16m-6-6 6 6 6-6" />,
    acima: <path d="M12 20V4m-6 6 6-6 6 6" />,
    upgrade: <path d="m5 13 7-7 7 7M5 20l7-7 7 7" />,
    fechar: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return <svg className="upg-icone" viewBox="0 0 24 24" aria-hidden="true">{caminhos[tipo]}</svg>
}

function Cartao({ cor, img, nome, arma, valor, desgaste, selecionado, bloqueado, aoClicar }) {
  return (
    <button
      type="button"
      className={`upg-card ${selecionado ? 'upg-card--sel' : ''}`}
      style={cor ? { '--cor-item': cor } : undefined}
      onClick={aoClicar}
      disabled={bloqueado}
      aria-pressed={selecionado}
      title={arma ? `${arma} | ${nome}` : nome}
    >
      {desgaste && <span className="upg-card-desgaste">{desgaste}</span>}
      <span className="upg-card-arte">
        <Hexagono selecionado={selecionado} />
        {img && <img src={img} alt="" loading="lazy" />}
      </span>
      <span className="upg-card-nome">{nome}</span>
      <span className="upg-card-arma">{arma}</span>
      <span className="upg-card-preco">{valor ? <NP v={valor} /> : '—'}</span>
    </button>
  )
}

// Com um item mostra nome e arma; com vários, só as imagens numa grade de até 4 colunas
function ItensArena({ itens }) {
  const n = itens.length
  const tamanho = n <= 2 ? n : n <= 4 ? 4 : 12
  return (
    <div className={`upg-arena-lista upg-arena-lista--${tamanho}`} style={{ '--colunas': Math.min(n, 4) }}>
      {itens.map(({ chave, cor, img, nome, arma, desgaste, aoClicar }) => {
        const legenda = [arma, desgaste].filter(Boolean).join(' · ')
        return (
          <button
            key={chave}
            type="button"
            className="upg-alvo"
            style={cor ? { '--cor-item': cor } : undefined}
            onClick={aoClicar}
            aria-label={`${nome} ${legenda}`}
            title={`${nome} (${legenda})`}
          >
            <span className="upg-alvo-arte">
              <Hexagono />
              {img && <img src={img} alt="" />}
            </span>
            {n === 1 && (
              <>
                <span className="upg-alvo-nome">{nome}</span>
                <span className="upg-alvo-arma">{legenda}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

function PainelAposta({ itensAposta, descricoes, totalApostado, aoRemover }) {
  const t = useT()
  return (
    <div className="upg-asa upg-asa-esq">
      <MolduraAsa />
      <div className="upg-asa-conteudo">
        {itensAposta.length === 0
          ? (
            <div className="upg-asa-vazia">
              <RiflesCruzados />
              <p className="upg-asa-titulo">{t('Selecione seus itens')}</p>
              <p className="upg-asa-sub">{t('Itens para upgrade')}</p>
            </div>
          )
          : (
            <ItensArena
              itens={itensAposta.map((id) => {
                const d = descricoes[id]
                return {
                  chave: id,
                  cor: d?.cor,
                  img: d?.img,
                  nome: d?.subtitulo || d?.titulo || '—',
                  arma: d?.subtitulo ? d.titulo : '',
                  desgaste: d?.desgaste,
                  aoClicar: () => aoRemover(id),
                }
              })}
            />
          )}
      </div>
      <div className="upg-asa-aba"><NP v={totalApostado} /></div>
    </div>
  )
}

function PainelAlvo({ alvos, valorAlvo, aoRemover, razao }) {
  const t = useT()
  return (
    <div className="upg-asa upg-asa-dir">
      <MolduraAsa />
      <div className="upg-asa-conteudo">
        {!alvos.length
          ? (
            <div className="upg-asa-vazia">
              <RiflesCruzados />
              <p className="upg-asa-titulo">{t('Selecione itens')}</p>
              <p className="upg-asa-sub">{t('Que você quer obter')}</p>
            </div>
          )
          : (
            <ItensArena
              itens={alvos.map((a) => ({
                chave: `${a.d}:${a.p}:${a.w}`,
                cor: a.cor,
                img: a.img,
                nome: a.nome,
                arma: a.arma,
                desgaste: DESGASTES[a.w],
                aoClicar: () => aoRemover(a),
              }))}
            />
          )}
      </div>
      <div className="upg-asa-aba">
        <NP v={valorAlvo} />
        <span className="upg-razao">{razao.toFixed(2)}x</span>
      </div>
    </div>
  )
}

function Medidor({ chance, estado, angulo, invertido }) {
  const t = useT()
  const classe = estado === 'ganhou' ? 'upg-medidor--ganhou' : estado === 'perdeu' ? 'upg-medidor--perdeu' : ''
  return (
    <div className={`upg-medidor ${classe}`}>
      <svg viewBox="0 0 320 360" aria-hidden="true">
        <polygon className="upg-med-hex-fora" points="160,3 317,93 317,267 160,357 3,267 3,93" />
        <polygon className="upg-med-hex-meio" points="160,20 302,102 302,258 160,340 18,258 18,102" />
        <circle className="upg-med-aro" cx="160" cy="180" r="124" />
        <circle className="upg-med-trilho" cx="160" cy="180" r="100" />
        <circle
          className="upg-med-chance"
          cx="160"
          cy="180"
          r="100"
          pathLength="100"
          strokeDasharray={`${chance * 100} 100`}
          transform={invertido ? 'translate(320 0) scale(-1 1) rotate(-90 160 180)' : 'rotate(-90 160 180)'}
        />
        <circle className="upg-med-miolo" cx="160" cy="180" r="84" />
        <g className={`upg-med-ponteiro ${estado === 'girando' ? 'upg-med-ponteiro--gira' : ''}`} style={{ transform: `rotate(${angulo}deg)` }}>
          <path d="M149 44H171V58L160 72 149 58Z" />
        </g>
      </svg>
      <div className="upg-med-texto" aria-live="polite">
        {estado === 'ganhou' && <strong>{t('Ganhou!')}</strong>}
        {estado === 'perdeu' && <strong>{t('Perdeu')}</strong>}
        {estado !== 'ganhou' && estado !== 'perdeu' && <strong>{pct(chance)}</strong>}
        <small>{estado === 'ganhou' || estado === 'perdeu' ? pct(chance) : t('Chance de upgrade')}</small>
      </div>
    </div>
  )
}

function BotaoLado({ invertido, desativado, aoTrocar }) {
  const t = useT()
  return (
    <button
      type="button"
      className="upg-lado-btn"
      onClick={aoTrocar}
      disabled={desativado}
      aria-pressed={invertido}
      aria-label={t('Trocar o lado da barra de ganho')}
      title={t('Trocar o lado da barra de ganho')}
    >
      <svg className={invertido ? 'upg-lado--invertido' : ''} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16" />
      </svg>
    </button>
  )
}

function Divisas({ dir }) {
  return (
    <svg className={`upg-divisas upg-divisas-${dir}`} viewBox="0 0 450 54" aria-hidden="true">
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={`M${i * 40 + 2} 2H${i * 40 + 16}L${i * 40 + 38} 27 ${i * 40 + 16} 52H${i * 40 + 2}L${i * 40 + 24} 27Z`} style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </svg>
  )
}

function BotaoOrdem({ ordem, aoTrocar }) {
  const t = useT()
  return (
    <button type="button" className="upg-ord-btn" onClick={() => aoTrocar((o) => (o === 'desc' ? 'asc' : 'desc'))}>
      {t('Preço')} <Icone tipo={ordem === 'desc' ? 'abaixo' : 'acima'} />
    </button>
  )
}

function CampoBusca({ valor, aoMudar }) {
  const t = useT()
  return (
    <label className="upg-busca">
      <input type="search" placeholder={t('Pesquisar')} aria-label={t('Pesquisar')} value={valor} onChange={(e) => aoMudar(e.target.value)} />
      <Icone tipo="busca" />
    </label>
  )
}

function GradeCatalogo({ itensAlvo, alvos, cheio, aoEscolher, busca, setBusca, minVal, setMinVal, maxVal, setMaxVal, ordemPreco, setOrdemPreco }) {
  const t = useT()
  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (itensAlvo || [])
      .filter((it) => {
        if (q && !`${it.arma} ${it.nome}`.toLowerCase().includes(q)) return false
        if (minVal && it.v < Number(minVal)) return false
        if (maxVal && it.v > Number(maxVal)) return false
        return true
      })
      .sort((a, b) => (ordemPreco === 'desc' ? b.v - a.v : a.v - b.v))
      .slice(0, 120)
  }, [itensAlvo, busca, minVal, maxVal, ordemPreco])

  return (
    <section className="upg-col">
      <div className="upg-col-cabecalho">
        <h2 className="upg-col-titulo">{t('Itens para obter')} <span className="upg-col-count">({itensAlvo?.length ?? 0})</span></h2>
        <BotaoOrdem ordem={ordemPreco} aoTrocar={setOrdemPreco} />
      </div>
      <div className="upg-filtros">
        <CampoBusca valor={busca} aoMudar={setBusca} />
        <input className="upg-input" type="number" placeholder={t('Valor mínimo')} aria-label={t('Valor mínimo')} value={minVal} onChange={(e) => setMinVal(e.target.value)} min="0" />
        <input className="upg-input" type="number" placeholder={t('Valor máximo')} aria-label={t('Valor máximo')} value={maxVal} onChange={(e) => setMaxVal(e.target.value)} min="0" />
      </div>
      <div className="upg-grade">
        {!itensAlvo
          ? <CarregandoNP />
          : itensFiltrados.length === 0
          ? <p className="upg-vazio">{t('Nenhum item encontrado')}</p>
          : itensFiltrados.map((it) => {
            const selecionado = alvos.some((a) => mesmoAlvo(a, it))
            return (
              <Cartao
                key={`${it.d}:${it.p}:${it.w}`}
                cor={it.cor}
                img={it.img}
                nome={it.nome}
                arma={it.arma}
                valor={it.v}
                desgaste={DESGASTES[it.w]}
                selecionado={selecionado}
                bloqueado={cheio && !selecionado}
                aoClicar={() => aoEscolher(it)}
              />
            )
          })}
      </div>
    </section>
  )
}

function GradeInventario({ inv, valores, itensAposta, cheio, aoToggle, busca, setBusca, ordemPreco, setOrdemPreco, idx, onRecarregar }) {
  const t = useT()
  const [dando, setDando] = useState(false)

  const itens = useMemo(() => {
    if (!inv) return []
    const q = busca.trim().toLowerCase()
    return Object.entries(inv.itens || {})
      .filter(([, it]) => ['arma', 'faca', 'luva'].includes(it.t) && !it.cadeado)
      .map(([id, it]) => ({ id, it, desc: descrever(it, idx), v: valores[id] || 0 }))
      .filter(({ desc }) => !q || desc.titulo.toLowerCase().includes(q) || desc.subtitulo?.toLowerCase().includes(q))
      .sort((a, b) => (ordemPreco === 'desc' ? b.v - a.v : a.v - b.v))
  }, [inv, valores, busca, ordemPreco, idx])

  const darItens = async () => {
    setDando(true)
    try {
      await chamarApi('/loja/debug-dar-itens', {})
      await onRecarregar()
    } finally { setDando(false) }
  }

  return (
    <section className="upg-col">
      <div className="upg-col-cabecalho">
        <h2 className="upg-col-titulo">{t('Meu inventário')}</h2>
        <BotaoOrdem ordem={ordemPreco} aoTrocar={setOrdemPreco} />
      </div>
      <div className="upg-filtros">
        <CampoBusca valor={busca} aoMudar={setBusca} />
      </div>
      {import.meta.env.DEV && (
        <button type="button" className="upg-btn-debug" onClick={darItens} disabled={dando}>
          {dando ? 'Adicionando...' : '+ Dar itens de teste (só na prévia local)'}
        </button>
      )}
      <div className="upg-grade">
        {!inv
          ? <CarregandoNP />
          : itens.length === 0
          ? <p className="upg-vazio">{t('Nenhum item no inventário')}</p>
          : itens.map(({ id, it, desc, v }) => (
            <Cartao
              key={id}
              cor={desc.cor}
              img={desc.img}
              nome={desc.subtitulo || desc.titulo}
              arma={desc.subtitulo ? desc.titulo : ''}
              valor={v}
              desgaste={siglaDesgaste(it.f)}
              selecionado={itensAposta.includes(id)}
              bloqueado={cheio && !itensAposta.includes(id)}
              aoClicar={() => aoToggle(id)}
            />
          ))}
      </div>
    </section>
  )
}

export default function Upgrade() {
  const t = useT()
  const conta = useConta()

  const [inv, setInv] = useState(null)
  const [valores, setValores] = useState({})
  const [itensAposta, setItensAposta] = useState([])
  const [alvos, setAlvos] = useState([])
  const [multiplicador, setMultiplicador] = useState(2)
  const [invertido, setInvertido] = useState(false)

  const [buscaInv, setBuscaInv] = useState('')
  const [ordemInv, setOrdemInv] = useState('desc')
  const [buscaAlvo, setBuscaAlvo] = useState('')
  const [ordemAlvo, setOrdemAlvo] = useState('asc')
  const [minValAlvo, setMinValAlvo] = useState('')
  const [maxValAlvo, setMaxValAlvo] = useState('')

  const [estado, setEstado] = useState('idle')
  const [angulo, setAngulo] = useState(0)
  const [chanceDoGiro, setChanceDoGiro] = useState(0)
  const [erro, setErro] = useState(null)

  const { dados: catalogoArmas } = useCatalogo('armas')
  const itensAlvo = useCatalogoAlvo(catalogoArmas?.armas)
  const idx = useMemo(() => indicar(catalogoArmas?.armas, []), [catalogoArmas])

  const carregarInv = useCallback(async () => {
    if (!loginAtivo()) return
    try { setInv(await chamarApi('/loja/itens')) } catch { setInv({ itens: {} }) }
  }, [])

  const carregarValores = useCallback(async () => {
    if (!loginAtivo()) return
    try {
      const lidos = await lerValores()
      setValores(Object.fromEntries(Object.entries(lidos).map(([id, x]) => [id, x?.v || 0])))
    } catch { /* sem valores */ }
  }, [])

  useEffect(() => {
    if (loginAtivo()) { carregarInv(); carregarValores() }
  }, [conta?.id, carregarInv, carregarValores])

  const totalApostado = itensAposta.reduce((s, id) => s + (valores[id] || 0), 0)

  useEffect(() => {
    if (totalApostado > 0 && multiplicador) {
      const ideal = totalApostado * multiplicador
      setMinValAlvo(String(Math.ceil(Math.max(ideal * 0.8, totalApostado * RAZAO_MINIMA))))
      setMaxValAlvo(String(Math.ceil(ideal * 1.5)))
    }
  }, [multiplicador, totalApostado])

  const descricoes = useMemo(() => {
    if (!inv) return {}
    const r = {}
    for (const id of itensAposta) {
      const it = inv.itens?.[id]
      if (it) r[id] = { ...descrever(it, idx), desgaste: siglaDesgaste(it.f) }
    }
    return r
  }, [inv, itensAposta, idx])

  const valorAlvo = alvos.reduce((s, a) => s + a.v, 0)
  const razao = valorAlvo && totalApostado > 0 ? valorAlvo / totalApostado : 0
  const abaixoDoMinimo = valorAlvo > 0 && totalApostado > 0 && valorAlvo < totalApostado * RAZAO_MINIMA
  const chance = razao && !abaixoDoMinimo ? Math.min(0.90, (totalApostado / valorAlvo) * 0.95) : 0
  const podeFazer = estado === 'idle' && chance > 0

  const terminou = estado === 'ganhou' || estado === 'perdeu'

  const limparFiltros = () => {
    setMinValAlvo('')
    setMaxValAlvo('')
  }
  const zerarRodada = () => {
    setEstado('idle')
    setAngulo(0)
    setErro(null)
    setItensAposta([])
    setAlvos([])
  }
  const zerar = () => {
    zerarRodada()
    limparFiltros()
  }
  const trocarAposta = (lista) => {
    setItensAposta(lista)
    if (!lista.length) limparFiltros()
  }

  const toggle = (id) => {
    if (estado === 'girando') return
    if (terminou) { zerar(); setItensAposta([id]); return }
    trocarAposta(itensAposta.includes(id) ? itensAposta.filter((x) => x !== id) : [...itensAposta, id].slice(0, LIMITE_ITENS))
  }
  const remover = (id) => {
    if (estado !== 'idle') return
    trocarAposta(itensAposta.filter((x) => x !== id))
  }
  const escolherAlvo = (it) => {
    if (estado === 'girando') return
    // Mantém os filtros: a lista não muda embaixo do card que acabou de ser clicado
    if (terminou) { zerarRodada(); setAlvos([it]); return }
    setAlvos((atuais) => (atuais.some((a) => mesmoAlvo(a, it)) ? atuais.filter((a) => !mesmoAlvo(a, it)) : [...atuais, it].slice(0, LIMITE_ITENS)))
  }
  const removerAlvo = (it) => {
    if (estado === 'girando') return
    if (terminou) zerar()
    else setAlvos((atuais) => atuais.filter((a) => !mesmoAlvo(a, it)))
  }

  const fazer = async () => {
    if (!podeFazer) return
    setErro(null)
    setChanceDoGiro(chance)
    setEstado('girando')
    try {
      const res = await chamarApi('/loja/upgrade', { itens: itensAposta, alvos: alvos.map(({ d, p, w }) => ({ d, p, w })) })
      const zona = res.chance * 360
      const parada = res.ganhou ? zona * (0.1 + Math.random() * 0.8) : zona + (360 - zona) * (0.1 + Math.random() * 0.8)
      setChanceDoGiro(res.chance)
      setItensAposta([])
      const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)').matches
      setAngulo((movimentoReduzido ? 1 : VOLTAS_GIRO) * 360 + (invertido ? 360 - parada : parada))
      await new Promise((r) => setTimeout(r, DURACAO_GIRO))
      setEstado(res.ganhou ? 'ganhou' : 'perdeu')
      if (res.saldo != null) avisarSaldo(res.saldo)
      carregarInv()
      carregarValores()
    } catch (e) {
      setEstado('idle')
      setErro(e?.mensagem || t('Erro ao fazer upgrade. Tente novamente.'))
    }
  }

  if (!loginAtivo()) {
    return (
      <Layout pagina="upgrade">
        <div className="upg-root upg-login">
          <p>{t('Entre com Steam para usar o upgrade.')}</p>
          <button type="button" className="upg-btn-principal" onClick={entrar}>{t('Entrar com Steam')}</button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout pagina="upgrade">
      <div className="upg-root">
        <h1 className="upg-titulo">Upgrade</h1>

        <div className="upg-arena">
          <PainelAposta itensAposta={itensAposta} descricoes={descricoes} totalApostado={totalApostado} aoRemover={remover} />
          <Medidor chance={estado === 'idle' ? chance : chanceDoGiro} estado={estado} angulo={angulo} invertido={invertido} />
          <PainelAlvo alvos={alvos} valorAlvo={valorAlvo} aoRemover={removerAlvo} razao={razao} />
        </div>

        <div className="upg-controles">
          <div className="upg-controle-esq">
            <BotaoLado invertido={invertido} desativado={estado !== 'idle'} aoTrocar={() => setInvertido((v) => !v)} />
          </div>
          <div className="upg-controle-dir">
            <div className="upg-mult-linha">
              {MULTIPLICADORES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`upg-mult-btn ${multiplicador === m ? 'upg-mult-btn--ativo' : ''}`}
                  onClick={() => setMultiplicador(m)}
                  aria-pressed={multiplicador === m}
                >
                  <svg viewBox="0 0 48 54" aria-hidden="true"><polygon points="24,1 47,14 47,40 24,53 1,40 1,14" /></svg>
                  <span>{m}x</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="upg-acao">
          <Divisas dir="esq" />
          <div className="upg-acao-centro">
            {estado === 'idle' && (
              <button type="button" className="upg-btn-principal" disabled={!podeFazer} onClick={fazer}>
                <Icone tipo="upgrade" /> {t('Fazer upgrade')}
              </button>
            )}
            {estado === 'girando' && <span className="upg-girando">{t('Girando...')}</span>}
            {terminou && (
              <button type="button" className="upg-btn-principal" onClick={zerar}>{t('Novo upgrade')}</button>
            )}
          </div>
          <Divisas dir="dir" />
        </div>
        {estado === 'idle' && abaixoDoMinimo && (
          <p className="upg-erro" role="status">{t('Os itens para obter precisam valer pelo menos 1,2x a sua aposta.')}</p>
        )}
        {erro && <p className="upg-erro" role="alert">{erro}</p>}

        <div className="upg-baixo">
          <GradeInventario
            inv={inv}
            valores={valores}
            itensAposta={itensAposta}
            cheio={estado === 'idle' && itensAposta.length >= LIMITE_ITENS}
            aoToggle={toggle}
            busca={buscaInv}
            setBusca={setBuscaInv}
            ordemPreco={ordemInv}
            setOrdemPreco={setOrdemInv}
            idx={idx}
            onRecarregar={async () => { await carregarInv(); await carregarValores() }}
          />
          <GradeCatalogo
            itensAlvo={itensAlvo}
            alvos={alvos}
            cheio={estado === 'idle' && alvos.length >= LIMITE_ITENS}
            aoEscolher={escolherAlvo}
            busca={buscaAlvo}
            setBusca={setBuscaAlvo}
            minVal={minValAlvo}
            setMinVal={setMinValAlvo}
            maxVal={maxValAlvo}
            setMaxVal={setMaxValAlvo}
            ordemPreco={ordemAlvo}
            setOrdemPreco={setOrdemAlvo}
          />
        </div>
      </div>
    </Layout>
  )
}
