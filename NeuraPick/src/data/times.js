import { useEffect, useState } from 'react'

// Lista de times cadastrados no site (página /times/): nome + logo.
// Quem carrega é o /assets/js/site.js (window.NEURA.carregarTimes); sem ele, a lista fica vazia.
export function useTimes() {
  const [times, setTimes] = useState([])

  useEffect(() => {
    let ativo = true
    window.NEURA?.carregarTimes?.().then((lista) => {
      if (ativo) setTimes(Array.isArray(lista) ? lista.filter((t) => t?.nome) : [])
    })
    return () => {
      ativo = false
    }
  }, [])

  return times
}

// Time da lista com esse nome (sem diferenciar maiúscula/minúscula e espaços nas pontas)
export const acharTime = (times, nome) => {
  const busca = (nome || '').trim().toLowerCase()
  return busca ? times.find((t) => t.nome.trim().toLowerCase() === busca) : undefined
}
