import { useEffect, useState } from 'react'

// Um observador por área de rolagem, compartilhado por todas as linhas.
const grupos = new Map()

export function useLinhaVisivel(ref, limitar) {
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    if (!limitar) return
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setVisivel(true); return }
    const root = el.closest('.am-rolagem')
    let grupo = grupos.get(root)
    if (!grupo) {
      const callbacks = new Map()
      const observer = new IntersectionObserver(entradas => {
        for (const entrada of entradas) {
          const focada = entrada.target.contains(document.activeElement)
          callbacks.get(entrada.target)?.(entrada.isIntersecting || focada)
        }
      }, { root, rootMargin: '150px 0px' })
      grupo = { observer, callbacks }
      grupos.set(root, grupo)
    }
    grupo.callbacks.set(el, setVisivel)
    grupo.observer.observe(el)
    return () => {
      grupo.observer.unobserve(el)
      grupo.callbacks.delete(el)
      if (!grupo.callbacks.size) { grupo.observer.disconnect(); grupos.delete(root) }
    }
  }, [limitar, ref])
  return [!limitar || visivel, () => setVisivel(true)]
}
