// Personalização do perfil de cada jogador: moldura do avatar e time.
// As escolhas ficam no worker do login (KV, GET /perfis = { steamId: { moldura, time, xp } }). Toda página que mostra
// avatar ou time lê o mapa e confere de novo a cada 30 s (sem recarregar a página); quem troca vê na hora.
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

// Lê os perfis do worker; só republica (e a página só redesenha) se mudou desde a última leitura
let textoPerfis = null
function buscar() {
  if (!CONFIG.loginSteam || buscando) return
  buscando = fetch(`${base()}/perfis`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : null))
    .then((texto) => {
      if (!texto || texto === textoPerfis) return
      textoPerfis = texto
      const d = JSON.parse(texto)
      if (d && typeof d === 'object') publicar(d)
    })
    .catch(() => {})
    .finally(() => (buscando = null))
}

// Atualização sozinha: perfis (moldura, time, XP do admin) e regras das molduras a cada 30 s, só com a aba visível,
// e na hora em que a pessoa volta para a aba. Quem troca a moldura num lugar vê em todas as abas e aparelhos.
const A_CADA = 30000
let relogio = false
function atualizarSozinho() {
  if (relogio || typeof window === 'undefined') return
  relogio = true
  const tudo = () => {
    if (document.visibilityState !== 'visible') return
    buscar()
    buscarConfig()
  }
  setInterval(tudo, A_CADA)
  document.addEventListener('visibilitychange', tudo)
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
    atualizarSozinho()
    window.addEventListener(EVENTO, ler)
    return () => window.removeEventListener(EVENTO, ler)
  }, [])
  return atual
}

// Chamada ao worker com o login (GET sem corpo, POST com corpo). Erros: 'login' (login vencido: sai da conta)
// ou a resposta do worker ({ erro, ... }, ex.: 'nivel', 'bloqueado', 'admin').
export async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token || !CONFIG.loginSteam) throw Object.assign(new Error('login'), { dados: {} })
  const r = await fetch(`${base()}${rota}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => null)
  if (r.status === 401) {
    sair()
    throw Object.assign(new Error('login'), { dados: d || {} })
  }
  if (!r.ok || d?.erro) throw Object.assign(new Error(d?.erro || 'falhou'), { dados: d || {} })
  if (d?.perfis) {
    publicar(d.perfis) // toda mudança de perfil já aparece na página
    textoPerfis = null // a próxima leitura sozinha confirma com o worker
  }
  return d
}

// Salva o perfil de quem está logado. mudar = { moldura?, time? } (só os campos enviados mudam; null tira).
export const salvarPerfil = (mudar) => chamar('/perfil', mudar)

// Regras públicas: { molduraPorNivel, nivelMoldura: { idMoldura: nível } }
const EVENTO_CONFIG = 'np-config'
const CONFIG_PADRAO = { molduraPorNivel: false, nivelMoldura: {} }
let config = null
let textoConfig = null
let buscandoConfig = null
function buscarConfig() {
  if (!CONFIG.loginSteam || buscandoConfig) return
  buscandoConfig = fetch(`${base()}/config`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : null))
    .then((texto) => {
      if (!texto || texto === textoConfig) return
      textoConfig = texto
      const d = JSON.parse(texto)
      config = { molduraPorNivel: !!d?.molduraPorNivel, nivelMoldura: d?.nivelMoldura || {} }
      window.dispatchEvent(new Event(EVENTO_CONFIG))
    })
    .catch(() => {})
    .finally(() => (buscandoConfig = null))
}
export function useConfigSite() {
  const [atual, setAtual] = useState(() => config || CONFIG_PADRAO)
  useEffect(() => {
    const ler = () => setAtual(config || CONFIG_PADRAO)
    ler()
    buscarConfig()
    atualizarSozinho()
    window.addEventListener(EVENTO_CONFIG, ler)
    return () => window.removeEventListener(EVENTO_CONFIG, ler)
  }, [])
  return atual
}
// Nível que a moldura exige (1 = livre), conforme a regra do admin
export const nivelDaMoldura = (config, id) => (config.molduraPorNivel ? Number(config.nivelMoldura?.[id]) || 1 : 1)

// Quem está logado é admin? (o worker confere de verdade em toda ação; aqui é só para mostrar a aba)
let eu = { id: null, admin: false, dono: false }
let buscandoEu = null
export function useAdmin(conta) {
  const [atual, setAtual] = useState(eu)
  useEffect(() => {
    if (!conta?.id) {
      setAtual({ id: null, admin: false, dono: false })
      return
    }
    if (eu.id !== conta.id) buscandoEu = null
    buscandoEu ??= chamar('/eu')
      .then((d) => (eu = { id: d.id, admin: !!d.admin, dono: !!d.dono }))
      .catch(() => (eu = { id: conta.id, admin: false, dono: false }))
    let vivo = true
    buscandoEu.then((e) => vivo && setAtual(e))
    return () => {
      vivo = false
    }
  }, [conta?.id])
  return atual
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
