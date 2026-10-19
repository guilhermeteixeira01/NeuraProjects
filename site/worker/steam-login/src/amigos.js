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

// Lobby (grupo para jogar junto, como o da FACEIT): o líder + até 4 membros. Fica no armazenamento do próprio objeto de presença
// (consistente, sem KV): lobbies = { "<SteamID do líder>": { membros: [ids], convites: [ids], publico: bool } }.
// Só o líder convida, remove e abre o lobby; amigos entram sozinhos se estiver aberto ("público") ou se foram convidados.
const LOBBY_MAX = 5
const LOBBY_OFFLINE_MS = 10 * 60 * 1000 // membro offline há mais que isso sai sozinho
const novoLobby = () => ({ membros: [], convites: [], publico: false })
const lobbyVazio = (lb) => !lb.membros.length && !lb.convites.length && !lb.publico
const ACOES_LOBBY = ['convidar', 'remover', 'entrar', 'recusar', 'sair', 'publico']

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

  // ── Lobby ──
  // GET /lobby (X-Id = quem pergunta) devolve o lobby dele; POST { acao, id?, valor? } muda e devolve o lobby novo.
  async lobby(req) {
    const eu = req.headers.get('X-Id')
    if (!ID_STEAM.test(String(eu))) return json({ erro: 'id' }, 400)
    const todos = (await this.state.storage.get('lobbies')) || {}
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
          todos[novo] = { membros: resto, convites: [], publico: lb.publico }
          lideres.add(novo)
        }
        delete todos[id]
      } else {
        lb.membros = tira(lb.membros, id)
      }
    }

    // Membro offline faz tempo sai sozinho (só confere o lobby de quem está perguntando)
    const limpar = async () => {
      const lider = achar(eu)
      if (!lider) return
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
      if (acao === 'convidar') {
        if (!eLider) return json({ erro: 'lider' }, 403)
        if (!alvoOk || !amigosEu.includes(id)) return json({ erro: 'amigo' }, 400)
        const lb = (todos[eu] ??= novoLobby())
        if (!lb.membros.includes(id) && !lb.convites.includes(id)) {
          if (1 + lb.membros.length + lb.convites.length >= LOBBY_MAX) return json({ erro: 'cheio' }, 400)
          lb.convites = poe(lb.convites, id)
        }
        lideres.add(eu)
        avisar(id, lb.membros)
      } else if (acao === 'remover') {
        if (!alvoOk || !todos[eu] || !eLider) return json({ erro: 'lider' }, 403)
        const lb = todos[eu]
        lb.membros = tira(lb.membros, id)
        lb.convites = tira(lb.convites, id)
        lideres.add(eu)
        avisar(id, lb.membros)
      } else if (acao === 'entrar') {
        const lb = alvoOk ? todos[id] : null
        if (!lb) return json({ erro: 'sem-lobby' }, 404)
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
      }
    }
    await limpar()

    // quem estava num lobby aberto: os amigos dele recarregam a lista de "lobbies abertos"
    for (const l of lideres) {
      if (todos[l]?.publico || publicosAntes.has(l)) avisar((await this.listaAmigos())[l]?.amigos || [])
    }
    for (const k of Object.keys(todos)) if (lobbyVazio(todos[k])) delete todos[k]
    if (mudou) {
      await this.state.storage.put('lobbies', todos)
      for (const a of avisados) this.enviar(a, { tipo: 'lobby' })
    }

    // Vista para quem perguntou
    const lider = achar(eu) || eu
    const lb = todos[lider] || novoLobby()
    const convitesRecebidos = Object.keys(todos).filter((l) => l !== lider && todos[l].convites.includes(eu))
    const abertos = amigosEu.filter((a) => a !== lider && todos[a]?.publico && 1 + todos[a].membros.length < LOBBY_MAX && !todos[a].convites.includes(eu))
    const ids = [...new Set([lider, ...lb.membros, ...lb.convites, ...convitesRecebidos, ...abertos])]
    const info = await nomes(this.env, ids)
    const pessoa = (id) => ({ id, ...info[id], st: this.statusDe(id) })
    return json({
      eu,
      lider,
      souLider: lider === eu,
      publico: !!lb.publico,
      max: LOBBY_MAX,
      membros: [lider, ...lb.membros].map(pessoa),
      convites: lb.convites.map(pessoa),
      convitesRecebidos: convitesRecebidos.map((l) => ({ lider: pessoa(l), membros: 1 + todos[l].membros.length })),
      abertos: abertos.map((l) => ({ lider: pessoa(l), membros: 1 + todos[l].membros.length })),
    })
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/lobby') return this.lobby(req)
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
