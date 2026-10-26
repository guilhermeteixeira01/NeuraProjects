// Conta do jogador (login pela Steam). O worker (site/worker/steam-login) confirma o login com a Steam e
// volta para a página com #steam=<token>; o token fica guardado no navegador até expirar ou a pessoa sair.
// O site só lê o conteúdo do token para mostrar (nome, avatar, SteamID); nada aqui depende de ele ser secreto.
import { useSyncExternalStore } from 'react'
import { CONFIG } from './config.js'

const CHAVE = 'np_conta'
const EVENTO = 'np-conta' // avisa os outros componentes da página que a conta mudou

function decodificar(token) {
  try {
    const corpo = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))
    const d = JSON.parse(new TextDecoder().decode(bytes))
    if (!/^\d{17}$/.test(d.id) || !(d.exp * 1000 > Date.now())) return null
    return { id: d.id, nome: String(d.nome || ''), avatar: String(d.avatar || ''), exp: d.exp }
  } catch {
    return null
  }
}

let tokenLido = undefined
let contaLida = null
function lerConta() {
  try {
    const token = import.meta.env.DEV && window.__npPreviewAtivo ? window.__npPreviewToken : localStorage.getItem(CHAVE)
    if (token !== tokenLido) {
      tokenLido = token
      contaLida = decodificar(token)
    }
    if (contaLida && contaLida.exp * 1000 <= Date.now()) contaLida = null
    return contaLida
  } catch { return null }
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
    const t = import.meta.env.DEV && window.__npPreviewAtivo ? window.__npPreviewToken : localStorage.getItem(CHAVE)
    return t && decodificar(t) ? t : null
  } catch {
    return null
  }
}

export const loginAtivo = () => Boolean(CONFIG.loginSteam)

// Antes de ir para a Steam, mostra os Termos de Uso (uma vez por versão) com a caixinha de aceite
export async function entrar() {
  if (import.meta.env.DEV && window.__npPreviewAtivo) {
    sessionStorage.removeItem('np-preview-saiu')
    location.reload()
    return
  }
  const { exigirTermos } = await import('./Termos.jsx')
  if (!(await exigirTermos())) return
  const volta = location.origin + location.pathname + location.search
  location.href = `${CONFIG.loginSteam.replace(/\/$/, '')}/login?volta=${encodeURIComponent(volta)}`
}

// irParaInicio: quem clicou em "Sair" volta para a página inicial. Login vencido (o worker respondeu 401) só
// limpa a conta e fica na página, para a mensagem "Seu login venceu" aparecer.
export function sair({ irParaInicio = false } = {}) {
  if (import.meta.env.DEV && window.__npPreviewAtivo) {
    sessionStorage.setItem('np-preview-saiu', '1')
    window.__npPreviewToken = null
    window.dispatchEvent(new Event(EVENTO))
    if (irParaInicio) location.assign('/')
    return
  }
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    // nada guardado
  }
  window.dispatchEvent(new Event(EVENTO))
  if (irParaInicio) location.assign('/')
}

// Conta logada (ou null). Começa null no HTML gerado e no primeiro render do navegador (iguais),
// e só depois lê o navegador.
const ouvintesConta = new Set()
const notificarConta = () => { for (const ouvir of ouvintesConta) ouvir() }
const aoGuardarConta = (e) => { if (!e.key || e.key === CHAVE) notificarConta() }
function assinarConta(ouvir) {
  if (!ouvintesConta.size) {
    capturarDaUrl()
    window.addEventListener(EVENTO, notificarConta)
    window.addEventListener('storage', aoGuardarConta)
  }
  ouvintesConta.add(ouvir)
  return () => {
    ouvintesConta.delete(ouvir)
    if (!ouvintesConta.size) {
      window.removeEventListener(EVENTO, notificarConta)
      window.removeEventListener('storage', aoGuardarConta)
    }
  }
}
const contaNoServidor = () => null
export function useConta() {
  // Snapshot único: montar um painel novo não simula um logout antes de ler a conta.
  return useSyncExternalStore(assinarConta, lerConta, contaNoServidor)
}

export const linkPerfil = (steamId) => `/perfil/?id=${encodeURIComponent(steamId)}`
