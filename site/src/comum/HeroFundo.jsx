import { Fragment, useEffect, useRef } from 'react'

// Pulsos de luz amarelos que correm pelas linhas da grade quadrada do fundo (a do <body>, em paginas.css:
// célula de 43px com a linha no último pixel), finos como numa fibra óptica. Cada cruzamento por onde o
// pulso passa acende e vai apagando devagar. Posição, direção, tamanho e velocidade são aleatórios.
// Mexa aqui para ajustar o efeito.
const CONFIG = {
  celula: 43, // tamanho do quadrado da grade
  deslocamento: 42.5, // posição da linha dentro da célula
  velocidade: [900, 1800], // px por segundo (maior = mais rápido)
  comprimento: [90, 240], // tamanho do rastro em px
  intervalo: [90, 320], // ms entre um rastro novo e outro (aleatório)
  espessura: 0.9, // fio fininho
  brilhoFio: 0.22, // halo suave ao redor do fio
  pontoRaio: 2.2, // tamanho do ponto aceso em cada cruzamento
  pontoDuracao: 750, // ms que o ponto leva para apagar
}

const rand = (min, max) => min + Math.random() * (max - min)

function rgbDe(cor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(cor)
  if (!m) return [245, 197, 66]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function RastrosGrade({ maximo }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const pai = canvas.parentElement
    const html = document.documentElement
    const ctx = canvas.getContext('2d')

    // Respeita "Melhorar desempenho", os temas otimizados (sem partículas) e movimento reduzido
    const desligado = () =>
      html.hasAttribute('data-desempenho') ||
      ['escuro', 'claro'].includes(html.getAttribute('data-tema')) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = pai.clientWidth
      h = pai.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(pai)

    const { celula, deslocamento } = CONFIG
    let rastros = []
    let pontos = [] // cruzamentos acesos: { x, y } na página + instante em que acenderam
    let proximo = 0
    let anterior = performance.now()
    let raf = 0
    let visivel = true

    let amarelo = ''
    let rgb = [245, 197, 66]
    const atualizaCor = () => {
      amarelo = getComputedStyle(html).getPropertyValue('--yellow').trim() || '#f5c542'
      rgb = rgbDe(amarelo)
    }
    atualizaCor()
    const obsTema = new MutationObserver(atualizaCor)
    obsTema.observe(html, { attributes: true, attributeFilter: ['data-tema'] })

    // pausa fora da tela
    const io = new IntersectionObserver(([e]) => (visivel = e.isIntersecting))
    io.observe(pai)

    // posição do canvas na página: as linhas da grade são fixas na página, não no topo
    const origem = () => {
      const r = canvas.getBoundingClientRect()
      return { x: r.left + window.scrollX, y: r.top + window.scrollY }
    }

    // índice do último cruzamento já ultrapassado pela cabeça (na coordenada da página)
    const indice = (r, o) => {
      const cabecaPagina = r.pos + (r.horizontal ? o.x : o.y)
      const k = (cabecaPagina - deslocamento) / celula
      return r.sentido > 0 ? Math.floor(k) : Math.ceil(k)
    }

    const criar = () => {
      const horizontal = Math.random() < 0.5
      const sentido = Math.random() < 0.5 ? 1 : -1
      const comp = rand(...CONFIG.comprimento)
      const vel = rand(...CONFIG.velocidade)
      const o = origem()
      const limite = horizontal ? w : h
      const linha = horizontal
        ? Math.round((o.y + rand(0, h) - deslocamento) / celula)
        : Math.round((o.x + rand(0, w) - deslocamento) / celula)
      const r = { horizontal, sentido, comp, vel, linha, pos: sentido > 0 ? -comp : limite + comp }
      r.ultimo = indice(r, o)
      rastros.push(r)
    }

    // acende os cruzamentos que a cabeça acabou de passar
    const acende = (r, o, agora) => {
      const atual = indice(r, o)
      for (let k = r.ultimo + r.sentido; r.sentido > 0 ? k <= atual : k >= atual; k += r.sentido) {
        const ao = k * celula + deslocamento
        const fixo = r.linha * celula + deslocamento
        pontos.push(r.horizontal ? { x: ao, y: fixo, t: agora } : { x: fixo, y: ao, t: agora })
      }
      r.ultimo = atual
    }

    const desenhaFio = (r, o) => {
      const fixo = r.linha * celula + deslocamento - (r.horizontal ? o.y : o.x)
      const cauda = r.pos - r.sentido * r.comp
      const [x0, y0, x1, y1] = r.horizontal ? [cauda, fixo, r.pos, fixo] : [fixo, cauda, fixo, r.pos]

      const g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`)
      g.addColorStop(1, amarelo)

      ctx.lineCap = 'round'
      ctx.strokeStyle = g
      // halo suave
      ctx.globalAlpha = CONFIG.brilhoFio
      ctx.lineWidth = CONFIG.espessura * 4
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      // fio fininho
      ctx.globalAlpha = 1
      ctx.lineWidth = CONFIG.espessura
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      // pontinha da luz
      ctx.fillStyle = '#fff'
      ctx.shadowColor = amarelo
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(x1, y1, CONFIG.espessura * 1.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    const desenhaPontos = (o, agora) => {
      pontos = pontos.filter((p) => agora - p.t < CONFIG.pontoDuracao)
      for (const p of pontos) {
        const x = p.x - o.x
        const y = p.y - o.y
        if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue
        const a = 1 - (agora - p.t) / CONFIG.pontoDuracao
        const f = a * a // apaga rápido no começo e devagar no fim
        // halo
        ctx.globalAlpha = f * 0.45
        ctx.fillStyle = amarelo
        ctx.shadowColor = amarelo
        ctx.shadowBlur = 14 * f
        ctx.beginPath()
        ctx.arc(x, y, CONFIG.pontoRaio * (1 + f), 0, Math.PI * 2)
        ctx.fill()
        // centro
        ctx.globalAlpha = f
        ctx.shadowBlur = 0
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, CONFIG.pontoRaio * 0.55, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
    }

    const quadro = (agora) => {
      const dt = Math.min((agora - anterior) / 1000, 0.05)
      anterior = agora
      raf = requestAnimationFrame(quadro)

      if (desligado() || !visivel) {
        if (rastros.length || pontos.length) {
          ctx.clearRect(0, 0, w, h)
          rastros = []
          pontos = []
        }
        return
      }

      if (agora >= proximo && rastros.length < maximo) {
        criar()
        proximo = agora + rand(...CONFIG.intervalo)
      }

      const o = origem()
      ctx.clearRect(0, 0, w, h)
      desenhaPontos(o, agora)
      rastros = rastros.filter((r) => {
        r.pos += r.sentido * r.vel * dt
        const limite = r.horizontal ? w : h
        const saiu = r.sentido > 0 ? r.pos - r.comp > limite : r.pos + r.comp < 0
        if (saiu) return false
        acende(r, o, agora)
        desenhaFio(r, o)
        return true
      })
    }
    raf = requestAnimationFrame(quadro)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      obsTema.disconnect()
    }
  }, [maximo])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

// Fundo do topo das páginas: brilhos azul/amarelo, chão de grade em perspectiva andando e pulsos de luz
// amarelos aleatórios correndo pela grade. Vai como primeiro filho da <section className="hero"> (que já é
// position: relative + overflow: hidden). `quantidade` agora controla quantos rastros ao mesmo tempo.
export function FundoHero({ quantidade = 14, chao = true }) {
  return (
    <>
      <div className="hero-glow hero-glow-1" />
      <div className="hero-glow hero-glow-2" />
      <div className="fx-fundo" aria-hidden="true">
        {chao && <div className="fx-chao" />}
        <RastrosGrade maximo={Math.max(4, Math.round(quantidade * 1.3))} />
      </div>
    </>
  )
}

// Título que entra palavra por palavra. O espaço fica fora do <span>: dentro de inline-block ele sumiria.
export function Palavras({ texto, inicio = 0 }) {
  return texto.split(' ').map((p, i) => (
    <Fragment key={i}>
      <span className="fx-palavra" style={{ '--w': inicio + i }}>
        {p}
      </span>{' '}
    </Fragment>
  ))
}