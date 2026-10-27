// Ambiente de teste do worker em Node: os Durable Objects de verdade (classes de src/), com SQLite real (node:sqlite) no lugar do armazenamento
// da Cloudflare, KV e cache da borda em memória e fetch externo (ranking do site, Steam) respondido aqui. Cada teste cria o seu (ambiente()).
import { registerHooks } from 'node:module'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// O worker importa JSON sem "with { type: 'json' }" (o wrangler aceita): aqui o JSON vira um módulo com export default
registerHooks({
  load(url, contexto, proximo) {
    if (url.endsWith('.wasm')) return { format: 'module', source: `export default new WebAssembly.Module(Buffer.from('${fs.readFileSync(fileURLToPath(url)).toString('base64')}', 'base64'))`, shortCircuit: true }
    if (url.endsWith('.json') && contexto.importAttributes?.type !== 'json') return { format: 'module', source: `export default ${fs.readFileSync(fileURLToPath(url), 'utf8')}`, shortCircuit: true }
    return proximo(url, contexto)
  },
})

// ctx.storage de um Durable Object: sql (exec com toArray/one), transactionSync, get/put/delete/list e alarme
export function armazenamento() {
  const db = new DatabaseSync(':memory:')
  const chaves = new Map()
  let alarme = null
  const cursor = (linhas) => ({
    toArray: () => linhas,
    one: () => {
      if (linhas.length !== 1) throw new Error(`one(): ${linhas.length} linhas`)
      return linhas[0]
    },
    [Symbol.iterator]: () => linhas[Symbol.iterator](),
  })
  const copia = (v) => (v === undefined ? undefined : structuredClone(v))
  return {
    sql: { exec: (consulta, ...valores) => cursor(db.prepare(consulta).all(...valores).map((l) => ({ ...l }))) },
    transactionSync(fn) {
      db.exec('BEGIN')
      try {
        const r = fn()
        db.exec('COMMIT')
        return r
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    async get(k) {
      return Array.isArray(k) ? new Map(k.filter((x) => chaves.has(x)).map((x) => [x, copia(chaves.get(x))])) : copia(chaves.get(k))
    },
    async put(k, v) {
      if (typeof k === 'object') for (const [a, b] of Object.entries(k)) chaves.set(a, copia(b))
      else chaves.set(k, copia(v))
    },
    async delete(k) {
      for (const x of [k].flat()) chaves.delete(x)
    },
    async list({ prefix = '' } = {}) {
      return new Map([...chaves].filter(([x]) => x.startsWith(prefix)))
    },
    async setAlarm(quando) { alarme = Number(quando) },
    async getAlarm() { return alarme },
    async deleteAlarm() { alarme = null },
  }
}

// Namespace de Durable Object: um objeto por nome, criado na primeira vez; fetch passa por um Request/Response de verdade
function namespace(Classe, env) {
  const instancias = new Map()
  const instancia = (id) => {
    if (!instancias.has(id)) {
      const storage = armazenamento()
      const ctx = { storage, blockConcurrencyWhile: (fn) => fn(), getWebSockets: () => [], acceptWebSocket() {}, setWebSocketAutoResponse() {}, getWebSocketAutoResponseTimestamp: () => null }
      instancias.set(id, new Classe(ctx, env))
    }
    return instancias.get(id)
  }
  return {
    instancia,
    idFromName: (nome) => nome,
    get(id) {
      return {
        fetch: async (endereco, init) => {
          const r = await instancia(id).fetch(new Request(endereco, init))
          return new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers })
        },
      }
    },
  }
}

function kv() {
  const m = new Map()
  return {
    dados: m,
    get: async (k, tipo) => (m.has(k) ? (tipo === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => void m.set(k, String(v)),
    delete: async (k) => void m.delete(k),
    list: async ({ prefix = '' } = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  }
}

// Cache da borda (caches.default) e fetch externo: ranking.json do site com os pontos de cada jogador
const cache = new Map()
globalThis.caches = {
  default: {
    match: async (r) => cache.get(typeof r === 'string' ? r : r.url)?.clone(),
    put: async (r, resp) => void cache.set(typeof r === 'string' ? r : r.url, resp.clone()),
    delete: async (r) => cache.delete(typeof r === 'string' ? r : r.url),
  },
}
export const ranking = { jogadores: [], niveis: [0] }
globalThis.fetch = async (endereco) => {
  const url = String(endereco)
  if (url.endsWith('/ranking/ranking.json')) return new Response(JSON.stringify(ranking), { headers: { 'Content-Type': 'application/json' } })
  if (url.includes('/perfil/historico/')) return new Response('', { status: 404 })
  throw new Error(`fetch não previsto no teste: ${url}`)
}

// API de WebSocket com hibernação do Durable Object de presença (os testes não abrem abas: só existe)
globalThis.WebSocketRequestResponsePair = class {}

const src = new URL('../src/', import.meta.url)
const worker = await import(new URL('index.js', src))

export const DONO = '76561198000000001'
export const SITE = 'http://localhost:5173'
const SEGREDO = 'segredo-de-teste'

// Ambiente novo (objetos e KV vazios); kvInicial preenche o KV antigo antes (para testar a migração)
export function ambiente(kvInicial = {}) {
  cache.clear()
  const env = { SITE: 'https://neuraproject.com.br', DONO, SEGREDO, ORIGENS_EXTRAS: SITE, SERVIDOR_TOKEN: 'token-servidor', MOLDURAS: kv() }
  for (const [k, v] of Object.entries(kvInicial)) env.MOLDURAS.dados.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  for (const [binding, classe] of Object.entries({ PRESENCA: 'Presenca', LOJA: 'Loja', TROCAS: 'Trocas', MERCADO: 'Mercado', REGISTRO: 'Registro', EQUIPES: 'Equipes', CONTAS: 'Contas', DADOS: 'Dados', HALL_RETRATOS: 'HallRetratos' })) env[binding] = namespace(worker[classe], env)
  const espera = []
  const ctx = { waitUntil: (p) => espera.push(p) }
  const b64 = (s) => Buffer.from(s).toString('base64url')
  async function token(id, nome = `Jogador ${id.slice(-2)}`) {
    const corpo = b64(JSON.stringify({ id, nome, avatar: '', exp: Math.floor(Date.now() / 1000) + 3600 }))
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return `${corpo}.${Buffer.from(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo))).toString('base64url')}`
  }
  // Pedido ao worker como o site faria: { status, dados }
  async function pedir(metodo, rota, { quem, corpo, cabecalhos = {} } = {}) {
    const headers = { Origin: SITE, ...cabecalhos }
    if (quem) headers.Authorization = `Bearer ${await token(quem)}`
    if (corpo !== undefined) headers['Content-Type'] = 'application/json'
    const r = await worker.default.fetch(new Request(`https://worker.test${rota}`, { method: metodo, headers, body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }), env, ctx)
    await Promise.all(espera.splice(0))
    const texto = await r.text()
    return { status: r.status, dados: texto && (r.headers.get('Content-Type') || '').includes('json') ? JSON.parse(texto) : texto }
  }
  return { env, pedir }
}
