// Amigos (pedido e aceite, como na FACEIT) e presença em tempo real (online / ausente / offline no site).
//
// Lista de amizades: no armazenamento do objeto de presença ("amigosV2" = { "<SteamID64>": { amigos: [ids], recebidos: [ids], enviados: [ids] } }),
// consistente na hora. Na primeira vez veio do KV "amigos" (formato antigo, só lido).
//
// Presença: Durable Object "Presenca" (uma instância só, "global"). Cada aba do site com login abre um WebSocket
// (GET /presenca?t=<token>); o objeto guarda as conexões (API de hibernação: não cobra enquanto ninguém fala) e,
// quando alguém entra, sai ou fica ausente, avisa só os AMIGOS dessa pessoa. "Visto por último" fica no armazenamento
// do próprio objeto. Rotas (com login, em index.js): GET /amigos, POST /amigos { acao, id }.

import { DEFAULT_POOL } from '../../../src/paginas/neurapick/data/maps.js'
import { FORMATS, buildSteps, deriveState, other } from '../../../src/paginas/neurapick/data/veto.js'
import { ErroConflito, ErroLimite, ErroNaoEncontrado, ErroPedido, ErroPermissao } from './erros.js'
import { exigirBearer, lerCorpo, reenviar, respostaDeErro } from './http.js'
import { lerJsonKv } from './kv.js'
import { Fila, objetoGlobal, responder, semDerrubar } from './objetos.js'
import { lerPerfil, subAtiva } from './perfis.js'
import { nomesDe } from './usuarios.js'

const ID_STEAM = /^\d{17}$/
const MAX_AMIGOS = 300
const ACOES = ['pedir', 'aceitar', 'recusar', 'cancelar', 'remover']

// Lobby (grupo para jogar junto, como o da FACEIT): o líder + até 4 membros. Fica no armazenamento do próprio objeto de presença
// (consistente, sem KV): lobbies = { "<SteamID do líder>": { membros: [ids], convites: [ids], publico: bool } }.
// Só o líder convida, remove e abre o lobby; amigos entram sozinhos se estiver aberto ("público") ou se foram convidados.
const LOBBY_MAX = 5
const SEM_SINAL_MS = 150 * 1000 // o site manda "ping" a cada 20 s; sem nenhum sinal por isso, a conexão é tratada como morta
const LOBBY_OFFLINE_MS = 10 * 60 * 1000 // membro offline há mais que isso sai sozinho
const novoLobby = () => ({ membros: [], convites: [], publico: false, busca: null })
const lobbyVazio = (lb) => !lb.membros.length && !lb.convites.length && !lb.publico
const ACOES_LOBBY = ['convidar', 'remover', 'entrar', 'recusar', 'sair', 'publico', 'buscar', 'cancelar-busca', 'aceitar', 'recusar-partida', 'veto', 'substituir']
// Ações que continuam valendo com a partida montada (as outras mexem no grupo, que fica travado)
const ACOES_PARTIDA = ['aceitar', 'recusar-partida', 'veto', 'substituir'] // depois do veto não há como cancelar nem encerrar a sala: ela se resolve sozinha (prazos T)

// ── Fila e partida ──
// O líder de um lobby com 5 busca partida (lb.busca = quando começou). Dois lobbies buscando viram uma partida:
//   partidas = { "<id>": { id, fase: 'aceitar' | 'veto' | 'pronto', prazo, times: { A: { lider, membros }, B }, aceitos: [ids],
//                          formato, pool, primeiro: 'A' | 'B', historico: [{ type, team, map?, side?, auto? }] } }
// 'aceitar': os 10 têm ACEITE_SEG para aceitar (quem não aceitar derruba a partida; o time que aceitou inteiro volta para a fila).
// 'veto': só o líder do time da vez age (pick/ban/lado); passou VETO_SEG o servidor joga sozinho. 'pronto': veto acabou.
// Veto pronto = a partida vai para o servidor de CS2: p.servidor = { estado, desde, ... } com estado
//   'fila'      esperando o plugin buscar (POST /servidor/proxima, autenticado com SERVIDOR_TOKEN)
//   'entregue'  o plugin pegou a série e está carregando (volta para 'fila' se não confirmar em T.entrega)
//   'carregada' série carregada no servidor: os jogadores já podem entrar   'jogando' mapa em andamento
//   'encerrada' série terminou (ou foi cancelada)                            'erro' o plugin não conseguiu carregar, ou ninguém pegou a partida
// O plugin avisa cada fase por POST /servidor/estado (ESTADOS_SERVIDOR). Cada fase tem um prazo (T): a sala se resolve sozinha, sem botão de cancelar.
const ACEITE_SEG = 30
const VETO_SEG = 30
// Prazos da sala depois do veto. Não existe botão de cancelar nem de encerrar: a sala se resolve sozinha. Só mudam nos testes (TEMPOS_TESTE).
//   fila      ninguém (o servidor) pegou a partida a tempo: vira "erro" e a sala fecha
//   entrega   o plugin pegou a série e não confirmou que carregou: volta para a fila
//   serie     tempo máximo de uma série em andamento (se o plugin sumir sem avisar, a sala fecha depois disso)
//   encerrada a série acabou (ou deu erro): a sala mostra o resultado por esse tempo e fecha sozinha
const T = { fila: 10 * 60 * 1000, entrega: 90 * 1000, serie: 6 * 60 * 60 * 1000, encerrada: 20 * 1000 }
const ORDEM_SERVIDOR = { fila: 0, entregue: 1, carregada: 2, jogando: 3, encerrada: 4, erro: 4 } // o plugin só avança (aviso atrasado não volta a sala)
const ESTADOS_SERVIDOR = ['carregada', 'jogando', 'encerrada', 'erro']
const FORMATOS_FILA = ['bo1', 'bo3'] // formatos que o líder pode buscar; só lobbies do mesmo formato se enfrentam
// Assinatura Premium ativa de quem busca (perfil.sub; ver src/comum/assinatura.js). A busca de MD3 é só para o líder assinante; o MD1 é livre.
const temSubAtiva = async (env, id) => subAtiva((await lerPerfil(env, id))?.sub)
const idsDe = (p) => [...p.times.A.membros, ...p.times.B.membros]
const partidaDe = (partidas, id) => Object.values(partidas).find((p) => idsDe(p).includes(id)) || null
// Quem do time já esteve no servidor e agora não está (caiu): as vagas que um substituto pode ocupar
const CHAMADO_MS = 60 * 1000 // tempo para o amigo chamado aceitar a vaga
const vagasDe = (p, time) => {
  const sv = p.servidor
  if (!sv || !['carregada', 'jogando'].includes(sv.estado)) return []
  if (!Array.isArray(sv.presentes)) return [] // o plugin ainda não contou quem está no servidor
  // Com a partida valendo, quem não está no servidor caiu (mesmo que o plugin tenha sido recarregado e nunca o tenha visto); antes disso só quem já tinha entrado
  return time.membros.filter((m) => !sv.presentes.includes(m) && (sv.estado === 'jogando' || (sv.vistos || []).includes(m)))
}
const passoDe = (p) => buildSteps(p.formato, p.primeiro)[p.historico.length] || null
const sorteio = (lista) => lista[Math.floor(Math.random() * lista.length)]

function criarPartida(todos, partidas, a, b) {
  const id = crypto.randomUUID()
  const time = (lider) => ({ lider, membros: [lider, ...todos[lider].membros] })
  partidas[id] = {
    id, fase: 'aceitar', prazo: Date.now() + ACEITE_SEG * 1000, times: { A: time(a), B: time(b) }, aceitos: [],
    formato: todos[a].formato, pool: DEFAULT_POOL, primeiro: Math.random() < 0.5 ? 'A' : 'B', historico: [],
  }
  todos[a].busca = null
  todos[b].busca = null
  return partidas[id]
}

// Aceite falhou: a partida some; o time que aceitou inteiro volta para a fila
function cancelarPartida(todos, partidas, p) {
  delete partidas[p.id]
  for (const t of [p.times.A, p.times.B]) {
    if (todos[t.lider] && t.membros.every((m) => p.aceitos.includes(m))) todos[t.lider].busca = Date.now()
  }
}

// Junta os lobbies que estão buscando, dois a dois (o mais antigo primeiro)
function procurar(todos, partidas) {
  const novas = []
  for (const formato of FORMATOS_FILA) {
    const fila = Object.keys(todos).filter((l) => todos[l].busca && todos[l].formato === formato).sort((x, y) => todos[x].busca - todos[y].busca)
    for (let i = 0; i + 1 < fila.length; i += 2) novas.push(criarPartida(todos, partidas, fila[i], fila[i + 1]))
  }
  return novas
}

function registrarPasso(p, h) {
  p.historico.push(h)
  if (passoDe(p)) p.prazo = Date.now() + VETO_SEG * 1000
  else {
    p.fase = 'pronto'
    p.servidor = { estado: 'fila', desde: Date.now() }
    prazoServidor(p)
  }
}

// Prazo da sala conforme a fase do servidor (o alarme age quando ele vence)
function prazoServidor(p, agora = Date.now()) {
  const s = p.servidor?.estado
  p.prazo = agora + (s === 'fila' ? T.fila : s === 'entregue' ? T.entrega : s === 'encerrada' || s === 'erro' ? T.encerrada : T.serie)
}

// O prazo da sala venceu: devolve false se a sala deve ser apagada; senão muda a fase do servidor e dá um prazo novo
function expirarServidor(p, agora = Date.now()) {
  const s = p.servidor?.estado
  if (s === 'fila') p.servidor = { ...p.servidor, estado: 'erro', detalhe: 'Nenhum servidor pegou a partida a tempo.' }
  else if (s === 'entregue') p.servidor = { ...p.servidor, estado: 'fila', desde: agora } // o plugin sumiu depois de pegar: oferece de novo
  else return false
  prazoServidor(p, agora)
  return true
}

// Série no formato do css_serie do plugin (BaseComp/Serie.cs): o A/B do site é o A/B da série.
// Mapas na ordem do veto (picks) e o decider por último, com round faca. Em cada pick o time que NÃO escolheu o mapa escolheu o lado:
// "ct" é o time que começa de CT.
function montarSerie(p, nomeDe) {
  const { picks, remaining } = deriveState(p.pool, p.historico)
  const mapas = picks.map((k) => ({ mapa: `de_${k.map}`, faca: false, ct: k.side === 'ct' ? k.sideBy : other(k.sideBy) }))
  mapas.push({ mapa: `de_${remaining[0]}`, faca: true, ct: null })
  const nomeTime = (t) => `time_${nomeDe(p.times[t].lider)}`
  const timeA = nomeTime('A')
  let timeB = nomeTime('B')
  if (timeB.toLowerCase() === timeA.toLowerCase()) timeB += ' (2)' // o plugin recusa dois times com o mesmo nome
  return {
    partidaId: p.id,
    formato: FORMATS[p.formato]?.label || p.formato.toUpperCase(),
    timeA,
    timeB,
    mapas,
    elenco: Object.fromEntries(['A', 'B'].flatMap((t) => p.times[t].membros.map((id) => [id, t]))),
  }
}

// Ação do líder no veto; devolve o código do erro ou null
function agirVeto(p, eu, valor) {
  const passo = passoDe(p)
  if (p.fase !== 'veto' || !passo) return 'fase'
  if (p.times[passo.team].lider !== eu) return 'vez'
  if (passo.type === 'side') {
    if (valor?.lado !== 'ct' && valor?.lado !== 't') return 'acao'
    registrarPasso(p, { ...passo, side: valor.lado })
  } else {
    if (!deriveState(p.pool, p.historico).remaining.includes(valor?.mapa)) return 'mapa'
    registrarPasso(p, { ...passo, map: valor.mapa })
  }
  return null
}

function autoVeto(p) {
  const passo = passoDe(p)
  if (passo.type === 'side') registrarPasso(p, { ...passo, side: sorteio(['ct', 't']), auto: true })
  else registrarPasso(p, { ...passo, map: sorteio(deriveState(p.pool, p.historico).remaining), auto: true })
}

const vazio = () => ({ amigos: [], recebidos: [], enviados: [] })
const tira = (lista, id) => (lista || []).filter((x) => x !== id)
const poe = (lista, id) => [...new Set([...(lista || []), id])]

// Presença: o objeto único que guarda as conexões
const presenca = (env) => objetoGlobal(env.PRESENCA)

async function minhaLista(env, eu, todos) {
  const m = todos[eu] || vazio()
  const ids = [...new Set([...m.amigos, ...m.recebidos, ...m.enviados])]
  const info = await nomesDe(env, ids)
  const com = (l) => l.map((id) => ({ id, ...info[id] }))
  return { amigos: com(m.amigos), recebidos: com(m.recebidos), enviados: com(m.enviados) }
}

// GET /amigos e POST /amigos { acao, id }
// Pedidos e amizades vivem no objeto de presença (consistência na hora): no KV (eventual) o pedido novo levava até 1 min para a outra pessoa enxergar.
export async function rotaAmigos(req, env, quem, cors) {
  const corpo = req.method === 'POST' ? await lerCorpo(req) : {}
  const r = await presenca(env).fetch('https://presenca/amigos', { method: 'POST', body: JSON.stringify({ metodo: req.method, quem: quem.id, acao: corpo.acao, id: corpo.id }) })
  return reenviar(r, cors)
}

// Avisos ao vivo para as abas abertas (sem aba aberta, não faz nada). Não derrubam a ação que avisa: a falha vai para o log.
const mandar = (env, caminho, corpo, oQue) => semDerrubar(presenca(env).fetch(`https://presenca${caminho}`, { method: 'POST', body: JSON.stringify(corpo) }), oQue)
// Mensagem para as abas abertas de uma lista de jogadores (times, chat do time...)
export const mandarPara = (env, ids, msg) => mandar(env, '/mandar', { ids, msg }, `aviso "${msg.tipo}"`)
// Mensagem para TODAS as abas abertas (ex.: bônus para todos: cada site busca o saldo e as notificações)
export const avisarTodos = (env, msg) => mandar(env, '/todos', { msg }, `aviso "${msg.tipo}" para todos`)
// Skin nova no inventário (o dono deu): o aviso aparece na hora
export const avisarSkin = (env, id) => mandarPara(env, [id], { tipo: 'skin' })
// Troca nova (ou aceita/recusada): o site recarrega as trocas na hora (comum/Trocas.jsx)
export const avisarTroca = (env, id) => mandarPara(env, [id], { tipo: 'troca' })
// Venderam um item meu no mercado: o sino busca a notificação nova e a lista do mercado atualiza
export const avisarMercado = (env, id) => mandarPara(env, [id], { tipo: 'mercado' })
// Perfil mudou (insígnia, moldura, assinatura...): o perfil novo vai para as abas abertas da pessoa
export const avisarPerfil = (env, id, perfil) => mandarPara(env, [id], { tipo: 'perfil', id, perfil: perfil || null })

// GET/POST /chat: chat da sala da partida (o objeto de presença guarda e entrega ao vivo)
export async function rotaChat(req, env, quem, cors) {
  const corpo = req.method === 'POST' ? JSON.stringify(await lerCorpo(req)) : undefined
  return reenviar(await presenca(env).fetch('https://presenca/chat', { method: req.method, headers: { 'X-Id': quem.id }, body: corpo }), cors)
}

// GET /lobby e POST /lobby { acao, id?, valor? }: o objeto de presença guarda e muda os lobbies (index.js confere o login)
export async function rotaLobby(req, env, quem, cors) {
  const corpo = req.method === 'POST' ? JSON.stringify(await lerCorpo(req)) : undefined
  return reenviar(await presenca(env).fetch('https://presenca/lobby', { method: req.method, headers: { 'X-Id': quem.id }, body: corpo }), cors)
}

// POST /servidor/proxima e /servidor/estado: só o plugin do servidor de CS2 (Authorization: Bearer <SERVIDOR_TOKEN>)
export async function rotaServidor(req, env, rota) {
  exigirBearer(req, env.SERVIDOR_TOKEN)
  return reenviar(await presenca(env).fetch(`https://presenca${rota}`, { method: 'POST', body: JSON.stringify(await lerCorpo(req)) }))
}

// GET /presenca?t=<token> (WebSocket): o index.js confere o token e manda para o objeto com o SteamID em X-Id
export function rotaPresenca(req, env, id) {
  const r = new Request(req)
  r.headers.set('X-Id', id)
  return presenca(env).fetch(r)
}

// Manda para uma aba; a aba que está fechando (send lança TypeError) já não precisa da mensagem
function enviarSeguro(ws, texto) {
  try {
    ws.send(texto)
  } catch (e) {
    if (!(e instanceof TypeError)) throw e
  }
}

export class Presenca {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.amigos = null // cache do KV "amigos" (some quando o objeto hiberna; relê na volta)
    // ping/pong de manutenção respondido sem acordar o objeto
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    this.fila = new Fila() // ver a nota da fila abaixo
    // Só o ambiente de teste local define isto (TEMPOS_TESTE="fila=4000,encerrada=3000"): prazos curtos para testar sem esperar minutos
    for (const par of String(env.TEMPOS_TESTE || '').split(',')) {
      const [k, v] = par.split('=')
      if (k in T && Number(v) > 0) T[k] = Number(v)
    }
  }

  // Fila: uma coisa de cada vez. Lobby, fila de partida, aceite, veto, alarme e o plugin mudam o mesmo estado (lido, mexido e gravado); sem ela,
  // dois pedidos juntos (os 10 jogadores clicando em ACEITAR) liam o mesmo estado e o último a gravar apagava o aceite do outro.
  exclusivo(fn) {
    return this.fila.rodar(fn)
  }

  async listaAmigos() {
    if (!this.amigos) {
      this.amigos = await this.state.storage.get('amigosV2')
      if (!this.amigos) {
        this.amigos = (await lerJsonKv(this.env, 'amigos')) || {} // primeira vez: traz o que estava no KV
        await this.state.storage.put('amigosV2', this.amigos)
      }
    }
    return this.amigos
  }

  // GET/POST /amigos (rotaAmigos): lista, pedir, aceitar, recusar, cancelar, remover. Tudo aqui dentro, um pedido de cada vez
  async amigosPedido(req) {
    const { metodo, quem, acao, id } = await lerCorpo(req)
    const todos = await this.listaAmigos()
    if (metodo === 'GET') return (minhaLista(this.env, quem, todos))
    if (!ACOES.includes(acao) || !ID_STEAM.test(String(id)) || id === quem) throw new ErroPedido('amigos')
    const eu = (todos[quem] ??= vazio())
    const ele = (todos[id] ??= vazio())
    if (acao === 'pedir') {
      if (eu.amigos.includes(id)) return (minhaLista(this.env, quem, todos))
      if (eu.amigos.length >= MAX_AMIGOS) throw new ErroConflito('limite')
      if (eu.recebidos.includes(id)) {
        // ele já tinha pedido: vira amizade direto
        eu.recebidos = tira(eu.recebidos, id); ele.enviados = tira(ele.enviados, quem)
        eu.amigos = poe(eu.amigos, id); ele.amigos = poe(ele.amigos, quem)
      } else {
        eu.enviados = poe(eu.enviados, id); ele.recebidos = poe(ele.recebidos, quem)
      }
    } else if (acao === 'aceitar') {
      if (!eu.recebidos.includes(id)) throw new ErroPedido('pedido')
      if (eu.amigos.length >= MAX_AMIGOS) throw new ErroConflito('limite')
      eu.recebidos = tira(eu.recebidos, id); ele.enviados = tira(ele.enviados, quem)
      eu.amigos = poe(eu.amigos, id); ele.amigos = poe(ele.amigos, quem)
    } else if (acao === 'recusar') {
      eu.recebidos = tira(eu.recebidos, id); ele.enviados = tira(ele.enviados, quem)
    } else if (acao === 'cancelar') {
      eu.enviados = tira(eu.enviados, id); ele.recebidos = tira(ele.recebidos, quem)
    } else if (acao === 'remover') {
      eu.amigos = tira(eu.amigos, id); ele.amigos = tira(ele.amigos, quem)
    }
    for (const k of [quem, id]) if (!todos[k].amigos.length && !todos[k].recebidos.length && !todos[k].enviados.length) delete todos[k]
    this.amigos = todos
    await this.state.storage.put('amigosV2', todos)
    // Avisa as duas pessoas (as abas abertas recarregam a lista e a presença na hora)
    for (const k of [quem, id]) {
      this.enviar(k, { tipo: 'lista' })
      if (this.state.getWebSockets(k).length) this.enviar(k, await this.estadoPara(k))
    }
    return (minhaLista(this.env, quem, todos))
  }

  // "jogando": quem está numa partida do site com o servidor carregado/ao vivo (e o plugin diz que está lá, quando ele informa quem está presente).
  // Só aparece para os outros (amigos, lobby); as regras de convite continuam usando a presença (statusDe).
  jogandoAgora = new Set()
  async sincronizarJogando(partidas) {
    const agora = new Set()
    for (const p of Object.values(partidas || {})) {
      if (!['carregada', 'jogando'].includes(p.servidor?.estado)) continue
      const presentes = Array.isArray(p.servidor.presentes) ? new Set(p.servidor.presentes) : null
      for (const id of idsDe(p)) if (!presentes || presentes.has(id)) agora.add(id)
    }
    const mudaram = [...new Set([...agora, ...this.jogandoAgora])].filter((id) => agora.has(id) !== this.jogandoAgora.has(id))
    this.jogandoAgora = agora
    for (const id of mudaram) await this.avisarAmigos(id, this.statusVisivel(id), this.statusVisivel(id) === 'offline' ? (await this.state.storage.get(`visto:${id}`)) || null : null)
  }
  statusVisivel(id) {
    return this.jogandoAgora.has(id) ? 'jogando' : this.statusDe(id)
  }
  async gravarPartidas(partidas) {
    await this.state.storage.put('partidas', partidas)
    await this.sincronizarJogando(partidas)
    await this.limparChats(partidas)
  }

  // ── Chat da sala da partida ──
  // Duas conversas por sala: "geral" (os dois times) e "time" (só o time de quem escreveu). As mensagens ficam guardadas só enquanto a sala existe:
  // quando ela fecha (série acabou, erro, cancelada), o chat da partida é apagado (limparChats).
  async limparChats(partidas) {
    const chaves = [...(await this.state.storage.list({ prefix: 'chat:' })).keys()]
    const velhas = chaves.filter((k) => !partidas[k.slice(5)])
    if (velhas.length) await this.state.storage.delete(velhas)
  }

  // GET /chat -> { partida, mensagens } (geral + as do meu time) · POST /chat { texto, canal } -> { ok, msg }
  async chat(req) {
    const eu = req.headers.get('X-Id')
    if (!ID_STEAM.test(String(eu))) throw new ErroPedido('id')
    const partidas = (await this.state.storage.get('partidas')) || {}
    const p = partidaDe(partidas, eu)
    if (!p) throw new ErroNaoEncontrado('sem-partida')
    const meuTime = p.times.A.membros.includes(eu) ? 'A' : 'B'
    const chave = `chat:${p.id}`
    const todas = (await this.state.storage.get(chave)) || []
    if (req.method === 'GET') return { partida: p.id, mensagens: todas.filter((m) => m.canal === 'geral' || m.time === meuTime) }

    const { texto, canal } = await lerCorpo(req)
    const limpo = String(texto || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
    if (!limpo || !['geral', 'time'].includes(canal)) throw new ErroPedido('mensagem')
    const agora = Date.now()
    if (agora - (this.ultimoChat.get(eu) || 0) < 800) throw new ErroLimite('devagar') // no máximo ~1 mensagem por segundo por pessoa
    this.ultimoChat.set(eu, agora)
    const info = (await nomesDe(this.env, [eu]))[eu] || {}
    const msg = { id: `${agora.toString(36)}${Math.random().toString(36).slice(2, 6)}`, de: eu, nome: info.nome || eu, canal, time: meuTime, texto: limpo, ts: agora }
    todas.push(msg)
    await this.state.storage.put(chave, todas.slice(-200))
    const destino = canal === 'geral' ? idsDe(p) : p.times[meuTime].membros
    for (const id of destino) this.enviar(id, { tipo: 'chat', partida: p.id, msg })
    return { ok: true, msg }
  }

  // online > ausente > offline, juntando todas as abas da pessoa
  statusDe(id) {
    // Conexão que não dá sinal há tempo demais (aba que morreu sem avisar, PC que dormiu) não conta como presente
    const agora = Date.now()
    const abas = this.state.getWebSockets(id).filter((ws) => {
      const ultimo = this.state.getWebSocketAutoResponseTimestamp(ws)?.getTime() || ws.deserializeAttachment()?.ts || agora
      return agora - ultimo < SEM_SINAL_MS
    })
    if (!abas.length) return 'offline'
    return abas.some((ws) => ws.deserializeAttachment()?.st !== 'ausente') ? 'online' : 'ausente'
  }

  enviar(id, msg) {
    const texto = JSON.stringify(msg)
    for (const ws of this.state.getWebSockets(id)) enviarSeguro(ws, texto)
  }

  // Estado completo para uma pessoa: status (e "visto por último") de cada amigo
  async estadoPara(id) {
    const amigos = (await this.listaAmigos())[id]?.amigos || []
    const vistos = amigos.length ? await this.state.storage.get(amigos.map((a) => `visto:${a}`)) : new Map()
    const status = Object.fromEntries(amigos.map((a) => [a, { st: this.statusVisivel(a), visto: vistos.get(`visto:${a}`) || null }]))
    return { tipo: 'estado', status }
  }

  // Avisa os amigos de "id" que o status dele mudou
  async avisarAmigos(id, st, visto = null) {
    const amigos = (await this.listaAmigos())[id]?.amigos || []
    for (const a of amigos) this.enviar(a, { tipo: 'mudou', id, st, visto })
  }

  // ── Lobby ──
  // GET /lobby (X-Id = quem pergunta) devolve o lobby dele; POST { acao, id?, valor? } muda e devolve o lobby novo.
  async lobby(req) {
    const eu = req.headers.get('X-Id')
    if (!ID_STEAM.test(String(eu))) throw new ErroPedido('id')
    const todos = (await this.state.storage.get('lobbies')) || {}
    const partidas = (await this.state.storage.get('partidas')) || {}
    const amigosEu = (await this.listaAmigos())[eu]?.amigos || []
    const achar = (id) => (todos[id] ? id : Object.keys(todos).find((l) => todos[l].membros.includes(id)) || null)
    const lideres = new Set() // lobbies mexidos: se forem públicos, os amigos do líder também recarregam a lista de lobbies abertos
    const avisados = new Set([eu])
    let mudou = req.method === 'POST' // só grava e avisa se algo mudou (a limpeza de membros offline também conta)
    const avisar = (...ids) => ids.flat().forEach((i) => i && avisados.add(i))
    // Em lobby = dentro de um grupo com mais gente (líder com membros, ou membro de outro líder). Sozinho (ou só com convites) ainda dá para convidar.
    const emLobbyComGente = (id) => {
      const l = achar(id)
      return !!l && todos[l].membros.length > 0
    }

    // Tira "id" de qualquer lobby em que esteja. Líder que sai passa a liderança para o primeiro membro.
    const sairDe = (id) => {
      const lider = achar(id)
      if (!lider) return
      mudou = true
      const lb = todos[lider]
      lideres.add(lider)
      avisar(lider, lb.membros, lb.convites)
      if (lider === id) {
        if (lb.membros.length) {
          const [novo, ...resto] = lb.membros
          todos[novo] = { membros: resto, convites: [], publico: lb.publico, busca: null }
          lideres.add(novo)
        }
        delete todos[id]
      } else {
        lb.membros = tira(lb.membros, id)
        lb.busca = null // sem os 5, a busca para
      }
    }

    // Membro offline faz tempo sai sozinho (só confere o lobby de quem está perguntando)
    const limpar = async () => {
      const lider = achar(eu)
      if (!lider || todos[lider].busca || partidaDe(partidas, eu)) return // buscando ou em partida: o grupo não muda
      for (const m of [...todos[lider].membros]) {
        if (m === eu || this.statusDe(m) !== 'offline') continue
        // "visto" só existe depois que a pessoa fechou a última aba; sem registro, não tira (nunca saiu da conta)
        const visto = await this.state.storage.get(`visto:${m}`)
        if (visto && Date.now() - visto > LOBBY_OFFLINE_MS) sairDe(m)
      }
    }

    if (req.method === 'POST') {
      const { acao, id, valor } = await lerCorpo(req)
      if (!ACOES_LOBBY.includes(acao)) throw new ErroPedido('acao')
      const meuLider = achar(eu)
      const eLider = !meuLider || meuLider === eu
      const alvoOk = ID_STEAM.test(String(id)) && id !== eu
      const minha = partidaDe(partidas, eu)
      if (minha && !ACOES_PARTIDA.includes(acao)) throw new ErroConflito('em-partida')
      if (!minha && ACOES_PARTIDA.includes(acao)) throw new ErroNaoEncontrado('sem-partida')
      if (todos[meuLider || eu]?.busca && (acao === 'convidar' || acao === 'remover')) throw new ErroConflito('buscando')
      if (acao === 'convidar') {
        // qualquer membro do lobby convida (o convite entra no lobby do líder); só o líder remove
        if (!alvoOk || !amigosEu.includes(id)) throw new ErroPedido('amigo')
        if (this.statusDe(id) === 'offline') throw new ErroConflito('offline')
        const dono = meuLider || eu
        if (dono === id) throw new ErroPedido('amigo')
        if (partidaDe(partidas, id)) throw new ErroConflito('convidado-em-partida')
        if (emLobbyComGente(id) && achar(id) !== dono) throw new ErroConflito('em-lobby') // já está num lobby: não dá para convidar
        const lb = (todos[dono] ??= novoLobby())
        if (!lb.membros.includes(id) && !lb.convites.includes(id)) {
          if (1 + lb.membros.length + lb.convites.length >= LOBBY_MAX) throw new ErroConflito('cheio')
          lb.convites = poe(lb.convites, id)
        }
        lideres.add(dono)
        avisar(dono)
        avisar(id, lb.membros)
      } else if (acao === 'remover') {
        if (!alvoOk || !todos[eu] || !eLider) throw new ErroPermissao('lider')
        const lb = todos[eu]
        lb.membros = tira(lb.membros, id)
        lb.convites = tira(lb.convites, id)
        lideres.add(eu)
        avisar(id, lb.membros)
      } else if (acao === 'entrar' && alvoOk && Object.values(partidas).some((x) => x.chamados?.[eu]?.por === id && x.chamados[eu].ate > Date.now())) {
        // Aceitou o convite para uma vaga de partida em andamento: entra no lugar de quem caiu
        const p = Object.values(partidas).find((x) => x.chamados?.[eu]?.por === id && x.chamados[eu].ate > Date.now())
        const time = p.times.A.membros.includes(id) ? p.times.A : p.times.B
        const saiu = vagasDe(p, time)[0]
        if (!saiu) {
          delete p.chamados[eu]
          throw new ErroConflito('sem-vaga')
        }
        if (todos[eu]?.membros.length) throw new ErroConflito('ocupado')
        sairDe(eu) // sai do grupo em que estava
        time.membros = time.membros.map((m) => (m === saiu ? eu : m))
        if (time.lider === saiu) time.lider = eu
        p.servidor.vistos = (p.servidor.vistos || []).filter((m) => m !== saiu)
        p.servidor.presentes = (p.servidor.presentes || []).filter((m) => m !== saiu)
        delete p.chamados[eu]
        avisar(idsDe(p), saiu)
      } else if (acao === 'entrar') {
        const lb = alvoOk ? todos[id] : null
        if (!lb) throw new ErroNaoEncontrado('sem-lobby')
        if (lb.busca) throw new ErroConflito('buscando')
        if (!lb.membros.includes(eu)) {
          if (!lb.convites.includes(eu) && !(lb.publico && amigosEu.includes(id))) throw new ErroPermissao('negado')
          if (1 + lb.membros.length >= LOBBY_MAX) throw new ErroConflito('cheio')
          if (todos[eu]?.membros.length) throw new ErroConflito('ocupado') // líder com gente: saia/passe a liderança antes
          sairDe(eu) // sai do lobby em que estava (o próprio, vazio, ou o de outro líder)
          lb.convites = tira(lb.convites, eu)
          lb.membros = poe(lb.membros, eu)
        }
        lideres.add(id)
        avisar(id, lb.membros, lb.convites)
      } else if (acao === 'recusar') {
        for (const x of Object.values(partidas)) if (x.chamados?.[eu]?.por === id) delete x.chamados[eu]
        avisar(id)
        if (alvoOk && todos[id]) {
          todos[id].convites = tira(todos[id].convites, eu)
          lideres.add(id)
          avisar(id)
        }
      } else if (acao === 'sair') {
        sairDe(eu)
      } else if (acao === 'publico') {
        if (!eLider) throw new ErroPermissao('lider')
        const lb = (todos[eu] ??= novoLobby())
        lb.publico = valor === true
        lideres.add(eu)
        avisar(lb.membros)
      } else if (acao === 'buscar') {
        const lb = todos[eu]
        if (!eLider || !lb || 1 + lb.membros.length < LOBBY_MAX) throw new ErroPedido('incompleto')
        if (!FORMATOS_FILA.includes(valor?.formato) || !FORMATS[valor.formato]) throw new ErroPedido('formato')
        if (valor.formato === 'bo3' && !(await temSubAtiva(this.env, eu))) throw new ErroPermissao('sem-sub')
        if (!lb.busca) {
          lb.convites = []
          lb.formato = valor.formato
          lb.busca = Date.now()
        }
        avisar(lb.membros)
      } else if (acao === 'cancelar-busca') {
        if (!eLider || !todos[eu]) throw new ErroPermissao('lider')
        todos[eu].busca = null
        avisar(todos[eu].membros)
      } else if (acao === 'aceitar') {
        if (minha.fase !== 'aceitar') throw new ErroConflito('fase')
        minha.aceitos = poe(minha.aceitos, eu)
        if (minha.aceitos.length === idsDe(minha).length) {
          minha.fase = 'veto'
          minha.prazo = Date.now() + VETO_SEG * 1000
        }
        avisar(idsDe(minha))
      } else if (acao === 'recusar-partida') {
        if (minha.fase !== 'aceitar') throw new ErroConflito('fase')
        cancelarPartida(todos, partidas, minha)
        avisar(idsDe(minha))
      } else if (acao === 'substituir') {
        // Alguém do time caiu no meio da partida: um membro chama um amigo (online/ausente) para o lugar dele
        const sv = minha.servidor
        if (minha.fase !== 'pronto' || !['carregada', 'jogando'].includes(sv?.estado)) throw new ErroConflito('fase')
        if (!alvoOk || !amigosEu.includes(id)) throw new ErroPedido('amigo')
        if (this.statusDe(id) === 'offline') throw new ErroConflito('offline')
        if (partidaDe(partidas, id)) throw new ErroConflito('em-partida')
        if (todos[id]?.membros.length) throw new ErroConflito('ocupado') // líder de grupo com gente: ele precisa desfazer o grupo antes
        const time = minha.times.A.membros.includes(eu) ? minha.times.A : minha.times.B
        const vagas = vagasDe(minha, time)
        const saiu = vagas.includes(valor?.saiu) ? valor.saiu : vagas[0]
        if (!saiu) throw new ErroConflito('sem-vaga')
        // Só vira substituto se aceitar (o convite aparece para ele como o de lobby; vale por 1 minuto)
        minha.chamados = { ...(minha.chamados || {}), [id]: { por: eu, ate: Date.now() + CHAMADO_MS } }
        avisar(id)
      } else if (acao === 'veto') {
        const erro = agirVeto(minha, eu, valor)
        if (erro) throw new ErroConflito(erro)
        avisar(idsDe(minha))
      }
      for (const p of procurar(todos, partidas)) avisar(idsDe(p))
    }
    await limpar()

    // quem estava num lobby aberto: os amigos dele recarregam a lista de "lobbies abertos"
    for (const l of lideres) {
      // os amigos de quem mexeu no lobby recarregam (o "Em lobby" deles na lista de convidar muda; lobby público também aparece em "abertos")
      avisar((await this.listaAmigos())[l]?.amigos || [])
    }
    for (const k of Object.keys(todos)) if (lobbyVazio(todos[k])) delete todos[k]
    if (mudou) {
      await this.state.storage.put('lobbies', todos)
      await this.gravarPartidas(partidas)
      await this.agendar(partidas)
      for (const a of avisados) this.enviar(a, { tipo: 'lobby' })
    }

    // Vista para quem perguntou
    const lider = achar(eu) || eu
    const lb = todos[lider] || novoLobby()
    const convitesRecebidos = Object.keys(todos).filter((l) => l !== lider && todos[l].convites.includes(eu))
    const abertos = amigosEu.filter((a) => a !== lider && todos[a]?.publico && 1 + todos[a].membros.length < LOBBY_MAX && !todos[a].convites.includes(eu))
    const minhaPartida = partidaDe(partidas, eu)
    const chamadosPor = minhaPartida ? [] : [...new Set(Object.values(partidas).flatMap((x) => (x.chamados?.[eu] && x.chamados[eu].ate > Date.now() && vagasDe(x, x.times.A.membros.includes(x.chamados[eu].por) ? x.times.A : x.times.B).length ? [x.chamados[eu].por] : [])))]
    const ids = [...new Set([lider, ...lb.membros, ...lb.convites, ...convitesRecebidos, ...chamadosPor, ...abertos, ...(minhaPartida ? idsDe(minhaPartida) : [])])]
    const info = await nomesDe(this.env, ids)
    const pessoa = (id) => ({ id, ...info[id], st: this.statusVisivel(id) })
    return {
      eu,
      lider,
      souLider: lider === eu,
      publico: !!lb.publico,
      max: LOBBY_MAX,
      busca: lb.busca || null,
      formato: lb.formato || null,
      partida: minhaPartida && {
        id: minhaPartida.id, fase: minhaPartida.fase, prazo: minhaPartida.prazo, agora: Date.now(), formato: minhaPartida.formato,
        pool: minhaPartida.pool, primeiro: minhaPartida.primeiro, historico: minhaPartida.historico, aceitos: minhaPartida.aceitos,
        meuTime: minhaPartida.times.A.membros.includes(eu) ? 'A' : 'B',
        servidor: minhaPartida.servidor && {
          estado: minhaPartida.servidor.estado,
          detalhe: minhaPartida.servidor.detalhe || '',
          placar: minhaPartida.servidor.placar || '',
          conectar: this.env.SERVIDOR_CONECTAR || '',
          senha: ['carregada', 'jogando'].includes(minhaPartida.servidor.estado) ? this.env.SERVIDOR_SENHA || '' : '',
          vagas: vagasDe(minhaPartida, minhaPartida.times.A.membros.includes(eu) ? minhaPartida.times.A : minhaPartida.times.B).map(pessoa),
        },
        times: Object.fromEntries(['A', 'B'].map((t) => [t, { lider: minhaPartida.times[t].lider, membros: minhaPartida.times[t].membros.map(pessoa) }])),
      },
      membros: [lider, ...lb.membros].map(pessoa),
      convites: lb.convites.map(pessoa),
      convitesRecebidos: [
        ...convitesRecebidos.map((l) => ({ lider: pessoa(l), membros: 1 + todos[l].membros.length })),
        ...chamadosPor.map((l) => ({ lider: pessoa(l), membros: 0, vaga: true })),
      ],
      abertos: abertos.map((l) => ({ lider: pessoa(l), membros: 1 + todos[l].membros.length })),
      // amigos que não dá para convidar agora: já estão num lobby com gente, ou numa partida
      emLobby: amigosEu.filter((a) => a !== lider && emLobbyComGente(a) && achar(a) !== lider),
      emPartida: amigosEu.filter((a) => partidaDe(partidas, a)),
    }
  }

  // Um alarme só, no prazo mais próximo entre as partidas (fim do aceite, vez do veto, sala velha)
  async agendar(partidas) {
    const prazos = Object.values(partidas).map((p) => p.prazo).filter(Boolean)
    if (prazos.length) await this.state.storage.setAlarm(Math.min(...prazos) + 50)
    else await this.state.storage.deleteAlarm()
  }

  alarm() {
    return this.exclusivo(() => this.tratarAlarme())
  }

  async tratarAlarme() {
    const todos = (await this.state.storage.get('lobbies')) || {}
    const partidas = (await this.state.storage.get('partidas')) || {}
    const avisados = new Set()
    for (const p of Object.values(partidas)) {
      while (p.prazo && p.prazo <= Date.now()) {
        idsDe(p).forEach((i) => avisados.add(i))
        if (p.fase === 'veto') autoVeto(p)
        else if (p.fase === 'aceitar') {
          cancelarPartida(todos, partidas, p)
          break
        } else if (!expirarServidor(p)) {
          delete partidas[p.id] // série encerrada/com erro (ou passou do limite): a sala fecha
          break
        }
      }
    }
    for (const p of procurar(todos, partidas)) idsDe(p).forEach((i) => avisados.add(i))
    await this.state.storage.put('lobbies', todos)
    await this.gravarPartidas(partidas)
    await this.agendar(partidas)
    for (const a of avisados) this.enviar(a, { tipo: 'lobby' })
  }

  // ── Servidor de CS2 (o plugin BaseComp conversa com estas duas rotas; index.js confere o token) ──
  // POST /servidor/proxima: o plugin está livre e pede a próxima partida; devolve a série pronta ({ nenhuma: true } se não tem).
  async servidorProxima() {
    const partidas = (await this.state.storage.get('partidas')) || {}
    const agora = Date.now()
    const avisados = new Set()
    for (const p of Object.values(partidas)) {
      if (p.servidor?.estado === 'entregue' && agora - p.servidor.entregueEm > T.entrega) {
        expirarServidor(p, agora) // o plugin sumiu depois de pegar: oferece de novo (o alarme também faz isto)
        idsDe(p).forEach((i) => avisados.add(i))
      }
    }
    // O plugin só pergunta quando está sem série. Partida que ainda consta carregada/jogando é série que acabou sem avisar (cancelada, plugin recarregado)
    for (const x of Object.values(partidas)) {
      if ((x.servidor?.estado === 'carregada' || x.servidor?.estado === 'jogando') && agora - (x.servidor.entregueEm || 0) > 30000) {
        x.servidor = { ...x.servidor, estado: 'encerrada', detalhe: x.servidor.detalhe || 'cancelada' }
        prazoServidor(x, agora)
        idsDe(x).forEach((i) => avisados.add(i))
      }
    }
    const p = Object.values(partidas)
      .filter((x) => x.fase === 'pronto' && x.servidor?.estado === 'fila')
      .sort((a, b) => a.servidor.desde - b.servidor.desde)[0]
    let resposta = { nenhuma: true }
    if (p) {
      const info = await nomesDe(this.env, idsDe(p))
      resposta = montarSerie(p, (id) => info[id]?.nome || id)
      p.servidor = { ...p.servidor, estado: 'entregue', entregueEm: agora }
      prazoServidor(p, agora)
      idsDe(p).forEach((i) => avisados.add(i))
    }
    if (avisados.size) {
      await this.gravarPartidas(partidas)
      await this.agendar(partidas)
      for (const a of avisados) this.enviar(a, { tipo: 'lobby' })
    }
    return resposta
  }

  // POST /servidor/estado { partidaId, estado, detalhe?, placar? }: o plugin conta em que fase a série está
  async servidorEstado(req) {
    const { partidaId, estado, detalhe, placar } = await lerCorpo(req)
    if (!ESTADOS_SERVIDOR.includes(estado)) throw new ErroPedido('estado')
    const partidas = (await this.state.storage.get('partidas')) || {}
    const p = partidas[String(partidaId)]
    if (!p?.servidor) throw new ErroNaoEncontrado('sem-partida') // sala fechada pelos jogadores: o plugin segue o jogo mesmo assim
    // aviso atrasado (tentativa repetida) ou depois do fim não volta a sala para trás
    if (ORDEM_SERVIDOR[estado] < ORDEM_SERVIDOR[p.servidor.estado] || ORDEM_SERVIDOR[p.servidor.estado] >= 4) return { ok: true, ignorado: true }
    p.servidor = { ...p.servidor, estado, detalhe: String(detalhe || '').slice(0, 200), placar: String(placar || '').slice(0, 40) }
    prazoServidor(p)
    await this.gravarPartidas(partidas)
    await this.agendar(partidas)
    for (const i of idsDe(p)) this.enviar(i, { tipo: 'lobby' })
    return { ok: true }
  }

  // POST /servidor/elenco { partidaId, presentes }: o plugin diz quem do elenco está no servidor e recebe o elenco atual
  // (muda quando um membro chama um substituto). Sem partida (já fechada): { erro }.
  async servidorElenco(req) {
    const { partidaId, presentes } = await lerCorpo(req)
    const partidas = (await this.state.storage.get('partidas')) || {}
    const p = partidas[String(partidaId)]
    if (!p?.servidor) throw new ErroNaoEncontrado('sem-partida')
    const elenco = Object.fromEntries(['A', 'B'].flatMap((t) => p.times[t].membros.map((id) => [id, t])))
    if (['carregada', 'jogando'].includes(p.servidor.estado) && Array.isArray(presentes)) {
      const agora = presentes.map(String).filter((id) => elenco[id])
      const vistos = [...new Set([...(p.servidor.vistos || []), ...agora])]
      const mudou = !Array.isArray(p.servidor.presentes) || JSON.stringify([...agora].sort()) !== JSON.stringify([...(p.servidor.presentes || [])].sort()) || vistos.length !== (p.servidor.vistos || []).length
      if (mudou) {
        p.servidor = { ...p.servidor, presentes: agora, vistos }
        await this.gravarPartidas(partidas)
        for (const i of idsDe(p)) this.enviar(i, { tipo: 'lobby' })
      }
    }
    return { elenco }
  }

  ultimoChat = new Map()

  async limparTeste(req) {
    const { apenasPartidas } = await lerCorpo(req)
    await this.state.storage.delete(apenasPartidas ? ['partidas'] : ['lobbies', 'partidas'])
    if (!apenasPartidas) await this.state.storage.delete([...(await this.state.storage.list({ prefix: 'visto:' })).keys()]) // "visto offline" antigo expulsaria o jogador de teste do grupo
    await this.state.storage.deleteAlarm()
    return { ok: true }
  }

  // /mandar: mensagem para as abas de uma lista de jogadores · /todos: para todas as abas abertas
  async avisar(caminho, req) {
    const { ids = [], msg } = await lerCorpo(req)
    if (!msg) throw new ErroPedido('msg')
    if (caminho === '/mandar') for (const id of ids) this.enviar(id, msg)
    else {
      const texto = JSON.stringify(msg)
      for (const ws of this.state.getWebSockets()) enviarSeguro(ws, texto)
    }
    return { ok: true }
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (!this.jogandoPronto) {
      this.jogandoPronto = true // quem está jogando agora (partidas guardadas) entra na conta logo na primeira chamada depois de o objeto acordar
      this.jogandoAgora = new Set()
      await this.sincronizarJogando((await this.state.storage.get('partidas')) || {})
    }
    const rotas = {
      '/amigos': () => this.amigosPedido(req),
      '/chat': () => this.chat(req),
      '/lobby': () => this.lobby(req),
      '/servidor/elenco': () => this.servidorElenco(req),
      '/servidor/proxima': () => this.servidorProxima(),
      '/servidor/estado': () => this.servidorEstado(req),
      // só o ambiente de teste local liga isto (index.js exige MODO_TESTE): apaga as partidas (e os lobbies, sem { apenasPartidas: true })
      '/teste/limpar': () => this.limparTeste(req),
    }
    if (rotas[url.pathname]) return responder(() => this.exclusivo(rotas[url.pathname]))
    if (url.pathname === '/todos' || url.pathname === '/mandar') return responder(() => this.avisar(url.pathname, req))

    if (req.headers.get('Upgrade') !== 'websocket') return respostaDeErro(new ErroNaoEncontrado('rota'))
    const id = req.headers.get('X-Id')
    if (!ID_STEAM.test(String(id))) return respostaDeErro(new ErroPedido('id'))
    const antes = this.statusDe(id)
    const [cliente, servidor] = Object.values(new WebSocketPair())
    this.state.acceptWebSocket(servidor, [id])
    servidor.serializeAttachment({ id, st: 'online', ts: Date.now() })
    servidor.send(JSON.stringify(await this.estadoPara(id)))
    if (antes !== 'online') await this.avisarAmigos(id, this.statusVisivel(id))
    return new Response(null, { status: 101, webSocket: cliente })
  }

  async webSocketMessage(ws, msg) {
    const dados = ws.deserializeAttachment()
    if (!dados?.id || (msg !== 'online' && msg !== 'ausente') || dados.st === msg) return
    const antes = this.statusDe(dados.id)
    ws.serializeAttachment({ ...dados, st: msg })
    const depois = this.statusDe(dados.id)
    if (antes !== depois) await this.avisarAmigos(dados.id, this.statusVisivel(dados.id))
  }

  async saiu(ws) {
    const id = ws.deserializeAttachment()?.id
    if (!id) return
    // a aba que fechou ainda aparece em getWebSockets até o fim deste evento: conta as outras
    const outras = this.state.getWebSockets(id).filter((x) => x !== ws)
    if (outras.length) {
      const st = outras.some((x) => x.deserializeAttachment()?.st !== 'ausente') ? 'online' : 'ausente'
      await this.avisarAmigos(id, this.jogandoAgora.has(id) ? 'jogando' : st)
      return
    }
    const agora = Date.now()
    await this.state.storage.put(`visto:${id}`, agora)
    await this.avisarAmigos(id, this.jogandoAgora.has(id) ? 'jogando' : 'offline', agora)
  }

  async webSocketClose(ws, codigo) {
    await this.saiu(ws)
    // 1005, 1006 e 1015 são reservados (querem dizer "não veio código"): não podem ser mandados de volta, então a resposta é 1000 (normal)
    const resposta = [1005, 1006, 1015].includes(codigo) ? 1000 : codigo
    try {
      ws.close(resposta, 'tchau')
    } catch (e) {
      if (!(e instanceof TypeError)) throw e // já estava fechada
    }
  }

  async webSocketError(ws) {
    await this.saiu(ws)
  }
}
