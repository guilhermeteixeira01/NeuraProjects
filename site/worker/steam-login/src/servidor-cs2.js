// Painel do servidor de CS2 (só o dono): proxy do site para o agente da VPS (public/vps/painel.js).
// A URL e o token do agente ficam só aqui, como segredos do worker (CS2_AGENTE_URL, CS2_AGENTE_TOKEN): nunca vão para o navegador.
//   GET  /admin/servidor/status?desde=N
//   POST /admin/servidor/iniciar   { validar }     POST /admin/servidor/parar
//   POST /admin/servidor/reiniciar { validar }     POST /admin/servidor/comando { cmd }
const TEMPO_MS = 10000
const ACOES = { iniciar: true, parar: false, reiniciar: true, comando: false } // true = repassa "validar"

const resposta = (corpo, status, cors) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })

export async function rotaAdminServidorCs2(req, env, rota, url, cors) {
  const base = String(env.CS2_AGENTE_URL || '').replace(/\/$/, '')
  if (!base || !env.CS2_AGENTE_TOKEN) return resposta({ erro: 'configuracao' }, 503, cors)
  const acao = rota.replace('/admin/servidor/', '')

  let destino
  let init = { headers: { Authorization: `Bearer ${env.CS2_AGENTE_TOKEN}` }, signal: AbortSignal.timeout(TEMPO_MS) }
  if (acao === 'status' && req.method === 'GET') {
    const desde = Number.parseInt(url.searchParams.get('desde'), 10)
    destino = `${base}/api/status${Number.isFinite(desde) && desde >= 0 ? `?desde=${desde}` : ''}`
  } else if (req.method === 'POST' && Object.hasOwn(ACOES, acao)) {
    const c = (await req.json().catch(() => null)) || {}
    const corpo = {}
    if (ACOES[acao]) corpo.validar = c.validar === true
    if (acao === 'comando') {
      corpo.cmd = String(c.cmd ?? '').trim().slice(0, 500)
      if (!corpo.cmd) return resposta({ erro: 'Comando vazio' }, 400, cors)
    }
    destino = `${base}/api/${acao}`
    init = { ...init, method: 'POST', headers: { ...init.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
  } else {
    return resposta({ erro: 'rota' }, 404, cors)
  }

  let r
  try {
    r = await fetch(destino, init)
  } catch (e) {
    return resposta({ erro: e?.name === 'TimeoutError' ? 'timeout' : 'vps-fora' }, 504, cors)
  }
  const d = await r.json().catch(() => null)
  if (r.status === 401 || r.status === 403) return resposta({ erro: 'token-agente' }, 502, cors) // o token do worker não confere com o da VPS
  if (!d) return resposta({ erro: 'vps-fora' }, 502, cors)
  return resposta(d, r.status, cors)
}
