/*
 * Login pela Steam do neuraproject.com.br (Cloudflare Worker).
 *
 * O site é estático (GitHub Pages) e não consegue confirmar sozinho que o login da Steam é verdadeiro:
 * isso exige uma chamada servidor → Steam. Este worker faz só essa parte:
 *   /login?volta=<página>  -> manda para o login da Steam
 *   /retorno               -> a Steam volta aqui; confirma com ela, busca nome e avatar e devolve para
 *                             a página com #steam=<token> (o site guarda o token no navegador)
 *   /perfis, /perfil       -> personalização dos jogadores: moldura do avatar e time (KV MOLDURAS, mais abaixo)
 *
 * Token: base64url(JSON { id, nome, avatar, exp }) + "." + base64url(HMAC-SHA256 com o SEGREDO).
 * O site lê o JSON para mostrar; a assinatura é conferida aqui quando o jogador salva o perfil (/perfil).
 *
 * Variáveis (wrangler.toml / painel da Cloudflare):
 *   SITE            endereço do site (padrão https://neuraproject.com.br)
 *   ORIGENS_EXTRAS  outros endereços que podem receber o login, separados por vírgula
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
    if (url.pathname === '/login') return login(url, env, site)
    if (url.pathname === '/retorno') return retorno(url, env, site)
    if (url.pathname === '/perfis' && req.method === 'GET') return lerPerfis(env)
    if (url.pathname === '/perfil') return salvarPerfil(req, env, site, null)
    // Rotas antigas (só moldura): páginas que ainda estejam abertas com a versão anterior do site
    if (url.pathname === '/molduras' && req.method === 'GET') return lerMolduras(env)
    if (url.pathname === '/moldura') return salvarPerfil(req, env, site, 'moldura')
    return Response.redirect(`${site}/`, 302)
  },
}

// ── Perfil dos jogadores (personalização): moldura do avatar e time ──
// Guardado no KV MOLDURAS numa chave só: { "<SteamID64>": { "moldura": "<coleção>/<moldura>", "time": "<nome>" } }.
//   GET  /perfis -> o mapa inteiro (toda página do site lê, para mostrar a moldura e o time de cada jogador)
//   POST /perfil -> { moldura?: "<id>" | null, time?: "<nome>" | null } com "Authorization: Bearer <token do login>";
//                   só muda os campos enviados (null tira) e só do dono do token
const CHAVE_PERFIS = 'perfis'
const CHAVE_ANTIGA = 'molduras' // formato antigo { "<SteamID64>": "<moldura>" }: lido uma vez e convertido
const ID_MOLDURA = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,60}$/
const NOME_TIME = /^[^\u0000-\u001f<>]{1,40}$/ // nome da lista de times (o site só mostra se ainda existir na lista)

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })
const publico = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=5' } // troca aparece em segundos

async function mapaPerfis(env) {
  try {
    const perfis = await env.MOLDURAS.get(CHAVE_PERFIS, 'json')
    if (perfis) return perfis
    const antigo = (await env.MOLDURAS.get(CHAVE_ANTIGA, 'json')) || {}
    return Object.fromEntries(Object.entries(antigo).map(([id, moldura]) => [id, { moldura }]))
  } catch {
    return {}
  }
}

const lerPerfis = async (env) => json(await mapaPerfis(env), 200, publico)

async function lerMolduras(env) {
  const perfis = await mapaPerfis(env)
  return json(Object.fromEntries(Object.entries(perfis).filter(([, p]) => p.moldura).map(([id, p]) => [id, p.moldura])), 200, publico)
}

// campo = 'moldura' na rota antiga (/moldura): só aceita a moldura; null = qualquer campo do perfil
async function salvarPerfil(req, env, site, campo) {
  // Só o próprio site (e as ORIGENS_EXTRAS) pode salvar
  const permitidas = [site, ...String(env.ORIGENS_EXTRAS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)]
  const origem = req.headers.get('Origin') || ''
  const cors = permitidas.includes(origem)
    ? { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' }
    : {}
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ erro: 'metodo' }, 405, cors)
  if (!cors['Access-Control-Allow-Origin']) return json({ erro: 'origem' }, 403)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const dono = env.SEGREDO ? await conferir(token, env.SEGREDO) : null
  if (!dono) return json({ erro: 'login' }, 401, cors) // login inválido ou vencido: entrar de novo

  let corpo
  try {
    corpo = (await req.json()) || {}
  } catch {
    return json({ erro: 'corpo' }, 400, cors)
  }
  const mudar = {}
  if ('moldura' in corpo) {
    const m = corpo.moldura ?? null
    if (m !== null && (typeof m !== 'string' || !ID_MOLDURA.test(m))) return json({ erro: 'moldura' }, 400, cors)
    mudar.moldura = m
  }
  if (!campo && 'time' in corpo) {
    const t = typeof corpo.time === 'string' ? corpo.time.trim() : corpo.time ?? null
    if (t !== null && (typeof t !== 'string' || !NOME_TIME.test(t))) return json({ erro: 'time' }, 400, cors)
    mudar.time = t
  }

  const perfis = await mapaPerfis(env)
  const meu = { ...perfis[dono.id] }
  for (const [k, v] of Object.entries(mudar)) {
    if (v === null) delete meu[k]
    else meu[k] = v
  }
  if (Object.keys(meu).length) perfis[dono.id] = meu
  else delete perfis[dono.id]
  await env.MOLDURAS.put(CHAVE_PERFIS, JSON.stringify(perfis))
  if (campo === 'moldura')
    return json({ ok: true, molduras: Object.fromEntries(Object.entries(perfis).filter(([, p]) => p.moldura).map(([id, p]) => [id, p.moldura])) }, 200, cors)
  return json({ ok: true, perfis }, 200, cors)
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
    return /^\d{17}$/.test(dados.id) && dados.exp * 1000 > Date.now() ? dados : null
  } catch {
    return null
  }
}

// Para onde voltar depois do login: só páginas do próprio site (ou das ORIGENS_EXTRAS)
function destino(volta, env, site) {
  const permitidas = [site, ...String(env.ORIGENS_EXTRAS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)]
  try {
    const u = new URL(volta || '/', site)
    if (permitidas.includes(u.origin)) {
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
  const token = await assinar({ id, nome: perfil.nome, avatar: perfil.avatar, exp: Math.floor(Date.now() / 1000) + DIAS * 86400 }, env.SEGREDO)
  return Response.redirect(`${volta}#steam=${token}`, 302)
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
