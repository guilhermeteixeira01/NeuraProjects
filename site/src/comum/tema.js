// Tema do site (Configurações ⚙ → Tema): padrão (o de sempre), padrão branco (o mesmo, com todos os efeitos, em fundo
// branco), escuro otimizado ou claro otimizado.
// Vale para todas as páginas. Fica guardado no navegador (localStorage np_tema, aplicado já no <head> de cada
// página, antes de desenhar, então não pisca) e, com login, no perfil do worker (preferencias.js).

export const TEMAS = [
  { id: 'padrao', nome: 'Padrão do site', descricao: 'O visual de sempre, com todos os efeitos e animações.' },
  { id: 'branco', nome: 'Padrão branco', descricao: 'O visual completo do padrão, com todos os efeitos, em fundo branco.' },
  { id: 'escuro', nome: 'Escuro otimizado', descricao: 'Escuro mais neutro e leve: sem partículas, brilhos e desfoques.' },
  { id: 'claro', nome: 'Claro otimizado', descricao: 'Fundo claro, ótimo de dia, também sem os efeitos pesados.' },
]
const CHAVE = 'np_tema'
export const EVENTO_TEMA = 'np-tema'
const COR_BARRA = { padrao: '#0b0c0f', branco: '#f2f4f8', escuro: '#101114', claro: '#f2f4f8' } // <meta name="theme-color">

export const temaAtual = () => (typeof document === 'undefined' ? 'padrao' : document.documentElement.dataset.tema || 'padrao')

// Troca o tema na hora. guardar = salvar no navegador (false: só vale nesta página)
export function aplicarTema(id, { guardar = true } = {}) {
  const tema = TEMAS.some((t) => t.id === id) ? id : 'padrao'
  const html = document.documentElement
  if (tema === 'padrao') delete html.dataset.tema
  else html.dataset.tema = tema
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_BARRA[tema])
  window.dispatchEvent(new Event(EVENTO_TEMA)) // avisa quem mostra o tema (painel ⚙ Configurações)
  if (guardar) {
    try {
      if (tema === 'padrao') localStorage.removeItem(CHAVE)
      else localStorage.setItem(CHAVE, tema)
    } catch {
      // sem armazenamento: vale só nesta página
    }
  }
}
