/*
 * Login pela Steam e token do site.
 *
 * O site é estático (GitHub Pages) e não consegue confirmar sozinho que o login da Steam é verdadeiro: isso exige uma chamada servidor → Steam.
 *   /login?volta=<página>  -> manda para o login da Steam
 *   /retorno               -> a Steam volta aqui; confirma com ela, busca nome e avatar, registra o usuário e devolve para a página
 *                             com #steam=<token> (o site guarda o token no navegador)
 * Token: base64url(JSON { id, nome, avatar, exp }) + "." + base64url(HMAC-SHA256 com o SEGREDO). O site lê o JSON para mostrar; a assinatura
 * é conferida aqui em tudo que salva.
 */
import { chamarContas } from './contas.js'
import { ErroLogin, ErroServico } from './erros.js'
import { tokenDoPedido } from './http.js'
import { semDerrubar } from './objetos.js'
import { perfilSteam } from './steam.js'
import { registrarUsuario } from './usuarios.js'

const OPENID = 'https://steamcommunity.com/openid/login'
const NS = 'http://specs.openid.net/auth/2.0'
const DIAS = 30 // validade do login
const ID_STEAM = /^\d{17}$/

export const origensPermitidas = (env, site) => [site, ...String(env.ORIGENS_EXTRAS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)]

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const de64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const chaveHmac = (segredo, uso) => crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, [uso])

async function assinar(dados, segredo) {
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(dados)))
  const assinatura = await crypto.subtle.sign('HMAC', await chaveHmac(segredo, 'sign'), new TextEncoder().encode(corpo))
  return `${corpo}.${base64url(assinatura)}`
}

// Token com assinatura certa e dentro da validade -> { id, nome, avatar, exp }; qualquer outra coisa (formato, assinatura, vencido) -> null
export async function conferirToken(token, segredo) {
  const [corpo, assinatura] = String(token).split('.')
  const base64Ok = (s) => /^[A-Za-z0-9_-]+$/.test(s) && s.length % 4 !== 1 // o que atob consegue ler (sem isso, token quebrado lançaria exceção)
  if (!segredo || !corpo || !assinatura || !base64Ok(corpo) || !base64Ok(assinatura)) return null
  if (!(await crypto.subtle.verify('HMAC', await chaveHmac(segredo, 'verify'), de64(assinatura), new TextEncoder().encode(corpo)))) return null
  const dados = JSON.parse(new TextDecoder().decode(de64(corpo))) // assinatura certa: o JSON foi este worker que escreveu
  return ID_STEAM.test(dados.id) && dados.exp * 1000 > Date.now() ? dados : null
}

// O apelido escolhido no site vale no lugar do nome da Steam (lobby, trocas, mercado, chat...). Guardado 60 s na memória
const APELIDOS = new Map() // id -> { nick, ate }
export const lembrarApelido = (id, nick) => (nick == null ? APELIDOS.delete(id) : APELIDOS.set(id, { nick, ate: Date.now() + 60_000 }))
async function apelidoDe(env, id) {
  const guardado = APELIDOS.get(id)
  if (guardado && guardado.ate > Date.now()) return guardado.nick
  const nick = (await chamarContas(env, { acao: 'nicks', ids: [id] }))[id] || ''
  lembrarApelido(id, nick)
  return nick
}

// Quem está logado (token no cabeçalho Authorization); sem login válido: ErroLogin (o site pede para entrar de novo)
export async function exigirLogin(req, env) {
  const quem = await conferirToken(tokenDoPedido(req), env.SEGREDO)
  if (!quem) throw new ErroLogin('login')
  const apelido = await apelidoDe(env, quem.id)
  return apelido ? { ...quem, nome: apelido } : quem
}

// Para onde voltar depois do login: só páginas do próprio site (ou das ORIGENS_EXTRAS); qualquer outra coisa volta para o início
function destino(volta, env, site) {
  if (!URL.canParse(volta || '/', site)) return `${site}/`
  const u = new URL(volta || '/', site)
  if (!origensPermitidas(env, site).includes(u.origin)) return `${site}/`
  u.hash = ''
  return u.toString()
}

export function login(url, env, site) {
  const retorno = new URL('/retorno', url.origin)
  retorno.searchParams.set('volta', destino(url.searchParams.get('volta'), env, site))
  if (ID_STEAM.test(url.searchParams.get('ref') || '')) retorno.searchParams.set('ref', url.searchParams.get('ref'))
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

// A Steam confirma que a resposta é verdadeira (sem isso qualquer um forjaria o SteamID)
async function steamConfirma(q) {
  const corpo = new URLSearchParams()
  for (const [k, v] of q) if (k.startsWith('openid.')) corpo.set(k, v)
  corpo.set('openid.mode', 'check_authentication')
  let r
  try {
    r = await fetch(OPENID, { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  } catch (e) {
    throw new ErroServico('steam', undefined, { indisponivel: true, causa: e })
  }
  return r.ok && /is_valid\s*:\s*true/.test(await r.text())
}

export async function retorno(url, env, site) {
  const q = url.searchParams
  const volta = destino(q.get('volta'), env, site)
  const erro = (motivo) => Response.redirect(`${volta}#steam-erro=${motivo}`, 302)

  if (q.get('openid.mode') !== 'id_res') return erro('cancelado')
  // A resposta tem que ter sido feita para este worker e vir do login da Steam
  if (!String(q.get('openid.return_to') || '').startsWith(`${url.origin}/retorno`) || q.get('openid.op_endpoint') !== OPENID) return erro('invalido')
  const claimed = q.get('openid.claimed_id') || ''
  const id = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed)?.[1]
  if (!id || q.get('openid.identity') !== claimed) return erro('invalido')
  let confirmado
  try {
    confirmado = await steamConfirma(q)
  } catch (e) {
    if (!(e instanceof ErroServico)) throw e
    console.error('login: Steam fora', e.cause)
    return erro('steam-fora')
  }
  if (!confirmado) return erro('invalido')
  if (!env.SEGREDO) return erro('config')

  const perfil = await perfilSteam(env, id)
  // O return_to foi confirmado pela Steam; não aceita indicação enviada depois do primeiro login.
  const retornoAssinado = new URL(q.get('openid.return_to'))
  const entrada = await semDerrubar(registrarUsuario(env, id, perfil, false, retornoAssinado.searchParams.get('ref') || ''), 'registro do usuário no login')
  // A origem persistida permite retomar se o objeto de contas esteve indisponível no callback anterior.
  if (entrada) await semDerrubar(chamarContas(env, { acao: 'afiliado-entrada', steam: id, novo: !!entrada.indicacaoEntrada, ref: entrada.indicacaoEntrada?.ref || '' }), 'registro da indicação')
  const token = await assinar({ id, nome: perfil.nome, avatar: perfil.avatar, exp: Math.floor(Date.now() / 1000) + DIAS * 86400 }, env.SEGREDO)
  return Response.redirect(`${volta}#steam=${token}`, 302)
}
