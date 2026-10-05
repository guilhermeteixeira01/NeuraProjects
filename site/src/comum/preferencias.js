// Preferências de quem olha o site (⚙ Configurações e seletor do rodapé): tema, idioma e "melhorar desempenho".
// Sempre ficam no navegador. Com login, também ficam no perfil do worker (campos tema, idioma e desempenho):
// valem em qualquer aparelho em que a pessoa entrar, e a conta vence o que estava no navegador.
import { useEffect } from 'react'
import { tokenConta, useConta } from './conta.js'
import { aplicarDesempenho, desempenhoAtivo } from './desempenho.js'
import { aplicarIdioma, idiomaEscolhido } from './i18n.js'
import { salvarPerfil, usePerfis } from './Moldura.jsx'
import { aplicarTema, temaAtual } from './tema.js'

// Guarda na conta (se estiver logado). mudar = { tema?, idioma?, desempenho?: 'ligado' | 'desligado' }
function salvarNaConta(mudar) {
  if (tokenConta()) salvarPerfil(mudar).catch(() => {}) // fora do ar: fica só neste navegador
}

export function escolherTema(id) {
  aplicarTema(id)
  salvarNaConta({ tema: temaAtual() })
}

export function escolherIdioma(id) {
  aplicarIdioma(id)
  salvarNaConta({ idioma: idiomaEscolhido() })
}

export function escolherDesempenho(ligado) {
  aplicarDesempenho(ligado)
  salvarNaConta({ desempenho: ligado ? 'ligado' : 'desligado' })
}

// Com login: aplica o que está salvo na conta (trocou em outro aparelho, ou acabou de entrar).
// Cada efeito só roda quando o valor da conta muda, então uma troca feita aqui não é desfeita por uma leitura antiga.
export function SincronizarPreferencias() {
  const conta = useConta()
  const p = usePerfis()[conta?.id] || {}
  useEffect(() => {
    if (p.tema && p.tema !== temaAtual()) aplicarTema(p.tema)
  }, [p.tema])
  useEffect(() => {
    if (p.idioma && p.idioma !== idiomaEscolhido()) aplicarIdioma(p.idioma)
  }, [p.idioma])
  useEffect(() => {
    if (!p.desempenho) return
    const ligado = p.desempenho === 'ligado'
    if (ligado !== desempenhoAtivo()) aplicarDesempenho(ligado)
  }, [p.desempenho])
  return null
}
