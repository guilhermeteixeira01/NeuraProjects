// Chat direto entre amigos (worker: src/amigos.js, GET/POST /dm). Mensagem nova chega pela conexão de presença (amigos.js: evento
// "np-dm") e atualiza a lista de conversas e, se a conversa estiver aberta nesta aba, a conversa também — sem recarregar nada.
//   conversa = { id, nome, avatar, st: 'online'|'ausente'|'offline', amigo, ts, texto (prévia), de (quem mandou por último), naoLidas }
//   mensagem = { id, de, texto, ts }
import { useEffect, useState } from 'react'
import { criarAtualizador } from './atualizador.js'
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

const leituraConversas = criarAtualizador({
  ler: async () => { const autor = dono; return { autor, dados: await chamarApi('/dm') } },
  aplicar: ({ autor, dados }) => autor === dono && publicar({ conversas: dados.conversas || [] }),
})
export const carregarConversas = (nova = false) => nova ? leituraConversas.atualizar() : leituraConversas.carregar()
const leiturasMensagens = new Map()
export async function carregarMensagens(com, nova = false) {
  let consulta = leiturasMensagens.get(com)
  if (!consulta) {
    consulta = { info: null }
    consulta.leitura = criarAtualizador({
      ler: async () => { const autor = dono; return { autor, dados: await chamarApi(`/dm?com=${encodeURIComponent(com)}`) } },
      aplicar: ({ autor, dados: d }) => {
        if (autor !== dono) return
        consulta.info = d.com
        publicar({ msgs: { ...estado.msgs, [com]: d.mensagens || [] } })
        if (estado.conversas?.some((c) => c.id === com && c.naoLidas)) publicar({ conversas: estado.conversas.map((c) => c.id === com ? { ...c, naoLidas: 0 } : c) })
      },
      aoErro: (e) => { throw e },
    })
    leiturasMensagens.set(com, consulta)
  }
  await (nova ? consulta.leitura.atualizar() : consulta.leitura.carregar())
  return consulta.info
}

export async function enviarMensagem(com, texto) {
  const autor = dono
  const d = await chamarApi('/dm', { com, texto })
  if (autor !== dono) return d.msg
  publicar({ msgs: { ...estado.msgs, [com]: [...(estado.msgs[com] || []).filter((m) => m.id !== d.msg.id), d.msg] } })
  const existente = estado.conversas?.find((c) => c.id === com)
  if (existente) publicar({ conversas: [{ ...existente, ts: d.msg.ts, texto: d.msg.texto, de: d.msg.de }, ...estado.conversas.filter((c) => c.id !== com)] })
  else carregarConversas() // primeira mensagem para essa pessoa: busca a conversa nova com nome e foto
  return d.msg
}

export async function apagarChat(com, mensagem) {
  await chamarApi('/dm', { com, acao: mensagem ? 'apagar-mensagem' : 'apagar-conversa', mensagem })
  await Promise.all([carregarMensagens(com, true), carregarConversas(true)])
}

function aoAtualizarDm(e) {
  const outro = e.detail.de === dono ? e.detail.para : e.detail.de
  carregarConversas(true)
  if (outro === abertaCom) carregarMensagens(outro, true).catch(() => {})
  else if (estado.msgs[outro]) {
    const msgs = { ...estado.msgs }
    delete msgs[outro]
    publicar({ msgs })
  }
}

// A conversa aberta na tela agora (ou null): evita contar "não lida" do que a pessoa já está vendo
export function definirConversaAberta(id) {
  abertaCom = id
}

function aoReceberDm(e) {
  const { de, para, msg } = e.detail
  const outro = de === dono ? para : de
  if (outro === abertaCom) {
    carregarMensagens(outro, true).catch(() => {}) // já está com a conversa aberta: busca de novo (marca como lida) e mostra a mensagem
    return
  }
  const existente = estado.conversas?.find((c) => c.id === outro)
  if (!existente) {
    carregarConversas(true) // conversa nova (primeira mensagem dessa pessoa): busca nome e foto certinhos
    return
  }
  const msgs = estado.msgs[outro]
  const souEu = de === dono
  const atualizada = { ...existente, ts: msg.ts, texto: msg.texto, de, naoLidas: souEu ? existente.naoLidas : (existente.naoLidas || 0) + 1 }
  publicar({
    msgs: msgs ? { ...estado.msgs, [outro]: [...msgs.filter((m) => m.id !== msg.id), msg] } : estado.msgs,
    conversas: [atualizada, ...estado.conversas.filter((c) => c.id !== outro)],
  })
}

let eventosLigados = false
const sincronizarChats = () => {
  carregarConversas(true)
  if (abertaCom) carregarMensagens(abertaCom, true).catch(() => {})
}
let ligadoPara = null
function ligar(id) {
  if (!eventosLigados) {
    eventosLigados = true
    window.addEventListener('np-dm', aoReceberDm)
    window.addEventListener('np-dm-atualizou', aoAtualizarDm)
    window.addEventListener('np-reconectou', sincronizarChats)
  }
  dono = id
  if (ligadoPara === id) return
  ligadoPara = id
  leituraConversas.descartar()
  for (const consulta of leiturasMensagens.values()) consulta.leitura.descartar()
  leiturasMensagens.clear()
  estado = { conversas: null, msgs: {} }
  window.dispatchEvent(new Event(EVENTO))
  if (id) carregarConversas(true)
}

// Lista de conversas (sidebar) + helper para o total de mensagens não lidas (selo no botão de Amigos)
export function useConversas() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    return () => {
      window.removeEventListener(EVENTO, ouvir)
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
