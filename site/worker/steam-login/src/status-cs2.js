// Estado público do CS2 para o lobby (GET /status/cs2, sem login):
//   atualizacao: a última atualização do jogo (notas de versão da Valve) se saiu nas últimas 48 h; o lobby avisa para atualizar o jogo
//   servidor:    se o nosso servidor está no ar (pergunta ao agente da VPS, o mesmo do painel do dono); o token do agente não sai daqui
// Tudo fica em cache na memória do worker por alguns segundos/minutos: o site pode perguntar a toda hora sem sobrecarregar a Steam nem a VPS.
// Falha de consulta não confirma queda: devolve estado desconhecido e a última confirmação, sem inventar manutenção.
import { ErroServico } from './erros.js'
import { agenteCs2, pedirAgente } from './servidor-cs2.js'
import { objetoGlobal } from './objetos.js'

const NOTICIAS = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=12&maxlength=1&format=json'
const JANELA_ATUALIZACAO_MS = 48 * 3600 * 1000
const CACHE_NOTICIAS_MS = 10 * 60 * 1000
const CACHE_SERVIDOR_MS = 8 * 1000

async function notaMaisRecente() {
  let r
  try {
    r = await fetch(NOTICIAS, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'neura-project' } })
  } catch (e) {
    throw new ErroServico('steam', undefined, { indisponivel: true, causa: e })
  }
  if (!r.ok) throw new ErroServico('steam', { status: r.status })
  const itens = (await r.json())?.appnews?.newsitems || []
  const nota = itens.find((n) => n.feedname === 'steam_community_announcements' && (n.tags || []).includes('patchnotes'))
  return nota ? { titulo: String(nota.title || '').slice(0, 120), data: Number(nota.date) * 1000, url: `https://store.steampowered.com/news/app/730/view/${nota.gid}`, gid: String(nota.gid) } : null
}

async function sinalDoPlugin(env) {
  if (!env.PRESENCA) return 0
  try {
    const r = await objetoGlobal(env.PRESENCA).fetch('https://presenca/servidor/sinal')
    return r.ok ? Number((await r.json()).visto) || 0 : 0
  } catch { return 0 }
}

// Instâncias independentes também permitem testar expiração e falhas sem depender da rede.
export function criarConsultaStatusCs2({ consultar = pedirAgente, consultarNota = notaMaisRecente, consultarSinal = sinalDoPlugin, agora = Date.now } = {}) {
  let noticias = { ate: 0, valor: null }, noticiaPendente = null
  const servidores = new Map()
  function atualizarNoticias() {
    if (agora() < noticias.ate) return Promise.resolve()
    noticiaPendente ||= (async () => {
      try { noticias = { ate: agora() + CACHE_NOTICIAS_MS, valor: await consultarNota() } }
      catch { noticias.ate = agora() + 30000 }
    })().finally(() => { noticiaPendente = null })
    return noticiaPendente
  }
  async function estadoDoServidor(env) {
    const agente = agenteCs2(env)
    const pluginRecente = async () => {
      const visto = await consultarSinal(env)
      return visto > 0 && agora() - visto >= 0 && agora() - visto < 45000 ? { online: true, atualizando: false, verificadoEm: visto, desatualizado: false, fonte: 'plugin' } : null
    }
    if (!agente) return await pluginRecente() || { online: null, atualizando: false, verificadoEm: null, desatualizado: false }
    const chave = agente.base + agente.cab.Authorization
    let cache = servidores.get(chave)
    if (!cache) { cache = { ate: 0, confirmado: null, valor: null, pendente: null }; servidores.set(chave, cache) }
    if (agora() < cache.ate) return cache.valor
    cache.pendente ||= (async () => {
      try {
        const { status, dados } = await consultar(agente, '/api/status?desde=999999999', {}, 5000)
        if (status !== 200 || !['rodando', 'parado', 'atualizando', 'parando'].includes(dados?.estado)) throw new ErroServico('estado-invalido')
        cache.confirmado = { online: dados.estado === 'rodando', atualizando: ['atualizando', 'parando'].includes(dados.estado), verificadoEm: agora(), desatualizado: false }
        if (dados.estado === 'parado') cache.confirmado = await pluginRecente() || cache.confirmado
        cache.valor = cache.confirmado
        cache.ate = agora() + (cache.valor.online ? CACHE_SERVIDOR_MS : 3000)
      } catch {
        const sinal = await pluginRecente()
        if (sinal) { cache.confirmado = sinal; cache.valor = sinal; cache.ate = agora() + CACHE_SERVIDOR_MS; return sinal }
        const recente = cache.confirmado && agora() - cache.confirmado.verificadoEm <= 90000
        cache.valor = { online: recente ? cache.confirmado.online : null, atualizando: false, verificadoEm: cache.confirmado?.verificadoEm ?? null, desatualizado: true, consultaFalhou: true }
        cache.ate = agora() + 3000
      }
      return cache.valor
    })().finally(() => { cache.pendente = null })
    return cache.pendente
  }
  return async (env, ctx) => {
    const servidor = estadoDoServidor(env)
    const noticiasAtualizadas = atualizarNoticias()
    // A latência da Steam não deve segurar o status do servidor de jogo.
    if (ctx?.waitUntil) ctx.waitUntil(noticiasAtualizadas)
    else await noticiasAtualizadas
    return { atualizacao: noticias.valor && agora() - noticias.valor.data < JANELA_ATUALIZACAO_MS ? noticias.valor : null, servidor: await servidor }
  }
}
export const statusCs2 = criarConsultaStatusCs2()
