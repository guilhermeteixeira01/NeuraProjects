/*
 * Login pela Steam e dados dos jogadores do neuraproject.com.br (Cloudflare Worker).
 *
 * O site é estático (GitHub Pages) e não consegue confirmar sozinho que o login da Steam é verdadeiro:
 * isso exige uma chamada servidor → Steam. Este worker faz essa parte e guarda o que muda sem deploy:
 *   /login?volta=<página>  -> manda para o login da Steam
 *   /retorno               -> a Steam volta aqui; confirma com ela, busca nome e avatar, registra o usuário e
 *                             devolve para a página com #steam=<token> (o site guarda o token no navegador)
 *   /perfis, /perfil       -> personalização dos jogadores: moldura do avatar e time
 *   /config                -> regras públicas (molduras liberadas por nível)
 *   /jogador?id=<SteamID>  -> nome e avatar públicos da Steam (perfil de quem ainda não tem partida)
 *   /eu                    -> quem é o dono do token e se é admin
 *   /admin/...             -> painel de administrador (só admins; conferido aqui em toda chamada)
 *
 * Token: base64url(JSON { id, nome, avatar, exp }) + "." + base64url(HMAC-SHA256 com o SEGREDO).
 * O site lê o JSON para mostrar; a assinatura é conferida aqui em tudo que salva.
 *
 * KV MOLDURAS (nome antigo do banco; guarda tudo):
 *   perfis   { "<SteamID64>": { moldura?, time?, xp? (ajuste do admin), bloqueado?, cargos? } }
 *   config   { molduraPorNivel: bool, nivelMoldura: { "<moldura>": nível }, admins: ["<SteamID64>"],
 *              cargos: [{ id, nome, cor }], molduraCargo: { "<moldura>": "<cargo>" } }  (Premium, VIP... e exclusivas)
 *   usuarios { "<SteamID64>": { nome, avatar, primeiro, visto } }  (quem já entrou no site)
 *
 * Variáveis (wrangler.toml / painel da Cloudflare):
 *   SITE            endereço do site (padrão https://neuraproject.com.br)
 *   DONO            SteamID64 do dono: sempre admin e o único que muda a lista de admins
 *   ORIGENS_EXTRAS  outros endereços que podem usar o login, separados por vírgula
 *                   (ex.: http://localhost:5173 para testar no `npm run dev`)
 * Segredos (npx wrangler secret put <NOME>):
 *   SEGREDO         texto aleatório longo que assina os tokens (obrigatório)
 *   STEAM_API_KEY   chave da Web API da Steam (opcional; sem ela o token vai sem nome/avatar e o site
 *                   usa os do ranking)
 */
const OPENID = 'https://steamcommunity.com/openid/login'
const NS = 'http://specs.openid.net/auth/2.0'
const DIAS = 30 // validade do login

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const site = (env.SITE || 'https://neuraproject.com.br').replace(/\/$/, '')
    const rota = url.pathname
    if (rota === '/login') return login(url, env, site)
    if (rota === '/retorno') return retorno(url, env, site)
    if (rota === '/perfis' && req.method === 'GET') return json(await ler(env, 'perfis'), 200, publico)
    if (rota === '/config' && req.method === 'GET') return json(configPublica(await ler(env, 'config')), 200, publico)
    if (rota === '/jogador' && req.method === 'GET') return jogadorPublico(url, env)
    // Rotas antigas (só moldura): páginas que ainda estejam abertas com uma versão anterior do site
    if (rota === '/molduras' && req.method === 'GET') return json(soMolduras(await ler(env, 'perfis')), 200, publico)

    // Daqui para baixo: só o próprio site, com login
    const cors = corsDe(req, env, site)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (!cors['Access-Control-Allow-Origin']) return json({ erro: 'origem' }, 403)
    const quem = await logado(req, env)
    if (!quem) return json({ erro: 'login' }, 401, cors) // login inválido ou vencido: entrar de novo
    const config = await ler(env, 'config')
    const admin = ehAdmin(quem.id, env, config)

    if (rota === '/eu' && req.method === 'GET') {
      // Toda página com login chama /eu: registra a visita (nome/avatar do próprio login) para o painel
      await registrarUsuario(env, quem.id, { nome: quem.nome, avatar: quem.avatar }, true)
      return json({ id: quem.id, admin, dono: quem.id === env.DONO }, 200, cors)
    }
    if (req.method === 'POST' && (rota === '/perfil' || rota === '/moldura')) return salvarPerfil(req, env, site, quem, admin, config, cors, rota === '/moldura')

    if (rota.startsWith('/admin/')) {
      if (!admin) return json({ erro: 'admin' }, 403, cors)
      if (rota === '/admin/dados' && req.method === 'GET') return adminDados(env, config, cors)
      if (rota === '/admin/perfil' && req.method === 'POST') return adminPerfil(req, env, config, cors)
      if (rota === '/admin/config' && req.method === 'POST') return adminConfig(req, env, config, cors)
      if (rota === '/admin/admins' && req.method === 'POST') {
        if (quem.id !== env.DONO) return json({ erro: 'dono' }, 403, cors)
        return adminAdmins(req, env, config, cors)
      }
    }
    return json({ erro: 'rota' }, 404, cors)
  },
}

// ── Utilidades ──
const ID_STEAM = /^\d{17}$/
const ID_MOLDURA = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,60}$/
const NOME_TIME = /^[^\u0000-\u001f<>]{1,40}$/ // nome da lista de times (o site só mostra se ainda existir na lista)
const NIVEL_MAX = 10
const CARGOS_MAX = 20
const XP_LIMITE = 1000000 // ajuste de XP do admin: de -1.000.000 a +1.000.000

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })
const publico = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=5' } // troca aparece em segundos

const origensPermitidas = (env, site) => [site, ...String(env.ORIGENS_EXTRAS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)]

function corsDe(req, env, site) {
  const origem = req.headers.get('Origin') || ''
  return origensPermitidas(env, site).includes(origem)
    ? { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' }
    : {}
}

async function logado(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  return env.SEGREDO ? conferir(token, env.SEGREDO) : null
}

const ehAdmin = (id, env, config) => id === env.DONO || (config.admins || []).includes(id)

// Lê uma chave do KV (objeto vazio se não existir). "perfis" ainda converte o formato antigo da chave "molduras".
async function ler(env, chave) {
  try {
    const v = await env.MOLDURAS.get(chave, 'json')
    if (v) return v
    if (chave === 'perfis') {
      const antigo = (await env.MOLDURAS.get('molduras', 'json')) || {}
      return Object.fromEntries(Object.entries(antigo).map(([id, moldura]) => [id, { moldura }]))
    }
  } catch {
    // KV fora: segue vazio
  }
  return {}
}
const gravar = (env, chave, valor) => env.MOLDURAS.put(chave, JSON.stringify(valor))

const soMolduras = (perfis) => Object.fromEntries(Object.entries(perfis).filter(([, p]) => p.moldura).map(([id, p]) => [id, p.moldura]))
const configPublica = (c) => ({
  molduraPorNivel: !!c.molduraPorNivel,
  nivelMoldura: c.nivelMoldura || {},
  cargos: c.cargos || [], // [{ id, nome, cor }] (ex.: Premium, VIP)
  molduraCargo: c.molduraCargo || {}, // { idMoldura: idCargo }: moldura exclusiva de quem tem o cargo
})
const ID_CARGO = /^[a-z0-9-]{1,24}$/
const COR = /^#[0-9a-f]{6}$/i

async function corpoJson(req) {
  try {
    return (await req.json()) || {}
  } catch {
    return null
  }
}

// Aplica mudanças num perfil (null tira o campo) e grava; perfil vazio sai do mapa
async function mudarPerfil(env, id, mudar) {
  const perfis = await ler(env, 'perfis')
  const p = { ...perfis[id] }
  for (const [k, v] of Object.entries(mudar)) {
    if (v === null || v === false || v === 0 || (Array.isArray(v) && !v.length)) delete p[k]
    else p[k] = v
  }
  if (Object.keys(p).length) perfis[id] = p
  else delete perfis[id]
  await gravar(env, 'perfis', perfis)
  return perfis
}

// Valida moldura/time vindos do site; devolve { mudar } ou { erro }
function validarPerfil(corpo, soMoldura) {
  const mudar = {}
  if ('moldura' in corpo) {
    const m = corpo.moldura ?? null
    if (m !== null && (typeof m !== 'string' || !ID_MOLDURA.test(m))) return { erro: 'moldura' }
    mudar.moldura = m
  }
  if (!soMoldura && 'time' in corpo) {
    const t = typeof corpo.time === 'string' ? corpo.time.trim() : corpo.time ?? null
    if (t !== null && (typeof t !== 'string' || !NOME_TIME.test(t))) return { erro: 'time' }
    mudar.time = t
  }
  return { mudar }
}

// Nível do jogador: XP das partidas (ranking.json do site, com a tabela de níveis) + ajuste do admin
async function nivelDoJogador(env, site, id, perfis) {
  let ranking = null
  try {
    const r = await fetch(`${site}/ranking/ranking.json`, { cf: { cacheTtl: 60 } })
    ranking = r.ok ? await r.json() : null
  } catch {
    // site fora: considera só o ajuste
  }
  const niveis = Array.isArray(ranking?.niveis) && ranking.niveis.length ? ranking.niveis : [0]
  const xp = (Number(ranking?.jogadores?.find((j) => j.steamId === id)?.xp) || 0) + (Number(perfis[id]?.xp) || 0)
  let nivel = 1
  while (nivel < niveis.length && xp >= niveis[nivel]) nivel++
  return nivel
}

// ── Jogador salvando o próprio perfil ──
// POST /perfil { moldura?, time? }  (POST /moldura = rota antiga, só moldura)
async function salvarPerfil(req, env, site, quem, admin, config, cors, rotaAntiga) {
  const corpo = await corpoJson(req)
  if (!corpo) return json({ erro: 'corpo' }, 400, cors)
  const { mudar, erro } = validarPerfil(corpo, rotaAntiga)
  if (erro) return json({ erro }, 400, cors)

  const perfis = await ler(env, 'perfis')
  if (perfis[quem.id]?.bloqueado && !admin) return json({ erro: 'bloqueado' }, 403, cors)

  // Moldura liberada por nível (o admin escolhe no painel); admins não têm trava
  const precisa = config.molduraPorNivel ? Number(config.nivelMoldura?.[mudar.moldura]) || 1 : 1
  if (mudar.moldura && precisa > 1 && !admin) {
    const nivel = await nivelDoJogador(env, site, quem.id, perfis)
    if (nivel < precisa) return json({ erro: 'nivel', precisa, nivel }, 403, cors)
  }

  // Moldura exclusiva de um cargo (Premium, VIP...): só quem tem o cargo; admins não têm trava
  const cargo = mudar.moldura ? config.molduraCargo?.[mudar.moldura] : null
  if (cargo && !admin && !(perfis[quem.id]?.cargos || []).includes(cargo)) return json({ erro: 'cargo', cargo }, 403, cors)

  const novos = await mudarPerfil(env, quem.id, mudar)
  return rotaAntiga ? json({ ok: true, molduras: soMolduras(novos) }, 200, cors) : json({ ok: true, perfis: novos }, 200, cors)
}

// ── Painel de administrador ──
async function adminDados(env, config, cors) {
  const [perfis, usuarios] = await Promise.all([ler(env, 'perfis'), ler(env, 'usuarios')])
  return json({ perfis, usuarios, config: { ...configPublica(config), admins: config.admins || [] }, dono: env.DONO || null }, 200, cors)
}

// POST /admin/perfil { id, moldura?, time?, xp? (ajuste), bloqueado?, cargos? ([idCargo]), limpar? }
async function adminPerfil(req, env, config, cors) {
  const corpo = await corpoJson(req)
  if (!corpo || !ID_STEAM.test(String(corpo.id))) return json({ erro: 'id' }, 400, cors)
  if (corpo.limpar) {
    const perfis = await ler(env, 'perfis')
    delete perfis[corpo.id]
    await gravar(env, 'perfis', perfis)
    return json({ ok: true, perfis }, 200, cors)
  }
  const { mudar, erro } = validarPerfil(corpo, false)
  if (erro) return json({ erro }, 400, cors)
  if ('xp' in corpo) {
    const xp = Math.round(Number(corpo.xp) || 0)
    if (Math.abs(xp) > XP_LIMITE) return json({ erro: 'xp' }, 400, cors)
    mudar.xp = xp
  }
  if ('bloqueado' in corpo) mudar.bloqueado = corpo.bloqueado === true
  if ('cargos' in corpo) {
    const existem = new Set((config.cargos || []).map((c) => c.id))
    const cargos = [...new Set(Array.isArray(corpo.cargos) ? corpo.cargos : [])]
    if (cargos.some((c) => !existem.has(c))) return json({ erro: 'cargo' }, 400, cors)
    mudar.cargos = cargos
  }
  return json({ ok: true, perfis: await mudarPerfil(env, corpo.id, mudar) }, 200, cors)
}

// POST /admin/config { molduraPorNivel?, nivelMoldura?, cargos?, molduraCargo? }
async function adminConfig(req, env, config, cors) {
  const corpo = await corpoJson(req)
  if (!corpo) return json({ erro: 'corpo' }, 400, cors)
  const novo = { ...config }
  if ('molduraPorNivel' in corpo) novo.molduraPorNivel = corpo.molduraPorNivel === true
  if ('nivelMoldura' in corpo) {
    const mapa = {}
    for (const [id, n] of Object.entries(corpo.nivelMoldura || {})) {
      const nivel = Math.round(Number(n))
      if (!ID_MOLDURA.test(id) || !(nivel >= 1 && nivel <= NIVEL_MAX)) return json({ erro: 'nivelMoldura' }, 400, cors)
      if (nivel > 1) mapa[id] = nivel // nível 1 = liberada para todos (não precisa guardar)
    }
    novo.nivelMoldura = mapa
  }
  if ('cargos' in corpo) {
    const lista = Array.isArray(corpo.cargos) ? corpo.cargos : []
    if (lista.length > CARGOS_MAX) return json({ erro: 'cargos' }, 400, cors)
    const vistos = new Set()
    novo.cargos = []
    for (const c of lista) {
      const nome = String(c?.nome || '').trim()
      if (!ID_CARGO.test(String(c?.id)) || vistos.has(c.id) || !NOME_TIME.test(nome) || nome.length > 24 || !COR.test(String(c?.cor))) return json({ erro: 'cargos' }, 400, cors)
      vistos.add(c.id)
      novo.cargos.push({ id: c.id, nome, cor: c.cor })
    }
  }
  if ('molduraCargo' in corpo || 'cargos' in corpo) {
    // Moldura exclusiva só de cargo que existe (cargo apagado libera as molduras dele)
    const existem = new Set((novo.cargos || []).map((c) => c.id))
    const origem = 'molduraCargo' in corpo ? corpo.molduraCargo || {} : novo.molduraCargo || {}
    const mapa = {}
    for (const [id, cargo] of Object.entries(origem)) {
      if (!ID_MOLDURA.test(id)) return json({ erro: 'molduraCargo' }, 400, cors)
      if (cargo && existem.has(cargo)) mapa[id] = cargo
    }
    novo.molduraCargo = mapa
  }
  await gravar(env, 'config', novo)
  return json({ ok: true, config: { ...configPublica(novo), admins: novo.admins || [] } }, 200, cors)
}

// POST /admin/admins { id, admin: bool }  (só o DONO)
async function adminAdmins(req, env, config, cors) {
  const corpo = await corpoJson(req)
  if (!corpo || !ID_STEAM.test(String(corpo.id))) return json({ erro: 'id' }, 400, cors)
  const admins = new Set(config.admins || [])
  if (corpo.admin === true) admins.add(corpo.id)
  else admins.delete(corpo.id)
  const novo = { ...config, admins: [...admins] }
  await gravar(env, 'config', novo)
  return json({ ok: true, config: { ...configPublica(novo), admins: novo.admins } }, 200, cors)
}

// Token do login: assinatura certa e dentro da validade -> { id, ... }; senão null
async function conferir(token, segredo) {
  const [corpo, assinatura] = String(token).split('.')
  if (!corpo || !assinatura) return null
  try {
    const de64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    if (!(await crypto.subtle.verify('HMAC', chave, de64(assinatura), new TextEncoder().encode(corpo)))) return null
    const dados = JSON.parse(new TextDecoder().decode(de64(corpo)))
    return ID_STEAM.test(dados.id) && dados.exp * 1000 > Date.now() ? dados : null
  } catch {
    return null
  }
}

// ── Login pela Steam ──
// Para onde voltar depois do login: só páginas do próprio site (ou das ORIGENS_EXTRAS)
function destino(volta, env, site) {
  try {
    const u = new URL(volta || '/', site)
    if (origensPermitidas(env, site).includes(u.origin)) {
      u.hash = ''
      return u.toString()
    }
  } catch {
    // endereço inválido: volta para o início
  }
  return `${site}/`
}

function login(url, env, site) {
  const retorno = new URL('/retorno', url.origin)
  retorno.searchParams.set('volta', destino(url.searchParams.get('volta'), env, site))
  const p = new URLSearchParams({
    'openid.ns': NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': retorno.toString(),
    'openid.realm': url.origin,
    'openid.identity': `${NS}/identifier_select`,
    'openid.claimed_id': `${NS}/identifier_select`,
  })
  return Response.redirect(`${OPENID}?${p}`, 302)
}

async function retorno(url, env, site) {
  const q = url.searchParams
  const volta = destino(q.get('volta'), env, site)
  const erro = (motivo) => Response.redirect(`${volta}#steam-erro=${motivo}`, 302)

  if (q.get('openid.mode') !== 'id_res') return erro('cancelado')
  // A resposta tem que ter sido feita para este worker e vir do login da Steam
  if (!String(q.get('openid.return_to') || '').startsWith(`${url.origin}/retorno`)) return erro('invalido')
  if (q.get('openid.op_endpoint') !== OPENID) return erro('invalido')
  const claimed = q.get('openid.claimed_id') || ''
  const id = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed)?.[1]
  if (!id || q.get('openid.identity') !== claimed) return erro('invalido')

  // Confirma com a própria Steam que a resposta é verdadeira (sem isso qualquer um forjaria o SteamID)
  const corpo = new URLSearchParams()
  for (const [k, v] of q) if (k.startsWith('openid.')) corpo.set(k, v)
  corpo.set('openid.mode', 'check_authentication')
  try {
    const r = await fetch(OPENID, { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    if (!r.ok || !/is_valid\s*:\s*true/.test(await r.text())) return erro('invalido')
  } catch {
    return erro('steam-fora')
  }

  if (!env.SEGREDO) return erro('config')
  const perfil = await perfilSteam(id, env)
  await registrarUsuario(env, id, perfil)
  const token = await assinar({ id, nome: perfil.nome, avatar: perfil.avatar, exp: Math.floor(Date.now() / 1000) + DIAS * 86400 }, env.SEGREDO)
  return Response.redirect(`${volta}#steam=${token}`, 302)
}

// Lista de quem já entrou no site (painel do admin). visita = chamada do /eu: só grava se for novo, se o nome ou o
// avatar mudou ou se a última visita registrada tem mais de 1 hora (o KV grátis tem limite de gravações por dia)
async function registrarUsuario(env, id, perfil, visita = false) {
  try {
    const usuarios = await ler(env, 'usuarios')
    const agora = new Date().toISOString()
    const antes = usuarios[id] || {}
    const mudou = !usuarios[id] || (perfil.nome && perfil.nome !== antes.nome) || (perfil.avatar && perfil.avatar !== antes.avatar)
    if (visita && !mudou && Date.now() - new Date(antes.visto || 0).getTime() < 3600000) return
    usuarios[id] = { nome: perfil.nome || antes.nome || '', avatar: perfil.avatar || antes.avatar || '', primeiro: antes.primeiro || agora, visto: agora }
    await gravar(env, 'usuarios', usuarios)
  } catch {
    // não impede o login
  }
}

// GET /jogador?id=<SteamID64> -> { nome, avatar } (público). Quem já entrou no site sai da lista de usuários;
// os outros vêm da Web API da Steam. Resposta guardada 1 hora no cache da Cloudflare (poupa a API e o KV).
async function jogadorPublico(url, env) {
  const id = url.searchParams.get('id') || ''
  if (!ID_STEAM.test(id)) return json({ erro: 'id' }, 400, { 'Access-Control-Allow-Origin': '*' })
  const cache = caches.default
  const chave = new Request(`https://cache.neura/jogador/${id}`)
  const guardado = await cache.match(chave)
  if (guardado) return guardado
  const usuario = (await ler(env, 'usuarios'))[id]
  const steam = usuario?.nome && usuario?.avatar ? { nome: usuario.nome, avatar: usuario.avatar } : await perfilSteam(id, env)
  const resposta = json({ nome: steam.nome || usuario?.nome || '', avatar: steam.avatar || usuario?.avatar || '' }, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  })
  await cache.put(chave, resposta.clone())
  return resposta
}

// Nome e avatar pela Web API da Steam (sem chave ou com erro: vazio)
async function perfilSteam(id, env) {
  if (!env.STEAM_API_KEY) return { nome: '', avatar: '' }
  try {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${id}`)
    const p = (await r.json())?.response?.players?.[0]
    return { nome: String(p?.personaname || '').slice(0, 64), avatar: p?.avatarfull || '' }
  } catch {
    return { nome: '', avatar: '' }
  }
}

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function assinar(dados, segredo) {
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(dados)))
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo))
  return `${corpo}.${base64url(assinatura)}`
}
