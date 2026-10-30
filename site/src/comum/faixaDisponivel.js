import { useLayoutEffect } from 'react'

// Usa a área real entre as barras laterais, inclusive com o zoom do desktop.
export function useFaixaDisponivel(ref, margem = 12) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const pai = el.parentElement
    const mobile = window.matchMedia('(max-width: 1024px)')
    let quadro = 0
    const ajustar = () => {
      quadro = 0
      if (!el.isConnected || !pai.offsetWidth) return
      const estilo = getComputedStyle(document.body)
      const esquerda = parseFloat(estilo.paddingLeft) || 0
      const direita = parseFloat(estilo.paddingRight) || 0
      const rect = pai.getBoundingClientRect()
      const escala = rect.width / pai.offsetWidth || 1
      const inicioPai = rect.left / escala + (parseFloat(getComputedStyle(pai).paddingLeft) || 0)
      const folga = mobile.matches ? 0 : margem
      const largura = Math.max(0, document.body.clientWidth - esquerda - direita - folga * 2)
      el.style.width = `${largura}px`
      el.style.marginLeft = `${esquerda + folga - inicioPai}px`
      el.style.marginRight = '0px'
    }
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(ajustar) }
    const observer = new ResizeObserver(agendar)
    observer.observe(document.body)
    observer.observe(pai)
    window.addEventListener('resize', agendar)
    mobile.addEventListener('change', agendar)
    ajustar()
    return () => {
      cancelAnimationFrame(quadro)
      observer.disconnect()
      window.removeEventListener('resize', agendar)
      mobile.removeEventListener('change', agendar)
    }
  }, [ref, margem])
}
