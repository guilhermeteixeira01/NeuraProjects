// Chat direto entre amigos (worker: src/amigos.js, GET/POST /dm). Mensagem nova chega pela conexão de presença (amigos.js: evento
// "np-dm") e atualiza a lista de conversas e, se a conversa estiver aberta nesta aba, a conversa também — sem recarregar nada.
//   conversa = { id, nome, avatar, st: 'online'|'ausente'|'offline', amigo, ts, texto (prévia), de (quem mandou por último), naoLidas }
//   mensagem = { id, de, texto, ts }
import { useEffect, useState } from 'react'
import { chamarApi } from './api.js'
import { useConta } from './conta.js'

const EVENTO = 'np-mensagens'

let estado = { conversas: null, msgs: {} } // msgs: { [idDoAmigo]: [mensagem] } (só guarda quem já foi aberto nesta aba)
let dono = null // SteamID de quem está logado (para saber se uma mensagem recebida é minha, de outra aba)
let abertaCom = null // id da conversa aberta agora nesta aba (não soma "não lida" dela e marca como lida sozinha)

const publicar = (novo) => {
  estado = { ...estado, ...novo }
  window.dispatchEvent(new Event(EVENTO))
}

export async function carregarConversas() {
  try {
    const d = await chamarApi('/dm')
    publicar({ conversas: d.conversas || [] })
  } catch {
    // mantém a lista que já tinha
  }
}

// Histórico com um amigo: o worker já marca como lida ao ler (zera naoLidas dessa conversa para quem pediu)
export async function carregarMensagens(com) {
  const d = await chamarApi(`/dm?com=${encodeURIComponent(com)}`)
  publicar({ msgs: { ...estado.msgs, [com]: d.mensagens || [] } })
  if (estado.conversas?.some((c) => c.id === com && c.naoLidas)) publicar({ conversas: estado.conversas.map((c) => (c.id === com ? { ...c, naoLidas: 0 } : c)) })
  return d.com
}

export async function enviarMensagem(com, texto) {
  const d = await chamarApi('/dm', { com, texto })
  publicar({ msgs: { ...estado.msgs, [com]: [...(estado.msgs[com] || []), d.msg] } })
  const existente = estado.conversas?.find((c) => c.id === com)
  if (existente) publicar({ conversas: [{ ...existente, ts: d.msg.ts, texto: d.msg.texto, de: d.msg.de }, ...estado.conversas.filter((c) => c.id !== com)] })
  else carregarConversas() // primeira mensagem para essa pessoa: busca a conversa nova com nome e foto
  return d.msg
}

// A conversa aberta na tela agora (ou null): evita contar "não lida" do que a pessoa já está vendo
export function definirConversaAberta(id) {
  abertaCom = id
}

function aoReceberDm(e) {
  const { de, para, msg } = e.detail
  const outro = de === dono ? para : de
  if (outro === abertaCom) {
    carregarMensagens(outro) // já está com a conversa aberta: busca de novo (marca como lida) e mostra a mensagem
    return
  }
  const existente = estado.conversas?.find((c) => c.id === outro)
  if (!existente) {
    carregarConversas() // conversa nova (primeira mensagem dessa pessoa): busca nome e foto certinhos
    return
  }
  const msgs = estado.msgs[outro]
  const souEu = de === dono
  const atualizada = { ...existente, ts: msg.ts, texto: msg.texto, de, naoLidas: souEu ? existente.naoLidas : (existente.naoLidas || 0) + 1 }
  publicar({
    msgs: msgs ? { ...estado.msgs, [outro]: [...msgs, msg] } : estado.msgs,
    conversas: [atualizada, ...estado.conversas.filter((c) => c.id !== outro)],
  })
}

let ligadoPara = null
function ligar(id) {
  dono = id
  if (ligadoPara === id) return
  ligadoPara = id
  estado = { conversas: null, msgs: {} }
  window.dispatchEvent(new Event(EVENTO))
  if (id) carregarConversas()
}

// Lista de conversas (sidebar) + helper para o total de mensagens não lidas (selo no botão de Amigos)
export function useConversas() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    window.addEventListener('np-dm', aoReceberDm)
    return () => {
      window.removeEventListener(EVENTO, ouvir)
      window.removeEventListener('np-dm', aoReceberDm)
    }
  }, [])
  useEffect(() => {
    ligar(conta?.id || null)
  }, [conta?.id])
  const conversas = estado.conversas || []
  const naoLidas = conversas.reduce((a, c) => a + (c.naoLidas || 0), 0)
  return { conversas, naoLidas, msgs: estado.msgs }
}

// "agora", "14:32" (hoje) ou "12/09" (mais antigo)
export function horaOuData(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
}
