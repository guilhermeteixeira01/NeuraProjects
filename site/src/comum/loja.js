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
// modo: undefined (normal) | 'jester' (chances iguais) | 'boost' (raridades altas mais prováveis); o preço do modo é o do servidor
export const abrirCaixa = (caixa, qtd, origem, modo) => chamar('/loja/abrir', { caixa, qtd, origem, ...(modo ? { modo } : {}) })
// Página da caixa: { itens, facas: [[{ nome, p, v }] por desgaste], modos: { jester|boost: { preco, chances } } }
export const lerDetalhesCaixa = (id) => chamar(`/loja/caixa?id=${id}`)
// Valor de venda de cada item do inventário: { <id do item>: { r: raridade 0..6, v: NP } } (o servidor calcula)
export const lerValores = async () => (await chamar('/loja/valores')).valores || {}
// Vende itens (skin, faca ou luva) por NP: { saldo, total, vendidos, inv }
export const venderItens = (ids) => chamar('/loja/vender', { ids })

// Carrossel de drops ao vivo (público): { agora, recentes, bons, top }, cada drop { id, ts, r, v, t, d, p, n?, i?, quem, nome, avatar, caixa }
export const lerDrops = () => fetch(`${base()}/loja/drops`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('drops'))))

// Caixas (nome, imagem, preço) sem a lista de itens: público, serve para dar nome às caixas fechadas do inventário
let publicas = null
export const lerCaixasPublicas = () => (publicas ??= fetch(`${base()}/loja/caixas`).then((r) => (r.ok ? r.json() : [])).catch(() => []))

// Saldo de NP (pontos ganhos - gastos). Avisa os outros lugares da página quando muda (evento np-saldo).
// O último saldo fica guardado no navegador (por conta): ao abrir o menu o número já aparece, sem esperar o servidor, e se atualiza em seguida.
let ultimo = null
let ultimoId = null
const CHAVE_SALDO = 'np_saldo'
const guardado = (id) => {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE_SALDO) || 'null')
    return g && g.id === id && Number.isFinite(g.saldo) ? g.saldo : null
  } catch {
    return null
  }
}
const guardar = (saldo) => {
  ultimo = saldo
  try {
    if (ultimoId) localStorage.setItem(CHAVE_SALDO, JSON.stringify({ id: ultimoId, saldo }))
  } catch {
    // sem localStorage: só não guarda
  }
}
export const avisarSaldo = (saldo) => {
  guardar(saldo)
  window.dispatchEvent(new CustomEvent('np-saldo', { detail: saldo }))
}
// gatilho: muda (ex.: o menu abriu) para buscar de novo na hora
export function useSaldo(steamId, ativo = true, gatilho = 0) {
  const [saldo, setSaldo] = useState(() => {
    if (steamId && ultimoId !== steamId) {
      ultimoId = steamId
      ultimo = guardado(steamId)
    }
    return ultimo
  })
  useEffect(() => {
    if (!steamId || !ativo || !CONFIG.loginSteam) return
    let vivo = true
    if (ultimoId !== steamId) {
      ultimoId = steamId
      ultimo = guardado(steamId)
      setSaldo(ultimo)
    }
    // Depois de buscar o saldo, pede as notificações: é a consulta do saldo que aplica um bônus novo e o aviso dele no sino (senão o sino chegava antes e só mostrava 1 min depois)
    const buscar = () =>
      lerSaldo().then(
        (r) => {
          if (!vivo) return
          guardar(r.saldo)
          setSaldo(r.saldo)
          window.dispatchEvent(new Event('np-notif-servidor'))
        },
        () => {},
      )
    buscar()
    const ouvir = (e) => setSaldo(e.detail)
    window.addEventListener('np-saldo', ouvir)
    window.addEventListener('np-mercado', buscar) // venderam um item meu: os NP entraram
    window.addEventListener('np-bonus', buscar) // bônus para todos
    window.addEventListener('focus', buscar) // voltou para a aba: pontos de partida, bônus Premium...
    return () => {
      vivo = false
      window.removeEventListener('np-saldo', ouvir)
      window.removeEventListener('np-mercado', buscar)
      window.removeEventListener('np-bonus', buscar)
      window.removeEventListener('focus', buscar)
    }
  }, [steamId, ativo, gatilho])
  return saldo
}
