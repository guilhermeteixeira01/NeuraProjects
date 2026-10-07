// Foto atual da Steam de cada jogador. A foto que vem nas partidas (ranking, perfil, página da partida) é a do dia em que
// a pessoa jogou, e a do login é a do dia em que entrou; quem troca a foto na Steam continuaria com a velha.
// useAvatar(id, padrao) mostra a que já tem (padrao) e troca pela atual quando o worker responde (GET /avatares,
// até 100 por chamada, com cache de 5 min por jogador lá). Os pedidos da página toda são juntados numa chamada só.
// Quem tem avatar animado (Loja de Pontos) recebe o GIF; com "Melhorar desempenho" ligado, a foto parada.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from './desempenho.js'

const EVENTO = 'np-avatares'
const ID = /^\d{17}$/
const URL_OK = /^https:\/\//
const atuais = new Map() // id -> url atual (GIF para quem tem avatar animado)
const parados = new Map() // id -> foto parada de quem tem avatar animado
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
      // v=2: versões antigas do worker mandavam o navegador guardar por 30 min; o endereço novo não pega essa cópia velha
      const r = await fetch(`${base}/avatares?v=2&ids=${ids.slice(i, i + 100).join(',')}`, { cache: 'no-store' })
      const d = r.ok ? await r.json() : {}
      for (const [id, url] of Object.entries(d || {})) if (typeof url === 'string' && URL_OK.test(url)) atuais.set(id, url)
      for (const [id, url] of Object.entries(d?._parado || {})) if (URL_OK.test(url)) parados.set(id, url)
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
    window.addEventListener(EVENTO_DESEMPENHO, ouvir)
    pedir(String(id))
    return () => {
      window.removeEventListener(EVENTO, ouvir)
      window.removeEventListener(EVENTO_DESEMPENHO, ouvir)
    }
  }, [id])
  const chave = String(id || '')
  if (desempenhoAtivo() && parados.has(chave)) return parados.get(chave)
  return atuais.get(chave) || padrao
}
