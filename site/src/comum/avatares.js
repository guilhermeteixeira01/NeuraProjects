// Foto atual da Steam de cada jogador. A foto que vem nas partidas (ranking, perfil, página da partida) é a do dia em que
// a pessoa jogou, e a do login é a do dia em que entrou; quem troca a foto na Steam continuaria com a velha.
// useAvatar(id, padrao) mostra a que já tem (padrao) e troca pela atual quando o worker responde (GET /avatares,
// até 100 por chamada, com cache de 30 min lá). Os pedidos da página toda são juntados numa chamada só.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'

const EVENTO = 'np-avatares'
const ID = /^\d{17}$/
const atuais = new Map() // id -> url atual
const pedidos = new Set() // esperando a próxima chamada
const buscados = new Set() // já pedidos (não pede de novo nesta página)
let espera = null

async function buscar() {
  espera = null
  const ids = [...pedidos]
  pedidos.clear()
  const base = CONFIG.loginSteam.replace(/\/$/, '')
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const r = await fetch(`${base}/avatares?ids=${ids.slice(i, i + 100).join(',')}`)
      const d = r.ok ? await r.json() : {}
      for (const [id, url] of Object.entries(d || {})) if (/^https:\/\//.test(url)) atuais.set(id, url)
    } catch {
      // sem resposta: fica a foto que já tinha
    }
  }
  window.dispatchEvent(new Event(EVENTO))
}

function pedir(id) {
  if (buscados.has(id)) return
  buscados.add(id)
  pedidos.add(id)
  espera ??= setTimeout(buscar, 40) // junta os pedidos da mesma renderização
}

export function useAvatar(id, padrao = '') {
  const [, atualizar] = useState(0)
  useEffect(() => {
    if (!CONFIG.loginSteam || !ID.test(String(id || ''))) return
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    pedir(String(id))
    return () => window.removeEventListener(EVENTO, ouvir)
  }, [id])
  return atuais.get(String(id || '')) || padrao
}
