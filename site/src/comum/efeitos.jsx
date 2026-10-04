import { useEffect, useRef, useState } from 'react'

const reduzir = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Luz que segue o cursor: todo elemento com a classe "spot" recebe --mx/--my (posição do mouse nele, em px).
// O CSS usa isso num radial-gradient. Um ouvinte só para a página inteira.
export function useLuzCursor() {
  useEffect(() => {
    if (reduzir()) return
    let quadro = 0
    let ultimo = null
    const mover = (e) => {
      ultimo = e
      if (quadro) return
      quadro = requestAnimationFrame(() => {
        quadro = 0
        const el = ultimo.target instanceof Element ? ultimo.target.closest('.spot') : null
        if (!el) return
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${ultimo.clientX - r.left}px`)
        el.style.setProperty('--my', `${ultimo.clientY - r.top}px`)
      })
    }
    document.addEventListener('pointermove', mover, { passive: true })
    return () => {
      document.removeEventListener('pointermove', mover)
      cancelAnimationFrame(quadro)
    }
  }, [])
}

// Inclinação 3D seguindo o mouse (painel do topo). Devolve a ref para pôr no elemento.
export function useInclinar(maximo = 8) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reduzir() || !window.matchMedia('(hover: hover)').matches) return
    const mover = (e) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.setProperty('--ry', `${(x * maximo).toFixed(2)}deg`)
      el.style.setProperty('--rx', `${(-y * maximo).toFixed(2)}deg`)
    }
    const sair = () => {
      el.style.setProperty('--ry', '0deg')
      el.style.setProperty('--rx', '0deg')
    }
    el.addEventListener('pointermove', mover)
    el.addEventListener('pointerleave', sair)
    return () => {
      el.removeEventListener('pointermove', mover)
      el.removeEventListener('pointerleave', sair)
    }
  }, [maximo])
  return ref
}

// Número que conta de 0 até o valor quando aparece na tela
export function Contador({ valor, duracao = 1600, formatar = (v) => v.toLocaleString('pt-BR') }) {
  const ref = useRef(null)
  const [v, setV] = useState(valor)

  useEffect(() => {
    if (valor == null || reduzir()) return setV(valor)
    const el = ref.current
    let quadro
    const animar = () => {
      const inicio = performance.now()
      const passo = (agora) => {
        const t = Math.min(1, (agora - inicio) / duracao)
        setV(Math.round(valor * (1 - Math.pow(1 - t, 4))))
        if (t < 1) quadro = requestAnimationFrame(passo)
      }
      setV(0)
      quadro = requestAnimationFrame(passo)
    }
    if (!('IntersectionObserver' in window)) {
      animar()
      return () => cancelAnimationFrame(quadro)
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        obs.disconnect()
        animar()
      }
    })
    obs.observe(el)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(quadro)
    }
  }, [valor, duracao])

  return <span ref={ref}>{v == null ? '—' : formatar(v)}</span>
}
