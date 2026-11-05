// Estado público do CS2 para o lobby (GET /status/cs2, sem login):
//   atualizacao: a última atualização do jogo (notas de versão da Valve) se saiu nas últimas 48 h; o lobby avisa para atualizar o jogo
//   servidor:    sinal recente do plugin do CS2; ausência de sinal deixa o estado desconhecido
// Tudo fica em cache na memória do worker por alguns segundos/minutos: o site pode perguntar a toda hora sem sobrecarregar a Steam nem a VPS.
// Falha de consulta não confirma queda: devolve estado desconhecido e a última confirmação, sem inventar manutenção.
import { ErroServico } from './erros.js'
import { objetoGlobal } from './objetos.js'

const NOTICIAS = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=12&maxlength=1&format=json'
const JANELA_ATUALIZACAO_MS = 48 * 3600 * 1000
const CACHE_NOTICIAS_MS = 10 * 60 * 1000

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
export function criarConsultaStatusCs2({ consultarNota = notaMaisRecente, consultarSinal = sinalDoPlugin, agora = Date.now } = {}) {
  let noticias = { ate: 0, valor: null }, noticiaPendente = null
  function atualizarNoticias() {
    if (agora() < noticias.ate) return Promise.resolve()
    noticiaPendente ||= (async () => {
      try { noticias = { ate: agora() + CACHE_NOTICIAS_MS, valor: await consultarNota() } }
      catch { noticias.ate = agora() + 30000 }
    })().finally(() => { noticiaPendente = null })
    return noticiaPendente
  }
  async function estadoDoServidor(env) {
    const visto = await consultarSinal(env)
    const recente = visto > 0 && agora() - visto >= 0 && agora() - visto < 45000
    return recente
      ? { online: true, atualizando: false, verificadoEm: visto, desatualizado: false, fonte: 'plugin' }
      : { online: null, atualizando: false, verificadoEm: visto || null, desatualizado: visto > 0 }
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
