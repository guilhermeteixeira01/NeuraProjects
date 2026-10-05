// Moldura de avatar de cada jogador (personalização do perfil).
// As escolhas ficam no worker do login (KV, GET /molduras). Toda página que mostra avatar lê o mapa uma vez;
// quem troca a moldura vê na hora (evento np-molduras) e os outros ao abrir/recarregar qualquer página.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { sair, tokenConta } from './conta.js'
import { molduraPorId, urlMoldura } from './molduras.js'

const EVENTO = 'np-molduras'
const CACHE = 'np_molduras' // última lista lida (a moldura aparece já na troca de página, sem esperar a rede)
const base = () => CONFIG.loginSteam.replace(/\/$/, '')

let mapa = null // { steamId: idMoldura }
let buscando = null

function publicar(novo) {
  mapa = novo || {}
  try {
    sessionStorage.setItem(CACHE, JSON.stringify(mapa))
  } catch {
    // sem armazenamento: só não guarda para a próxima página
  }
  window.dispatchEvent(new Event(EVENTO))
}

function buscar() {
  if (!CONFIG.loginSteam) return
  buscando ??= fetch(`${base()}/molduras`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d && typeof d === 'object' && publicar(d))
    .catch(() => {})
}

// Mapa das molduras ({} no HTML gerado e até a primeira leitura no navegador)
export function useMolduras() {
  // Começa vazio (igual ao HTML gerado); componente que abre depois (ex.: janela) já pega o que foi lido
  const [atual, setAtual] = useState(() => (typeof window === 'undefined' ? {} : mapa || {}))
  useEffect(() => {
    if (!mapa) {
      try {
        mapa = JSON.parse(sessionStorage.getItem(CACHE) || 'null')
      } catch {
        mapa = null
      }
    }
    const ler = () => setAtual(mapa || {})
    ler()
    buscar()
    window.addEventListener(EVENTO, ler)
    return () => window.removeEventListener(EVENTO, ler)
  }, [])
  return atual
}

// Salva a moldura de quem está logado (id ou null para tirar). Erro 'login' = login vencido (sai da conta).
export async function salvarMoldura(id) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/moldura`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ moldura: id }),
  })
  if (r.status === 401) {
    sair()
    throw new Error('login')
  }
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error('falhou')
  publicar(d.molduras)
}

// Desenho da moldura por cima de um avatar (o pai precisa ter position: relative e o tamanho do avatar)
export function CamadaMoldura({ id, parada = false }) {
  const m = molduraPorId(id)
  if (!m) return null
  return <span className="moldura" aria-hidden="true" style={{ backgroundImage: `url("${parada ? urlMoldura(m.id).replace(/\.png$/, '.webp') : urlMoldura(m.id)}")` }} />
}

// Envolve o avatar e põe a moldura do jogador por cima (sem moldura, devolve o avatar como está).
// cheio: o avatar ocupa 100% do pai (ex.: avatar do pódio do ranking, que tem tamanho fixo).
export function ComMoldura({ steamId, children, cheio = false }) {
  const molduras = useMolduras()
  const id = molduras[steamId]
  if (!molduraPorId(id)) return children
  return (
    <span className={`moldura-box${cheio ? ' cheio' : ''}`}>
      {children}
      <CamadaMoldura id={id} />
    </span>
  )
}
