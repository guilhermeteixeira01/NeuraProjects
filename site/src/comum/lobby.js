// Lobby (grupo para jogar junto). O worker guarda os lobbies (src/amigos.js, GET/POST /lobby) e avisa pela conexão de
// presença (mensagem "lobby", vira o evento np-lobby em amigos.js) quando algo muda; aqui a página lê e muda.
//   dados = { eu, lider, souLider, publico, max, membros: [pessoa] (líder primeiro), convites: [pessoa],
//             convitesRecebidos: [{ lider: pessoa, membros }], abertos: [{ lider: pessoa, membros }] }
//   pessoa = { id, nome, avatar, st: 'online' | 'ausente' | 'offline' }
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { tokenConta, useConta } from './conta.js'

const EVENTO = 'np-lobby-estado'
const base = () => CONFIG.loginSteam.replace(/\/$/, '')

let estado = { dados: null, erro: '' }
const publicar = (novo) => {
  estado = { ...estado, ...novo }
  window.dispatchEvent(new Event(EVENTO))
}

async function chamar(metodo, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/lobby`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

export async function carregarLobby() {
  try {
    publicar({ dados: await chamar('GET'), erro: '' })
  } catch (e) {
    publicar({ erro: e.message })
  }
}

// convidar | remover | entrar | recusar | sair | publico   (id = SteamID do alvo ou do líder; valor = true/false no "publico")
export async function acaoLobby(acao, id, valor) {
  const d = await chamar('POST', { acao, id, valor })
  publicar({ dados: d, erro: '' })
  return d
}

// Estado do lobby de quem está logado; atualiza sozinho (aviso ao vivo do worker, ao voltar para a aba e a cada 20 s)
export function useLobby() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    return () => window.removeEventListener(EVENTO, ouvir)
  }, [])
  useEffect(() => {
    if (!conta?.id || !CONFIG.loginSteam) return
    carregarLobby()
    const recarregar = () => document.visibilityState === 'visible' && carregarLobby()
    window.addEventListener('np-lobby', carregarLobby)
    window.addEventListener('focus', recarregar)
    document.addEventListener('visibilitychange', recarregar)
    const relogio = setInterval(recarregar, 20000)
    return () => {
      window.removeEventListener('np-lobby', carregarLobby)
      window.removeEventListener('focus', recarregar)
      document.removeEventListener('visibilitychange', recarregar)
      clearInterval(relogio)
    }
  }, [conta?.id])
  return { ...estado, conta }
}
