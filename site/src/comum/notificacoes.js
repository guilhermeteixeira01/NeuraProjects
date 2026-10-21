// Histórico de notificações do sino (barra da direita). O que está pendente no servidor (convite de lobby, pedido de
// amizade) o painel lê direto de lobby.js / amigos.js; aqui fica o que já passou (partida nova, nível, skin, insígnia...).
// Fica GUARDADO NA CONTA (worker: GET/POST /notificacoes), então aparece em todos os aparelhos, e só some quando a pessoa clica em
// "Limpar". O navegador guarda uma cópia (np_notifs_<SteamID>) para abrir na hora e funcionar sem o worker; a junção das cópias
// (worker/steam-login/src/notif-core.js) nunca perde nada: nem nova, nem "lida", nem o "limpar".
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { tokenConta, useConta } from './conta.js'
import { docVazio, juntar, limparDoc } from '../../worker/steam-login/src/notif-core.js'

const EVENTO = 'np-notificacoes'
const chave = (id) => `np_notifs_${id}`
const chaveVistos = (id) => `np_notifs_vistos_${id}` // formato antigo (lista de ids à parte)

// Documento local { lista, vistos, limpoEm }; entende o formato antigo (só a lista)
function ler(id) {
  try {
    const bruto = JSON.parse(localStorage.getItem(chave(id)) || 'null')
    const doc = Array.isArray(bruto) ? { lista: bruto } : bruto || {}
    let vistos = []
    try {
      vistos = JSON.parse(localStorage.getItem(chaveVistos(id)) || '[]')
    } catch {
      // ignora
    }
    return limparDoc({ ...doc, vistos: [...(Array.isArray(vistos) ? vistos : []), ...(doc.vistos || [])] })
  } catch {
    return docVazio()
  }
}
function gravarLocal(id, doc) {
  try {
    localStorage.setItem(chave(id), JSON.stringify(doc))
  } catch {
    // sem armazenamento: só não fica a cópia neste aparelho
  }
}

// ── conta (worker) ──
const base = () => CONFIG.loginSteam.replace(/\/$/, '')
let enviando = null
let reenviar = false
async function sincronizar(id) {
  const token = tokenConta()
  if (!token || !CONFIG.loginSteam) return
  if (enviando) {
    reenviar = true // já tem um envio em andamento: manda de novo quando ele acabar, com o que mudou nesse meio-tempo
    return
  }
  enviando = (async () => {
    try {
      const r = await fetch(`${base()}/notificacoes`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ doc: ler(id) }) })
      if (!r.ok) return
      const { doc } = await r.json()
      if (doc) {
        gravarLocal(id, juntar(ler(id), doc))
        window.dispatchEvent(new Event(EVENTO))
      }
    } catch {
      // sem rede: fica só no aparelho e sobe na próxima
    } finally {
      enviando = null
      if (reenviar) {
        reenviar = false
        sincronizar(id)
      }
    }
  })()
}
let agenda = 0
const subir = (id) => {
  clearTimeout(agenda)
  agenda = setTimeout(() => sincronizar(id), 600)
}

function gravar(id, doc) {
  gravarLocal(id, doc)
  window.dispatchEvent(new Event(EVENTO))
  subir(id)
}

// { id, titulo, texto, link?, cargo?... } -> guarda como não lida. O mesmo id (ou o mesmo cargo) nunca entra duas vezes.
export function registrarNotificacao(steamId, n) {
  if (!steamId || !n?.id) return
  const doc = ler(steamId)
  if (doc.vistos.includes(n.id) || doc.lista.some((x) => x.id === n.id || (n.cargo && x.cargo === n.cargo))) return
  gravar(steamId, juntar(doc, { lista: [{ ...n, quando: Date.now(), lida: false }], vistos: [n.id], limpoEm: 0 }))
}

export function useNotificacoes() {
  const conta = useConta()
  const id = conta?.id
  const [doc, setDoc] = useState(docVazio())
  useEffect(() => {
    if (!id) return setDoc(docVazio())
    const atualizar = () => setDoc(ler(id))
    atualizar()
    sincronizar(id) // traz o que chegou nos outros aparelhos (e sobe o que só este tem)
    const periodico = setInterval(() => document.visibilityState === 'visible' && sincronizar(id), 60000)
    const voltou = () => document.visibilityState === 'visible' && sincronizar(id)
    const doServidor = () => sincronizar(id) // o worker gravou uma notificação na conta (ex.: item vendido no mercado)
    window.addEventListener('np-mercado', doServidor)
    window.addEventListener(EVENTO, atualizar)
    window.addEventListener('storage', atualizar)
    document.addEventListener('visibilitychange', voltou)
    return () => {
      clearInterval(periodico)
      window.removeEventListener('np-mercado', doServidor)
      window.removeEventListener(EVENTO, atualizar)
      window.removeEventListener('storage', atualizar)
      document.removeEventListener('visibilitychange', voltou)
    }
  }, [id])
  const lista = doc.lista.filter((x) => !String(x.id).startsWith('partida:')) // avisos de fim de partida não aparecem mais (os que já estavam guardados somem)
  return {
    lista,
    naoLidas: lista.filter((x) => !x.lida).length,
    marcarLidas: () => id && lista.some((x) => !x.lida) && gravar(id, juntar(ler(id), { lista: lista.map((x) => ({ ...x, lida: true })), vistos: [], limpoEm: 0 })),
    // Limpar: some em todos os aparelhos (o limpoEm sobe; o que veio antes dele nunca volta)
    limpar: () => id && gravar(id, { ...ler(id), lista: [], limpoEm: Date.now() }),
  }
}
