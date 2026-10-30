// Amigos e presença (worker: src/amigos.js). Uma conexão só por página, compartilhada por todos os componentes:
//  - lista (GET /amigos): amigos, pedidos recebidos e enviados, com nome e foto;
//  - presença (WebSocket /presenca): online / ausente / offline de cada amigo, ao vivo, e "visto por último";
//    a mesma conexão traz o meu perfil quando o admin muda algo nele (evento np-perfil-ao-vivo).
// Ausente após 5 min sem atividade, inclusive entre páginas e abas.
import { useEffect, useState } from 'react'
import { ErroApi, chamarApi, enderecoApi } from './api.js'
import { criarAtualizador } from './atualizador.js'
import { CONFIG } from './config.js'
import { tokenConta, useConta } from './conta.js'

const EVENTO = 'np-amigos'
const OCIOSO_MS = 5 * 60 * 1000

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

const leituraLista = criarAtualizador({
  ler: async () => { const id = dono; return { id, lista: await chamarApi('/amigos') } },
  aplicar: ({ id, lista }) => id === dono && publicar({ lista }),
  aoErro: (e) => { if (!(e instanceof ErroApi)) throw e },
})
const carregarLista = () => dono && leituraLista.carregar()
const atualizarLista = () => dono && leituraLista.atualizar()

// pedir | aceitar | recusar | cancelar | remover
// Busca por nome entre quem o site conhece (quem já entrou com a Steam; o ranking o painel já tem): GET /usuarios/buscar?q=
export async function buscarJogadores(q) {
  const d = await chamarApi(`/usuarios/buscar?q=${encodeURIComponent(q)}`)
  return Array.isArray(d?.jogadores) ? d.jogadores : []
}

export async function acaoAmizade(acao, id) {
  const autor = dono
  const lista = await chamarApi('/amigos', { acao, id })
  if (autor !== dono) return lista
  leituraLista.descartar()
  publicar({ lista })
  atualizarLista()
  return lista
}

function mandarStatus(st) {
  if (st === meuStatus) return
  meuStatus = st
  if (ws?.readyState === 1) ws.send(st)
}
let ultimaAtividade = 0
const chaveAtividade = () => `np-presenca-atividade:${dono}`
function lerAtividade() {
  try { return Number(localStorage.getItem(chaveAtividade())) || 0 } catch { return ultimaAtividade }
}
function conferirAtividade() {
  clearTimeout(ocioso)
  if (!dono) return
  ultimaAtividade = Math.max(ultimaAtividade, Math.min(Date.now(), lerAtividade()))
  const restante = OCIOSO_MS - (Date.now() - ultimaAtividade)
  mandarStatus(restante > 0 ? 'online' : 'ausente')
  if (restante > 0) ocioso = setTimeout(conferirAtividade, restante)
}
const atividade = () => {
  if (document.visibilityState !== 'visible') return
  if (!dono || (Date.now() - ultimaAtividade < 1000 && meuStatus === 'online')) return
  ultimaAtividade = Date.now()
  try { localStorage.setItem(chaveAtividade(), String(ultimaAtividade)) } catch { /* armazenamento indisponível */ }
  conferirAtividade()
}
const visibilidade = () => document.visibilityState === 'visible' ? atividade() : conferirAtividade()

// Conexão que parou de responder (PC dormiu, rede trocou) não dispara "close" na hora: derruba e liga de novo sem esperar
function verificar() {
  if (ws?.readyState !== 1) return
  if (Date.now() - ultimoSinal > 35000) return reconectar()
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
let ultimaSincronia = 0
function acordou() {
  if (!dono || document.visibilityState === 'hidden' || Date.now() - ultimaSincronia < 500) return
  ultimaSincronia = Date.now()
  atualizarLista()
  window.dispatchEvent(new Event('np-reconectou'))
  if (!ws || ws.readyState > 1) return reconectar()
  if (ws.readyState === 1) ws.send('sincronizar')
  if (Date.now() - ultimoSinal > 15000) {
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
  ws = new WebSocket(`${enderecoApi().replace(/^http/, 'ws')}/presenca?t=${encodeURIComponent(token)}`)
  const socket = ws
  const prazo = setTimeout(() => { if (ws === socket && socket.readyState === 0) socket.close() }, 8000)
  ws.onerror = () => { if (ws === socket) socket.close() }
  ws.onopen = () => {
    clearTimeout(prazo)
    if (ws !== socket) return
    atualizarLista()
    window.dispatchEvent(new Event('np-reconectou'))
    conferirAtividade()
    tentativas = 0
    publicar({ conectado: true })
    socket.send(meuStatus)
    clearInterval(pingar)
    ultimoSinal = Date.now()
    pingar = setInterval(verificar, 15000) // mantém a conexão viva e percebe quando ela morreu sem avisar
  }
  ws.onmessage = (e) => {
    if (ws !== socket) return
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
    else if (m.tipo === 'lista') atualizarLista()
    // O dono deu uma skin: o aviso aparece na hora (comum/AvisoSkin.jsx)
    else if (m.tipo === 'skin') window.dispatchEvent(new Event('np-skin'))
    // Troca nova/aceita/recusada: o aviso e a lista de trocas atualizam na hora (comum/Trocas.jsx)
    else if (m.tipo === 'troca') window.dispatchEvent(new Event('np-troca'))
    // Venderam um item meu no mercado: o sino busca a notificação e as listas do mercado/inventário atualizam (comum/mercado.js)
    else if (m.tipo === 'mercado') window.dispatchEvent(new Event('np-mercado'))
    // Time: algo mudou no meu time (membros, cargos, convite) e mensagem nova no chat do time (paginas/equipes)
    else if (m.tipo === 'equipe') window.dispatchEvent(new Event('np-equipe'))
    else if (m.tipo === 'equipe-chat') window.dispatchEvent(new CustomEvent('np-equipe-chat', { detail: m }))
    // Bônus de pontos para todos: o saldo é buscado (o servidor aplica o bônus) e depois as notificações (comum/loja.js)
    else if (m.tipo === 'bonus') window.dispatchEvent(new Event('np-bonus'))
    else if (m.tipo === 'hall') window.dispatchEvent(new Event('np-hall'))
    // Mensagem nova no chat da sala da partida (comum/ChatSala.jsx)
    else if (m.tipo === 'chat') window.dispatchEvent(new CustomEvent('np-chat', { detail: m }))
    // Chat global (painel da direita): mensagem nova, apagada, alguém silenciado ou aviso fixado (comum/ChatGlobal.jsx)
    else if (String(m.tipo).startsWith('chat-global')) window.dispatchEvent(new CustomEvent('np-chat-global', { detail: m }))
    // Mensagem nova no chat direto com um amigo (comum/mensagens.js)
    else if (m.tipo === 'dm-atualizou') window.dispatchEvent(new CustomEvent('np-dm-atualizou', { detail: m }))
    else if (m.tipo === 'dm') window.dispatchEvent(new CustomEvent('np-dm', { detail: m }))
    // Algo mudou no meu lobby (convite, alguém entrou/saiu, lobby aberto): a página do Lobby recarrega
    else if (m.tipo === 'lobby') window.dispatchEvent(new Event('np-lobby'))
    // O admin mudou o meu perfil (ex.: deu uma insígnia): Moldura.jsx atualiza na hora e o aviso aparece
    else if (m.tipo === 'perfil' && m.id) window.dispatchEvent(new CustomEvent('np-perfil-ao-vivo', { detail: { id: m.id, perfil: m.perfil } }))
  }
  ws.onclose = () => {
    clearTimeout(prazo)
    if (ws !== socket) return
    clearInterval(pingar)
    publicar({ conectado: false })
    if (dono !== id) return // saiu da conta: não reconecta
    const espera = Math.min(15000, 1000 * 2 ** tentativas++) // 1 s, 2 s, 4 s... até 15 s
    religar = setTimeout(() => dono === id && conectar(id), espera)
  }
}

function desconectar() {
  dono = null
  leituraLista.descartar()
  clearTimeout(ocioso)
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

let ligadoPara = null
function ligar(id) {
  if (ligadoPara === id) return
  desconectar()
  ligadoPara = id
  if (!id) return
  dono = id
  ultimaAtividade = lerAtividade() || Date.now()
  conferirAtividade()
  carregarLista()
  conectar(id)
  if (!window.__npAmigosEventos) {
    window.__npAmigosEventos = true
    for (const ev of ['mousemove', 'keydown', 'pointerdown', 'scroll', 'focus']) window.addEventListener(ev, atividade, { passive: true })
    document.addEventListener('visibilitychange', visibilidade)
    window.addEventListener('storage', (e) => { if (dono && e.key === chaveAtividade()) conferirAtividade() })
    for (const ev of ['visibilitychange', 'focus', 'online']) (ev === 'visibilitychange' ? document : window).addEventListener(ev, acordou)
  }
}

// Status de um amigo: { st: 'online' | 'ausente' | 'offline', visto }
export function useAmigos() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    return () => window.removeEventListener(EVENTO, ouvir)
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
