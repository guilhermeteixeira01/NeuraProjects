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
 *   /avatares?ids=a,b,...  -> foto atual da Steam de até 100 jogadores { id: url } (as das partidas ficam velhas)
 *   /premier               -> CS Rating do Premier (Leetify) dos jogadores do ranking, atualizado de hora em hora
 *   /eu                    -> quem é o dono do token e se é admin
 *   /admin/...             -> painel de administrador (só admins; conferido aqui em toda chamada)
 *
 * Token: base64url(JSON { id, nome, avatar, exp }) + "." + base64url(HMAC-SHA256 com o SEGREDO).
 * O site lê o JSON para mostrar; a assinatura é conferida aqui em tudo que salva.
 *
 * KV MOLDURAS (nome antigo do banco; guarda tudo):
 *   perfis   { "<SteamID64>": { moldura?, molduraLivre? (posta por admin), time?, tema?, idioma?, desempenho?, xp? (ajuste do admin), bloqueado?, cargos?, ocultoRanking? (dono/admin fora do ranking),
 *              insignias? { "<insígnia>": quando ganhou (ms) } (o admin dá; "top3" o cron dá sozinho) } }
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
import { Presenca, avisarPerfil, rotaAmigos, rotaPresenca } from './amigos.js'
export { Presenca } // Durable Object da presença (wrangler.toml)

const OPENID = 'https://steamcommunity.com/openid/login'
const NS = 'http://specs.openid.net/auth/2.0'
const DIAS = 30 // validade do login

export default {
  // Cron (wrangler.toml): quem saiu do top N perde o cargo automático e a moldura exclusiva dele sai do perfil
  async scheduled(evento, env, ctx) {
    const site = (env.SITE || 'https://neuraproject.com.br').replace(/\/$/, '')
    ctx.waitUntil(tirarExclusivasSemCargo(env, site, await ler(env, 'config')).then(() => darInsigniaTop3(env, site)))
    // Premier (Leetify) de hora em hora: na primeira rodada de cada hora (minuto 0–9)
    if (new Date(evento.scheduledTime).getUTCMinutes() < 10) ctx.waitUntil(atualizarPremier(env, site))
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url)
    const site = (env.SITE || 'https://neuraproject.com.br').replace(/\/$/, '')
    const rota = url.pathname
    if (rota === '/login') return login(url, env, site)
    if (rota === '/retorno') return retorno(url, env, site)
    if (rota === '/perfis' && req.method === 'GET') return json(await ler(env, 'perfis'), 200, publico)
    if (rota === '/config' && req.method === 'GET') return json(configPublica(await ler(env, "config"), env), 200, publico)
    if (rota === '/jogador' && req.method === 'GET') return jogadorPublico(url, env)
    if (rota === '/avatares' && req.method === 'GET') return avataresAtuais(url, env)
    if (rota === '/premier' && req.method === 'GET') return premierPublico(env, site, ctx)
    // Rotas antigas (só moldura): páginas que ainda estejam abertas com uma versão anterior do site
    if (rota === '/molduras' && req.method === 'GET') return json(soMolduras(await ler(env, 'perfis')), 200, publico)

    // Presença em tempo real (WebSocket): o navegador não manda cabeçalho de login, então o token vem no endereço
    if (rota === '/presenca') {
      if (!origensPermitidas(env, site).includes(req.headers.get('Origin') || '')) return new Response('origem', { status: 403 })
      const quemWs = env.SEGREDO ? await conferir(url.searchParams.get('t') || '', env.SEGREDO) : null
      if (!quemWs) return new Response('login', { status: 401 })
      return rotaPresenca(req, env, quemWs.id)
    }

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
    if (rota === '/amigos' && (req.method === 'GET' || req.method === 'POST')) return rotaAmigos(req, env, quem, cors)
    if (req.method === 'POST' && (rota === '/perfil' || rota === '/moldura')) return salvarPerfil(req, env, site, quem, admin, config, cors, rota === '/moldura')

    if (rota.startsWith('/admin/')) {
      if (!admin) return json({ erro: 'admin' }, 403, cors)
      if (rota === '/admin/dados' && req.method === 'GET') return adminDados(env, config, cors)
      if (rota === '/admin/perfil' && req.method === 'POST') return adminPerfil(req, env, site, config, cors)
      if (rota === '/admin/config' && req.method === 'POST') return adminConfig(req, env, site, config, cors)
      if (rota === '/admin/selos' && req.method === 'POST') {
        if (quem.id !== env.DONO) return json({ erro: 'dono' }, 403, cors)
        return adminSelos(req, env, config, cors)
      }
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
// Selos da equipe (dono e admins): o dono edita nome, cor, ícone e se aparecem (POST /admin/selos)
const SELOS_PADRAO = {
  dono: { nome: 'Dono', cor: '#ff4655', icone: 'coroa', mostrar: true },
  admin: { nome: 'Admin', cor: '#3498db', icone: 'escudo', mostrar: true },
}
const selosDe = (c) => ({ dono: { ...SELOS_PADRAO.dono, ...c.selos?.dono }, admin: { ...SELOS_PADRAO.admin, ...c.selos?.admin } })
const configPublica = (c, env = {}) => ({
  selos: selosDe(c),
  equipe: { dono: env.DONO || null, admins: (c.admins || []).filter((id) => id !== env.DONO) }, // quem recebe os selos acima
  molduraPorNivel: !!c.molduraPorNivel,
  nivelMoldura: c.nivelMoldura || {},
  cargos: c.cargos || [], // [{ id, nome, cor, icone?, top? }] (ex.: Premium, VIP). top = automático para o top N do ranking
  molduraCargo: c.molduraCargo || {}, // { idMoldura: idCargo }: moldura exclusiva de quem tem o cargo
})
const ID_CARGO = /^[a-z0-9-]{1,24}$/
const COR = /^#[0-9a-f]{6}$/i
// Ícones do selo do cargo (o desenho de cada um fica no site: src/comum/cargos.jsx)
const ICONES_CARGO = ['coroa', 'cifrao', 'estrela', 'diamante', 'raio', 'escudo', 'fogo', 'caveira', 'trofeu', 'coracao', 'verificado', 'mira', 'microfone', 'controle']

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

const PREFERENCIAS = ['tema', 'idioma', 'desempenho']

// Insígnias (arte e descrição ficam no site: src/comum/insignias.js). "top3" também vem sozinha (darInsigniaTop3)
const INSIGNIAS = ['top3', 'staff', 'embaixador', 'designer']

// Insígnia "top3": quem aparece no top 3 do ranking ganha e não perde mais (mesmo se cair depois). Roda no cron.
async function darInsigniaTop3(env, site) {
  const ranking = await lerRanking(site)
  if (!ranking) return
  const perfis = await ler(env, 'perfis')
  const agora = Date.now()
  const novos = []
  for (const j of ordemRanking(ranking, perfis).slice(0, 3)) {
    if (perfis[j.steamId]?.insignias?.top3) continue
    perfis[j.steamId] = { ...perfis[j.steamId], insignias: { ...perfis[j.steamId]?.insignias, top3: agora } }
    novos.push(j.steamId)
  }
  if (!novos.length) return
  await gravar(env, 'perfis', perfis)
  for (const id of novos) await avisarPerfil(env, id, perfis[id]) // quem está com o site aberto vê o aviso na hora
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
  // Preferências do ⚙ Configurações do site. Ficam guardadas mesmo no valor padrão ('padrao', 'pt', 'desligado')
  // para valer nos outros aparelhos em que a pessoa entrar.
  if (!soMoldura && 'tema' in corpo) {
    if (!['padrao', 'branco', 'escuro', 'claro'].includes(corpo.tema)) return { erro: 'tema' }
    mudar.tema = corpo.tema
  }
  if (!soMoldura && 'idioma' in corpo) {
    if (!['pt', 'en', 'es'].includes(corpo.idioma)) return { erro: 'idioma' }
    mudar.idioma = corpo.idioma
  }
  if (!soMoldura && 'desempenho' in corpo) {
    if (!['ligado', 'desligado'].includes(corpo.desempenho)) return { erro: 'desempenho' }
    mudar.desempenho = corpo.desempenho
  }
  // "Ocultar do ranking" (só dono e admins: salvarPerfil confere)
  if (!soMoldura && 'ocultoRanking' in corpo) mudar.ocultoRanking = corpo.ocultoRanking === true || null
  return { mudar }
}

// Nível do jogador: XP das partidas (ranking.json do site, com a tabela de níveis) + ajuste do admin
async function lerRanking(site) {
  try {
    const r = await fetch(`${site}/ranking/ranking.json`, { cf: { cacheTtl: 60 } })
    return r.ok ? await r.json() : null
  } catch {
    return null // site fora
  }
}

// Ordem do top do ranking (a mesma do site, src/comum/ranking.js): quem tem mapa, por rating e depois kills
// Dono/admin com "Ocultar do ranking" ligado (perfis[id].ocultoRanking) fica de fora: o próximo sobe de posição
const ordemRanking = (ranking, perfis = {}) =>
  (ranking?.jogadores || []).filter((j) => j.mapas >= 1 && !perfis[j.steamId]?.ocultoRanking).sort((a, b) => b.rating - a.rating || b.kills - a.kills)

// Cargos do jogador: os que o admin deu + os automáticos ("top N do ranking": entra e sai sozinho com a posição)
async function cargosDoJogador(site, id, perfis, config, rankingLido) {
  const manuais = perfis[id]?.cargos || []
  const automaticos = (config.cargos || []).filter((c) => c.top > 0)
  if (!automaticos.length) return manuais
  const ranking = rankingLido ?? (await lerRanking(site))
  const pos = ordemRanking(ranking, perfis).findIndex((j) => j.steamId === id)
  return [...new Set([...manuais, ...automaticos.filter((c) => pos >= 0 && pos < c.top).map((c) => c.id)])]
}

// Moldura exclusiva de um cargo que o jogador não tem mais (admin tirou, cargo automático saiu porque ele caiu no
// ranking, moldura virou exclusiva...): sai do perfil. Vale também para moldura posta por admin. Dono e admins ficam de
// fora (usam qualquer moldura). Devolve os perfis.
async function tirarExclusivasSemCargo(env, site, config) {
  const perfis = await ler(env, 'perfis')
  const exclusivas = config.molduraCargo || {}
  const comExclusiva = Object.entries(perfis).filter(([, p]) => p.moldura && exclusivas[p.moldura])
  if (!comExclusiva.length) return perfis
  const ranking = (config.cargos || []).some((c) => c.top > 0) ? await lerRanking(site) : null
  let mudou = false
  for (const [id, p] of comExclusiva) {
    if (ehAdmin(id, env, config)) continue // dono e admins usam qualquer moldura, com ou sem o cargo
    const tem = await cargosDoJogador(site, id, perfis, config, ranking)
    if (tem.includes(exclusivas[p.moldura])) continue
    delete p.moldura
    delete p.molduraLivre
    if (!Object.keys(p).length) delete perfis[id]
    mudou = true
  }
  if (mudou) await gravar(env, 'perfis', perfis)
  return perfis
}

async function nivelDoJogador(env, site, id, perfis) {
  const ranking = await lerRanking(site)
  const niveis = Array.isArray(ranking?.niveis) && ranking.niveis.length ? ranking.niveis : [0]
  const jog = ranking?.jogadores?.find((j) => j.steamId === id)
  // Menos de 10 partidas: "Sem classificação" no site; para as molduras vale como nível 1 (só as livres)
  if ((Number(jog?.mapas) || 0) < 10) return 1
  const xp = (Number(jog?.xp) || 0) + (Number(perfis[id]?.xp) || 0)
  let nivel = 1
  while (nivel < niveis.length && xp >= niveis[nivel]) nivel++
  return nivel
}

// ── Jogador salvando o próprio perfil ──
// POST /perfil { moldura?, time?, tema?, idioma?, desempenho? }  (POST /moldura = rota antiga, só moldura)
async function salvarPerfil(req, env, site, quem, admin, config, cors, rotaAntiga) {
  const corpo = await corpoJson(req)
  if (!corpo) return json({ erro: 'corpo' }, 400, cors)
  const { mudar, erro } = validarPerfil(corpo, rotaAntiga)
  if (erro) return json({ erro }, 400, cors)

  const perfis = await ler(env, 'perfis')
  // Bloqueado não troca moldura/time (o que os outros veem); tema, idioma e desempenho são só de quem olha: continuam livres
  if (perfis[quem.id]?.bloqueado && !admin && Object.keys(mudar).some((k) => !PREFERENCIAS.includes(k))) return json({ erro: 'bloqueado' }, 403, cors)
  // Só dono e admins podem se esconder do ranking
  if ('ocultoRanking' in mudar && mudar.ocultoRanking && !admin) return json({ erro: 'admin' }, 403, cors)

  // Moldura liberada por nível (o admin escolhe no painel); admins não têm trava
  const precisa = config.molduraPorNivel ? Number(config.nivelMoldura?.[mudar.moldura]) || 1 : 1
  if (mudar.moldura && precisa > 1 && !admin) {
    const nivel = await nivelDoJogador(env, site, quem.id, perfis)
    if (nivel < precisa) return json({ erro: 'nivel', precisa, nivel }, 403, cors)
  }

  // Moldura exclusiva de um cargo (Premium, VIP...): só quem tem o cargo; admins não têm trava
  const cargo = mudar.moldura ? config.molduraCargo?.[mudar.moldura] : null
  if (cargo && !admin && !(await cargosDoJogador(site, quem.id, perfis, config)).includes(cargo)) return json({ erro: 'cargo', cargo }, 403, cors)

  // molduraLivre: moldura posta por um admin aparece sempre (as outras exclusivas somem se o cargo sair)
  if ('moldura' in mudar) mudar.molduraLivre = admin && mudar.moldura ? true : null
  const novos = await mudarPerfil(env, quem.id, mudar)
  return rotaAntiga ? json({ ok: true, molduras: soMolduras(novos) }, 200, cors) : json({ ok: true, perfis: novos }, 200, cors)
}

// ── Painel de administrador ──
async function adminDados(env, config, cors) {
  const [perfis, usuarios] = await Promise.all([ler(env, 'perfis'), ler(env, 'usuarios')])
  return json({ perfis, usuarios, config: { ...configPublica(config, env), admins: config.admins || [] }, dono: env.DONO || null }, 200, cors)
}

// POST /admin/perfil { id, moldura?, time?, xp? (ajuste), bloqueado?, cargos? ([idCargo]), insignias? ([id]), limpar? }
async function adminPerfil(req, env, site, config, cors) {
  const corpo = await corpoJson(req)
  if (!corpo || !ID_STEAM.test(String(corpo.id))) return json({ erro: 'id' }, 400, cors)
  if (corpo.limpar) {
    // Limpa moldura, time, XP, cargos e bloqueio; as preferências da pessoa (tema, idioma, desempenho) e as insígnias ficam
    const perfis = await ler(env, 'perfis')
    const fica = Object.fromEntries([...PREFERENCIAS, 'insignias'].filter((k) => perfis[corpo.id]?.[k] !== undefined).map((k) => [k, perfis[corpo.id][k]]))
    if (Object.keys(fica).length) perfis[corpo.id] = fica
    else delete perfis[corpo.id]
    await gravar(env, 'perfis', perfis)
    await avisarPerfil(env, corpo.id, perfis[corpo.id])
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
  if ('moldura' in mudar) mudar.molduraLivre = mudar.moldura ? true : null // dada pelo admin (fora as exclusivas, aparece sempre)
  if ('cargos' in corpo) {
    const existem = new Set((config.cargos || []).map((c) => c.id))
    const cargos = [...new Set(Array.isArray(corpo.cargos) ? corpo.cargos : [])]
    if (cargos.some((c) => !existem.has(c))) return json({ erro: 'cargo' }, 400, cors)
    mudar.cargos = cargos
  }
  // Insígnias: lista das que o jogador fica tendo; as que ele já tinha mantêm a data em que ganhou
  if ('insignias' in corpo) {
    const lista = [...new Set(Array.isArray(corpo.insignias) ? corpo.insignias : [])]
    if (lista.some((i) => !INSIGNIAS.includes(i))) return json({ erro: 'insignia' }, 400, cors)
    const antes = (await ler(env, 'perfis'))[corpo.id]?.insignias || {}
    const agora = Date.now()
    mudar.insignias = lista.length ? Object.fromEntries(lista.map((i) => [i, Number(antes[i]) || agora])) : null
  }
  // Moldura exclusiva de cargo: nem o admin dá para quem não tem o cargo (dê o cargo primeiro)
  const exige = mudar.moldura ? config.molduraCargo?.[mudar.moldura] : null
  if (exige && !ehAdmin(corpo.id, env, config)) { // dono e admins podem ter qualquer moldura
    const perfis = await ler(env, 'perfis')
    const comNovos = { ...perfis, [corpo.id]: { ...perfis[corpo.id], ...('cargos' in mudar ? { cargos: mudar.cargos } : {}) } }
    if (!(await cargosDoJogador(site, corpo.id, comNovos, config)).includes(exige)) return json({ erro: 'exclusiva', cargo: exige }, 400, cors)
  }
  const gravados = await mudarPerfil(env, corpo.id, mudar)
  // Tirou um cargo: a moldura exclusiva dele sai do perfil na hora
  const perfis = 'cargos' in mudar ? await tirarExclusivasSemCargo(env, site, config) : gravados
  // A pessoa vê a mudança na hora se estiver com o site aberto (insígnia nova: aviso com som)
  await avisarPerfil(env, corpo.id, perfis[corpo.id])
  return json({ ok: true, perfis }, 200, cors)
}

// POST /admin/config { molduraPorNivel?, nivelMoldura?, cargos?, molduraCargo? }
async function adminConfig(req, env, site, config, cors) {
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
      const top = Math.round(Number(c.top) || 0)
      if (top < 0 || top > 15) return json({ erro: 'cargos' }, 400, cors)
      const icone = ICONES_CARGO.includes(c.icone) ? c.icone : 'coroa'
      // numerar: automático mostra a posição ("Campeão 1", "Campeão 2"...)
      novo.cargos.push({ id: c.id, nome, cor: c.cor, icone, ...(top > 0 ? { top } : {}), ...(top > 0 && c.numerar === true ? { numerar: true } : {}) })
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
  if ('cargos' in corpo || 'molduraCargo' in corpo) await tirarExclusivasSemCargo(env, site, novo)
  return json({ ok: true, config: { ...configPublica(novo, env), admins: novo.admins || [] } }, 200, cors)
}

// POST /admin/selos { dono?: { nome, cor, icone, mostrar }, admin?: {...} }  (só o DONO)
async function adminSelos(req, env, config, cors) {
  const corpo = await corpoJson(req)
  if (!corpo) return json({ erro: 'corpo' }, 400, cors)
  const selos = selosDe(config)
  for (const qual of ['dono', 'admin']) {
    if (!(qual in corpo)) continue
    const s = corpo[qual] || {}
    const nome = String(s.nome || '').trim()
    if (!NOME_TIME.test(nome) || nome.length > 24 || !COR.test(String(s.cor)) || !ICONES_CARGO.includes(s.icone)) return json({ erro: 'selos' }, 400, cors)
    selos[qual] = { nome, cor: s.cor, icone: s.icone, mostrar: s.mostrar !== false }
  }
  const novo = { ...config, selos }
  await gravar(env, 'config', novo)
  return json({ ok: true, config: { ...configPublica(novo, env), admins: novo.admins || [] } }, 200, cors)
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
  // Deixou de ser admin: volta para o ranking ("Ocultar do ranking" é só da equipe)
  if (corpo.admin !== true && corpo.id !== env.DONO) {
    const perfis = await ler(env, 'perfis')
    if (perfis[corpo.id]?.ocultoRanking) {
      delete perfis[corpo.id].ocultoRanking
      if (!Object.keys(perfis[corpo.id]).length) delete perfis[corpo.id]
      await gravar(env, 'perfis', perfis)
    }
  }
  return json({ ok: true, config: { ...configPublica(novo, env), admins: novo.admins } }, 200, cors)
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

// GET /jogador?id=<SteamID64> -> { nome, avatar } (público), atuais pela Web API da Steam (sem resposta: os do último
// login, da lista de usuários). Resposta guardada 1 hora no cache da Cloudflare (poupa a API e o KV).
async function jogadorPublico(url, env) {
  const id = url.searchParams.get('id') || ''
  if (!ID_STEAM.test(id)) return json({ erro: 'id' }, 400, { 'Access-Control-Allow-Origin': '*' })
  const cache = caches.default
  const chave = new Request(`https://cache.neura/jogador/${id}`)
  const guardado = await cache.match(chave)
  if (guardado) return guardado
  const usuario = (await ler(env, 'usuarios'))[id]
  // Steam primeiro (nome e foto atuais); a cópia do login (usuarios) só se a Steam não responder
  const steam = await perfilSteam(id, env)
  const resposta = json({ nome: steam.nome || usuario?.nome || '', avatar: steam.avatar || usuario?.avatar || '' }, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  })
  await cache.put(chave, resposta.clone())
  return resposta
}

// CS Rating do Premier (Leetify) de cada jogador do ranking, buscado de hora em hora pelo cron (o ranking.json só traz
// o do último deploy). KV "premier" = { atualizado, jogadores: { "<SteamID64>": número | null } }.
// Um por vez (sem estourar a API da Leetify) e no máximo 45 por rodada (limite de chamadas do Worker grátis).
async function atualizarPremier(env, site) {
  const ranking = await lerRanking(site)
  const ids = (ranking?.jogadores || []).map((j) => j.steamId).filter((id) => ID_STEAM.test(String(id))).slice(0, 45)
  if (!ids.length) return
  const antes = (await ler(env, 'premier')).jogadores || {}
  const jogadores = {}
  for (const id of ids) {
    try {
      const r = await fetch(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${id}`, { headers: { 'User-Agent': 'neuraproject.com.br' } })
      if (r.status === 404) {
        jogadores[id] = null // sem conta na Leetify
        continue
      }
      const p = r.ok ? (await r.json())?.ranks?.premier : undefined
      jogadores[id] = Number.isFinite(p) && p > 0 ? p : r.ok ? null : (antes[id] ?? null) // erro: mantém o anterior
    } catch {
      jogadores[id] = antes[id] ?? null
    }
  }
  await gravar(env, 'premier', { atualizado: new Date().toISOString(), jogadores })
}

// GET /premier -> { atualizado, jogadores }. Com mais de 2 horas (cron parado, ou ainda vazio), dispara uma atualização
// em segundo plano; a trava no cache (10 min) faz várias visitas ao mesmo tempo gerarem uma atualização só.
async function premierPublico(env, site, ctx) {
  const d = await ler(env, 'premier')
  if (!d.atualizado || Date.now() - Date.parse(d.atualizado) > 2 * 3600 * 1000) {
    const trava = new Request('https://cache.neura/premier-trava')
    if (!(await caches.default.match(trava))) {
      await caches.default.put(trava, new Response('1', { headers: { 'Cache-Control': 'max-age=600' } }))
      ctx?.waitUntil(atualizarPremier(env, site))
    }
  }
  return json(d, 200, { ...publico, 'Cache-Control': 'public, max-age=300' })
}

// GET /avatares?ids=<id>,<id>,... (até 100) -> { "<SteamID64>": "<url da foto atual>", _parado: { "<SteamID64>": "<jpg>" } }
// (público). A foto guardada nas partidas é a do dia em que a pessoa jogou; o site troca pela atual com isto.
// Avatar animado (item da Loja de Pontos) vem como GIF; a foto comum da Steam é sempre parada. Para quem tem animado,
// _parado traz a foto parada (modo "Melhorar desempenho" no site).
// Um mapa só no cache da Cloudflare com todos os jogadores ({ id: { url, parado, em } }); cada um vale 5 min.
// Por visita: 1 leitura do mapa, 1 chamada à Steam para os vencidos, 1 por animado (até 40) e 1 gravação
// (o Worker grátis permite 50 chamadas por pedido). O navegador não guarda (no-store).
const AVATAR_VALIDADE_MS = 5 * 60 * 1000
const CDN_ITENS = 'https://shared.akamai.steamstatic.com/community_assets/images/'
async function avataresAtuais(url, env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').filter((id) => ID_STEAM.test(id)))].slice(0, 100)
  if (!ids.length || !env.STEAM_API_KEY) return json({}, 200, cors)
  const cache = caches.default
  const chave = new Request('https://cache.neura/avatares-mapa')
  let mapa = {}
  try {
    mapa = (await (await cache.match(chave))?.json()) || {}
  } catch {
    mapa = {}
  }
  const agora = Date.now()
  const vencidos = ids.filter((id) => !(agora - (mapa[id]?.em || 0) < AVATAR_VALIDADE_MS)).slice(0, 40)
  if (vencidos.length) {
    try {
      const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${vencidos.join(',')}`)
      if (!r.ok) throw new Error('steam')
      const lista = (await r.json())?.response?.players || []
      const fotos = Object.fromEntries(lista.filter((p) => p?.steamid).map((p) => [p.steamid, p.avatarfull || '']))
      // Avatar animado: uma chamada por jogador (não precisa de chave)
      const animados = await Promise.all(
        vencidos.map(async (id) => {
          try {
            const a = await fetch(`https://api.steampowered.com/IPlayerService/GetAnimatedAvatar/v1/?steamid=${id}`)
            const img = (await a.json())?.response?.avatar?.image_small
            return /.gif$/i.test(img || '') ? CDN_ITENS + img : ''
          } catch {
            return ''
          }
        }),
      )
      vencidos.forEach((id, i) => {
        const parado = fotos[id] || mapa[id]?.parado || ''
        mapa[id] = { url: animados[i] || parado, parado, em: agora }
      })
      await cache.put(chave, new Response(JSON.stringify(mapa), { headers: { 'Cache-Control': 'max-age=86400' } }))
    } catch {
      // Steam fora do ar: devolve o que já tinha (o site fica com as fotos que já tem)
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
