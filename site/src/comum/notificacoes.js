// Histórico de notificações do sino (barra da direita). O que está pendente no servidor (convite de lobby, pedido de
// amizade) o painel lê direto de lobby.js / amigos.js; aqui fica só o que já passou (partida nova, nível) e que a
// pessoa pode querer rever. Fica no navegador, por conta (np_notifs_<SteamID>), com as 30 mais novas.
import { useEffect, useState } from 'react'
import { useConta } from './conta.js'

const EVENTO = 'np-notificacoes'
const MAX = 30
const chave = (id) => `np_notifs_${id}`

function ler(id) {
  try {
    const l = JSON.parse(localStorage.getItem(chave(id)) || '[]')
    return Array.isArray(l) ? l : []
  } catch {
    return []
  }
}
function gravar(id, lista) {
  try {
    localStorage.setItem(chave(id), JSON.stringify(lista.slice(0, MAX)))
  } catch {
    // sem armazenamento: o histórico só não fica guardado
  }
  window.dispatchEvent(new Event(EVENTO))
}

// { id, titulo, texto, link?, rotulo? } -> guarda como não lida (o mesmo id não entra duas vezes)
export function registrarNotificacao(steamId, n) {
  if (!steamId || !n?.id) return
  const lista = ler(steamId)
  if (lista.some((x) => x.id === n.id)) return
  gravar(steamId, [{ ...n, quando: Date.now(), lida: false }, ...lista])
}

export function useNotificacoes() {
  const conta = useConta()
  const id = conta?.id
  const [lista, setLista] = useState([])
  useEffect(() => {
    if (!id) return setLista([])
    const atualizar = () => setLista(ler(id))
    atualizar()
    window.addEventListener(EVENTO, atualizar)
    window.addEventListener('storage', atualizar)
    return () => {
      window.removeEventListener(EVENTO, atualizar)
      window.removeEventListener('storage', atualizar)
    }
  }, [id])
  return {
    lista,
    naoLidas: lista.filter((x) => !x.lida).length,
    marcarLidas: () => id && lista.some((x) => !x.lida) && gravar(id, lista.map((x) => ({ ...x, lida: true }))),
    limpar: () => id && gravar(id, []),
  }
}
