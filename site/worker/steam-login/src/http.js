// Respostas HTTP, leitura do corpo e conferência de tokens: o que todas as rotas e todos os Durable Objects usam.
import { ErroApi, ErroLogin, ErroPedido } from './erros.js'

const TIPO_JSON = { 'Content-Type': 'application/json; charset=utf-8' }

export const json = (dados, status = 200, cabecalhos = {}) => new Response(JSON.stringify(dados), { status, headers: { ...TIPO_JSON, ...cabecalhos } })

// Repassa a resposta de um Durable Object (já em JSON) com os cabeçalhos da rota (CORS, cache)
export const reenviar = (r, cabecalhos = {}) => new Response(r.body, { status: r.status, headers: { ...TIPO_JSON, ...cabecalhos } })

// Erro tipado vira { erro, ...dados } com o status da classe; qualquer outro é bug: 500 e log
export function respostaDeErro(e, cabecalhos = {}) {
  if (e instanceof ErroApi) return json({ erro: e.codigo, ...e.dados }, e.status, cabecalhos)
  console.error(e)
  return json({ erro: 'falhou' }, 500, cabecalhos)
}

// Corpo JSON de um POST (sempre um objeto); corpo ausente, quebrado ou de outro tipo é pedido inválido
export async function lerCorpo(req) {
  let corpo
  try {
    corpo = await req.json()
  } catch {
    throw new ErroPedido('corpo')
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroPedido('corpo')
  return corpo
}

// Compara dois textos em tempo constante (não para no primeiro caractere diferente: não dá para descobrir o token aos poucos)
export function tokenIgual(recebido, certo) {
  const a = new TextEncoder().encode(String(recebido ?? ''))
  const b = new TextEncoder().encode(String(certo ?? ''))
  let dif = a.length ^ b.length
  for (let i = 0; i < b.length; i++) dif |= (a[i] ?? 0) ^ b[i]
  return b.length > 0 && dif === 0
}

const bearer = (req) => (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()

// Rotas de serviço (plugin do servidor, Asaas, manutenção): o token tem que conferir com o segredo configurado
export function exigirToken(recebido, segredo) {
  if (!tokenIgual(recebido, segredo)) throw new ErroLogin('token')
}
export const exigirBearer = (req, segredo) => exigirToken(bearer(req), segredo)
export const tokenDoPedido = bearer
