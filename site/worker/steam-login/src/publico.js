/*
 * Rotas públicas (sem login) de dados dos jogadores e a busca de jogadores:
 *   GET /perfis                -> personalização de todos (moldura, card, time, insígnias, apelido...)
 *   GET /nicks?ids=a,b         -> { id: apelido }
 *   GET /config                -> regras públicas (molduras por nível, cargos, selos...)
 *   GET /jogador?id=           -> nome e avatar públicos (Steam) de quem ainda não tem partida
 *   GET /avatares?ids=a,b,...  -> foto atual da Steam de até 100 jogadores { id: url, _parado: { id: jpg } }
 *   GET /premier               -> CS Rating do Premier (Leetify) dos jogadores do ranking (o cron atualiza de hora em hora)
 *   GET /usuarios/buscar?q=    (login) -> até 8 jogadores pelo nome (para adicionar amigo)
 */
import { chamarContas } from './contas.js'
import { corrigirEventosAntecipados } from './missoes.js'
import { lerDoc, gravarDoc } from './dados.js'
import { ErroPedido, ErroServico } from './erros.js'
import { json } from './http.js'
import { timeDosJogadores } from './equipes.js'
import { semDerrubar } from './objetos.js'
import { configPublica, lerConfig, lerPerfis } from './perfis.js'
import { lerRanking } from './ranking.js'
import { avatarAnimado, perfilSteam, resolverVanity, resumosSteam } from './steam.js'
import { lerUsuarios } from './usuarios.js'

const ID_STEAM = /^\d{17}$/
const publico = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=5' } // troca aparece em segundos
const idsDaUrl = (url, max) => [...new Set(String(url.searchParams.get('ids') || '').split(',').filter((id) => ID_STEAM.test(id)))].slice(0, max)

// O time de cada jogador é o time em que ele está (o campo "time" escolhido à mão deixou de valer); o apelido vem das contas
export async function rotaPerfis(env) {
  await corrigirEventosAntecipados(env)
  const [perfis, doTime, nicks] = await Promise.all([lerPerfis(env), timeDosJogadores(env), chamarContas(env, { acao: 'todos-nicks' })])
  const saida = {}
  for (const [id, { time, ...resto }] of Object.entries(perfis)) saida[id] = doTime[id] ? { ...resto, time: doTime[id] } : resto
  for (const [id, nome] of Object.entries(doTime)) saida[id] ??= { time: nome }
  for (const [id, nick] of Object.entries(nicks)) saida[id] = { ...saida[id], nick }
  return json(saida, 200, publico)
}

export async function rotaNicks(url, env) {
  const ids = idsDaUrl(url, 100)
  return json(ids.length ? await chamarContas(env, { acao: 'nicks', ids }) : {}, 200, { ...publico, 'Cache-Control': 'public, max-age=30' })
}

export const rotaConfig = async (env) => json(configPublica(await lerConfig(env), env), 200, publico)

// Link do perfil ou nome de usuário colado (ex.: "steamcommunity.com/id/fulano", "steamcommunity.com/profiles/765...", só "fulano"
// ou só o SteamID64) -> { id } (já é um SteamID64) ou { vanity } (nome de usuário: precisa perguntar à Steam qual é o SteamID64)
function doTextoDoPerfil(texto) {
  const t = String(texto || '').trim()
  const id = /(\d{17})/.exec(t)?.[1]
  if (id) return { id }
  const vanity = /steamcommunity\.com\/id\/([\w-]{2,32})/i.exec(t)?.[1] || (/^[\w-]{2,32}$/.test(t) ? t : '')
  return vanity ? { vanity } : null
}

// GET /jogador?id=<SteamID64> ou ?perfil=<link do perfil ou nome de usuário> -> { id, nome, avatar }: Steam primeiro (atuais);
// a cópia do login (usuarios) só se a Steam não responder. Com "perfil", acha o SteamID64 de quem nunca entrou no site (para
// adicionar amigo por link ou nome de usuário da Steam, não só por quem já jogou ou visitou).
// Guardado 1 hora no cache da Cloudflare (poupa a API); trocar o apelido apaga a cópia (esquecerJogador)
const chaveJogador = (id) => new Request(`https://cache.neura/jogador/${id}`)
export async function rotaJogador(url, env) {
  let id = url.searchParams.get('id') || ''
  const perfil = url.searchParams.get('perfil') || ''
  if (!ID_STEAM.test(id) && perfil) {
    const alvo = doTextoDoPerfil(perfil)
    id = alvo?.id || (alvo?.vanity ? await resolverVanity(env, alvo.vanity) : '')
  }
  if (!ID_STEAM.test(id)) throw new ErroPedido('id')
  const guardado = await caches.default.match(chaveJogador(id))
  if (guardado) return guardado
  const [usuario, steam, nicks] = await Promise.all([lerUsuarios(env).then((u) => u[id]), perfilSteam(env, id), chamarContas(env, { acao: 'nicks', ids: [id] })])
  const resposta = json({ id, nome: nicks[id] || steam.nome || usuario?.nome || '', avatar: steam.avatar || usuario?.avatar || '' }, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' })
  await caches.default.put(chaveJogador(id), resposta.clone())
  return resposta
}
export const esquecerJogador = (id) => caches.default.delete(chaveJogador(id))

// GET /usuarios/buscar?q=nome: quem já entrou no site com a Steam, pelo nome. Quem escondeu o perfil do ranking não aparece; nunca você mesmo
export async function rotaBuscarUsuarios(url, env, quem, cors) {
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = semAcento(url.searchParams.get('q') || '').trim()
  if (q.length < 2 || q.length > 40) return json({ jogadores: [] }, 200, cors)
  const [usuarios, perfis] = await Promise.all([lerUsuarios(env), lerPerfis(env)])
  const achados = Object.entries(usuarios)
    .filter(([id, u]) => id !== quem.id && u?.nome && !perfis[id]?.ocultoRanking && semAcento(u.nome).includes(q))
    .map(([id, u]) => ({ id, nome: String(u.nome), avatar: String(u.avatar || ''), comeca: semAcento(u.nome).startsWith(q) }))
    .sort((a, b) => Number(b.comeca) - Number(a.comeca) || a.nome.localeCompare(b.nome))
    .slice(0, 8)
    .map(({ id, nome, avatar }) => ({ id, nome, avatar }))
  return json({ jogadores: achados }, 200, cors)
}

// ── Premier (Leetify) ──
// Doc "premier" = { atualizado, jogadores: { "<SteamID64>": número | null } }. Um por vez (sem estourar a API da Leetify) e no máximo 45 por
// rodada (limite de chamadas do Worker grátis). Erro de um jogador: fica o valor anterior dele.
export async function atualizarPremier(env) {
  const ranking = await lerRanking(env)
  const ids = (ranking.jogadores || []).map((j) => j.steamId).filter((id) => ID_STEAM.test(String(id))).slice(0, 45)
  if (!ids.length) return
  const antes = (await lerDoc(env, 'premier', {})).jogadores || {}
  const jogadores = {}
  for (const id of ids) jogadores[id] = await premierDe(id, antes[id] ?? null)
  await gravarDoc(env, 'premier', { atualizado: new Date().toISOString(), jogadores })
}
async function premierDe(id, anterior) {
  let r
  try {
    r = await fetch(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${id}`, { headers: { 'User-Agent': 'neuraproject.com.br' } })
  } catch (e) {
    console.error('premier: Leetify fora', id, e)
    return anterior
  }
  if (r.status === 404) return null // sem conta na Leetify
  if (!r.ok) return anterior
  const p = (await r.json())?.ranks?.premier
  return Number.isFinite(p) && p > 0 ? p : null
}

// GET /premier: com mais de 2 horas (cron parado, ou ainda vazio), dispara uma atualização em segundo plano; a trava no cache (10 min)
// faz várias visitas ao mesmo tempo gerarem uma atualização só
export async function rotaPremier(env, ctx) {
  const d = await lerDoc(env, 'premier', {})
  if (!d.atualizado || Date.now() - Date.parse(d.atualizado) > 2 * 3600 * 1000) {
    const trava = new Request('https://cache.neura/premier-trava')
    if (!(await caches.default.match(trava))) {
      await caches.default.put(trava, new Response('1', { headers: { 'Cache-Control': 'max-age=600' } }))
      ctx.waitUntil(semDerrubar(atualizarPremier(env), 'atualização do Premier'))
    }
  }
  return json(d, 200, { ...publico, 'Cache-Control': 'public, max-age=300' })
}

// ── Avatares atuais ──
// A foto guardada nas partidas é a do dia em que a pessoa jogou; o site troca pela atual com isto. Avatar animado (item da Loja de Pontos
// da Steam) vem como GIF; para quem tem, _parado traz a foto parada (modo "Melhorar desempenho" e celular).
// Um mapa só no cache da Cloudflare com todos os jogadores ({ id: { url, parado, em } }); cada um vale 5 min. Por visita: 1 leitura do mapa,
// 1 chamada à Steam para os vencidos, 1 por animado (até 40) e 1 gravação (o Worker grátis permite 50 chamadas por pedido).
const AVATAR_VALIDADE_MS = 5 * 60 * 1000
const CHAVE_AVATARES = new Request('https://cache.neura/avatares-mapa')
// Animado de um jogador; se a Steam falhar só nesse, ele fica com a foto parada
async function animadoOuNada(id) {
  try {
    return await avatarAnimado(id)
  } catch (e) {
    if (!(e instanceof ErroServico)) throw e
    return ''
  }
}
export async function rotaAvatares(url, env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  const ids = idsDaUrl(url, 100)
  if (!ids.length || !env.STEAM_API_KEY) return json({}, 200, cors)
  const mapa = (await (await caches.default.match(CHAVE_AVATARES))?.json()) || {}
  const agora = Date.now()
  const vencidos = ids.filter((id) => !(agora - (mapa[id]?.em || 0) < AVATAR_VALIDADE_MS)).slice(0, 40)
  if (vencidos.length) {
    try {
      const [fotos, animados] = await Promise.all([resumosSteam(env, vencidos), Promise.all(vencidos.map(animadoOuNada))])
      vencidos.forEach((id, i) => {
        const parado = fotos.get(id)?.avatar || mapa[id]?.parado || ''
        mapa[id] = { url: animados[i] || parado, parado, em: agora }
      })
      await caches.default.put(CHAVE_AVATARES, new Response(JSON.stringify(mapa), { headers: { 'Cache-Control': 'max-age=86400' } }))
    } catch (e) {
      if (!(e instanceof ErroServico)) throw e
      console.error('avatares: Steam fora', e.cause ?? e.dados) // o site fica com as fotos que já tem
    }
  }
  const resposta = { _parado: {} }
  for (const id of ids) {
    const m = mapa[id]
    if (!m?.url) continue
    resposta[id] = m.url
    if (m.parado && m.parado !== m.url) resposta._parado[id] = m.parado
  }
  return json(resposta, 200, cors)
}
