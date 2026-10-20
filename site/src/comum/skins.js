// Skins do jogador: catálogo (public/assets/skins/*.json, gerado por ferramentas/skins/gerar-catalogo.mjs) e inventário salvo no worker
// (GET/POST /skins). O plugin BaseComp lê o mesmo inventário e aplica no servidor de CS2.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { tokenConta } from './conta.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')

export const IMG_BASE = 'https://community.akamai.steamstatic.com/economy/image/'
export const urlImg = (sufixo, tamanho = 256) => (sufixo ? `${IMG_BASE}${sufixo}/${tamanho}fx${tamanho}f` : '')

export const CATEGORIAS = [
  ['rifles', 'Rifles'],
  ['smgs', 'SMGs'],
  ['pistols', 'Pistolas'],
  ['heavy', 'Pesadas'],
]

export const inventarioVazio = () => ({ armas: {}, facas: {}, luvas: {}, agentes: {} })

// Catálogos: baixados uma vez por visita
const cache = {}
function carregar(nome) {
  if (!cache[nome]) {
    cache[nome] = fetch(`/assets/skins/${nome}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('catalogo'))))
      .catch((e) => {
        delete cache[nome] // tenta de novo na próxima vez
        throw e
      })
  }
  return cache[nome]
}

// nome: 'armas' | 'agentes' | 'adesivos'. Devolve { dados, erro }
export function useCatalogo(nome, ativo = true) {
  const [estado, setEstado] = useState({ dados: null, erro: false })
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    carregar(nome).then(
      (d) => vivo && setEstado({ dados: d, erro: false }),
      () => vivo && setEstado({ dados: null, erro: true }),
    )
    return () => {
      vivo = false
    }
  }, [nome, ativo])
  return estado
}

async function chamar(metodo, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/skins`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

export const lerInventario = () => chamar('GET')
export const salvarInventario = (inv) => chamar('POST', inv)
