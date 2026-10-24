// Estado público do CS2 para o lobby (GET /status/cs2, sem login):
//   atualizacao: a última atualização do jogo (notas de versão da Valve) se saiu nas últimas 48 h; o lobby avisa para atualizar o jogo
//   servidor:    se o nosso servidor está no ar (pergunta ao agente da VPS, o mesmo do painel do dono); o token do agente não sai daqui
// Tudo fica em cache na memória do worker por alguns segundos/minutos: o site pode perguntar a toda hora sem sobrecarregar a Steam nem a VPS.
// Este aviso é informativo: se a Steam ou a VPS não responderem, ele mostra o último valor conhecido (Steam) ou "fora do ar" (VPS), e a falha vai para o log.
import { ErroServico } from './erros.js'
import { agenteCs2, pedirAgente } from './servidor-cs2.js'

const NOTICIAS = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=12&maxlength=1&format=json'
const JANELA_ATUALIZACAO_MS = 48 * 3600 * 1000
const CACHE_NOTICIAS_MS = 10 * 60 * 1000
const CACHE_SERVIDOR_MS = 15 * 1000

let noticias = { ate: 0, valor: null }
let servidor = { ate: 0, valor: null }

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

async function ultimaAtualizacao() {
  const agora = Date.now()
  if (agora < noticias.ate) return noticias.valor
  let valor = noticias.valor
  try {
    valor = await notaMaisRecente()
  } catch (e) {
    if (!(e instanceof ErroServico)) throw e
    console.error('status-cs2: notícias da Steam', e.cause ?? e.dados) // fica o último valor que deu certo
  }
  noticias = { ate: agora + CACHE_NOTICIAS_MS, valor }
  return valor
}

async function estadoDoServidor(env) {
  const agora = Date.now()
  if (agora < servidor.ate) return servidor.valor
  const agente = agenteCs2(env)
  let valor = { online: null, atualizando: false } // sem agente configurado (teste local): não sabemos
  if (agente) {
    try {
      const { status, dados } = await pedirAgente(agente, '/api/status?desde=999999999', {}, 4000)
      valor = status === 200 ? { online: dados.estado === 'rodando', atualizando: dados.estado === 'atualizando' || dados.estado === 'parando' } : { online: false, atualizando: false }
    } catch (e) {
      if (!(e instanceof ErroServico)) throw e
      console.error('status-cs2: agente da VPS', e.codigo)
      valor = { online: false, atualizando: false } // VPS fora do ar
    }
  }
  servidor = { ate: agora + CACHE_SERVIDOR_MS, valor }
  return valor
}

export async function statusCs2(env) {
  const [nota, srv] = await Promise.all([ultimaAtualizacao(), estadoDoServidor(env)])
  return { atualizacao: nota && Date.now() - nota.data < JANELA_ATUALIZACAO_MS ? nota : null, servidor: srv }
}
