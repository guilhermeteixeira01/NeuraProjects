// Conta do jogador (login pela Steam). O worker (site/worker/steam-login) confirma o login com a Steam e
// volta para a página com #steam=<token>; o token fica guardado no navegador até expirar ou a pessoa sair.
// O site só lê o conteúdo do token para mostrar (nome, avatar, SteamID); nada aqui depende de ele ser secreto.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'

const CHAVE = 'np_conta'
const EVENTO = 'np-conta' // avisa os outros componentes da página que a conta mudou

function decodificar(token) {
  try {
    const corpo = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))
    const d = JSON.parse(new TextDecoder().decode(bytes))
    if (!/^\d{17}$/.test(d.id) || !(d.exp * 1000 > Date.now())) return null
    return { id: d.id, nome: String(d.nome || ''), avatar: String(d.avatar || '') }
  } catch {
    return null
  }
}

function lerConta() {
  try {
    return decodificar(localStorage.getItem(CHAVE))
  } catch {
    return null
  }
}

// Chegou do login: guarda o token e tira ele do endereço (some do histórico e de quem copiar o link)
function capturarDaUrl() {
  const m = /^#steam(-erro)?=(.*)$/.exec(location.hash)
  if (!m) return
  if (!m[1] && decodificar(m[2])) {
    try {
      localStorage.setItem(CHAVE, m[2])
    } catch {
      // navegador sem armazenamento: o login vale só nesta página
    }
  }
  history.replaceState(null, '', location.pathname + location.search)
}

// Token guardado (o worker confere a assinatura ao salvar a moldura); null sem login ou vencido
export function tokenConta() {
  try {
    const t = localStorage.getItem(CHAVE)
    return t && decodificar(t) ? t : null
  } catch {
    return null
  }
}

export const loginAtivo = () => Boolean(CONFIG.loginSteam)

export function entrar() {
  const volta = location.origin + location.pathname + location.search
  location.href = `${CONFIG.loginSteam.replace(/\/$/, '')}/login?volta=${encodeURIComponent(volta)}`
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    // nada guardado
  }
  window.dispatchEvent(new Event(EVENTO))
}

// Conta logada (ou null). Começa null no HTML gerado e no primeiro render do navegador (iguais),
// e só depois lê o navegador.
export function useConta() {
  const [conta, setConta] = useState(null)
  useEffect(() => {
    capturarDaUrl()
    const ler = () => setConta(lerConta())
    ler()
    window.addEventListener(EVENTO, ler)
    window.addEventListener('storage', ler) // entrou/saiu em outra aba
    return () => {
      window.removeEventListener(EVENTO, ler)
      window.removeEventListener('storage', ler)
    }
  }, [])
  return conta
}

export const linkPerfil = (steamId) => `/perfil/?id=${encodeURIComponent(steamId)}`
