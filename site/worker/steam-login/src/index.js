/*
 * Login pela Steam do neuraproject.com.br (Cloudflare Worker).
 *
 * O site é estático (GitHub Pages) e não consegue confirmar sozinho que o login da Steam é verdadeiro:
 * isso exige uma chamada servidor → Steam. Este worker faz só essa parte:
 *   /login?volta=<página>  -> manda para o login da Steam
 *   /retorno               -> a Steam volta aqui; confirma com ela, busca nome e avatar e devolve para
 *                             a página com #steam=<token> (o site guarda o token no navegador)
 *
 * Token: base64url(JSON { id, nome, avatar, exp }) + "." + base64url(HMAC-SHA256 com o SEGREDO).
 * A assinatura deixa um backend futuro confiar no token; o site hoje só lê o JSON para mostrar.
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
    return Response.redirect(`${site}/`, 302)
  },
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
