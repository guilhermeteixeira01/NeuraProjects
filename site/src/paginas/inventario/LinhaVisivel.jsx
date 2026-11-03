import { useEffect, useRef, useState } from 'react'

const ouvintes = new WeakMap()
let observador

function observar(elemento, atualizar) {
  observador ??= new IntersectionObserver(entradas => {
    for (const entrada of entradas) {
      ouvintes.get(entrada.target)?.(entrada.isIntersecting)
    }
  })
  ouvintes.set(elemento, atualizar)
  observador.observe(elemento)
  return () => {
    observador.unobserve(elemento)
    ouvintes.delete(elemento)
  }
}

export default function LinhaVisivel({ compacto, caixa, children }) {
  const ref = useRef(null)
  const [visivel, setVisivel] = useState(false)
  const [comFoco, setComFoco] = useState(false)
  const montado = visivel || comFoco
  const altura = useRef(0)

  useEffect(() => {
    if (!montado) return
    const elemento = ref.current
    const medir = () => { altura.current = elemento.getBoundingClientRect().height }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const medidas = new ResizeObserver(medir)
    medidas.observe(elemento)
    return () => medidas.disconnect()
  }, [montado])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true)
      return
    }
    return observar(ref.current, setVisivel)
  }, [])

  return (
    <li
      ref={ref}
      className={montado ? 'inv-cartao-li' : `inv-cartao-li inv-card-janela${compacto ? ' inv-card-janela-compacto' : ''}${caixa ? ' inv-card-janela-caixa' : ''}`}
      style={!montado && altura.current ? { height: altura.current } : undefined}
      aria-hidden={montado ? undefined : true}
      onFocus={() => setComFoco(true)}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setComFoco(false)
      }}
    >
      {montado && children}
    </li>
  )
}
