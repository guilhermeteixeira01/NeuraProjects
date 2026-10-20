// Abertura de caixa: roleta horizontal (estilo CS), roleta vertical das facas, revelação com efeitos e a tela de resultado.
// O resultado já vem definido do servidor (POST /loja/abrir): aqui só se anima até ele. O item já está salvo no inventário quando a roleta começa.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RARIDADES, nomeDoDesgaste } from '../../../worker/steam-login/src/loja-core.js'
import { abrirCaixa, avisarSaldo } from '../../comum/loja.js'
import { desempenhoAtivo } from '../../comum/desempenho.js'
import { useT } from '../../comum/i18n.js'
import { urlImgArma, useCatalogo } from '../../comum/skins.js'
import { definirPreferencia, preferenciaAtual, som, somDaRaridade } from './somLoja.js'

const DURACAO = 6000 // roleta horizontal (ms)
const DURACAO_FACAS = 5000

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
export function CartaoItem({ r, d, p, achar, classe = '', children }) {
  const t = useT()
  if (r === 5 && d === undefined) {
    return (
      <div className={`lj-cartao lj-especial ${classe}`} style={{ '--cor': RARIDADES[5].cor }}>
        <span className="lj-interroga">?</span>
        <b>{t('Item Raro Especial')}</b>
      </div>
    )
  }
  const x = achar(d, p)
  return (
    <div className={`lj-cartao ${classe}`} style={{ '--cor': RARIDADES[r].cor }}>
      <span className="lj-cartao-arte">{x.img ? <img src={x.img} alt="" draggable="false" /> : null}</span>
      <b>{x.nome}</b>
      <small>{x.skin}</small>
      {children}
    </div>
  )
}

// ── roleta (horizontal ou vertical): anima até o item sorteado ──
// itens: lista de { r, i } (i = índice na lista `lista` da caixa); o vencedor está em `alvo`
function Roleta({ vertical = false, itens, alvo, lista, achar, rodando, pular, duracao, aoParar, sonora = true }) {
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
          if (!vertical && it.r === 5) return <CartaoItem key={k} r={5} achar={achar} classe={cls} />
          return <CartaoItem key={k} r={vertical ? 5 : it.r} d={base.d} p={base.p} achar={achar} classe={cls} />
        })}
      </div>
      <i className="lj-marcador" aria-hidden="true" />
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
  const x = achar(resultado.item.d, resultado.item.p)
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
        <span className="lj-rev-skin">{x.skin}</span>
        <div className="lj-rev-desgaste">
          <span>{t(nomeDoDesgaste(f))}</span>
          <i className="lj-barra-desgaste">
            <u style={{ left: `${Math.min(100, f * 100)}%` }} />
          </i>
          <small>
            {t('Float')} {f.toFixed(6)}
          </small>
        </div>
      </div>
    </div>
  )
}

function MiniResultado({ resultado, achar }) {
  const t = useT()
  const r = resultado.raridade
  const x = achar(resultado.item.d, resultado.item.p)
  return (
    <li className={`lj-mini lj-rev-${r}`} style={{ '--cor': RARIDADES[r].cor }}>
      <img src={x.img} alt="" draggable="false" />
      <b>{x.nome}</b>
      <span>{x.skin}</span>
      <small>
        {t(nomeDoDesgaste(resultado.item.f))} · {resultado.item.f.toFixed(4)}
      </small>
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

// props: caixa (completa, de GET /loja), qtd, origem ('direto' | 'inventario'), aoFechar(), aoOutra()
export default function Abertura({ caixa, qtd, origem, maxQtd = 5, aoFechar, aoOutra }) {
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
    // trava a rolagem da página de trás (barras de rolagem do site não aparecem por cima da roleta)
    document.documentElement.classList.add('lj-travado')
    return () => document.documentElement.classList.remove('lj-travado')
  }, [])
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
    abrirCaixa(caixa.id, qtd, origem).then(
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

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && fase !== 'carregando' && fase !== 'roleta' && fase !== 'facas' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [fase, aoFechar])

  const mudarSom = (p) => {
    definirPreferencia(p)
    setPref(preferenciaAtual())
  }
  const animando = fase === 'roleta' || fase === 'facas'
  // "Abrir outra": usa primeiro as caixas dessa que o jogador já tem no inventário e só cobra as que faltam
  const doInventario = Math.min(qtdOutra, restantes)
  const aPagar = (qtdOutra - doInventario) * caixa.preco
  const falta = aPagar > (dados?.saldo ?? 0)
  const rotuloOutra = (() => {
    const base = qtdOutra > 1 ? t('Abrir outras {n}', { n: qtdOutra }) : t('Abrir outra')
    if (doInventario === 0) return `${base} (${aPagar.toLocaleString('pt-BR')} NP)`
    if (aPagar === 0) return `${base} (${t('do inventário')})`
    return `${base} (${t('{n} do inventário', { n: doInventario })} + ${aPagar.toLocaleString('pt-BR')} NP)`
  })()

  return (
    <div className={`lj-abertura${tremer ? ' lj-tremer' : ''}`} role="dialog" aria-modal="true" aria-label={t('Abrindo caixa')} style={{ '--cor-caixa': caixa.cor }}>
      <div className="lj-abertura-topo">
        <b>{caixa.nome}</b>
        <span className="lj-som">
          <button type="button" className="lj-icone" onClick={() => mudarSom({ mudo: !pref.mudo })} aria-label={pref.mudo ? t('Ligar o som') : t('Desligar o som')} title={pref.mudo ? t('Ligar o som') : t('Desligar o som')}>
            {pref.mudo ? '🔇' : '🔊'}
          </button>
          <input type="range" min="0" max="1" step="0.05" value={pref.vol} onChange={(e) => mudarSom({ vol: Number(e.target.value), mudo: false })} aria-label={t('Volume')} />
        </span>
        {animando && (
          <button
            type="button"
            className="lj-pular"
            onClick={() => {
              pular.current = true
              if (fase === 'facas') proximaFaca()
            }}
          >
            {t('Pular animação')}
          </button>
        )}
      </div>

      {fase === 'carregando' && (
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

      {fase === 'roleta' && (
        <div className="lj-faixas" data-n={resultados.length} style={{ "--n": resultados.length }}>
          {resultados.map((r, k) => (
            <Roleta key={r.id} itens={r.faixa} alvo={r.alvo} lista={caixa.itens} achar={achar} rodando sonora={k === 0} duracao={DURACAO + k * 250} pular={pular} aoParar={() => setParadas((n) => n + 1)} />
          ))}
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
            duracao={DURACAO_FACAS}
            pular={pular}
            aoParar={() => {
              som('parar')
              setTimeout(proximaFaca, 1100)
            }}
          />
        </div>
      )}

      {fase === 'resultado' && (
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
                {Array.from({ length: maxQtd }, (_, k) => k + 1).map((n) => (
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
              {t('Voltar para a loja')}
            </button>
          </div>
          <small className="lj-salvo">{t('O item já está salvo no seu inventário.')}</small>
        </div>
      )}
    </div>
  )
}
