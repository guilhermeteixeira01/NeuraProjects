// Estado público do CS2 para o lobby (GET /status/cs2, sem login):
//   atualizacao: a última atualização do jogo (notas de versão da Valve) se saiu nas últimas 48 h; o lobby avisa para atualizar o jogo
//   servidor:    se o nosso servidor está no ar (pergunta ao agente da VPS, o mesmo do painel do dono); o token do agente não sai daqui
// Tudo fica em cache na memória do worker por alguns segundos/minutos: o site pode perguntar a toda hora sem sobrecarregar a Steam nem a VPS.
const NOTICIAS = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=12&maxlength=1&format=json'
const JANELA_ATUALIZACAO_S = 48 * 3600
const CACHE_NOTICIAS_MS = 10 * 60 * 1000
const CACHE_SERVIDOR_MS = 15 * 1000

let noticias = { ate: 0, valor: null }
let servidor = { ate: 0, valor: null }

async function ultimaAtualizacao() {
  const agora = Date.now()
  if (agora < noticias.ate) return noticias.valor
  let valor = noticias.valor // se a Steam falhar, vale o último que deu certo
  try {
    const r = await fetch(NOTICIAS, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'neura-project' } })
    if (r.ok) {
      const itens = (await r.json())?.appnews?.newsitems || []
      const nota = itens.find((n) => n.feedname === 'steam_community_announcements' && (n.tags || []).includes('patchnotes'))
      valor = nota ? { titulo: String(nota.title || '').slice(0, 120), data: Number(nota.date) * 1000, url: `https://store.steampowered.com/news/app/730/view/${nota.gid}`, gid: String(nota.gid) } : null
    }
  } catch {
    // sem resposta: fica com o último valor
  }
  noticias = { ate: agora + CACHE_NOTICIAS_MS, valor }
  return valor
}

async function estadoDoServidor(env) {
  const agora = Date.now()
  if (agora < servidor.ate) return servidor.valor
  let valor
  const base = String(env.CS2_AGENTE_URL || '').replace(/\/$/, '')
  if (!base || !env.CS2_AGENTE_TOKEN) {
    valor = { online: null, atualizando: false } // sem agente configurado (teste local): não sabemos
  } else {
    try {
      const r = await fetch(`${base}/api/status?desde=999999999`, { headers: { Authorization: `Bearer ${env.CS2_AGENTE_TOKEN}` }, signal: AbortSignal.timeout(4000) })
      const d = r.ok ? await r.json() : null
      if (!d) valor = { online: false, atualizando: false }
      else valor = { online: d.estado === 'rodando', atualizando: d.estado === 'atualizando' || d.estado === 'parando' }
    } catch {
      valor = { online: false, atualizando: false } // VPS fora do ar
    }
  }
  servidor = { ate: agora + CACHE_SERVIDOR_MS, valor }
  return valor
}

export async function statusCs2(env) {
  const [nota, srv] = await Promise.all([ultimaAtualizacao(), estadoDoServidor(env)])
  const recente = nota && Date.now() - nota.data < JANELA_ATUALIZACAO_S * 1000
  return { atualizacao: recente ? nota : null, servidor: srv }
}
