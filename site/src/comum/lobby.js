// Lobby (grupo para jogar junto). O worker guarda os lobbies (src/amigos.js, GET/POST /lobby) e avisa pela conexão de
// presença (mensagem "lobby", vira o evento np-lobby em amigos.js) quando algo muda; aqui a página lê e muda.
//   dados = { eu, lider, souLider, publico, max, membros: [pessoa] (líder primeiro), convites: [pessoa],
//             convitesRecebidos: [{ lider: pessoa, membros }], abertos: [{ lider: pessoa, membros }] }
//   pessoa = { id, nome, avatar, st: 'online' | 'ausente' | 'offline' }
import { useEffect, useState } from 'react'
import { chamarApi } from './api.js'
import { CONFIG } from './config.js'
import { useConta } from './conta.js'
import { criarAtualizador } from './atualizador.js'

const EVENTO = 'np-lobby-estado'

let estado = { dados: null, erro: '' }
const publicar = (novo) => {
  estado = { ...estado, ...novo }
  window.dispatchEvent(new Event(EVENTO))
}

async function chamar(corpo) {
  const d = await chamarApi('/lobby', corpo)
  if (d.partida) d.partida.desvio = d.partida.agora - Date.now() // relógio do servidor − o desta aba
  return d
}

//   dados.busca = quando o lobby começou a buscar (ms) ou null
//   dados.partida = { id, fase: 'aceitar' | 'veto' | 'pronto', prazo, desvio, meuTime: 'A' | 'B', formato, pool, primeiro, historico, aceitos: [ids],
//                     times: { A: { lider, membros: [pessoa] }, B } } ou null
// Milissegundos até o prazo da fase atual (pelo relógio do servidor)
export const msAte = (prazo, desvio = 0) => Math.max(0, prazo - (Date.now() + desvio))

// Faz o componente redesenhar a cada `ms` enquanto `ativo` (contagens regressivas)
export function useRelogio(ativo, ms = 250) {
  const [, tic] = useState(0)
  useEffect(() => {
    if (!ativo) return
    const id = setInterval(() => tic((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ativo, ms])
}

let dono = null
const leitura = criarAtualizador({
  ler: async () => { const id = dono; return { id, dados: await chamar() } },
  aplicar: ({ id, dados }) => id === dono && publicar({ dados, erro: '' }),
  aoErro: (e) => publicar({ erro: e.message }),
})
export const carregarLobby = () => dono && leitura.carregar()
const atualizarLobby = () => dono && leitura.atualizar()

// convidar | remover | entrar | recusar | sair | publico   (id = SteamID do alvo ou do líder; valor = true/false no "publico")
export async function acaoLobby(acao, id, valor) {
  const autor = dono
  const d = await chamar({ acao, id, valor })
  if (autor !== dono) return d
  leitura.descartar()
  publicar({ dados: d, erro: '' })
  atualizarLobby()
  return d
}

// Uma assinatura de rede por conta, compartilhada por página, avisos e painéis.
let assinantes = 0
let parar = null
function assinarRede(id) {
  const mudouConta = dono !== id
  if (mudouConta) {
    leitura.descartar()
    dono = id
    publicar({ dados: null, erro: '' })
  }
  if (!assinantes++) {
    if (mudouConta) atualizarLobby()
    else carregarLobby()
    const voltou = () => document.visibilityState === 'visible' && atualizarLobby()
    window.addEventListener('np-lobby', atualizarLobby)
    window.addEventListener('np-reconectou', atualizarLobby)
    window.addEventListener('focus', voltou)
    document.addEventListener('visibilitychange', voltou)
    // Recuperação de eventos perdidos; o WebSocket entrega as mudanças imediatamente.
    const relogio = setInterval(() => document.visibilityState === 'visible' && carregarLobby(), 20000)
    parar = () => {
      window.removeEventListener('np-lobby', atualizarLobby)
      window.removeEventListener('np-reconectou', atualizarLobby)
      window.removeEventListener('focus', voltou)
      document.removeEventListener('visibilitychange', voltou)
      clearInterval(relogio)
    }
  }
  return () => { if (!--assinantes) parar?.() }
}
export function useLobby() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO, ouvir)
    return () => window.removeEventListener(EVENTO, ouvir)
  }, [])
  useEffect(() => {
    if (!conta?.id || !CONFIG.loginSteam) {
      if (dono && !conta?.id) { dono = null; leitura.descartar(); publicar({ dados: null, erro: '' }) }
      return
    }
    return assinarRede(conta.id)
  }, [conta?.id])
  return { ...estado, conta }
}
