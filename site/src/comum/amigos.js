// Amigos e presença (worker: src/amigos.js). Uma conexão só por página, compartilhada por todos os componentes:
//  - lista (GET /amigos): amigos, pedidos recebidos e enviados, com nome e foto;
//  - presença (WebSocket /presenca): online / ausente / offline de cada amigo, ao vivo, e "visto por último";
//    a mesma conexão traz o meu perfil quando o admin muda algo nele (evento np-perfil-ao-vivo).
// Ausente: aba em segundo plano ou 5 min sem mexer no mouse/teclado. A conexão volta sozinha se cair.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { tokenConta, useConta } from './conta.js'

const EVENTO = 'np-amigos'
const OCIOSO_MS = 5 * 60 * 1000
const base = () => CONFIG.loginSteam.replace(/\/$/, '')

let estado = { lista: null, status: {}, conectado: false }
let ws = null
let dono = null // SteamID da conexão atual
let tentativas = 0
let religar = null
let pingar = null
let ultimoSinal = 0 // última vez que o worker respondeu (pong ou mensagem)
let ocioso = null
let meuStatus = 'online'

const publicar = (novo) => {
  estado = { ...estado, ...novo }
  window.dispatchEvent(new Event(EVENTO))
}

async function chamar(metodo, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/amigos`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

async function carregarLista() {
  try {
    publicar({ lista: await chamar('GET') })
  } catch {
    // sem login ou worker fora: fica a lista que já tinha
  }
}

// pedir | aceitar | recusar | cancelar | remover
// Busca por nome entre quem o site conhece (quem já entrou com a Steam; o ranking o painel já tem): GET /usuarios/buscar?q=
export async function buscarJogadores(q) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}/usuarios/buscar?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return Array.isArray(d?.jogadores) ? d.jogadores : []
}

export async function acaoAmizade(acao, id) {
  const lista = await chamar('POST', { acao, id })
  publicar({ lista })
  return lista
}

function mandarStatus(st) {
  if (st === meuStatus) return
  meuStatus = st
  if (ws?.readyState === 1) ws.send(st)
}
const atividade = () => {
  if (document.visibilityState !== 'visible') return
  mandarStatus('online')
  clearTimeout(ocioso)
  ocioso = setTimeout(() => mandarStatus('ausente'), OCIOSO_MS)
}
const visibilidade = () => (document.visibilityState === 'visible' ? atividade() : mandarStatus('ausente'))

// Conexão que parou de responder (PC dormiu, rede trocou) não dispara "close" na hora: derruba e liga de novo sem esperar
function verificar() {
  if (ws?.readyState !== 1) return
  if (Date.now() - ultimoSinal > 50000) return reconectar()
  ws.send('ping')
}
function reconectar() {
  if (!dono) return
  const id = dono
  clearTimeout(religar)
  clearInterval(pingar)
  const velha = ws
  ws = null
  if (velha) {
    velha.onclose = velha.onmessage = velha.onopen = null
    try {
      velha.close()
    } catch {
      // já fechada
    }
  }
  tentativas = 0
  publicar({ conectado: false })
  conectar(id)
}
// Voltou para a aba / a internet voltou: se a conexão não está aberta liga já; se está, confere com um ping
function acordou() {
  if (!dono || document.visibilityState === 'hidden') return
  if (!ws || ws.readyState > 1) return reconectar()
  if (Date.now() - ultimoSinal > 25000) {
    ultimoSinal = Math.min(ultimoSinal, Date.now() - 40000) // se não vier pong em ~10 s, o próximo verificar() derruba
    try {
      ws.send('ping')
    } catch {
      reconectar()
    }
  }
}

function conectar(id) {
  const token = tokenConta()
  if (!token || !CONFIG.loginSteam) return
  dono = id
  ws = new WebSocket(`${base().replace(/^http/, 'ws')}/presenca?t=${encodeURIComponent(token)}`)
  ws.onopen = () => {
    tentativas = 0
    publicar({ conectado: true })
    meuStatus = 'online'
    if (document.visibilityState !== 'visible') mandarStatus('ausente')
    clearInterval(pingar)
    ultimoSinal = Date.now()
    pingar = setInterval(verificar, 20000) // mantém a conexão viva e percebe quando ela morreu sem avisar
  }
  ws.onmessage = (e) => {
    ultimoSinal = Date.now()
    if (e.data === 'pong') return
    let m
    try {
      m = JSON.parse(e.data)
    } catch {
      return
    }
    if (m.tipo === 'estado') publicar({ status: m.status || {} })
    else if (m.tipo === 'mudou') publicar({ status: { ...estado.status, [m.id]: { st: m.st, visto: m.visto ?? estado.status[m.id]?.visto ?? null } } })
    else if (m.tipo === 'lista') carregarLista()
    // O dono deu uma skin: o aviso aparece na hora (comum/AvisoSkin.jsx)
    else if (m.tipo === 'skin') window.dispatchEvent(new Event('np-skin'))
    // Algo mudou no meu lobby (convite, alguém entrou/saiu, lobby aberto): a página do Lobby recarrega
    else if (m.tipo === 'lobby') window.dispatchEvent(new Event('np-lobby'))
    // O admin mudou o meu perfil (ex.: deu uma insígnia): Moldura.jsx atualiza na hora e o aviso aparece
    else if (m.tipo === 'perfil' && m.id) window.dispatchEvent(new CustomEvent('np-perfil-ao-vivo', { detail: { id: m.id, perfil: m.perfil } }))
  }
  ws.onclose = () => {
    clearInterval(pingar)
    publicar({ conectado: false })
    if (dono !== id) return // saiu da conta: não reconecta
    const espera = Math.min(30000, 1000 * 2 ** tentativas++) // 1 s, 2 s, 4 s... até 30 s
    religar = setTimeout(() => dono === id && conectar(id), espera)
  }
}

function desconectar() {
  dono = null
  clearTimeout(religar)
  clearInterval(pingar)
  try {
    ws?.close()
  } catch {
    // já fechada
  }
  ws = null
  estado = { lista: null, status: {}, conectado: false }
  window.dispatchEvent(new Event(EVENTO))
}

let usuarios = 0
let ligadoPara = null
function ligar(id) {
  if (ligadoPara === id) return
  desconectar()
  ligadoPara = id
  if (!id) return
  carregarLista()
  conectar(id)
  if (!window.__npAmigosEventos) {
    window.__npAmigosEventos = true
    for (const ev of ['mousemove', 'keydown', 'pointerdown', 'scroll', 'focus']) window.addEventListener(ev, atividade, { passive: true })
    document.addEventListener('visibilitychange', visibilidade)
    for (const ev of ['visibilitychange', 'focus', 'online']) (ev === 'visibilitychange' ? document : window).addEventListener(ev, acordou)
    atividade()
  }
}

// Status de um amigo: { st: 'online' | 'ausente' | 'offline', visto }
export function useAmigos() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    usuarios++
    return () => {
      window.removeEventListener(EVENTO, ouvir)
      usuarios--
    }
  }, [])
  useEffect(() => {
    if (!CONFIG.loginSteam) return
    ligar(conta?.id || null)
  }, [conta?.id])
  return { ...estado, eu: conta?.id || null }
}

// Relação com outro jogador: 'amigo' | 'recebido' (ele pediu) | 'enviado' (eu pedi) | 'nada'
export function relacaoCom(lista, id) {
  if (!lista) return null
  if (lista.amigos.some((a) => a.id === id)) return 'amigo'
  if (lista.recebidos.some((a) => a.id === id)) return 'recebido'
  if (lista.enviados.some((a) => a.id === id)) return 'enviado'
  return 'nada'
}

// "agora", "há 5 min", "há 3 h", "há 2 dias"
export function tempoDesde(ms, t) {
  if (!ms) return ''
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return t('agora')
  if (s < 3600) return t('há {n} min', { n: Math.floor(s / 60) })
  if (s < 86400) return t('há {n} h', { n: Math.floor(s / 3600) })
  return t('há {n} dias', { n: Math.floor(s / 86400) })
}
