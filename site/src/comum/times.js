import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'

// Lista de times (nome + logo) cadastrada na página /times/.
// Lê pela API do GitHub (versão mais nova, na hora em que foi salva). Se a API falhar (limite de 60 leituras
// por hora por internet), usa o raw do GitHub (até 5 min de atraso) e depois a cópia publicada no site.
// Sempre devolve uma lista (vazia se nada funcionar).
// Guarda a resposta por 15s para não gastar o limite da API à toa; forcar = ignora essa espera.
let cache = null
let quando = 0

export function carregarTimes(forcar) {
  if (cache && !forcar && Date.now() - quando < 15000) return cache
  if (cache && forcar && Date.now() - quando < 5000) return cache

  const ler = (endereco, opcoes) =>
    fetch(endereco, { cache: 'no-store', ...opcoes }).then((r) => {
      if (!r.ok) throw new Error(r.status)
      return r.json()
    })
  const anterior = cache
  const { repositorio, branch, arquivoTimes } = CONFIG
  quando = Date.now()
  cache = ler(`https://api.github.com/repos/${repositorio}/contents/${arquivoTimes}?ref=${branch}`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  })
    .catch(() => ler(`https://raw.githubusercontent.com/${repositorio}/${branch}/${arquivoTimes}?t=${Date.now()}`))
    .catch(() => ler(`/${arquivoTimes}?t=${Date.now()}`))
    .then((dados) => (Array.isArray(dados?.times) ? dados.times : []))
    .catch(() => anterior || [])
  return cache
}

// Lista de times para os componentes. Recarrega quando você volta para a aba
// (pega o time que acabou de ser salvo na página /times/).
export function useTimes() {
  const [times, setTimes] = useState([])

  useEffect(() => {
    let ativo = true
    const carregar = (forcar) =>
      carregarTimes(forcar).then((lista) => {
        if (ativo && Array.isArray(lista)) setTimes(lista.filter((t) => t?.nome))
      })

    carregar(false)
    const voltou = () => {
      if (document.visibilityState === 'visible') carregar(true)
    }
    window.addEventListener('focus', voltou)
    document.addEventListener('visibilitychange', voltou)
    return () => {
      ativo = false
      window.removeEventListener('focus', voltou)
      document.removeEventListener('visibilitychange', voltou)
    }
  }, [])

  return times
}

// Time da lista com esse nome (sem diferenciar maiúscula/minúscula e espaços nas pontas)
export const acharTime = (times, nome) => {
  const busca = (nome || '').trim().toLowerCase()
  return busca ? times.find((t) => t.nome.trim().toLowerCase() === busca) : undefined
}
