import { Suspense, lazy, useEffect } from 'react'
import Avisos from './Avisos.jsx'
import AvisoConvite from './AvisoConvite.jsx'
import AceitarPartida from './AceitarPartida.jsx'
import AvisoNivel from './AvisoNivel.jsx'
import AvisoInsignia from './Insignias.jsx'
import AvisoSkin from './AvisoSkin.jsx'
import { AvisoTroca } from './Trocas.jsx'
import AvisoPontos from './AvisoPontos.jsx'
import { useLuzCursor } from './efeitos.jsx'
import Nav from './Nav.jsx'
import { useSeguranca } from './seguranca.js'
import { SincronizarPreferencias } from './preferencias.js'
import { MostrarAposIdioma } from './i18n.js'

const BoasVindas = lazy(() => import('./BoasVindas.jsx'))

// A janela de boas-vindas (apelido + senha, com a validação dos campos) só baixa para quem ainda precisa dela:
// logado e sem apelido ou sem senha (as mesmas condições em que BoasVindas abre).
function PortaoBoasVindas() {
  const seg = useSeguranca()
  if (!seg || (seg.nick && seg.temSenha)) return null
  return (
    <Suspense fallback={null}>
      <BoasVindas />
    </Suspense>
  )
}

// Elementos com a classe `seletor` ganham `classe` quando aparecem na tela (entram suavemente).
// Também pega os que surgem depois (lista que carrega da internet, troca de filtro...).
export function useRevelar(seletor = '.reveal', classe = 'is-visible', opcoes = { threshold: 0.12, rootMargin: '80px 0px' }, aoRevelar) {
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
    const vistos = new WeakSet()
    const observarUm = (el) => {
      if (vistos.has(el)) return
      vistos.add(el)
      obs.observe(el)
    }
    const observar = (raiz = document) => {
      if (raiz instanceof Element && raiz.matches(`${seletor}:not(.${classe})`)) observarUm(raiz)
      raiz.querySelectorAll(`${seletor}:not(.${classe})`).forEach(observarUm)
    }
    observar()
    const novos = new MutationObserver((registros) => {
      for (const registro of registros) for (const no of registro.addedNodes) {
        if (no instanceof Element) observar(no)
      }
    })
    novos.observe(document.body, { childList: true, subtree: true })
    return () => {
      obs.disconnect()
      novos.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seletor, classe])
}

// Estrutura de toda página: menu, conteúdo e avisos de novidade (o site não tem mais rodapé)
export default function Layout({ pagina, children }) {
  useRevelar()
  useLuzCursor() // cards com a classe "spot" ganham a luz que segue o cursor
  // Trocar de página: se a próxima demorar, aparece o carregamento da NP por cima (some sozinho quando a página nova abre).
  // Só links do próprio site, sem Ctrl/Shift, que não abrem em outra aba nem baixam nada.
  useEffect(() => {
    let tela = null
    let relogio = 0
    const sumir = () => {
      clearTimeout(relogio)
      tela?.remove()
      tela = null
    }
    const clicar = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return
      relogio = setTimeout(() => {
        if (tela) return
        tela = document.createElement('div')
        tela.className = 'cnp-nav'
        tela.innerHTML = '<div class="cnp cnp-tela"><div class="cnp-anel" aria-hidden="true">' + Array.from({ length: 12 }, (_, i) => '<i style="--i:' + i + '"></i>').join('') + '<img src="/assets/logos/logo-np-64.png" alt="" width="48" height="48"></div></div>'
        document.body.appendChild(tela)
      }, 180)
    }
    document.addEventListener('click', clicar)
    window.addEventListener('pageshow', sumir) // voltar pelo navegador (a página volta do cache): tira o carregamento
    return () => {
      document.removeEventListener('click', clicar)
      window.removeEventListener('pageshow', sumir)
      sumir()
    }
  }, [])
  // Imagens não podem ser arrastadas (o CSS -webkit-user-drag não vale no Firefox)
  useEffect(() => {
    const bloquear = (e) => e.target instanceof HTMLImageElement && e.preventDefault()
    document.addEventListener('dragstart', bloquear)
    return () => document.removeEventListener('dragstart', bloquear)
  }, [])
  return (
    <>
      <Nav pagina={pagina} />
      {children}
      <PortaoBoasVindas />
      <Avisos />
      <AvisoConvite />
      <AceitarPartida />
      <AvisoNivel />
      <AvisoInsignia />
      <AvisoSkin />
      <AvisoTroca />
      <AvisoPontos />
      <SincronizarPreferencias />
      <MostrarAposIdioma />
    </>
  )
}
