// Painel do servidor de CS2 (só o dono): proxy do site para o agente da VPS (public/vps/painel.js).
// A URL e o token do agente ficam só aqui, como segredos do worker (CS2_AGENTE_URL, CS2_AGENTE_TOKEN): nunca vão para o navegador.
//   GET  /admin/servidor/status?desde=N
//   POST /admin/servidor/iniciar   { validar, plugins }     POST /admin/servidor/parar
//   POST /admin/servidor/reiniciar { validar, plugins }     POST /admin/servidor/plugins (atualiza só os plugins, servidor parado)     POST /admin/servidor/comando { cmd }
//   POST /admin/servidor/gameinfo  (confere o gameinfo.gi e recoloca a linha do Metamod, se a atualização do CS2 tiver apagado)
import { ErroNaoEncontrado, ErroPedido, ErroServico } from './erros.js'
import { json, lerCorpo } from './http.js'

const TEMPO_MS = 10000
const ACOES = { iniciar: true, parar: false, reiniciar: true, comando: false, gameinfo: false, plugins: false } // true = repassa "validar"

// Endereço e token do agente; sem eles (teste local) o painel avisa que não está configurado
export function agenteCs2(env) {
  const base = String(env.CS2_AGENTE_URL || '').replace(/\/$/, '')
  return base && env.CS2_AGENTE_TOKEN ? { base, cab: { Authorization: `Bearer ${env.CS2_AGENTE_TOKEN}` } } : null
}

// Pedido ao agente da VPS: devolve { status, dados }. Sem resposta, token errado ou agente antigo: ErroServico com o motivo
export async function pedirAgente(agente, caminho, init = {}, tempoMs = TEMPO_MS) {
  let r
  try {
    r = await fetch(agente.base + caminho, { ...init, headers: { ...agente.cab, ...init.headers }, signal: AbortSignal.timeout(tempoMs) })
  } catch (e) {
    throw new ErroServico(e?.name === 'TimeoutError' ? 'timeout' : 'vps-fora', undefined, { indisponivel: true, causa: e })
  }
  if (r.status === 401 || r.status === 403) throw new ErroServico('token-agente') // o token do worker não confere com o da VPS
  if (r.status === 404) throw new ErroServico('agente-antigo') // o agente da VPS é de uma versão que não conhece essa rota
  const texto = await r.text()
  if (!(r.headers.get('Content-Type') || '').includes('json') || !texto) throw new ErroServico('vps-fora', { status: r.status })
  return { status: r.status, dados: JSON.parse(texto) }
}

export async function rotaAdminServidorCs2(req, env, rota, url, cors) {
  const agente = agenteCs2(env)
  if (!agente) throw new ErroServico('configuracao', undefined, { indisponivel: true })
  const acao = rota.replace('/admin/servidor/', '')
  let r
  if (acao === 'status' && req.method === 'GET') {
    const desde = Number.parseInt(url.searchParams.get('desde'), 10)
    r = await pedirAgente(agente, `/api/status${Number.isFinite(desde) && desde >= 0 ? `?desde=${desde}` : ''}`)
  } else if (req.method === 'POST' && Object.hasOwn(ACOES, acao)) {
    const c = await lerCorpo(req)
    const corpo = {}
    if (ACOES[acao]) {
      corpo.validar = c.validar === true
      corpo.plugins = c.plugins === true // baixa e instala o Metamod e o CounterStrikeSharp mais novos antes de abrir
    }
    if (acao === 'comando') {
      corpo.cmd = String(c.cmd ?? '').trim().slice(0, 500)
      if (!corpo.cmd) throw new ErroPedido('Comando vazio')
    }
    r = await pedirAgente(agente, `/api/${acao}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  } else throw new ErroNaoEncontrado('rota')
  // o agente responde no mesmo formato ({ erro } com 409 etc. quando recusa a ação): o painel mostra a frase dele
  return json(r.dados, r.status, cors)
}
