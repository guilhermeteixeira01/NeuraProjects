// Amigos (pedido e aceite, como na FACEIT) e presença em tempo real (online / ausente / offline no site).
//
// Lista de amizades: KV "amigos" = { "<SteamID64>": { amigos: [ids], recebidos: [ids], enviados: [ids] } }.
// Só muda quando alguém pede, aceita, recusa, cancela ou remove (poucas gravações: cabe no KV grátis).
//
// Presença: Durable Object "Presenca" (uma instância só, "global"). Cada aba do site com login abre um WebSocket
// (GET /presenca?t=<token>); o objeto guarda as conexões (API de hibernação: não cobra enquanto ninguém fala) e,
// quando alguém entra, sai ou fica ausente, avisa só os AMIGOS dessa pessoa. "Visto por último" fica no armazenamento
// do próprio objeto. Rotas (com login, em index.js): GET /amigos, POST /amigos { acao, id }.

const ID_STEAM = /^\d{17}$/
const MAX_AMIGOS = 300
const ACOES = ['pedir', 'aceitar', 'recusar', 'cancelar', 'remover']

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
  }

  async listaAmigos(recarregar = false) {
    if (!this.amigos || recarregar) this.amigos = await lerAmigos(this.env)
    return this.amigos
  }

  // online > ausente > offline, juntando todas as abas da pessoa
  statusDe(id) {
    const abas = this.state.getWebSockets(id)
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

  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/avisar') {
      const { ids = [] } = await req.json().catch(() => ({}))
      await this.listaAmigos(true)
      for (const id of ids) {
        this.enviar(id, { tipo: 'lista' }) // a aba busca GET /amigos de novo
        if (this.state.getWebSockets(id).length) this.enviar(id, await this.estadoPara(id))
      }
      return new Response('ok')
    }

    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket', { status: 426 })
    const id = req.headers.get('X-Id')
    if (!ID_STEAM.test(String(id))) return new Response('id', { status: 400 })
    const antes = this.statusDe(id)
    const [cliente, servidor] = Object.values(new WebSocketPair())
    this.state.acceptWebSocket(servidor, [id])
    servidor.serializeAttachment({ id, st: 'online' })
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
