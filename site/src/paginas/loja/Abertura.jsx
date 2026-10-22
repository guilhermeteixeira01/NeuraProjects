// Abertura de caixa: roleta horizontal (estilo CS), roleta vertical das facas, revelação com efeitos e a tela de resultado.
// O resultado já vem definido do servidor (POST /loja/abrir): aqui só se anima até ele. O item já está salvo no inventário quando a roleta começa.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RARIDADES, nomeDoDesgaste } from '../../../worker/steam-login/src/loja-core.js'
import { abrirCaixa, avisarSaldo } from '../../comum/loja.js'
import { desempenhoAtivo } from '../../comum/desempenho.js'
import { useT } from '../../comum/i18n.js'
import { urlImg, urlImgArma, useCatalogo } from '../../comum/skins.js'
import { definirPreferencia, preferenciaAtual, som, somDaRaridade } from './somLoja.js'

const DURACAO = 6000 // roleta horizontal (ms)
const DURACAO_FACAS = 5000
// Lightning (botão da página da caixa): a mesma animação, mais curta
const DURACAO_RAPIDA = 2200
const DURACAO_FACAS_RAPIDA = 1800
const SEM_VENDIDOS = new Set()

// ── dados de um item (nome, imagem) a partir do catálogo de skins ──
export function useAcharItem() {
  const { dados } = useCatalogo('armas')
  const mapa = useMemo(() => {
    const m = new Map()
    for (const a of dados?.armas || []) for (const s of a.s) m.set(`${a.d}:${s[0]}`, { arma: a, skin: s })
    return m
  }, [dados])
  return useCallback(
    (d, p) => {
      const x = mapa.get(`${d}:${p}`)
      if (!x) return { nome: `#${d}`, skin: '', img: '', faca: false }
      const faca = x.arma.c === 'facas'
      return { nome: `${faca ? '★ ' : ''}${x.arma.n}`, skin: x.skin[1], img: urlImgArma(x.skin[6], 256), imgGrande: urlImgArma(x.skin[6], 512), faca, stat: x.skin[5] === 1 }
    },
    [mapa],
  )
}

// ── cartão de um item (roleta e resultado) ──
// Nome e imagem de um item de caixa: adesivo e chaveiro trazem nome (n) e imagem (i) da própria caixa; skin e faca vêm do catálogo de armas
export function dadosDoItem(tipo, d, p, n, i, achar) {
  if (tipo === 'adesivo' || tipo === 'chaveiro') return { nome: n || `#${d}`, skin: tipo === 'adesivo' ? 'Adesivo' : 'Chaveiro', img: urlImg(i, 256), imgGrande: urlImg(i, 512), enfeite: true }
  return achar(d, p)
}

// Emblema do "Item Raro Especial" (no lugar do "?"): hexágono futurista com anéis, mira e núcleo brilhando na cor da raridade
export function EmblemaEspecial() {
  return (
    <svg className="lj-emblema" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="lj-em-nucleo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".35" stopColor="currentColor" stopOpacity=".9" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="lj-em-giro" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 3 56 17v30L32 61 8 47V17Z" opacity=".9" />
        <path d="M32 10 50 20.5v23L32 54 14 43.5v-23Z" strokeDasharray="5 4" opacity=".7" />
      </g>
      <g className="lj-em-contra" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".85">
        <circle cx="32" cy="32" r="13" strokeDasharray="14 7" />
        <path d="M32 14v6M32 44v6M14 32h6M44 32h6" />
      </g>
      <path d="M32 24 38 32 32 40 26 32Z" fill="url(#lj-em-nucleo)" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle className="lj-em-pisca" cx="32" cy="32" r="2.2" fill="#fff" />
    </svg>
  )
}

export function CartaoItem({ r, d, p, tipo, n, i, achar, classe = '', children }) {
  const t = useT()
  if (r === 5 && d === undefined) {
    return (
      <div className={`lj-cartao lj-especial ${classe}`} style={{ '--cor': RARIDADES[5].cor }}>
        <EmblemaEspecial />
        <b>{t('Item Raro Especial')}</b>
      </div>
    )
  }
  const x = dadosDoItem(tipo, d, p, n, i, achar)
  return (
    <div className={`lj-cartao ${classe}`} style={{ '--cor': RARIDADES[r].cor }}>
      <span className="lj-cartao-arte">{x.img ? <img src={x.img} alt="" draggable="false" /> : null}</span>
      <b>{x.nome}</b>
      <small>{x.enfeite ? t(x.skin) : x.skin}</small>
      {children}
    </div>
  )
}

// ── roleta (horizontal ou vertical): anima até o item sorteado ──
// itens: lista de { r, i } (i = índice na lista `lista` da caixa); o vencedor está em `alvo`
// ── confete do item ganho: só para item muito valioso (acima de VALOR_CONFETE NP). Cai do topo por cima da tela inteira, na cor da raridade, com dourado e branco ──
const VALOR_CONFETE = 700
function Confete({ r, valor }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const ctx = cv.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = (cv.width = window.innerWidth * dpr)
    const h = (cv.height = window.innerHeight * dpr)
    const cores = [RARIDADES[r].cor, RARIDADES[r].cor, '#ffffff', '#ffd34d', '#ffd34d']
    const total = Math.round((170 + Math.min(valor, 5000) / 25) / (desempenhoAtivo() ? 3 : 1)) // mais valioso, mais confete
    const DURACAO = 2600 // ms soltando confete do topo
    const ps = []
    const t0 = performance.now()
    let soltos = 0
    let quadro = 0
    const nova = () => ({
      x: Math.random() * w,
      y: -20 * dpr - Math.random() * 60 * dpr,
      vx: (Math.random() - 0.5) * 2 * dpr,
      vy: (2 + Math.random() * 3.5) * dpr,
      bal: Math.random() * 6,
      vbal: 0.03 + Math.random() * 0.05,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      tam: (6 + Math.random() * 7) * dpr,
      cor: cores[Math.floor(Math.random() * cores.length)],
    })
    const anima = (agora) => {
      const t = agora - t0
      const meta = Math.min(total, Math.floor((t / DURACAO) * total))
      while (soltos < meta) {
        ps.push(nova())
        soltos++
      }
      ctx.clearRect(0, 0, w, h)
      let vivos = 0
      for (const p of ps) {
        if (p.y > h + 30) continue
        vivos++
        p.bal += p.vbal
        p.x += p.vx + Math.sin(p.bal) * 1.4 * dpr
        p.y += p.vy
        p.rot += p.vr
        ctx.fillStyle = p.cor
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.scale(1, Math.cos(p.bal * 1.7)) // vira de lado como papel de verdade
        ctx.fillRect(-p.tam / 2, -p.tam / 3, p.tam, (p.tam * 2) / 3)
        ctx.restore()
      }
      if (soltos < total || vivos) quadro = requestAnimationFrame(anima)
    }
    quadro = requestAnimationFrame(anima)
    return () => cancelAnimationFrame(quadro)
  }, [r, valor])
  return createPortal(<canvas className="lj-confete" ref={ref} aria-hidden="true" />, document.body)
}

// vencedor (só na página da caixa, depois que tudo parou): o item ganho no lugar do cartão do meio (a faca no lugar do "?"), com o desgaste
// extra: algo por cima da roleta parada (o botão "Vender por X")
function Roleta({ vertical = false, itens, alvo, lista, achar, rodando, pular, duracao, aoParar, sonora = true, vencedor, extra }) {
  const t = useT()
  const caixa = useRef(null)
  const trilho = useRef(null)
  const [parou, setParou] = useState(false)
  const [sorte] = useState(() => Math.random()) // onde dentro do cartão vencedor o marcador para

  useEffect(() => {
    if (!rodando) return
    const el = caixa.current
    const tr = trilho.current
    if (!el || !tr || !tr.children[0]) return
    const primeiro = tr.children[0]
    const estilo = getComputedStyle(tr)
    const tam = vertical ? primeiro.offsetHeight : primeiro.offsetWidth
    const gap = parseFloat(vertical ? estilo.rowGap : estilo.columnGap) || 0
    const passo = tam + gap
    const V = vertical ? el.clientHeight : el.clientWidth
    const desvio = (sorte - 0.5) * tam * 0.78 // um pouco para cada lado do centro do cartão (parece natural, mas nunca na borda)
    const x0 = V / 2 - tam / 2
    const x1 = V / 2 - (alvo * passo + tam / 2 + desvio)
    const eixo = vertical ? 'Y' : 'X'
    let quadro = 0
    let ultimo = -1
    let ultimoTick = 0
    const t0 = performance.now()
    const pos = (x) => (tr.style.transform = `translate${eixo}(${x}px)`)
    pos(x0)
    const passoAnim = (agora) => {
      let p = Math.min(1, (agora - t0) / duracao)
      if (pular.current) p = 1
      const e = 1 - Math.pow(1 - p, 3.6) // começa rápida e desacelera até parar
      const x = x0 + (x1 - x0) * e
      pos(x)
      const i = Math.floor((V / 2 - x) / passo)
      if (i !== ultimo) {
        ultimo = i
        if (sonora && agora - ultimoTick > 24 && p < 1) {
          ultimoTick = agora
          som('tick', 1 - p) // o ritmo acompanha a desaceleração (cada cartão que passa pelo marcador)
        }
      }
      if (p < 1) quadro = requestAnimationFrame(passoAnim)
      else {
        setParou(true)
        aoParar()
      }
    }
    quadro = requestAnimationFrame(passoAnim)
    return () => cancelAnimationFrame(quadro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando])

  return (
    <div className={`lj-roleta${vertical ? ' lj-vertical' : ''}${parou ? ' lj-parou' : ''}`} ref={caixa}>
      <div className="lj-trilho" ref={trilho}>
        {itens.map((it, k) => {
          const base = it.r === 5 && !vertical ? null : vertical ? lista[it] : lista[it.i]
          const cls = k === alvo && parou ? 'lj-venceu' : ''
          if (k === alvo && parou && vencedor) {
            const v = vencedor.item
            const enfeite = v.t === 'adesivo' || v.t === 'chaveiro'
            return (
              <CartaoItem key={k} r={vencedor.raridade} d={v.d} p={v.p} tipo={v.t} n={v.n} i={v.i} achar={achar} classe={cls}>
                {!enfeite && <small className="lj-venceu-desgaste">{t(nomeDoDesgaste(v.f))}</small>}
              </CartaoItem>
            )
          }
          if (!vertical && it.r === 5) return <CartaoItem key={k} r={5} achar={achar} classe={cls} />
          return <CartaoItem key={k} r={vertical ? 5 : it.r} d={base.d} p={base.p} tipo={base.t} n={base.n} i={base.i} achar={achar} classe={cls} />
        })}
      </div>
      <i className="lj-marcador" aria-hidden="true" />
      {parou && vencedor && (vencedor.v || 0) > VALOR_CONFETE && <Confete r={vencedor.raridade} valor={vencedor.v} />}
      {parou && extra}
    </div>
  )
}

// ── partículas (canvas): explosão para raridades altas; confete dourado para a faca ──
function Particulas({ r }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || r < 2) return
    const ctx = cv.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = (cv.width = cv.clientWidth * dpr)
    const h = (cv.height = cv.clientHeight * dpr)
    const leve = desempenhoAtivo()
    const n = (r === 5 ? 220 : r === 4 ? 120 : r === 3 ? 70 : 40) / (leve ? 3 : 1)
    const cor = RARIDADES[r].cor
    const ouro = ['#ffd34d', '#f5c518', '#fff3b0', '#ffb300', '#ffffff', '#ff8a00']
    const ps = Array.from({ length: n }, () => {
      const ang = Math.random() * Math.PI * 2
      const v = (r === 5 ? 6 + Math.random() * 14 : 3 + Math.random() * 8) * dpr
      return { x: w / 2, y: h * 0.45, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 3 * dpr, g: (0.18 + Math.random() * 0.12) * dpr, vida: 1, tam: (2 + Math.random() * (r === 5 ? 6 : 4)) * dpr, cor: r === 5 ? ouro[Math.floor(Math.random() * ouro.length)] : cor, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, quadrado: r === 5 && Math.random() < 0.6 }
    })
    let quadro = 0
    const anima = () => {
      ctx.clearRect(0, 0, w, h)
      let vivos = 0
      for (const p of ps) {
        p.x += p.vx
        p.y += p.vy
        p.vy += p.g
        p.vx *= 0.992
        p.rot += p.vr
        p.vida -= r === 5 ? 0.004 : 0.008
        if (p.vida <= 0) continue
        vivos++
        ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 1.4))
        ctx.fillStyle = p.cor
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        if (p.quadrado) ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2)
        else {
          ctx.beginPath()
          ctx.arc(0, 0, p.tam / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      if (vivos) quadro = requestAnimationFrame(anima)
    }
    quadro = requestAnimationFrame(anima)
    return () => cancelAnimationFrame(quadro)
  }, [r])
  return <canvas className="lj-particulas" ref={ref} aria-hidden="true" />
}

// ── revelação: brilho, raios, flash, partículas e tremida, crescendo com a raridade ──
function Revelacao({ resultado, achar }) {
  const t = useT()
  const r = resultado.raridade
  const x = dadosDoItem(resultado.item.t, resultado.item.d, resultado.item.p, resultado.item.n, resultado.item.i, achar)
  const f = resultado.item.f
  return (
    <div className={`lj-revelacao lj-rev-${r}`} style={{ '--cor': RARIDADES[r].cor }}>
      <span className="lj-brilho" aria-hidden="true" />
      {r >= 4 && <span className="lj-raios" aria-hidden="true" />}
      {r >= 4 && <span className="lj-flash" aria-hidden="true" />}
      <Particulas r={r} />
      <div className="lj-rev-cartao">
        <span className="lj-rev-raridade">{t(RARIDADES[r].nome)}</span>
        <img src={x.imgGrande || x.img} alt="" draggable="false" />
        <b>{x.nome}</b>
        <span className="lj-rev-skin">{x.enfeite ? t(x.skin) : x.skin}</span>
        {x.enfeite ? (
          <small className="lj-rev-guardado">{t('Guardado no seu inventário: cole numa arma ao editá-la.')}</small>
        ) : (
        <div className="lj-rev-desgaste">
          <span>{t(nomeDoDesgaste(f))}</span>
          <i className="lj-barra-desgaste">
            <u style={{ left: `${Math.min(100, f * 100)}%` }} />
          </i>
          <small>
            {t('Float')} {f.toFixed(6)}
          </small>
        </div>
        )}
      </div>
    </div>
  )
}

function MiniResultado({ resultado, achar }) {
  const t = useT()
  const r = resultado.raridade
  const x = dadosDoItem(resultado.item.t, resultado.item.d, resultado.item.p, resultado.item.n, resultado.item.i, achar)
  return (
    <li className={`lj-mini lj-rev-${r}`} style={{ '--cor': RARIDADES[r].cor }}>
      <img src={x.img} alt="" draggable="false" />
      <b>{x.nome}</b>
      <span>{x.enfeite ? t(x.skin) : x.skin}</span>
      {!x.enfeite && (
        <small>
          {t(nomeDoDesgaste(resultado.item.f))} · {resultado.item.f.toFixed(4)}
        </small>
      )}
    </li>
  )
}

const MENSAGENS = {
  saldo: 'Você não tem Neura Pontos suficientes.',
  'sem-caixa': 'Você não tem essa caixa no inventário.',
  cheio: 'O seu inventário está cheio.',
  caixa: 'Essa caixa não está disponível.',
  login: 'Entre com a Steam para abrir caixas.',
}

// props: caixa (completa, de GET /loja; no modo Jester/Boost, com o preço do modo), qtd, origem ('direto' | 'inventario'), aoFechar(), aoOutra()
//   embutida: roda dentro da página da caixa (sem tela cheia); rapida: Lightning (animação curta); modo: 'jester' | 'boost' | undefined
//   (embutida) aoResultado(resultados): tudo parou; vendidos: Set dos ids já vendidos; vendendo: venda em andamento; aoVender([ids])
//   espera: o que mostrar (embutida) enquanto o servidor sorteia
export default function Abertura({ caixa, qtd, origem, maxQtd = 5, aoFechar, aoOutra, embutida = false, rapida = false, modo, aoResultado, vendidos = SEM_VENDIDOS, vendendo = false, aoVender, espera = null }) {
  const t = useT()
  const achar = useAcharItem()
  const [fase, setFase] = useState('carregando') // carregando | roleta | facas | resultado | erro
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [paradas, setParadas] = useState(0)
  const [faca, setFaca] = useState(0) // qual das facas sorteadas está na roleta vertical
  const [pref, setPref] = useState(preferenciaAtual())
  const pular = useRef(false)
  const [tremer, setTremer] = useState(false)
  const [restantes, setRestantes] = useState(0) // caixas dessa que ainda sobram no inventário (contam antes de cobrar)
  const [qtdOutra, setQtdOutra] = useState(1) // quantas caixas "Abrir outra" abre de uma vez

  // avisa o resto do site que a roleta começou/acabou: a insígnia nova só aparece depois (Insignias.jsx)
  useEffect(() => {
    // trava a rolagem da página de trás (barras de rolagem do site não aparecem por cima da roleta); embutida, a página rola normal
    if (embutida) return
    document.documentElement.classList.add('lj-travado')
    return () => document.documentElement.classList.remove('lj-travado')
  }, [embutida])
  useEffect(() => {
    window.dispatchEvent(new Event('np-loja-inicio'))
    return () => {
      // espera o React tirar o elemento da página antes de avisar
      setTimeout(() => window.dispatchEvent(new Event('np-loja-fim')), 0)
    }
  }, [])

  // Uma única chamada (o StrictMode do desenvolvimento monta duas vezes: sem isto cobraria duas vezes)
  const montado = useRef(false)
  const iniciou = useRef(false)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])
  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    abrirCaixa(caixa.id, qtd, origem, modo).then(
      (r) => {
        if (!montado.current) return
        setDados(r)
        setRestantes(r.restantes || 0)
        avisarSaldo(r.saldo)
        som('abrir')
        setFase('roleta')
      },
      (e) => {
        if (!montado.current) return
        setErro(MENSAGENS[e.message] || 'Não deu para abrir agora. Tente de novo.')
        setFase('erro')
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resultados = dados?.resultados || []
  const comFaca = useMemo(() => resultados.map((r, k) => (r.facas ? k : -1)).filter((k) => k >= 0), [resultados])

  // todas as roletas pararam: vai para a das facas (se alguma caiu no card dourado) ou para o resultado
  // o som de "parou" toca uma vez só, quando a última roleta termina (e o tick só vem da primeira, senão soaria em dobro)
  useEffect(() => {
    if (fase === 'roleta' && resultados.length && paradas === resultados.length) som('parar')
  }, [fase, paradas, resultados.length])

  useEffect(() => {
    if (fase !== 'roleta' || !resultados.length || paradas < resultados.length) return
    const id = setTimeout(() => setFase(comFaca.length && !pular.current ? 'facas' : 'resultado'), 700)
    return () => clearTimeout(id)
  }, [fase, paradas, resultados.length, comFaca.length])

  const proximaFaca = () => {
    if (faca + 1 < comFaca.length && !pular.current) setFaca(faca + 1)
    else setFase('resultado')
  }

  // revelação final: som da maior raridade e tremida de tela na faca
  const maior = resultados.reduce((m, r) => Math.max(m, r.raridade), 0)
  useEffect(() => {
    if (fase !== 'resultado' || !resultados.length) return
    somDaRaridade(maior)
    if (maior === 5) {
      setTremer(true)
      const id = setTimeout(() => setTremer(false), 900)
      return () => clearTimeout(id)
    }
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps

  // embutida: a página da caixa mostra os botões do resultado (Vender tudo, Abrir de novo)
  useEffect(() => {
    if (embutida && fase === 'resultado' && resultados.length) aoResultado?.(resultados)
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && fase !== 'carregando' && fase !== 'roleta' && fase !== 'facas' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [fase, aoFechar])

  const mudarSom = (p) => {
    definirPreferencia(p)
    setPref(preferenciaAtual())
  }
  // "Abrir outra": usa primeiro as caixas dessa que o jogador já tem no inventário e só cobra as que faltam
  const doInventario = modo ? 0 : Math.min(qtdOutra, restantes) // Jester/Boost: sempre paga o preço do modo
  const aPagar = (qtdOutra - doInventario) * caixa.preco
  const falta = aPagar > (dados?.saldo ?? 0)
  const rotuloOutra = (() => {
    const base = qtdOutra > 1 ? t('Abrir outras {n}', { n: qtdOutra }) : t('Abrir outra')
    if (doInventario === 0) return `${base} (${aPagar.toLocaleString('pt-BR')} NP)`
    if (aPagar === 0) return `${base} (${t('do inventário')})`
    return `${base} (${t('{n} do inventário', { n: doInventario })} + ${aPagar.toLocaleString('pt-BR')} NP)`
  })()

  return (
    <div
      className={`lj-abertura${embutida ? ' lj-embutida' : ''}${tremer ? ' lj-tremer' : ''}`}
      role={embutida ? 'region' : 'dialog'}
      aria-modal={embutida ? undefined : 'true'}
      aria-label={t('Abrindo caixa')}
      style={{ '--cor-caixa': caixa.cor }}
    >
      <div className="lj-abertura-topo">
        {/* embutida: o nome e o som já estão na página da caixa */}
        {!embutida && <b>{caixa.nome}</b>}
        {!embutida && (
          <span className="lj-som">
            <button type="button" className="lj-icone" onClick={() => mudarSom({ mudo: !pref.mudo })} aria-label={pref.mudo ? t('Ligar o som') : t('Desligar o som')} title={pref.mudo ? t('Ligar o som') : t('Desligar o som')}>
              {pref.mudo ? '🔇' : '🔊'}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={pref.vol} onChange={(e) => mudarSom({ vol: Number(e.target.value), mudo: false })} aria-label={t('Volume')} />
          </span>
        )}
        {/* sem "Pular animação": a roleta sempre vai até o fim (o Lightning da página da caixa deixa ela mais curta) */}
      </div>

      {/* embutida: enquanto o servidor sorteia, ficam as mesmas roletas paradas que já estavam na tela (nada muda de altura) */}
      {fase === 'carregando' && embutida && espera}
      {fase === 'carregando' && !embutida && (
        <div className="lj-centro">
          <span className="lj-girando" aria-hidden="true" />
          <p>{t('Abrindo…')}</p>
        </div>
      )}

      {fase === 'erro' && (
        <div className="lj-centro">
          <p className="lj-erro">{t(erro)}</p>
          <button type="button" className="lj-btn" onClick={aoFechar}>
            {t('Voltar')}
          </button>
        </div>
      )}

      {/* embutida: as roletas continuam na tela depois de parar (escondidas só durante a roleta da faca), com o item ganho e o "Vender por X" */}
      {(fase === 'roleta' || (embutida && (fase === 'facas' || fase === 'resultado'))) && (
        <div className="lj-faixas" data-n={resultados.length} style={{ '--n': resultados.length, ...(fase === 'facas' ? { display: 'none' } : {}) }}>
          {resultados.map((r, k) => {
            const pronto = embutida && fase === 'resultado'
            const vendido = vendidos.has(r.id)
            return (
              <Roleta
                key={r.id}
                itens={r.faixa}
                alvo={r.alvo}
                lista={caixa.itens}
                achar={achar}
                rodando
                sonora={k === 0}
                duracao={(rapida ? DURACAO_RAPIDA : DURACAO) + k * (rapida ? 120 : 250)}
                pular={pular}
                aoParar={() => setParadas((n) => n + 1)}
                vencedor={pronto ? r : undefined}
                extra={
                  pronto ? (
                    <button type="button" className={`lj-vender-um${vendido ? ' is-vendido' : ''}`} disabled={vendido || vendendo} onClick={() => aoVender?.([r.id])}>
                      {vendido ? t('Vendido') : t('Vender por {n} NP', { n: (r.v || 0).toLocaleString('pt-BR') })}
                    </button>
                  ) : null
                }
              />
            )
          })}
        </div>
      )}

      {fase === 'facas' && resultados[comFaca[faca]] && (
        <div className="lj-centro lj-facas">
          <h2>{t('É uma faca!')}</h2>
          <p>{t('Qual faca vai ser?')}</p>
          <Roleta
            key={faca}
            vertical
            itens={resultados[comFaca[faca]].facas.itens}
            alvo={resultados[comFaca[faca]].facas.alvo}
            lista={caixa.facas}
            achar={achar}
            rodando
            duracao={rapida ? DURACAO_FACAS_RAPIDA : DURACAO_FACAS}
            pular={pular}
            aoParar={() => {
              som('parar')
              setTimeout(proximaFaca, 1100)
            }}
          />
        </div>
      )}

      {fase === 'resultado' && !embutida && (
        <div className="lj-resultado">
          {resultados.length === 1 ? (
            <Revelacao resultado={resultados[0]} achar={achar} />
          ) : (
            <>
              <h2>{t('Você ganhou')}</h2>
              <ul className="lj-minis">
                {resultados.map((r) => (
                  <MiniResultado key={r.id} resultado={r} achar={achar} />
                ))}
              </ul>
              {maior >= 2 && (
                <div className="lj-rev-fundo" style={{ '--cor': RARIDADES[maior].cor }}>
                  <Particulas r={maior} />
                </div>
              )}
            </>
          )}
          <div className="lj-botoes">
            <div className="lj-outra">
              <div className="lj-qtd lj-qtd-p" role="group" aria-label={t('Quantidade')}>
                {Array.from({ length: Math.min(maxQtd, 3) }, (_, k) => k + 1).map((n) => (
                  <button key={n} type="button" className={qtdOutra === n ? 'is-ativo' : ''} aria-pressed={qtdOutra === n} onClick={() => setQtdOutra(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <button type="button" className="lj-btn lj-btn-p" disabled={falta} onClick={() => aoOutra(qtdOutra)} title={falta ? t('Você não tem Neura Pontos suficientes.') : undefined}>
                {rotuloOutra}
              </button>
            </div>
            <a className="lj-btn" href="/inventario/">
              {t('Ver no inventário')}
            </a>
            <button type="button" className="lj-btn" onClick={aoFechar}>
              {embutida ? t('Voltar para a caixa') : t('Voltar para a loja')}
            </button>
          </div>
          <small className="lj-salvo">{t('O item já está salvo no seu inventário.')}</small>
        </div>
      )}
    </div>
  )
}
