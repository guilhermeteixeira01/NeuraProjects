// Foto atual da Steam de cada jogador. A foto que vem nas partidas (ranking, perfil, página da partida) é a do dia em que
// a pessoa jogou, e a do login é a do dia em que entrou; quem troca a foto na Steam continuaria com a velha.
//
// useAvatar(id, padrao) devolve a foto atual (GET /avatares no worker, até 100 por chamada, cache de 5 min por jogador
// lá; os pedidos da página toda viram uma chamada só). Para a foto velha nunca aparecer antes da nova:
//  - a última foto conhecida de cada jogador fica no navegador (localStorage np_avatares) e é usada na hora, antes de
//    desenhar (useLayoutEffect), e confirmada/atualizada pelo worker em seguida;
//  - jogador ainda desconhecido: AVATAR_VAZIO (imagem transparente, o círculo fica vazio) até o worker responder;
//    sem resposta em ESPERA_MAX, mostra a foto que veio da partida (padrao).
// No HTML gerado (sem JS) também sai AVATAR_VAZIO, igual à primeira renderização no navegador.
// Avatar animado (Loja de Pontos) vem como GIF; com "Melhorar desempenho", a foto parada.
import { useEffect, useLayoutEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from './desempenho.js'

export const AVATAR_VAZIO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const EVENTO = 'np-avatares'
const CHAVE = 'np_avatares'
const ESPERA_MAX = 2500
const ID = /^\d{17}$/
const URL_OK = /^https:\/\//
const usarLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const atuais = new Map() // id -> url atual (GIF para quem tem avatar animado)
const parados = new Map() // id -> foto parada de quem tem avatar animado
const desistiu = new Set() // worker não respondeu: usa a foto da partida
const pedidos = new Set() // esperando a próxima chamada
const buscados = new Set() // já pedidos nesta página
let espera = null
let lido = false

// Última foto conhecida de cada um (guardada no navegador)
function lerGuardadas() {
  if (lido || typeof window === 'undefined') return
  lido = true
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    for (const [id, v] of Object.entries(d)) {
      if (URL_OK.test(v?.u || '')) atuais.set(id, v.u)
      if (URL_OK.test(v?.p || '')) parados.set(id, v.p)
    }
  } catch {
    // sem armazenamento: só não tem a foto na hora
  }
}
function guardar() {
  try {
    const d = {}
    for (const [id, u] of atuais) d[id] = parados.has(id) ? { u, p: parados.get(id) } : { u }
    localStorage.setItem(CHAVE, JSON.stringify(d))
  } catch {
    // cheio ou bloqueado
  }
}

async function buscar() {
  espera = null
  const ids = [...pedidos]
  pedidos.clear()
  const base = CONFIG.loginSteam.replace(/\/$/, '')
  const desistir = setTimeout(() => {
    for (const id of ids) if (!atuais.has(id)) desistiu.add(id)
    window.dispatchEvent(new Event(EVENTO))
  }, ESPERA_MAX)
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100)
    try {
      // v=2: versões antigas do worker mandavam o navegador guardar por 30 min; o endereço novo não pega essa cópia velha
      const r = await fetch(`${base}/avatares?v=2&ids=${lote.join(',')}`, { cache: 'no-store' })
      const d = r.ok ? await r.json() : {}
      for (const [id, url] of Object.entries(d || {})) if (typeof url === 'string' && URL_OK.test(url)) atuais.set(id, url)
      for (const id of lote) {
        if (URL_OK.test(d?._parado?.[id] || '')) parados.set(id, d._parado[id])
        else if (d?.[id]) parados.delete(id) // tirou o avatar animado
        if (!atuais.has(id)) desistiu.add(id) // a Steam não devolveu: fica a da partida
      }
    } catch {
      for (const id of lote) if (!atuais.has(id)) desistiu.add(id)
    }
  }
  clearTimeout(desistir)
  guardar()
  window.dispatchEvent(new Event(EVENTO))
}

function pedir(id) {
  if (buscados.has(id)) return
  buscados.add(id)
  pedidos.add(id)
  espera ??= setTimeout(buscar, 40) // junta os pedidos da mesma renderização
}

const ativo = (id) => Boolean(CONFIG.loginSteam) && ID.test(String(id || ''))

function valor(id, padrao) {
  if (!ativo(id)) return padrao
  const chave = String(id)
  if (desempenhoAtivo() && parados.has(chave)) return parados.get(chave)
  if (atuais.has(chave)) return atuais.get(chave)
  return desistiu.has(chave) ? padrao : AVATAR_VAZIO
}

export function useAvatar(id, padrao = '') {
  // Primeira renderização (e HTML gerado): vazio, para nunca desenhar a foto velha; o efeito abaixo põe a certa
  const [, atualizar] = useState(0)
  const [montado, setMontado] = useState(false)
  usarLayout(() => {
    lerGuardadas()
    setMontado(true) // antes de pintar: a guardada já aparece no primeiro quadro
  }, [])
  useEffect(() => {
    if (!ativo(id)) return
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    window.addEventListener(EVENTO_DESEMPENHO, ouvir)
    pedir(String(id))
    return () => {
      window.removeEventListener(EVENTO, ouvir)
      window.removeEventListener(EVENTO_DESEMPENHO, ouvir)
    }
  }, [id])
  if (!montado) return ativo(id) ? AVATAR_VAZIO : padrao
  return valor(id, padrao)
}
