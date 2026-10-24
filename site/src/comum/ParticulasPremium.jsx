// Partículas do sistema Premium: faíscas que sobem com brilho aditivo, em tons dourados (ou na cor passada em `cor`, "r,g,b").
// Vai dentro de um elemento position: relative; o canvas cobre tudo e não pega clique. Fica parado com "Melhorar desempenho"
// ou movimento reduzido, e no celular (mesma regra do HeroFundo).
import { useEffect, useRef } from 'react'
import { ehCelular } from './desempenho.js'

const TONS = ['255,211,77', '255,157,46', '255,236,170']

export default function ParticulasPremium({ quantidade = 26, cor, estrelas = true }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const html = document.documentElement
    if (html.hasAttribute('data-desempenho') || ehCelular() || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const x = c.getContext('2d')
    const dpr = Math.min(devicePixelRatio || 1, 2)
    let W = 0
    let H = 0
    let quadro = 0
    const rand = (a, b) => a + Math.random() * (b - a)
    const medir = () => {
      W = c.width = Math.round(c.clientWidth * dpr)
      H = c.height = Math.round(c.clientHeight * dpr)
    }
    const nova = (aleatoria) => ({
      x: rand(0, W),
      y: aleatoria ? rand(0, H) : H + rand(0, 20) * dpr,
      r: rand(0.8, 2.6) * dpr,
      vy: -rand(0.25, 0.9) * dpr,
      vx: rand(-0.2, 0.2) * dpr,
      fase: rand(0, 6.28),
      vf: rand(0.02, 0.06),
      cor: cor || TONS[Math.floor(Math.random() * TONS.length)],
      estrela: estrelas && Math.random() < 0.28,
    })
    medir()
    const ps = Array.from({ length: quantidade }, () => nova(true))
    const ro = new ResizeObserver(medir)
    ro.observe(c)
    const desenhar = () => {
      x.clearRect(0, 0, W, H)
      x.globalCompositeOperation = 'lighter'
      for (let i = 0; i < ps.length; i++) {
        let p = ps[i]
        p.fase += p.vf
        p.y += p.vy
        p.x += p.vx + Math.sin(p.fase) * 0.3 * dpr
        if (p.y < -10) p = ps[i] = nova(false)
        const a = 0.3 + 0.6 * Math.abs(Math.sin(p.fase))
        const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        g.addColorStop(0, `rgba(${p.cor},${a})`)
        g.addColorStop(1, `rgba(${p.cor},0)`)
        x.fillStyle = g
        x.beginPath()
        x.arc(p.x, p.y, p.r * 4, 0, 6.283)
        x.fill()
        if (p.estrela) {
          // brilho em cruz (estrelinha)
          x.strokeStyle = `rgba(255,255,255,${a * 0.8})`
          x.lineWidth = dpr
          const l = p.r * 5 * (0.6 + 0.4 * Math.sin(p.fase * 2))
          x.beginPath()
          x.moveTo(p.x - l, p.y)
          x.lineTo(p.x + l, p.y)
          x.moveTo(p.x, p.y - l)
          x.lineTo(p.x, p.y + l)
          x.stroke()
        }
      }
      x.globalCompositeOperation = 'source-over'
      quadro = requestAnimationFrame(desenhar)
    }
    desenhar()
    return () => {
      cancelAnimationFrame(quadro)
      ro.disconnect()
    }
  }, [quantidade, cor, estrelas])
  return <canvas ref={ref} className="ppm-canvas" aria-hidden="true" />
}
