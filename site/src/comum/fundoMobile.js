import { useLayoutEffect } from 'react'

const JANELAS = '[aria-modal="true"], .am-painel.am-celular, .nx-painel-mobile'

// Move apenas o contêiner estável do Layout, nunca os filhos que o React
// reconcilia. O estado e os portais das janelas continuam montados.
export function useFundoMobile(ref) {
  useLayoutEffect(() => {
    const conteudo = ref.current
    if (!conteudo) return
    const mobile = matchMedia('(max-width: 1024px)')
    const guardado = document.createDocumentFragment()
    const reserva = document.createElement('div')
    reserva.setAttribute('aria-hidden', 'true')
    reserva.dataset.fundoMobileReserva = ''
    let quadro = 0
    let restauracao = 0
    let rolagem = 0
    let foco = null
    let pausados = []
    let suspenso = false

    const restaurar = (retomar = true) => {
      if (!suspenso) return
      suspenso = false
      reserva.replaceWith(conteudo)
      document.documentElement.classList.remove('np-fundo-mobile-suspenso')
      if (retomar) {
        for (const media of pausados) media.play()?.catch(() => {})
        restauracao = requestAnimationFrame(() => {
          window.scrollTo({ top: rolagem, behavior: 'instant' })
          if (foco?.isConnected && !document.activeElement?.closest(JANELAS)) foco.focus({ preventScroll: true })
        })
      }
      pausados = []
    }
    const sincronizar = () => {
      quadro = 0
      const abertas = mobile.matches && [...document.querySelectorAll(JANELAS)]
        .some(el => !conteudo.contains(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      if (!abertas) { restaurar(); return }
      if (suspenso || !conteudo.isConnected) return
      cancelAnimationFrame(restauracao)
      rolagem = window.scrollY
      foco = conteudo.contains(document.activeElement) ? document.activeElement : null
      const estilo = getComputedStyle(conteudo)
      reserva.style.height = `${conteudo.getBoundingClientRect().height}px`
      reserva.style.marginTop = estilo.marginTop
      reserva.style.marginBottom = estilo.marginBottom
      pausados = [...conteudo.querySelectorAll('video, audio')].filter(media => !media.paused)
      for (const media of pausados) media.pause()
      conteudo.before(reserva)
      guardado.append(conteudo)
      suspenso = true
      document.documentElement.classList.add('np-fundo-mobile-suspenso')
    }
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(sincronizar)
    }
    const observer = new MutationObserver(agendar)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-modal', 'style'] })
    mobile.addEventListener('change', agendar)
    sincronizar()
    return () => {
      observer.disconnect()
      mobile.removeEventListener('change', agendar)
      cancelAnimationFrame(quadro)
      cancelAnimationFrame(restauracao)
      // Restaura antes de o React remover o Layout (inclui StrictMode/HMR).
      restaurar(false)
    }
  }, [ref])
}
