// Chamadas ao worker (CONFIG.loginSteam). Toda falha vira ErroApi: o código que o worker mandou em { erro } (o mesmo que as telas traduzem),
// o status HTTP e os dados extras da resposta (ex.: { restantes } da senha errada). Sem conexão: código 'rede'. Login vencido (401): sai da conta.
import { CONFIG } from './config.js'
import { sair, tokenConta } from './conta.js'

export class ErroApi extends Error {
  /** @param {string} codigo  @param {{ status?: number, dados?: Record<string, unknown> }} [extra] */
  constructor(codigo, { status = 0, dados = {} } = {}) {
    super(codigo)
    this.name = 'ErroApi'
    this.codigo = codigo
    this.status = status
    this.dados = dados
  }
}

const base = () => String(CONFIG.loginSteam || '').replace(/\/$/, '')

// Resposta do worker como { texto, dados } (dados = JSON, quando é JSON); status de erro vira ErroApi
async function responder(rota, init) {
  if (!base()) throw new ErroApi('sem-servidor')
  let r
  try {
    r = await fetch(`${base()}${rota}`, init)
  } catch {
    throw new ErroApi('rede') // sem internet, worker fora ou bloqueado: o fetch não diz mais que isso
  }
  const texto = await r.text()
  const dados = texto && (r.headers.get('Content-Type') || '').includes('json') ? JSON.parse(texto) : null
  if (r.ok) return { texto, dados }
  const { erro, ...resto } = dados && typeof dados === 'object' ? dados : {}
  throw new ErroApi(typeof erro === 'string' ? erro : 'falhou', { status: r.status, dados: { erro, ...resto } })
}
const pedido = async (rota, init) => (await responder(rota, init)).dados

/**
 * Rota que pede login (GET sem corpo, POST com corpo). Sem login: ErroApi 'login'.
 * @param {string} rota  @param {unknown} [corpo]
 */
const leituras = new Map()
export async function chamarApi(rota, corpo) {
  const token = tokenConta()
  if (!token) throw new ErroApi('login')
  try {
    const chave = corpo === undefined ? `${token}:${rota}` : null
    if (chave && leituras.has(chave)) return await leituras.get(chave)
    const requisicao = pedido(rota, {
      method: corpo === undefined ? 'GET' : 'POST',
      ...(corpo === undefined ? { signal: AbortSignal.timeout(15000) } : {}),
      headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    if (!chave) return await requisicao
    leituras.set(chave, requisicao)
    try { return await requisicao } finally { if (leituras.get(chave) === requisicao) leituras.delete(chave) }
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401 && e.codigo === 'login') sair() // login vencido ou inválido: entrar de novo
    throw e
  }
}

// Para .catch de leituras de fundo (contador, lista que se atualiza sozinha, enfeite): falha do worker cai em "quando" (padrão: a tela fica
// como está); qualquer outro erro é bug e continua subindo.
export const seForErroApi =
  (quando = () => {}) =>
  (e) => {
    if (!(e instanceof ErroApi)) throw e
    return quando(e)
  }

// Rota pública (sem login)
export const lerApi = (rota, init) => pedido(rota, init)
// Rota pública como texto (quem compara com a última leitura para só redesenhar quando muda)
export const lerTextoApi = async (rota, init) => (await responder(rota, init)).texto

// Endereço do worker (WebSocket da presença, links de imagem)
export const enderecoApi = base
