// Loja de caixas (worker: src/loja.js): chamadas e o saldo de Neura Pontos que o menu da conta mostra.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { tokenConta } from './conta.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')

async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}${rota}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

export const lerLoja = () => chamar('/loja')
export const lerSaldo = () => chamar('/loja/saldo')
export const comprarCaixa = (caixa, qtd) => chamar('/loja/comprar', { caixa, qtd })
export const abrirCaixa = (caixa, qtd, origem) => chamar('/loja/abrir', { caixa, qtd, origem })
// Valor de venda de cada item do inventário: { <id do item>: { r: raridade 0..6, v: NP } } (o servidor calcula)
export const lerValores = async () => (await chamar('/loja/valores')).valores || {}
// Vende itens (skin, faca ou luva) por NP: { saldo, total, vendidos, inv }
export const venderItens = (ids) => chamar('/loja/vender', { ids })

// Caixas (nome, imagem, preço) sem a lista de itens: público, serve para dar nome às caixas fechadas do inventário
let publicas = null
export const lerCaixasPublicas = () => (publicas ??= fetch(`${base()}/loja/caixas`).then((r) => (r.ok ? r.json() : [])).catch(() => []))

// Saldo de NP (pontos ganhos - gastos). Avisa os outros lugares da página quando muda (evento np-saldo).
let ultimo = null
export const avisarSaldo = (saldo) => {
  ultimo = saldo
  window.dispatchEvent(new CustomEvent('np-saldo', { detail: saldo }))
}
export function useSaldo(steamId, ativo = true) {
  const [saldo, setSaldo] = useState(ultimo)
  useEffect(() => {
    if (!steamId || !ativo || !CONFIG.loginSteam) return
    let vivo = true
    lerSaldo().then((r) => vivo && (ultimo = r.saldo, setSaldo(r.saldo)), () => {})
    const ouvir = (e) => setSaldo(e.detail)
    window.addEventListener('np-saldo', ouvir)
    return () => {
      vivo = false
      window.removeEventListener('np-saldo', ouvir)
    }
  }, [steamId, ativo])
  return saldo
}
