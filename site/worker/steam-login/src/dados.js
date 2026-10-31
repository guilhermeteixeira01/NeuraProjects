/*
 * Dados compartilhados do site num Durable Object global ("Dados", SQLite), no lugar dos documentos inteiros do KV.
 *
 * Por quê: perfis, usuarios, config, bônus... eram um JSON só no KV, mudado com "lê tudo, muda, grava tudo". O KV não tem transação e leva
 * até 1 min para espalhar a gravação; duas mudanças perto uma da outra (admin editando um perfil enquanto um jogador ganha uma insígnia)
 * faziam a segunda gravar por cima da primeira, e a mudança sumia. Aqui cada registro é uma linha com número de versão: quem grava manda
 * a versão que leu e o objeto só aceita se ninguém mexeu no meio (senão ErroConflito 'versao' e o cliente relê e refaz: mudar()).
 *
 * Coleções (tabela itens: colecao, id, dados JSON, ver):
 *   perfis    id = SteamID64   (moldura, card, cargos, insígnias, assinatura, preferências... ver index.js)
 *   usuarios  id = SteamID64   ({ nome, apelido?, avatar, primeiro, visto }: quem já entrou no site)
 *   docs      id = nome        (config, loja-bonus, caixas, caixas-vistas, caixas-revisao, caixas-removidas, loja-config,
 *                               pagamento-config, assinatura-planos, premier, partidas-recentes, loja-jogadores)
 * Migração: na primeira leitura de cada coleção (ou de cada doc) o objeto traz o que estava no KV com o mesmo nome. O KV fica como estava.
 *
 * Leitura (lerColecao, lerItem, lerDoc): guardada na memória do worker por alguns segundos (quase todo pedido lê config e perfis).
 * Gravação (mudar, mudarDoc): sempre lê na hora, sem a cópia da memória, e confere a versão.
 */
import { ErroConflito, ErroPedido, ErroServico } from './erros.js'
import { lerCorpo } from './http.js'
import { lerJsonKv } from './kv.js'
import { Fila, objetoGlobal, pedir, responder } from './objetos.js'

const COLECOES = ['perfis', 'usuarios', 'docs']
const TENTATIVAS = 6

export class Dados {
  constructor(ctx, env) {
    this.env = env
    this.ctx = ctx
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS itens (colecao TEXT NOT NULL, id TEXT NOT NULL, dados TEXT NOT NULL, ver INTEGER NOT NULL, PRIMARY KEY (colecao, id)) WITHOUT ROWID')
    this.sql.exec('CREATE TABLE IF NOT EXISTS migradas (chave TEXT PRIMARY KEY) WITHOUT ROWID')
    this.fila = new Fila() // a migração lê o KV (await): os pedidos esperam a vez para ninguém importar duas vezes
  }

  fetch(req) {
    return responder(async () => {
      const c = await lerCorpo(req)
      if (!COLECOES.includes(c.colecao)) throw new ErroPedido('colecao')
      return this.fila.rodar(() => (c.acao === 'ler' ? this.ler(c.colecao, c.ids) : c.acao === 'gravar' ? this.gravar(c.colecao, c.mudancas) : Promise.reject(new ErroPedido('acao'))))
    })
  }

  migrada(chave) {
    return this.sql.exec('SELECT 1 FROM migradas WHERE chave = ?', chave).toArray().length > 0
  }

  // Traz do KV o que ainda não veio: a coleção inteira (perfis, usuarios) ou cada doc pedido
  async migrar(colecao, ids) {
    const pendentes = colecao === 'docs' ? (ids || []).filter((id) => !this.migrada(`docs:${id}`)) : this.migrada(colecao) ? [] : [colecao]
    for (const chave of pendentes) {
      const valor = await lerJsonKv(this.env, chave)
      const linhas = colecao === 'docs' ? (valor == null ? [] : [[chave, valor]]) : Object.entries(valor || (colecao === 'perfis' ? await perfisAntigos(this.env) : {}))
      this.ctx.storage.transactionSync(() => {
        for (const [id, dados] of linhas) this.sql.exec('INSERT OR IGNORE INTO itens (colecao, id, dados, ver) VALUES (?, ?, ?, 1)', colecao, id, JSON.stringify(dados))
        this.sql.exec('INSERT INTO migradas (chave) VALUES (?)', colecao === 'docs' ? `docs:${chave}` : chave)
      })
    }
  }

  // { itens: [[id, ver, dadosJson]] } da coleção inteira (ids ausente) ou só dos ids pedidos (os que não existem não vêm)
  async ler(colecao, ids) {
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 1000)) throw new ErroPedido('ids')
    await this.migrar(colecao, ids)
    // Correção única da antiga concessão automática pelo ranking. Preserva as demais conquistas.
    if (colecao === 'perfis' && !this.migrada('retirar-insignia-top3-v1')) {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("UPDATE itens SET dados = json_remove(dados, '$.insignias.top3'), ver = ver + 1 WHERE colecao = 'perfis' AND json_type(dados, '$.insignias.top3') IS NOT NULL")
        this.sql.exec('INSERT INTO migradas (chave) VALUES (?)', 'retirar-insignia-top3-v1')
      })
    }
    const linhas = ids
      ? ids.flatMap((id) => this.sql.exec('SELECT id, ver, dados FROM itens WHERE colecao = ? AND id = ?', colecao, String(id)).toArray())
      : this.sql.exec('SELECT id, ver, dados FROM itens WHERE colecao = ?', colecao).toArray()
    return { itens: linhas.map((l) => [l.id, l.ver, l.dados]) }
  }

  // mudancas: [{ id, ver (a que o cliente leu; 0 = não existia), dados (JSON) | null (apaga) }]. Tudo ou nada.
  async gravar(colecao, mudancas) {
    if (!Array.isArray(mudancas) || !mudancas.length || mudancas.length > 5000) throw new ErroPedido('mudancas')
    const vers = {}
    this.ctx.storage.transactionSync(() => {
      for (const m of mudancas) {
        const id = String(m.id)
        const atual = this.sql.exec('SELECT ver FROM itens WHERE colecao = ? AND id = ?', colecao, id).toArray()[0]?.ver ?? 0
        if (atual !== m.ver) throw new ErroConflito('versao', { id })
        if (m.dados == null) {
          this.sql.exec('DELETE FROM itens WHERE colecao = ? AND id = ?', colecao, id)
          vers[id] = 0
        } else {
          this.sql.exec('INSERT OR REPLACE INTO itens (colecao, id, dados, ver) VALUES (?, ?, ?, ?)', colecao, id, String(m.dados), atual + 1)
          vers[id] = atual + 1
        }
      }
    })
    return { vers }
  }
}

// KV "molduras" (formato de antes de existir "perfis"): { id: moldura }
async function perfisAntigos(env) {
  const antigo = (await lerJsonKv(env, 'molduras')) || {}
  return Object.fromEntries(Object.entries(antigo).map(([id, moldura]) => [id, { moldura }]))
}

// ── Cliente (usado pelas rotas e pelos outros objetos) ──
const objeto = (env) => objetoGlobal(env.DADOS)
const TTL = { perfis: 15_000, usuarios: 30_000, docs: 30_000 }
const memoria = new Map() // colecao (inteira) ou "docs:<id>" -> { linhas: Map(id -> dadosJson), ate }

const paraMapa = (linhas) => Object.fromEntries([...linhas].map(([id, dados]) => [id, JSON.parse(dados)]))

async function linhasDaColecao(env, colecao) {
  const guardado = memoria.get(colecao)
  if (guardado && guardado.ate > Date.now()) return guardado.linhas
  const { itens } = await pedir(objeto(env), { acao: 'ler', colecao })
  const linhas = new Map(itens.map(([id, , dados]) => [id, dados]))
  memoria.set(colecao, { linhas, ate: Date.now() + TTL[colecao] })
  return linhas
}

// Coleção inteira como objeto { id: dados } (cópia nova a cada chamada: quem recebe pode mexer à vontade)
export const lerColecao = async (env, colecao) => paraMapa(await linhasDaColecao(env, colecao))

// Um registro só (ou undefined)
export async function lerItem(env, colecao, id) {
  const dados = (await linhasDaColecao(env, colecao)).get(String(id))
  return dados === undefined ? undefined : JSON.parse(dados)
}

// Doc (config, bônus, caixas...): o valor salvo ou o padrão
export async function lerDoc(env, chave, padrao = null, { fresco = false } = {}) {
  const guardado = fresco ? undefined : memoria.get(`docs:${chave}`)
  let dados
  if (guardado && guardado.ate > Date.now()) dados = guardado.dados
  else {
    const { itens } = await pedir(objeto(env), { acao: 'ler', colecao: 'docs', ids: [chave] })
    dados = itens[0]?.[2]
    memoria.set(`docs:${chave}`, { dados, ate: Date.now() + TTL.docs })
  }
  return dados === undefined ? structuredClone(padrao) : JSON.parse(dados)
}

/**
 * Lê na hora (sem cópia da memória), deixa fn mexer e grava só o que mudou, conferindo a versão de cada registro.
 * Se alguém gravou no meio, relê e chama fn de novo (fn precisa poder rodar mais de uma vez: sem efeitos fora do mapa).
 * @param {string[] | null} ids  os registros que fn pode mexer (null = a coleção inteira)
 * @param {(mapa: Record<string, any>) => any} fn  muda o mapa no lugar (pôr, trocar ou apagar chaves) e devolve o que quiser
 * @returns {Promise<{ mapa: Record<string, any>, resultado: any }>}
 */
export async function mudar(env, colecao, ids, fn) {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const { itens } = await pedir(objeto(env), { acao: 'ler', colecao, ...(ids ? { ids: ids.map(String) } : {}) })
    const antes = new Map(itens.map(([id, ver, dados]) => [id, { ver, dados }]))
    const mapa = Object.fromEntries(itens.map(([id, , dados]) => [id, JSON.parse(dados)]))
    const resultado = await fn(mapa)
    const alcance = ids ? ids.map(String) : [...new Set([...antes.keys(), ...Object.keys(mapa)])]
    const mudancas = []
    for (const id of alcance) {
      const novo = mapa[id] === undefined ? null : JSON.stringify(mapa[id])
      const velho = antes.get(id)
      if (novo !== (velho?.dados ?? null)) mudancas.push({ id, ver: velho?.ver ?? 0, dados: novo })
    }
    if (!mudancas.length) return { mapa, resultado }
    try {
      await pedir(objeto(env), { acao: 'gravar', colecao, mudancas })
    } catch (e) {
      if (e instanceof ErroConflito && e.codigo === 'versao') continue
      throw e
    }
    esquecer(colecao, mudancas)
    return { mapa, resultado }
  }
  throw new ErroServico('ocupado', undefined, { indisponivel: true })
}

// Depois de gravar: a cópia da memória deste worker passa a ter o valor novo (os outros veem quando a cópia deles vencer)
function esquecer(colecao, mudancas) {
  if (colecao === 'docs') {
    for (const m of mudancas) memoria.set(`docs:${m.id}`, { dados: m.dados ?? undefined, ate: Date.now() + TTL.docs })
    return
  }
  const guardado = memoria.get(colecao)
  if (!guardado) return
  for (const m of mudancas) {
    if (m.dados == null) guardado.linhas.delete(m.id)
    else guardado.linhas.set(m.id, m.dados)
  }
}

// Muda um doc: fn recebe o valor atual (ou o padrão) e devolve o novo (undefined = apaga)
export async function mudarDoc(env, chave, fn, padrao = null) {
  const { mapa } = await mudar(env, 'docs', [chave], async (m) => {
    const novo = await fn(m[chave] ?? structuredClone(padrao))
    if (novo === undefined) delete m[chave]
    else m[chave] = novo
  })
  return mapa[chave]
}

export const gravarDoc = (env, chave, valor) => mudarDoc(env, chave, () => valor)
