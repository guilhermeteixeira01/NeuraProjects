import { useEffect } from 'react'
import Avisos from './Avisos.jsx'
import Nav from './Nav.jsx'
import Rodape from './Rodape.jsx'

// Elementos com a classe `seletor` ganham `classe` quando aparecem na tela (entram suavemente).
// Também pega os que surgem depois (lista que carrega da internet, troca de filtro...).
export function useRevelar(seletor = '.reveal', classe = 'is-visible', opcoes = { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }, aoRevelar) {
  useEffect(() => {
    const pendentes = () => document.querySelectorAll(`${seletor}:not(.${classe})`)
    const mostrar = (el) => {
      el.classList.add(classe)
      aoRevelar?.(el)
    }
    if (!('IntersectionObserver' in window)) {
      pendentes().forEach(mostrar)
      return
    }
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) {
          mostrar(e.target)
          obs.unobserve(e.target)
        }
      })
    }, opcoes)
    const observar = () => pendentes().forEach((el) => obs.observe(el))
    observar()
    const novos = new MutationObserver(observar)
    novos.observe(document.body, { childList: true, subtree: true })
    return () => {
      obs.disconnect()
      novos.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seletor, classe])
}

// Estrutura de toda página: menu, conteúdo, rodapé e avisos de novidade
export default function Layout({ pagina, children }) {
  useRevelar()
  return (
    <>
      <Nav pagina={pagina} />
      {children}
      <Rodape />
      <Avisos />
    </>
  )
}
