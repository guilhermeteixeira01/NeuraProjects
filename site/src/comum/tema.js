// Tema do site (Personalizar → Tema): padrão (o de sempre), escuro otimizado ou claro otimizado.
// Vale para todas as páginas. Fica guardado no navegador (localStorage np_tema, aplicado já no <head> de cada
// página, antes de desenhar, então não pisca) e, com login, no perfil do worker (acompanha a pessoa em outros
// aparelhos: SincronizarTema aplica o tema salvo no perfil).
import { useEffect } from 'react'
import { useConta } from './conta.js'
import { usePerfis } from './Moldura.jsx'

export const TEMAS = [
  { id: 'padrao', nome: 'Padrão do site', descricao: 'O visual de sempre, com todos os efeitos e animações.' },
  { id: 'escuro', nome: 'Escuro otimizado', descricao: 'Escuro mais neutro e leve: sem partículas, brilhos e desfoques.' },
  { id: 'claro', nome: 'Claro otimizado', descricao: 'Fundo claro, ótimo de dia, também sem os efeitos pesados.' },
]
const CHAVE = 'np_tema'
const COR_BARRA = { padrao: '#0b0c0f', escuro: '#101114', claro: '#f2f4f8' } // <meta name="theme-color">

export const temaAtual = () => (typeof document === 'undefined' ? 'padrao' : document.documentElement.dataset.tema || 'padrao')

// Troca o tema na hora. guardar = salvar no navegador (a prévia do Personalizar não guarda)
export function aplicarTema(id, { guardar = true } = {}) {
  const tema = TEMAS.some((t) => t.id === id) ? id : 'padrao'
  const html = document.documentElement
  if (tema === 'padrao') delete html.dataset.tema
  else html.dataset.tema = tema
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_BARRA[tema])
  if (guardar) {
    try {
      if (tema === 'padrao') localStorage.removeItem(CHAVE)
      else localStorage.setItem(CHAVE, tema)
    } catch {
      // sem armazenamento: vale só nesta página
    }
  }
}

// Com login: o tema salvo no perfil (worker) vence o do navegador (trocou em outro aparelho)
export function SincronizarTema() {
  const conta = useConta()
  const tema = usePerfis()[conta?.id]?.tema
  useEffect(() => {
    if (tema && tema !== temaAtual()) aplicarTema(tema)
  }, [tema])
  return null
}
