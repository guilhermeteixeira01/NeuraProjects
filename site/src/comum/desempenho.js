// Modo "Melhorar desempenho" (Configurações ⚙ no topo): desliga animações, transições e efeitos visuais
// (partículas, brilhos, desfoque, luz do cursor, contadores animados). Fica no navegador (localStorage
// np_desempenho) e é aplicado já no <head> de cada página (html[data-desempenho="1"]).
const CHAVE = 'np_desempenho'
export const EVENTO_DESEMPENHO = 'np-desempenho'

export const desempenhoAtivo = () => typeof document !== 'undefined' && document.documentElement.dataset.desempenho === '1'

export function aplicarDesempenho(ligado) {
  const html = document.documentElement
  if (ligado) html.dataset.desempenho = '1'
  else delete html.dataset.desempenho
  try {
    if (ligado) localStorage.setItem(CHAVE, '1')
    else localStorage.removeItem(CHAVE)
  } catch {
    // sem armazenamento: vale só nesta página
  }
  window.dispatchEvent(new Event(EVENTO_DESEMPENHO))
}
