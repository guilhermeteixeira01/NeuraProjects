import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'

// Lista de times (nome + logo): só os times criados no site (página /equipes/), lidos do worker sem precisar de login.
// Sempre devolve uma lista (vazia se nada funcionar).
// Guarda a resposta por 15s; forcar = ignora essa espera (no mínimo 5s entre leituras).
let cache = null
let quando = 0

export function carregarTimes(forcar) {
  if (cache && !forcar && Date.now() - quando < 15000) return cache
  if (cache && forcar && Date.now() - quando < 5000) return cache
  const anterior = cache
  quando = Date.now()
  cache = fetch(`${CONFIG.loginSteam}/equipes/publico`)
    .then((r) => {
      if (!r.ok) throw new Error(r.status)
      return r.json()
    })
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
