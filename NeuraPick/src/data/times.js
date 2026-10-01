import { useEffect, useState } from 'react'

// Lista de times cadastrados no site (página /times/): nome + logo.
// Quem carrega é o /assets/js/site.js (window.NEURA.carregarTimes); sem ele, a lista fica vazia.
// Recarrega quando você volta para a aba/janela do Pick & Ban (pega o time que acabou de ser salvo).
export function useTimes() {
  const [times, setTimes] = useState([])

  useEffect(() => {
    let ativo = true
    const carregar = (forcar) =>
      window.NEURA?.carregarTimes?.(forcar).then((lista) => {
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
