// Web API da Steam: nome e foto atuais dos jogadores (GetPlayerSummaries, até 100 por chamada) e avatar animado (Loja de Pontos da Steam).
// Falha da Steam vira ErroServico('steam'); quem usa só para enfeite (nome no lobby, foto) trata esse tipo e segue sem.
import { ErroServico } from './erros.js'

const API = 'https://api.steampowered.com'
const CDN_ITENS = 'https://shared.akamai.steamstatic.com/community_assets/images/'

async function pedirSteam(endereco, tempoMs) {
  let r
  try {
    r = await fetch(endereco, { signal: AbortSignal.timeout(tempoMs) })
  } catch (e) {
    throw new ErroServico('steam', undefined, { indisponivel: true, causa: e })
  }
  if (!r.ok) throw new ErroServico('steam', { status: r.status })
  return r.json()
}

// Map(id -> { nome, avatar }) dos que a Steam achou. Sem STEAM_API_KEY: vazio (o site usa o nome das partidas)
export async function resumosSteam(env, ids, tempoMs = 4000) {
  const lista = [...new Set(ids)].slice(0, 100)
  if (!lista.length || !env.STEAM_API_KEY) return new Map()
  const d = await pedirSteam(`${API}/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${lista.join(',')}`, tempoMs)
  return new Map((d?.response?.players || []).filter((p) => p?.steamid).map((p) => [p.steamid, { nome: String(p.personaname || '').slice(0, 64), avatar: p.avatarfull || '' }]))
}

// Nome e foto de um jogador; sem resposta da Steam, vazio (o login e o perfil público seguem com o que já tinham)
export async function perfilSteam(env, id) {
  try {
    return (await resumosSteam(env, [id])).get(id) || { nome: '', avatar: '' }
  } catch (e) {
    if (!(e instanceof ErroServico)) throw e
    console.error('steam: perfil de', id, e.cause ?? e.dados)
    return { nome: '', avatar: '' }
  }
}

// Avatar animado (GIF) do jogador, ou '' se ele não tem
export async function avatarAnimado(id) {
  const d = await pedirSteam(`${API}/IPlayerService/GetAnimatedAvatar/v1/?steamid=${id}`, 4000)
  const img = d?.response?.avatar?.image_small
  return /\.gif$/i.test(img || '') ? CDN_ITENS + img : ''
}
