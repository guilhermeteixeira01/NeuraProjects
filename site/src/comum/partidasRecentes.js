// Partidas recém-jogadas, direto do worker (antes de o deploy do site publicar a página delas).
// O worker guarda as últimas partidas que o plugin mandou (worker/steam-login/src/partidas-novas.js).
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'

export function lerRecentes() {
  if (!CONFIG.loginSteam) return Promise.resolve([])
  return fetch(`${CONFIG.loginSteam}/partidas/recentes`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .then((l) => (Array.isArray(l) ? l : []))
    .catch(() => [])
}

// Lista do site (partidas.json) + as recentes do worker. A do site vale quando a partida está nas duas (a página já foi gerada).
// Da mais nova para a mais antiga, como o partidas.json.
export function juntarPartidas(lista, recentes) {
  if (!Array.isArray(lista)) return lista
  const tem = new Set(lista.map((p) => p.caminho || p.nome))
  const novas = (recentes || []).filter((p) => !tem.has(p.caminho || p.nome))
  return novas.length ? [...novas, ...lista].sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))) : lista
}

// As recentes do worker, conferidas a cada `intervalo` ms (só enquanto a aba está visível)
export function useRecentes(intervalo = 15000, ativo = true) {
  const [recentes, setRecentes] = useState([])
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    const ler = () => document.visibilityState === 'visible' && lerRecentes().then((l) => vivo && setRecentes((antes) => (JSON.stringify(antes) === JSON.stringify(l) ? antes : l)))
    ler()
    const i = setInterval(ler, intervalo)
    document.addEventListener('visibilitychange', ler)
    window.addEventListener('np-partida', ler)
    return () => {
      vivo = false
      clearInterval(i)
      document.removeEventListener('visibilitychange', ler)
      window.removeEventListener('np-partida', ler)
    }
  }, [intervalo, ativo])
  return recentes
}
