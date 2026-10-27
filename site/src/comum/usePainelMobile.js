import { useEffect, useState } from 'react'

let bloqueios = 0

// Os painéis mobile são portais: não ficam presos ao recorte/transform da nav.
// O contador mantém o fundo travado até o último painel ser fechado.
export function usePainelMobile(aberto, ref) {
  const [celular, setCelular] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 1024px)')
    const atualizar = () => setCelular(q.matches)
    atualizar(); q.addEventListener('change', atualizar)
    return () => q.removeEventListener('change', atualizar)
  }, [])
  useEffect(() => {
    if (!aberto || !celular) return
    const anterior = document.activeElement
    bloqueios++
    document.documentElement.classList.add('np-painel-mobile-aberto')
    const raiz = () => ref?.current || document.querySelector('.am-painel.am-celular')
    const frame = requestAnimationFrame(() => raiz()?.querySelector('button[aria-label]')?.focus({ preventScroll: true }))
    const tecla = e => {
      if (e.key !== 'Tab') return
      const el = raiz(); if (!el) return
      const outro = document.activeElement?.closest('[role="dialog"]')
      if (outro && outro !== el) return // uma janela de senha/email tem seu próprio foco
      const itens = [...el.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(i => i.getClientRects().length)
      if (!itens.length) return
      const primeiro = itens[0], ultimo = itens[itens.length - 1]
      if (e.shiftKey && (document.activeElement === primeiro || !el.contains(document.activeElement))) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && (document.activeElement === ultimo || !el.contains(document.activeElement))) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', tecla)
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', tecla)
      if (--bloqueios === 0) {
        document.documentElement.classList.remove('np-painel-mobile-aberto')
        if (anterior?.isConnected) anterior.focus({ preventScroll: true })
      }
    }
  }, [aberto, celular, ref])
  return celular
}
