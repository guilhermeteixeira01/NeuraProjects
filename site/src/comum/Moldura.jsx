// Personalização do perfil de cada jogador: moldura do avatar e time.
// As escolhas ficam no worker do login (KV, GET /perfis = { steamId: { moldura, time } }). Toda página que mostra
// avatar ou time lê o mapa uma vez; quem troca vê na hora (evento np-perfis) e os outros ao abrir/recarregar.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { sair, tokenConta } from './conta.js'
import { molduraPorId, urlMoldura } from './molduras.js'

const EVENTO = 'np-perfis'
const CACHE = 'np_perfis' // última lista lida (aparece já na troca de página, sem esperar a rede)
const base = () => CONFIG.loginSteam.replace(/\/$/, '')

let mapa = null // { steamId: { moldura?, time? } }
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
  buscando ??= fetch(`${base()}/perfis`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d && typeof d === 'object' && publicar(d))
    .catch(() => {})
}

// Perfis de todos os jogadores ({} no HTML gerado e até a primeira leitura no navegador)
export function usePerfis() {
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

// Salva o perfil de quem está logado. mudar = { moldura?, time? } (só os campos enviados mudam; null tira).
// Erro 'login' = login vencido (sai da conta).
export async function salvarPerfil(mudar) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/perfil`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mudar),
  })
  if (r.status === 401) {
    sair()
    throw new Error('login')
  }
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error('falhou')
  publicar(d.perfis)
}

// ── Time escolhido ──
// Lista de times (nome + logo) da cópia publicada no site (assets/data/times.json, editada em /times/).
// Time que saiu da lista não aparece.
let times = null
let buscandoTimes = null

export function useListaTimes() {
  const [lista, setLista] = useState(() => times || [])
  useEffect(() => {
    buscandoTimes ??= fetch('/assets/data/times.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (times = Array.isArray(d?.times) ? d.times.filter((t) => t?.nome) : []))
      .catch(() => (times = []))
    let vivo = true
    buscandoTimes.then((l) => vivo && setLista(l))
    return () => {
      vivo = false
    }
  }, [])
  return lista
}

// { nome, logo } do time escolhido pelo jogador, ou null
export function useTimeDe(steamId) {
  const perfis = usePerfis()
  const lista = useListaTimes()
  const nome = perfis[steamId]?.time
  return (nome && lista.find((t) => t.nome === nome)) || null
}

// ── Moldura ──
// Desenho da moldura por cima de um avatar (o pai precisa ter position: relative e o tamanho do avatar)
export function CamadaMoldura({ id, parada = false }) {
  const m = molduraPorId(id)
  if (!m) return null
  return <span className="moldura" aria-hidden="true" style={{ backgroundImage: `url("${parada ? urlMoldura(m.id).replace(/\.png$/, '.webp') : urlMoldura(m.id)}")` }} />
}

// Envolve o avatar e põe a moldura do jogador por cima (sem moldura, devolve o avatar como está).
// cheio: o avatar ocupa 100% do pai (ex.: avatar do pódio do ranking, que tem tamanho fixo).
export function ComMoldura({ steamId, children, cheio = false }) {
  const id = usePerfis()[steamId]?.moldura
  if (!molduraPorId(id)) return children
  return (
    <span className={`moldura-box${cheio ? ' cheio' : ''}`}>
      {children}
      <CamadaMoldura id={id} />
    </span>
  )
}

// Selo do time escolhido (logo + nome), ou nada se o jogador não escolheu. classe: estilo de cada página.
export function TimeEscolhido({ steamId, classe = '' }) {
  const time = useTimeDe(steamId)
  const [erroLogo, setErroLogo] = useState(false)
  if (!time) return null
  return (
    <span className={`time-escolhido ${classe}`} title={`Time: ${time.nome}`}>
      {/^https?:\/\//.test(time.logo || '') && !erroLogo ? <img src={time.logo} alt="" loading="lazy" onError={() => setErroLogo(true)} /> : <i aria-hidden="true">{time.nome.slice(0, 1)}</i>}
      <span>{time.nome}</span>
    </span>
  )
}
