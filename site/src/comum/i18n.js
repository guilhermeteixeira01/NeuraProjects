// Idioma do site (Configurações ⚙ no topo e seletor do rodapé): português (padrão), inglês e espanhol.
//
// Como usar num componente:   const t = useT()   ...   t('Ver ranking')   t('faltam {n} para o nível {m}', { n, m })
// A chave é o próprio texto em português (fica legível no código e é a reserva quando falta tradução).
// As traduções ficam em ./idiomas/en.js e ./idiomas/es.js (mesma chave → texto traduzido).
//
// O HTML gerado no deploy sai em português. No navegador: o script do <head> esconde a página se o idioma
// guardado não for português, o React assume o HTML (em português), troca para o idioma guardado e mostra.
import { useEffect, useState } from 'react'
import en from './idiomas/en.js'
import es from './idiomas/es.js'

export const IDIOMAS = [
  { id: 'pt', nome: 'Português (Brasil)', html: 'pt-BR', local: 'pt-BR' },
  { id: 'en', nome: 'English', html: 'en', local: 'en-US' },
  { id: 'es', nome: 'Español', html: 'es', local: 'es-ES' },
]
const DICIONARIOS = { en, es }
const CHAVE = 'np_idioma'
export const EVENTO_IDIOMA = 'np-idioma'

let atual = 'pt' // idioma ativo nesta página

const valido = (id) => IDIOMAS.some((i) => i.id === id)
export const idiomaAtual = () => atual
export const localeAtual = () => IDIOMAS.find((i) => i.id === atual)?.local || 'pt-BR'

// Texto no idioma ativo (com {variáveis}); sem tradução, fica o português
export function traduzir(texto, vars, idioma = atual) {
  let s = (idioma !== 'pt' && DICIONARIOS[idioma]?.[texto]) || texto
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

// Troca o idioma na hora (e guarda no navegador)
export function aplicarIdioma(id) {
  const idioma = valido(id) ? id : 'pt'
  atual = idioma
  document.documentElement.lang = IDIOMAS.find((i) => i.id === idioma).html
  try {
    if (idioma === 'pt') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, idioma)
  } catch {
    // sem armazenamento: vale só nesta página
  }
  window.dispatchEvent(new Event(EVENTO_IDIOMA))
}

function lerGuardado() {
  try {
    const id = localStorage.getItem(CHAVE)
    return valido(id) ? id : 'pt'
  } catch {
    return 'pt'
  }
}

// Hook: devolve t() no idioma ativo. Começa em português (igual ao HTML gerado) e troca depois de montar.
export function useT() {
  const [idioma, setIdioma] = useState('pt')
  useEffect(() => {
    const ler = () => setIdioma(atual)
    if (atual === 'pt') atual = lerGuardado()
    ler()
    window.addEventListener(EVENTO_IDIOMA, ler)
    return () => window.removeEventListener(EVENTO_IDIOMA, ler)
  }, [])
  const t = (texto, vars) => traduzir(texto, vars, idioma)
  t.idioma = idioma
  t.local = IDIOMAS.find((i) => i.id === idioma)?.local || 'pt-BR'
  return t
}

// Mostra a página depois que o idioma guardado foi aplicado (o <head> escondeu para não piscar em português)
export function MostrarAposIdioma() {
  useEffect(() => {
    if (atual === 'pt') atual = lerGuardado()
    document.documentElement.lang = IDIOMAS.find((i) => i.id === atual).html
    // espera o React desenhar com o idioma novo antes de mostrar
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('i18n-trocando')))
  }, [])
  return null
}

// Data "dd/mm/aaaa" (ou "mm/dd/aaaa" em inglês) a partir das partes já separadas
export const dataNoIdioma = (ano, mes, dia, idioma = atual) => (idioma === 'en' ? `${mes}/${dia}/${ano}` : `${dia}/${mes}/${ano}`)
