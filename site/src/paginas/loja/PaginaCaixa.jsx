// Página de uma caixa (dentro da loja, com o carrossel de drops em cima): uma roleta parada por caixa escolhida (até 3), "Abrir por X NP",
// os modos (Jester = chances iguais, Boost = itens melhores mais prováveis, Lightning = animação rápida), o som e o conteúdo da caixa.
// Cada modo pinta a página com a cor dele (Jester roxo, Boost laranja) e entra com partículas e som. Abrir roda as roletas ali mesmo
// (Abertura embutida). Chances, preços dos modos e valores por desgaste vêm do servidor (GET /loja/caixa).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { seForErroApi } from '../../comum/api.js'
import Deposito from './Deposito.jsx'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo, lerDetalhesCaixa, venderItens } from '../../comum/loja.js'
import { desempenhoAtivo } from '../../comum/desempenho.js'
import { RARIDADES } from '../../../worker/steam-login/src/loja-core.js'
import Abertura, { CartaoItem, EmblemaEspecial, dadosDoItem } from './Abertura.jsx'
import { definirPreferencia, preferenciaAtual, som } from './somLoja.js'

const MAX_POR_VEZ = 1 // uma caixa por abertura, também validado no servidor
const numero = (n) => Number(n).toLocaleString('pt-BR')
// Chance em %: nunca aparece "0%" para item que tem chance de verdade (item caro: "0.0001%")
const pct = (n) => {
  if (!(n > 0)) return '0%'
  if (n < 0.0001) return '0.0001%'
  const txt = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4)
  return `${txt.replace(/0+$/, '').replace(/\.$/, '')}%`
}
const SIGLA = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' }
// cor de cada modo (moldura das roletas, botão Abrir, botões ativos, partículas)
const CORES = { normal: ['#1e90ff'], jester: ['#b14dff', '#e08cff', '#ffffff'], boost: ['#ff5f45', '#ff9a52', '#ffd27a'] }

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

// ── botão hexagonal com a dica em cima (quantidade, Jester, Boost, Lightning, som) ──
// acende / acendeFundo: cor própria do botão quando ligado (o Lightning acende amarelo mesmo dentro do Jester roxo ou do Boost laranja)
function Hex({ ativo, cor, acende, acendeFundo, titulo, dica, aoClicar, children, rotulo, desativado = false }) {
  return (
    <span className="lj-hex-caixa">
      <button type="button" className={`lj-hex${ativo ? ' is-ativo' : ''}`} style={acende ? { '--modo': acende, '--modo-fundo': acendeFundo || '#4a3b05' } : undefined} onClick={aoClicar} disabled={desativado} aria-pressed={ativo} aria-label={rotulo || titulo}>
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

const Icone = ({ d, preenchido, tam = 20 }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill={preenchido ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={preenchido ? 0 : 2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONES = {
  jester: 'M3 8l3.5 9h11L21 8l-4.5 3.5L12 5l-4.5 6.5L3 8Zm3.5 11h11v2h-11z',
  boost: 'M6 13l6-6 6 6M6 19l6-6 6 6',
  raio: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
}
// alto-falante (o corpo é preenchido; as ondas e o "x" são traços)
function IconeSom({ ligado }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5h3.5L11 5.5v13l-4.5-4H3z" fill="currentColor" stroke="none" />
      {ligado ? (
        <>
          <path d="M14.5 9a4 4 0 0 1 0 6" />
          <path d="M17.5 6.5a7.5 7.5 0 0 1 0 11" />
        </>
      ) : (
        <path d="m15 9.5 5 5m0-5-5 5" />
      )}
    </svg>
  )
}

// ── partículas ao ligar um modo: saem das molduras das roletas, na cor do modo (canvas por cima, não pega clique) ──
function ParticulasModo({ modo, chave }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const limpar = () => ctx.clearRect(0, 0, cv.width, cv.height)
    limpar() // desligou o modo (ou trocou): tira qualquer quadro que tenha ficado desenhado
    if (!modo || modo === 'normal') return
    // celular: menos partículas, sem brilho (shadowBlur pesa muito), resolução 1x e nada com a aba escondida
    const celular = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches
    const dpr = celular ? 1 : Math.min(2, window.devicePixelRatio || 1)
    // canvas fixo na tela inteira (não ocupa espaço nem é cortado); as partículas saem da moldura das roletas, que é o elemento pai.
    // Tudo medido pelo retângulo do próprio canvas: com o zoom do site no computador, as duas medidas ficam na mesma unidade
    // e a moldura cai no lugar certo do desenho.
    const tela = cv.getBoundingClientRect()
    const alvo = cv.parentElement.getBoundingClientRect()
    const w = (cv.width = Math.round(tela.width * dpr))
    const h = (cv.height = Math.round(tela.height * dpr))
    const L = (alvo.left - tela.left) * dpr
    const T = (alvo.top - tela.top) * dpr
    const W = alvo.width * dpr
    const H = alvo.height * dpr
    const cores = CORES[modo]
    const n = desempenhoAtivo() ? 40 : celular ? 55 : 160
    const jester = modo === 'jester'
    // Jester: estrelinhas que estouram de toda a borda; Boost: faíscas que sobem da borda de baixo
    const ps = Array.from({ length: n }, () => {
      const lado = Math.random()
      const x = jester ? (lado < 0.5 ? L + Math.random() * W : lado < 0.75 ? L : L + W) : L + Math.random() * W
      const y = jester ? (lado < 0.25 ? T : lado < 0.5 ? T + H : T + Math.random() * H) : T + H - Math.random() * H * 0.15
      const ang = jester ? Math.atan2(y - (T + H / 2), x - (L + W / 2)) + (Math.random() - 0.5) * 1.2 : -Math.PI / 2 + (Math.random() - 0.5) * 0.7
      const v = (jester ? 1.5 + Math.random() * 4 : 3 + Math.random() * 7) * dpr
      return { x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vida: 1, tam: (jester ? 2 + Math.random() * 4 : 1.5 + Math.random() * 3) * dpr, cor: cores[Math.floor(Math.random() * cores.length)], rot: Math.random() * 6 }
    })
    let quadro = 0
    const estrela = (x, y, r) => {
      ctx.beginPath()
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4
        const rr = k % 2 ? r * 0.4 : r
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
    }
    const anima = () => {
      if (document.hidden) {
        quadro = requestAnimationFrame(anima)
        return
      }
      ctx.clearRect(0, 0, w, h)
      let vivos = 0
      for (const p of ps) {
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.97
        p.vy = jester ? p.vy * 0.97 : p.vy * 0.985
        p.vida -= jester ? 0.016 : 0.02
        if (p.vida <= 0) continue
        vivos++
        ctx.globalAlpha = Math.min(1, p.vida * 1.5)
        ctx.fillStyle = p.cor
        if (!celular) {
          ctx.shadowColor = p.cor
          ctx.shadowBlur = 8 * dpr
        }
        if (jester) estrela(p.x, p.y, p.tam * 1.4)
        else ctx.fillRect(p.x - p.tam / 2, p.y - p.tam * 2, p.tam, p.tam * 4) // faísca comprida, subindo
      }
      if (vivos) quadro = requestAnimationFrame(anima)
      else ctx.clearRect(0, 0, w, h)
    }
    quadro = requestAnimationFrame(anima)
    return () => {
      cancelAnimationFrame(quadro)
      limpar() // cancelar no meio da animação não deixa partícula parada na tela
    }
  }, [modo, chave])
  return <canvas className="lj-cx-particulas" ref={ref} aria-hidden="true" />
}

// ── roleta parada (antes de abrir): uma amostra dos itens da caixa, com o marcador no meio ──
function sortearAmostra(c) {
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
}
function RoletaParada({ amostra, achar }) {
  return (
    <div className="lj-roleta lj-roleta-parada">
      <div className="lj-trilho">
        {amostra.map((x, k) => (x.r === 5 && !x.it ? <CartaoItem key={k} r={5} achar={achar} /> : <CartaoItem key={k} r={x.r} d={x.it.d} p={x.it.p} tipo={x.it.t} n={x.it.n} i={x.it.i} achar={achar} />))}
      </div>
      <i className="lj-marcador" aria-hidden="true" />
    </div>
  )
}

// ── um item do "Conteúdo da caixa": chance no canto (no Boost, quantas vezes mais chance); o "i" mostra preço e chance de cada desgaste ──
function ItemConteudo({ r, base, chance, normal, modo, desgastes, achar }) {
  const t = useT()
  const [info, setInfo] = useState(false)
  const x = dadosDoItem(base.t || (r === 5 ? 'faca' : 'arma'), base.d, base.p, base.n, base.i, achar)
  const nome = x.enfeite ? x.nome : `${x.nome}${x.skin ? ` | ${x.skin}` : ''}`
  const vezes = modo === 'boost' && normal > 0 ? chance / normal : 0
  return (
    <li className={`lj-cx-item${info ? ' is-info' : ''}`} style={{ '--cor': RARIDADES[r].cor }}>
      <button type="button" className="lj-cx-i" onClick={() => setInfo((v) => !v)} aria-expanded={info} aria-label={t('Preço e chance por desgaste')}>
        i
      </button>
      <span className="lj-cx-chance">
        {vezes >= 1.05 && <em className="lj-cx-vezes">{vezes.toFixed(1)}x</em>}
        <span className={modo === 'jester' ? 'lj-cx-pilula' : ''}>{pct(chance)}</span>
      </span>
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

// ── card único do "Item Raro Especial" no conteúdo da caixa: a chance é a soma de todos os itens especiais; clicar abre a lista com preço e chance de cada um ──
function CartaoEspecial({ chance, aoAbrir, modo }) {
  const t = useT()
  return (
    <li className="lj-cx-item lj-cx-especial" style={{ '--cor': RARIDADES[5].cor }}>
      <button type="button" className="lj-cx-especial-btn" onClick={aoAbrir} aria-label={t('Ver os itens raros especiais e as chances')}>
        <span className="lj-cx-chance">
          <span className={modo === 'jester' ? 'lj-cx-pilula' : ''}>{pct(chance)}</span>
        </span>
        <span className="lj-cx-i lj-cx-i-fixo" aria-hidden="true">i</span>
        <span className="lj-cx-medalha" aria-hidden="true">
          <EmblemaEspecial />
        </span>
        <b className="lj-cx-nome">★ {t('Item Raro Especial')} ★</b>
      </button>
    </li>
  )
}

// janela "Chances": cada item especial com a imagem, o nome, o valor e a chance
function JanelaEspeciais({ itens, achar, aoFechar }) {
  const t = useT()
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    document.documentElement.classList.add('inv-travado')
    return () => {
      document.removeEventListener('keydown', tecla)
      document.documentElement.classList.remove('inv-travado')
    }
  }, [aoFechar])
  return createPortal(
    <div className="lj-chm-fundo" onClick={aoFechar}>
      <div className="lj-chm" role="dialog" aria-modal="true" aria-label={t('Chances')} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            {t('Chances')}
          </h3>
          <button type="button" className="lj-chm-x" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <div className="lj-chm-cab">
          <span>{t('Item')}</span>
          <span>{t('Valor')}</span>
          <span>{t('Chance')}</span>
        </div>
        <ul>
          {itens.map((x) => {
            const d = dadosDoItem(x.base.t || 'faca', x.base.d, x.base.p, x.base.n, x.base.i, achar)
            const valor = (x.desgastes || []).reduce((a, g) => a + g.p * g.v, 0)
            return (
              <li key={x.chave}>
                <span className="lj-chm-item">
                  {d.img ? <img src={d.img} alt="" loading="lazy" draggable="false" /> : <i />}
                  <b>
                    {d.nome}
                    {d.skin ? ` | ${d.skin}` : ''}
                  </b>
                </span>
                <span className="lj-chm-valor">{x.desgastes ? `${numero(Math.round(valor))} NP` : '…'}</span>
                <span className="lj-chm-chance">{pct(x.chance)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

export default function PaginaCaixa({ c, saldo, tem, maxQtd, aberturas = 0, abrirDoInventario = false, aoAbrirDoInventario, ocupado = false, achar, favorita, aoFavoritar, aoVoltar, aoAbriu }) {
  const t = useT()
  const maximo = Math.min(maxQtd, MAX_POR_VEZ)
  const [qtd, setQtd] = useState(1)
  const [modo, setModo] = useState(null) // null | 'jester' | 'boost'
  const [verEspeciais, setVerEspeciais] = useState(false) // janela com os itens do card dourado
  const [depositando, setDepositando] = useState(false) // sem NP para abrir: o botão Abrir leva direto para a recarga
  const [efeito, setEfeito] = useState(0) // muda a cada troca de modo: dispara as partículas de novo
  const [rapida, setRapida] = useState(false)
  const [somLigado, setSomLigado] = useState(true)
  const [det, setDet] = useState(null) // GET /loja/caixa
  const [abrindo, setAbrindo] = useState(null) // { qtd, origem, chave }
  // caixa só de adesivos/chaveiros: não conta para a abertura especial (nem tem)
  const [resultado, setResultado] = useState(null) // o que saiu (depois que as roletas pararam): [{ id, v, ... }]
  const [vendidos, setVendidos] = useState(() => new Set())
  const [vendendo, setVendendo] = useState(false)
  const [erroVenda, setErroVenda] = useState('')

  useEffect(() => {
    setRapida(lerRapida())
    setSomLigado(!preferenciaAtual().mudo)
  }, [])

  useEffect(() => {
    let vivo = true
    setDet(null)
    lerDetalhesCaixa(c.id).then((d) => vivo && setDet(d), seForErroApi())
    return () => {
      vivo = false
    }
  }, [c.id])

  const preco = modo ? det?.modos?.[modo]?.preco ?? null : c.preco
  const chances = modo ? det?.modos?.[modo]?.chances ?? c.chances : c.chances
  // as caixas que já estão no inventário abrem primeiro (sem NP); só as que faltarem para a quantidade escolhida são pagas.
  // Jester/Boost sempre pagam (o worker não usa as do inventário nos modos)
  const doInventario = modo ? 0 : Math.min(qtd, tem)
  const custo = preco == null ? null : preco * (qtd - doInventario)
  const rotuloAbrir = (deNovo) => {
    if (doInventario === qtd) return qtd === 1 ? t('Abrir do inventário') : t('Abrir {n} do inventário', { n: qtd })
    const pago = t(deNovo ? 'Abrir de novo por {n} NP' : 'Abrir por {n} NP', { n: numero(custo ?? 0) })
    return doInventario ? `${pago} + ${t('{n} do inventário', { n: doInventario })}` : pago
  }
  const falta = custo != null && saldo != null && custo > saldo

  const conteudo = useMemo(() => {
    const l = c.itens.map((it, i) => ({ chave: `i${i}`, r: it.r, base: it, chance: chances.itens[i], normal: c.chances.itens[i], desgastes: det?.itens?.[i] }))
    c.facas.forEach((f, i) => l.push({ chave: `f${i}`, r: 5, base: { ...f, t: f.t || 'faca' }, chance: chances.facas[i], normal: c.chances.facas[i], desgastes: det?.facas?.[i] }))
    return l.sort((a, b) => b.r - a.r || a.normal - b.normal)
  }, [c, chances, det])

  const especiais = useMemo(() => conteudo.filter((x) => x.r === 5), [conteudo])
  const comuns = useMemo(() => conteudo.filter((x) => x.r !== 5), [conteudo])

  const alternarModo = (m) => {
    const novo = modo === m ? null : m
    setModo(novo)
    setEfeito((n) => n + 1)
    som(novo || 'modoOff')
  }
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
  const abrir = (q, origem) => {
    setResultado(null)
    setVendidos(new Set())
    setErroVenda('')
    setAbrindo({ qtd: q, origem, chave: Date.now() })
  }
  // veio do botão "Abrir" do inventário: abre uma das caixas que já tem aqui mesmo, na roleta da página (uma vez só)
  const abriuDoInventario = useRef(false)
  useEffect(() => {
    if (!abrirDoInventario || abriuDoInventario.current || tem <= 0) return
    abriuDoInventario.current = true
    aoAbrirDoInventario?.()
    abrir(1, 'inventario')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirDoInventario, tem])
  const voltarParaCaixa = () => {
    setAbrindo(null)
    setResultado(null)
    aoAbriu()
  }
  // Vender o que saiu (um ou todos): o item sai do inventário e os NP entram na hora
  const vender = async (ids) => {
    const lista = ids.filter((id) => !vendidos.has(id))
    if (!lista.length) return
    setVendendo(true)
    setErroVenda('')
    try {
      const r = await venderItens(lista)
      avisarSaldo(r.saldo)
      som('parar')
      setVendidos((s) => new Set([...s, ...lista]))
      aoAbriu()
    } catch {
      setErroVenda(t('Não deu para vender agora. Tente de novo.'))
    } finally {
      setVendendo(false)
    }
  }
  const girando = !!abrindo && !resultado
  // as roletas paradas (uma por caixa escolhida): a mesma amostra antes de abrir e enquanto o servidor sorteia
  const amostras = useMemo(() => Array.from({ length: qtd }, () => sortearAmostra(c)), [c.id, qtd]) // eslint-disable-line react-hooks/exhaustive-deps
  const paradas = amostras.map((a, k) => <RoletaParada key={k} amostra={a} achar={achar} />)
  const aVender = (resultado || []).filter((r) => !vendidos.has(r.id))
  const totalVenda = aVender.reduce((a, r) => a + (r.v || 0), 0)

  return (
    <section className="lj-cx" data-modo={modo || 'normal'} aria-label={c.nome}>
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

      <div className="lj-cx-roletas">
            <img className="np-carrossel-borda np-carrossel-borda-esquerda" src="/assets/caixas/carrocel/jason-esquerda.webp" alt="" aria-hidden="true" width="900" height="900" />
            <img className="np-carrossel-borda np-carrossel-borda-direita" src="/assets/caixas/carrocel/ghostface-direita.webp" alt="" aria-hidden="true" width="900" height="900" />
        {abrindo ? (
          <Abertura
            key={abrindo.chave}
            embutida
            rapida={rapida}
            modo={modo || undefined}
            caixa={{ ...c, preco: preco ?? c.preco }}
            qtd={abrindo.qtd}
            origem={abrindo.origem}
            maxQtd={maximo}
            aoFechar={voltarParaCaixa}
            aoOutra={(n) => abrir(n || 1, modo ? 'direto' : 'auto')}
            aoResultado={(r) => {
              setResultado(r)
              aoAbriu() // saldo novo (o "Abrir de novo" confere)
            }}
            vendidos={vendidos}
            vendendo={vendendo}
            aoVender={vender}
            espera={paradas}
          />
        ) : (
          <div className="np-caixa-antes">
            <div className="np-carrossel-vazio" aria-hidden="true" />
            <div className="np-caixa-vitrine"><img src={c.img} alt={c.nome} width="220" height="220" /><b>{c.nome}</b>{qtd > 1 && <small>× {qtd}</small>}</div>
          </div>
        )}
        <ParticulasModo modo={modo} chave={efeito} />
      </div>

      {/* resultado: vender tudo ou abrir de novo (a quantidade e o modo continuam os mesmos); Lightning e som à direita */}
      {abrindo && resultado && (
        <div className="lj-cx-controles lj-cx-pos">
          <div className="lj-cx-qtd">
            <button type="button" className="lj-cx-voltar-res" onClick={voltarParaCaixa}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {t('Voltar')}
            </button>
          </div>
          <div className="lj-cx-abrir">
            <span className="lj-cx-pos-botoes">
              <button type="button" className="lj-cx-vender-tudo" disabled={vendendo || !aVender.length} onClick={() => vender(aVender.map((r) => r.id))}>
                <Icone d="M12 2v12m0 0 4-4m-4 4-4-4M4 16v4h16v-4" />
                {aVender.length ? t('Vender tudo por {n} NP', { n: numero(totalVenda) }) : t('Tudo vendido')}
              </button>
              <button type="button" className="lj-cx-de-novo" disabled={preco == null} onClick={() => (falta ? setDepositando(true) : abrir(qtd, modo ? 'direto' : 'auto'))}>
                <Icone d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
                {rotuloAbrir(true)}
              </button>
            </span>
            {erroVenda && <small className="lj-cx-falta">{erroVenda}</small>}
          </div>
          <div className="lj-cx-modos">
            <Hex ativo={rapida} cor="#f5c518" acende="#f5c518" acendeFundo="#5a4707" titulo="Lightning" dica={t('Acelere a animação de abertura da caixa')} aoClicar={alternarRapida}>
              <Icone d={ICONES.raio} preenchido />
            </Hex>
            <Hex ativo={somLigado} rotulo={somLigado ? t('Desligar o som') : t('Ligar o som')} aoClicar={alternarSom}>
              <IconeSom ligado={somLigado} />
            </Hex>
          </div>
        </div>
      )}

      {/* enquanto gira, os mesmos controles continuam na tela (só travados): nada some, a página não pula */}
      {!(abrindo && resultado) && (
        <div className={`lj-cx-controles${girando ? ' is-girando' : ''}`}>
          <div className="lj-cx-qtd" role="group" aria-label={t('Quantidade')}>
            {Array.from({ length: maximo }, (_, k) => k + 1).map((n) => (
              <Hex key={n} ativo={qtd === n} desativado={girando} aoClicar={() => setQtd(n)} rotulo={t('Abrir {n}', { n })}>
                <b>{n}</b>
              </Hex>
            ))}
          </div>

          <div className="lj-cx-abrir">
            <button type="button" className="lj-cx-btn-abrir" disabled={girando || ocupado || preco == null} onClick={() => (falta ? setDepositando(true) : abrir(qtd, modo ? 'direto' : 'auto'))}>
              {girando ? t('Abrindo…') : preco == null ? t('Carregando…') : rotuloAbrir(false)}
            </button>
            {tem > 0 && (
              <span className="lj-cx-extras">
                <small className="lj-cx-tem">{modo ? t('Você tem {n} no inventário (os modos sempre cobram NP)', { n: tem }) : t('Você tem {n} no inventário', { n: tem })}</small>
              </span>
            )}
          </div>

          <div className="lj-cx-modos">
            <Hex ativo={modo === 'jester'} desativado={girando} cor="#d58cff" titulo="Jester Mode" dica={t('Chances iguais para todos os itens ({n} NP)', { n: det ? numero(det.modos.jester.preco) : '…' })} aoClicar={() => alternarModo('jester')}>
              <Icone d={ICONES.jester} preenchido />
            </Hex>
            <Hex ativo={modo === 'boost'} desativado={girando} cor="#ff6b5b" titulo="Boost Mode" dica={t('Chances aumentadas para itens melhores ({n} NP)', { n: det ? numero(det.modos.boost.preco) : '…' })} aoClicar={() => alternarModo('boost')}>
              <Icone d={ICONES.boost} />
            </Hex>
            <Hex ativo={rapida} cor="#f5c518" acende="#f5c518" acendeFundo="#5a4707" titulo="Lightning" dica={t('Acelere a animação de abertura da caixa')} aoClicar={alternarRapida}>
              <Icone d={ICONES.raio} preenchido />
            </Hex>
            <Hex ativo={somLigado} rotulo={somLigado ? t('Desligar o som') : t('Ligar o som')} aoClicar={alternarSom}>
              <IconeSom ligado={somLigado} />
            </Hex>
          </div>
        </div>
      )}

      {abrindo && <>
      <h2 className="lj-cx-sub">{t('Conteúdo da caixa')}</h2>
      <ul className="lj-cx-grade">
        {/* os itens do card dourado ficam juntos num card só ("Item Raro Especial") com a chance somada; clicar abre a lista */}
        {especiais.length > 0 && <CartaoEspecial chance={especiais.reduce((a, x) => a + (x.chance || 0), 0)} modo={modo} aoAbrir={() => setVerEspeciais(true)} />}
        {comuns.map((x) => (
          <ItemConteudo key={x.chave} r={x.r} base={x.base} chance={x.chance} normal={x.normal} modo={modo} desgastes={x.desgastes} achar={achar} />
        ))}
      </ul>
      </>}
      {verEspeciais && <JanelaEspeciais itens={[...especiais].sort((a, b) => b.chance - a.chance || (b.desgastes?.[0]?.v || 0) - (a.desgastes?.[0]?.v || 0))} achar={achar} aoFechar={() => setVerEspeciais(false)} />}
      {depositando && <Deposito aoFechar={() => setDepositando(false)} aoPagar={aoAbriu} />}
    </section>
  )
}
