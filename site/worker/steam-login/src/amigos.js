// Amigos (pedido e aceite, como na FACEIT) e presença em tempo real (online / ausente / offline no site).
//
// Lista de amizades: KV "amigos" = { "<SteamID64>": { amigos: [ids], recebidos: [ids], enviados: [ids] } }.
// Só muda quando alguém pede, aceita, recusa, cancela ou remove (poucas gravações: cabe no KV grátis).
//
// Presença: Durable Object "Presenca" (uma instância só, "global"). Cada aba do site com login abre um WebSocket
// (GET /presenca?t=<token>); o objeto guarda as conexões (API de hibernação: não cobra enquanto ninguém fala) e,
// quando alguém entra, sai ou fica ausente, avisa só os AMIGOS dessa pessoa. "Visto por último" fica no armazenamento
// do próprio objeto. Rotas (com login, em index.js): GET /amigos, POST /amigos { acao, id }.

import { DEFAULT_POOL } from '../../../src/paginas/neurapick/data/maps.js'
import { FORMATS, buildSteps, deriveState, other } from '../../../src/paginas/neurapick/data/veto.js'

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
const T = { fila: 10 * 60 * 1000, entrega: 90 * 1000, serie: 6 * 60 * 60 * 1000, encerrada: 2 * 60 * 1000 }
const ORDEM_SERVIDOR = { fila: 0, entregue: 1, carregada: 2, jogando: 3, encerrada: 4, erro: 4 } // o plugin só avança (aviso atrasado não volta a sala)
const ESTADOS_SERVIDOR = ['carregada', 'jogando', 'encerrada', 'erro']
const FORMATOS_FILA = ['bo1', 'bo3'] // formatos que o líder pode buscar; só lobbies do mesmo formato se enfrentam
// Assinatura Premium ativa de quem busca (perfis[id].sub, KV; ver src/comum/assinatura.js): sem data = infinita, vencida não vale.
// A busca de MD3 é só para o líder assinante; o MD1 é livre.
async function temSubAtiva(env, id) {
  try {
    const sub = ((await env.MOLDURAS.get('perfis', 'json')) || {})[id]?.sub
    return !!sub && (sub.expira == null || Number(sub.expira) > Date.now())
  } catch {
    return false
  }
}
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

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const vazio = () => ({ amigos: [], recebidos: [], enviados: [] })
const tira = (lista, id) => (lista || []).filter((x) => x !== id)
const poe = (lista, id) => [...new Set([...(lista || []), id])]

async function lerAmigos(env) {
  try {
    return (await env.MOLDURAS.get('amigos', 'json')) || {}
  } catch {
    return {}
  }
}

// Presença: o objeto único que guarda as conexões
const presenca = (env) => env.PRESENCA.get(env.PRESENCA.idFromName('global'))

// Nome e foto: quem já entrou no site (lista "usuarios"); os outros, pela Web API da Steam numa chamada só
async function nomes(env, ids) {
  const usuarios = (await env.MOLDURAS.get('usuarios', 'json').catch(() => null)) || {}
  const fora = ids.filter((id) => !usuarios[id]?.nome)
  const steam = {}
  if (fora.length && env.STEAM_API_KEY) {
    try {
      const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${fora.slice(0, 100).join(',')}`)
      for (const p of (await r.json())?.response?.players || []) steam[p.steamid] = { nome: p.personaname || '', avatar: p.avatarfull || '' }
    } catch {
      // sem nome: o site mostra o SteamID
    }
  }
  return Object.fromEntries(ids.map((id) => [id, { nome: usuarios[id]?.nome || steam[id]?.nome || '', avatar: usuarios[id]?.avatar || steam[id]?.avatar || '' }]))
}

async function minhaLista(env, eu, todos) {
  const m = todos[eu] || vazio()
  const ids = [...new Set([...m.amigos, ...m.recebidos, ...m.enviados])]
  const info = await nomes(env, ids)
  const com = (l) => l.map((id) => ({ id, ...info[id] }))
  return { amigos: com(m.amigos), recebidos: com(m.recebidos), enviados: com(m.enviados) }
}

// GET /amigos e POST /amigos { acao, id }
export async function rotaAmigos(req, env, quem, cors) {
  const todos = await lerAmigos(env)
  if (req.method === 'GET') return json(await minhaLista(env, quem.id, todos), 200, cors)

  let corpo
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'corpo' }, 400, cors)
  }
  const { acao, id } = corpo || {}
  if (!ACOES.includes(acao) || !ID_STEAM.test(String(id)) || id === quem.id) return json({ erro: 'amigos' }, 400, cors)

  const eu = (todos[quem.id] ??= vazio())
  const ele = (todos[id] ??= vazio())
  if (acao === 'pedir') {
    if (eu.amigos.includes(id)) return json(await minhaLista(env, quem.id, todos), 200, cors)
    if (eu.amigos.length >= MAX_AMIGOS) return json({ erro: 'limite' }, 400, cors)
    if (eu.recebidos.includes(id)) {
      // ele já tinha pedido: vira amizade direto
      eu.recebidos = tira(eu.recebidos, id); ele.enviados = tira(ele.enviados, quem.id)
      eu.amigos = poe(eu.amigos, id); ele.amigos = poe(ele.amigos, quem.id)
    } else {
      eu.enviados = poe(eu.enviados, id); ele.recebidos = poe(ele.recebidos, quem.id)
    }
  } else if (acao === 'aceitar') {
    if (!eu.recebidos.includes(id)) return json({ erro: 'pedido' }, 400, cors)
    if (eu.amigos.length >= MAX_AMIGOS) return json({ erro: 'limite' }, 400, cors)
    eu.recebidos = tira(eu.recebidos, id); ele.enviados = tira(ele.enviados, quem.id)
    eu.amigos = poe(eu.amigos, id); ele.amigos = poe(ele.amigos, quem.id)
  } else if (acao === 'recusar') {
    eu.recebidos = tira(eu.recebidos, id); ele.enviados = tira(ele.enviados, quem.id)
  } else if (acao === 'cancelar') {
    eu.enviados = tira(eu.enviados, id); ele.recebidos = tira(ele.recebidos, quem.id)
  } else if (acao === 'remover') {
    eu.amigos = tira(eu.amigos, id); ele.amigos = tira(ele.amigos, quem.id)
  }
  for (const k of [quem.id, id]) if (!todos[k].amigos.length && !todos[k].recebidos.length && !todos[k].enviados.length) delete todos[k]
  await env.MOLDURAS.put('amigos', JSON.stringify(todos))
  // Avisa as duas pessoas (as abas abertas recarregam a lista e a presença na hora)
  await presenca(env).fetch('https://presenca/avisar', { method: 'POST', body: JSON.stringify({ ids: [quem.id, id] }) }).catch(() => {})
  return json(await minhaLista(env, quem.id, todos), 200, cors)
}

// Perfil mudou (admin deu insígnia, moldura...): manda o perfil novo para as abas abertas da pessoa, na hora
// (o site mostra o aviso de insígnia nova sem esperar a releitura dos perfis). Sem aba aberta, não faz nada.
// Skin nova no inventário de alguém (o dono deu): quem está com o site aberto mostra o aviso na hora
export async function avisarSkin(env, id) {
  await presenca(env)
    .fetch('https://presenca/mandar', { method: 'POST', body: JSON.stringify({ ids: [id], msg: { tipo: 'skin' } }) })
    .catch(() => {})
}

// Troca nova (ou aceita/recusada) envolvendo a pessoa: o site dela recarrega as trocas na hora (comum/Trocas.jsx)
export async function avisarTroca(env, id) {
  await presenca(env)
    .fetch('https://presenca/mandar', { method: 'POST', body: JSON.stringify({ ids: [id], msg: { tipo: 'troca' } }) })
    .catch(() => {})
}

// Venderam um item meu no mercado: o sino busca a notificação nova e a lista do mercado atualiza na hora (comum/mercado.js)
export async function avisarMercado(env, id) {
  await presenca(env)
    .fetch('https://presenca/mandar', { method: 'POST', body: JSON.stringify({ ids: [id], msg: { tipo: 'mercado' } }) })
    .catch(() => {})
}

export async function avisarPerfil(env, id, perfil) {
  await presenca(env)
    .fetch('https://presenca/mandar', { method: 'POST', body: JSON.stringify({ ids: [id], msg: { tipo: 'perfil', id, perfil: perfil || null } }) })
    .catch(() => {})
}

// GET /lobby e POST /lobby { acao, id?, valor? }: o objeto de presença guarda e muda os lobbies (index.js confere o login)
export async function rotaLobby(req, env, quem, cors) {
  const corpo = req.method === 'POST' ? await req.text() : undefined
  const r = await presenca(env).fetch('https://presenca/lobby', { method: req.method, headers: { 'X-Id': quem.id, 'Content-Type': 'application/json' }, body: corpo })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
}

// POST /servidor/proxima e /servidor/estado: só o plugin do servidor de CS2 (Authorization: Bearer <SERVIDOR_TOKEN>)
export async function rotaServidor(req, env, rota) {
  const cab = req.headers.get('Authorization') || ''
  const dado = new TextEncoder().encode(cab.startsWith('Bearer ') ? cab.slice(7).trim() : '')
  const certo = new TextEncoder().encode(env.SERVIDOR_TOKEN || '')
  let dif = dado.length ^ certo.length // compara tudo, sem parar no primeiro byte diferente
  for (let i = 0; i < certo.length; i++) dif |= (dado[i] ?? 0) ^ certo[i]
  if (!env.SERVIDOR_TOKEN || dif !== 0) return json({ erro: 'token' }, 401)
  const r = await presenca(env).fetch(new Request(`https://presenca${rota}`, { method: 'POST', body: await req.text() }))
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

// GET /presenca?t=<token> (WebSocket): o index.js confere o token e manda para o objeto com o SteamID em X-Id
export function rotaPresenca(req, env, id) {
  const r = new Request(req)
  r.headers.set('X-Id', id)
  return presenca(env).fetch(r)
}

export class Presenca {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.amigos = null // cache do KV "amigos" (some quando o objeto hiberna; relê na volta)
    // ping/pong de manutenção respondido sem acordar o objeto
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    this.fila = Promise.resolve() // ver exclusivo()
    // Só o ambiente de teste local define isto (TEMPOS_TESTE="fila=4000,encerrada=3000"): prazos curtos para testar sem esperar minutos
    for (const par of String(env.TEMPOS_TESTE || '').split(',')) {
      const [k, v] = par.split('=')
      if (k in T && Number(v) > 0) T[k] = Number(v)
    }
  }

  // Uma coisa de cada vez: lobby, fila, aceite, veto, alarme e o plugin mudam o mesmo estado (lido, mexido e gravado). Sem isto, dois pedidos
  // juntos (os 10 jogadores clicando em ACEITAR) liam o mesmo estado e o último a gravar apagava o aceite do outro.
  exclusivo(fn) {
    const r = this.fila.then(fn)
    this.fila = r.then(() => {}, () => {})
    return r
  }

  async listaAmigos(recarregar = false) {
    if (!this.amigos || recarregar) this.amigos = await lerAmigos(this.env)
    return this.amigos
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
    for (const ws of this.state.getWebSockets(id)) {
      try {
        ws.send(texto)
      } catch {
        // aba fechando
      }
    }
  }

  // Estado completo para uma pessoa: status (e "visto por último") de cada amigo
  async estadoPara(id) {
    const amigos = (await this.listaAmigos())[id]?.amigos || []
    const vistos = amigos.length ? await this.state.storage.get(amigos.map((a) => `visto:${a}`)) : new Map()
    const status = Object.fromEntries(amigos.map((a) => [a, { st: this.statusDe(a), visto: vistos.get(`visto:${a}`) || null }]))
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
    if (!ID_STEAM.test(String(eu))) return json({ erro: 'id' }, 400)
    const todos = (await this.state.storage.get('lobbies')) || {}
    const partidas = (await this.state.storage.get('partidas')) || {}
    const amigosEu = (await this.listaAmigos())[eu]?.amigos || []
    const achar = (id) => (todos[id] ? id : Object.keys(todos).find((l) => todos[l].membros.includes(id)) || null)
    const publicosAntes = new Set(Object.keys(todos).filter((l) => todos[l].publico)) // abertos antes da ação (se fecharem, os amigos também recarregam)
    const lideres = new Set() // lobbies mexidos: se forem públicos, os amigos do líder também recarregam a lista de lobbies abertos
    const avisados = new Set([eu])
    let mudou = req.method === 'POST' // só grava e avisa se algo mudou (a limpeza de membros offline também conta)
    const avisar = (...ids) => ids.flat().forEach((i) => i && avisados.add(i))

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
      const { acao, id, valor } = (await req.json().catch(() => null)) || {}
      if (!ACOES_LOBBY.includes(acao)) return json({ erro: 'acao' }, 400)
      const meuLider = achar(eu)
      const eLider = !meuLider || meuLider === eu
      const alvoOk = ID_STEAM.test(String(id)) && id !== eu
      const minha = partidaDe(partidas, eu)
      if (minha && !ACOES_PARTIDA.includes(acao)) return json({ erro: 'em-partida' }, 409)
      if (!minha && ACOES_PARTIDA.includes(acao)) return json({ erro: 'sem-partida' }, 404)
      if (todos[meuLider || eu]?.busca && (acao === 'convidar' || acao === 'remover')) return json({ erro: 'buscando' }, 409)
      if (acao === 'convidar') {
        // qualquer membro do lobby convida (o convite entra no lobby do líder); só o líder remove
        if (!alvoOk || !amigosEu.includes(id)) return json({ erro: 'amigo' }, 400)
        if (this.statusDe(id) === 'offline') return json({ erro: 'offline' }, 409)
        const dono = meuLider || eu
        if (dono === id) return json({ erro: 'amigo' }, 400)
        const lb = (todos[dono] ??= novoLobby())
        if (!lb.membros.includes(id) && !lb.convites.includes(id)) {
          if (1 + lb.membros.length + lb.convites.length >= LOBBY_MAX) return json({ erro: 'cheio' }, 400)
          lb.convites = poe(lb.convites, id)
        }
        lideres.add(dono)
        avisar(dono)
        avisar(id, lb.membros)
      } else if (acao === 'remover') {
        if (!alvoOk || !todos[eu] || !eLider) return json({ erro: 'lider' }, 403)
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
          return json({ erro: 'sem-vaga' }, 409)
        }
        if (todos[eu]?.membros.length) return json({ erro: 'ocupado' }, 400)
        sairDe(eu) // sai do grupo em que estava
        time.membros = time.membros.map((m) => (m === saiu ? eu : m))
        if (time.lider === saiu) time.lider = eu
        p.servidor.vistos = (p.servidor.vistos || []).filter((m) => m !== saiu)
        p.servidor.presentes = (p.servidor.presentes || []).filter((m) => m !== saiu)
        delete p.chamados[eu]
        avisar(idsDe(p), saiu)
      } else if (acao === 'entrar') {
        const lb = alvoOk ? todos[id] : null
        if (!lb) return json({ erro: 'sem-lobby' }, 404)
        if (lb.busca) return json({ erro: 'buscando' }, 409)
        if (!lb.membros.includes(eu)) {
          if (!lb.convites.includes(eu) && !(lb.publico && amigosEu.includes(id))) return json({ erro: 'negado' }, 403)
          if (1 + lb.membros.length >= LOBBY_MAX) return json({ erro: 'cheio' }, 400)
          if (todos[eu]?.membros.length) return json({ erro: 'ocupado' }, 400) // líder com gente: saia/passe a liderança antes
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
        if (!eLider) return json({ erro: 'lider' }, 403)
        const lb = (todos[eu] ??= novoLobby())
        lb.publico = valor === true
        lideres.add(eu)
        avisar(lb.membros)
      } else if (acao === 'buscar') {
        const lb = todos[eu]
        if (!eLider || !lb || 1 + lb.membros.length < LOBBY_MAX) return json({ erro: 'incompleto' }, 400)
        if (!FORMATOS_FILA.includes(valor?.formato) || !FORMATS[valor.formato]) return json({ erro: 'formato' }, 400)
        if (valor.formato === 'bo3' && !(await temSubAtiva(this.env, eu))) return json({ erro: 'sem-sub' }, 403)
        if (!lb.busca) {
          lb.convites = []
          lb.formato = valor.formato
          lb.busca = Date.now()
        }
        avisar(lb.membros)
      } else if (acao === 'cancelar-busca') {
        if (!eLider || !todos[eu]) return json({ erro: 'lider' }, 403)
        todos[eu].busca = null
        avisar(todos[eu].membros)
      } else if (acao === 'aceitar') {
        if (minha.fase !== 'aceitar') return json({ erro: 'fase' }, 409)
        minha.aceitos = poe(minha.aceitos, eu)
        if (minha.aceitos.length === idsDe(minha).length) {
          minha.fase = 'veto'
          minha.prazo = Date.now() + VETO_SEG * 1000
        }
        avisar(idsDe(minha))
      } else if (acao === 'recusar-partida') {
        if (minha.fase !== 'aceitar') return json({ erro: 'fase' }, 409)
        cancelarPartida(todos, partidas, minha)
        avisar(idsDe(minha))
      } else if (acao === 'substituir') {
        // Alguém do time caiu no meio da partida: um membro chama um amigo (online/ausente) para o lugar dele
        const sv = minha.servidor
        if (minha.fase !== 'pronto' || !['carregada', 'jogando'].includes(sv?.estado)) return json({ erro: 'fase' }, 409)
        if (!alvoOk || !amigosEu.includes(id)) return json({ erro: 'amigo' }, 400)
        if (this.statusDe(id) === 'offline') return json({ erro: 'offline' }, 409)
        if (partidaDe(partidas, id)) return json({ erro: 'em-partida' }, 409)
        if (todos[id]?.membros.length) return json({ erro: 'ocupado' }, 400) // líder de grupo com gente: ele precisa desfazer o grupo antes
        const time = minha.times.A.membros.includes(eu) ? minha.times.A : minha.times.B
        const vagas = vagasDe(minha, time)
        const saiu = vagas.includes(valor?.saiu) ? valor.saiu : vagas[0]
        if (!saiu) return json({ erro: 'sem-vaga' }, 409)
        // Só vira substituto se aceitar (o convite aparece para ele como o de lobby; vale por 1 minuto)
        minha.chamados = { ...(minha.chamados || {}), [id]: { por: eu, ate: Date.now() + CHAMADO_MS } }
        avisar(id)
      } else if (acao === 'veto') {
        const erro = agirVeto(minha, eu, valor)
        if (erro) return json({ erro }, 409)
        avisar(idsDe(minha))
      }
      for (const p of procurar(todos, partidas)) avisar(idsDe(p))
    }
    await limpar()

    // quem estava num lobby aberto: os amigos dele recarregam a lista de "lobbies abertos"
    for (const l of lideres) {
      if (todos[l]?.publico || publicosAntes.has(l)) avisar((await this.listaAmigos())[l]?.amigos || [])
    }
    for (const k of Object.keys(todos)) if (lobbyVazio(todos[k])) delete todos[k]
    if (mudou) {
      await this.state.storage.put('lobbies', todos)
      await this.state.storage.put('partidas', partidas)
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
    const info = await nomes(this.env, ids)
    const pessoa = (id) => ({ id, ...info[id], st: this.statusDe(id) })
    return json({
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
    })
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
    await this.state.storage.put('partidas', partidas)
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
      const info = await nomes(this.env, idsDe(p))
      resposta = montarSerie(p, (id) => info[id]?.nome || id)
      p.servidor = { ...p.servidor, estado: 'entregue', entregueEm: agora }
      prazoServidor(p, agora)
      idsDe(p).forEach((i) => avisados.add(i))
    }
    if (avisados.size) {
      await this.state.storage.put('partidas', partidas)
      await this.agendar(partidas)
      for (const a of avisados) this.enviar(a, { tipo: 'lobby' })
    }
    return json(resposta)
  }

  // POST /servidor/estado { partidaId, estado, detalhe?, placar? }: o plugin conta em que fase a série está
  async servidorEstado(req) {
    const { partidaId, estado, detalhe, placar } = (await req.json().catch(() => null)) || {}
    if (!ESTADOS_SERVIDOR.includes(estado)) return json({ erro: 'estado' }, 400)
    const partidas = (await this.state.storage.get('partidas')) || {}
    const p = partidas[String(partidaId)]
    if (!p?.servidor) return json({ erro: 'sem-partida' }, 404) // sala fechada pelos jogadores: o plugin segue o jogo mesmo assim
    // aviso atrasado (tentativa repetida) ou depois do fim não volta a sala para trás
    if (ORDEM_SERVIDOR[estado] < ORDEM_SERVIDOR[p.servidor.estado] || ORDEM_SERVIDOR[p.servidor.estado] >= 4) return json({ ok: true, ignorado: true })
    p.servidor = { ...p.servidor, estado, detalhe: String(detalhe || '').slice(0, 200), placar: String(placar || '').slice(0, 40) }
    prazoServidor(p)
    await this.state.storage.put('partidas', partidas)
    await this.agendar(partidas)
    for (const i of idsDe(p)) this.enviar(i, { tipo: 'lobby' })
    return json({ ok: true })
  }

  // POST /servidor/elenco { partidaId, presentes }: o plugin diz quem do elenco está no servidor e recebe o elenco atual
  // (muda quando um membro chama um substituto). Sem partida (já fechada): { erro }.
  async servidorElenco(req) {
    const { partidaId, presentes } = (await req.json().catch(() => null)) || {}
    const partidas = (await this.state.storage.get('partidas')) || {}
    const p = partidas[String(partidaId)]
    if (!p?.servidor) return json({ erro: 'sem-partida' }, 404)
    const elenco = Object.fromEntries(['A', 'B'].flatMap((t) => p.times[t].membros.map((id) => [id, t])))
    if (['carregada', 'jogando'].includes(p.servidor.estado) && Array.isArray(presentes)) {
      const agora = presentes.map(String).filter((id) => elenco[id])
      const vistos = [...new Set([...(p.servidor.vistos || []), ...agora])]
      const mudou = !Array.isArray(p.servidor.presentes) || JSON.stringify([...agora].sort()) !== JSON.stringify([...(p.servidor.presentes || [])].sort()) || vistos.length !== (p.servidor.vistos || []).length
      if (mudou) {
        p.servidor = { ...p.servidor, presentes: agora, vistos }
        await this.state.storage.put('partidas', partidas)
        for (const i of idsDe(p)) this.enviar(i, { tipo: 'lobby' })
      }
    }
    return json({ elenco })
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/servidor/elenco') return this.exclusivo(() => this.servidorElenco(req))
    if (url.pathname === '/servidor/proxima') return this.exclusivo(() => this.servidorProxima())
    if (url.pathname === '/servidor/estado') return this.exclusivo(() => this.servidorEstado(req))
    if (url.pathname === '/lobby') return this.exclusivo(() => this.lobby(req))
    if (url.pathname === '/teste/limpar') {
      // só o ambiente de teste local liga isto (index.js exige MODO_TESTE): apaga as partidas (e os lobbies, sem { apenasPartidas: true })
      const { apenasPartidas } = (await req.json().catch(() => null)) || {}
      return this.exclusivo(async () => {
        await this.state.storage.delete(apenasPartidas ? ['partidas'] : ['lobbies', 'partidas'])
        if (!apenasPartidas) await this.state.storage.delete([...(await this.state.storage.list({ prefix: 'visto:' })).keys()]) // "visto offline" antigo expulsaria o jogador de teste do grupo
        await this.state.storage.deleteAlarm()
        return json({ ok: true })
      })
    }
    if (url.pathname === '/avisar') {
      const { ids = [] } = await req.json().catch(() => ({}))
      await this.listaAmigos(true)
      for (const id of ids) {
        this.enviar(id, { tipo: 'lista' }) // a aba busca GET /amigos de novo
        if (this.state.getWebSockets(id).length) this.enviar(id, await this.estadoPara(id))
      }
      return new Response('ok')
    }

    if (url.pathname === '/mandar') {
      const { ids = [], msg } = await req.json().catch(() => ({}))
      if (msg) for (const id of ids) this.enviar(id, msg)
      return new Response('ok')
    }

    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket', { status: 426 })
    const id = req.headers.get('X-Id')
    if (!ID_STEAM.test(String(id))) return new Response('id', { status: 400 })
    const antes = this.statusDe(id)
    const [cliente, servidor] = Object.values(new WebSocketPair())
    this.state.acceptWebSocket(servidor, [id])
    servidor.serializeAttachment({ id, st: 'online', ts: Date.now() })
    servidor.send(JSON.stringify(await this.estadoPara(id)))
    if (antes !== 'online') await this.avisarAmigos(id, 'online')
    return new Response(null, { status: 101, webSocket: cliente })
  }

  async webSocketMessage(ws, msg) {
    const dados = ws.deserializeAttachment()
    if (!dados?.id || (msg !== 'online' && msg !== 'ausente') || dados.st === msg) return
    const antes = this.statusDe(dados.id)
    ws.serializeAttachment({ ...dados, st: msg })
    const depois = this.statusDe(dados.id)
    if (antes !== depois) await this.avisarAmigos(dados.id, depois)
  }

  async saiu(ws) {
    const id = ws.deserializeAttachment()?.id
    if (!id) return
    // a aba que fechou ainda aparece em getWebSockets até o fim deste evento: conta as outras
    const outras = this.state.getWebSockets(id).filter((x) => x !== ws)
    if (outras.length) {
      const st = outras.some((x) => x.deserializeAttachment()?.st !== 'ausente') ? 'online' : 'ausente'
      await this.avisarAmigos(id, st)
      return
    }
    const agora = Date.now()
    await this.state.storage.put(`visto:${id}`, agora)
    await this.avisarAmigos(id, 'offline', agora)
  }

  async webSocketClose(ws, codigo) {
    await this.saiu(ws)
    try {
      ws.close(codigo, 'tchau')
    } catch {
      // já fechado
    }
  }

  async webSocketError(ws) {
    await this.saiu(ws)
  }
}
