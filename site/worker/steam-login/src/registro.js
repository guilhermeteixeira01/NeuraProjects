/*
 * Registro (log) do site, para o painel de admin (aba Logs). Um objeto global ("Registro") guarda as entradas em SQLite e só as últimas
 * 20 mil (as mais velhas saem a cada gravação).
 *
 * Tipos: admin (ações do painel), pagamento (depósitos e assinaturas pagas), troca, mercado, venda, assinatura, conta, erro.
 *
 *   registrar(env, { tipo, quem, alvo?, texto, dados? })   -> o log nunca derruba a ação que está sendo registrada (falha vai para o console)
 *   GET /admin/logs?tipo=&q=&antes=<id>&limite=             -> { logs: [{ id, ts, tipo, quem, alvo, texto, dados }], mais }
 */
import { ErroPedido } from './erros.js'
import { migrarEsquema } from './esquema.js'
import { lerCorpo, reenviar } from './http.js'
import { objetoGlobal, responder, semDerrubar } from './objetos.js'

const MAX_LINHAS = 20000
const MAX_DADOS = 1500
const TIPOS = ['admin', 'pagamento', 'troca', 'mercado', 'venda', 'assinatura', 'conta', 'erro']

export class Registro {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, tipo TEXT, quem TEXT, alvo TEXT, texto TEXT, dados TEXT)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS logs_tipo ON logs (tipo, id)')
    migrarEsquema(ctx, [
      // 1: "dados" antigos eram cortados no meio do JSON; os que ficaram inválidos viram vazio
      (sql) => sql.exec("UPDATE logs SET dados = '' WHERE dados != '' AND json_valid(dados) = 0"),
    ])
  }

  fetch(req) {
    return responder(async () => {
      const c = await lerCorpo(req)
      if (c.acao === 'add') return this.adicionar(c.entrada || {})
      if (c.acao === 'listar') return this.listar(c)
      throw new ErroPedido('acao')
    })
  }

  adicionar(e) {
    const { id } = this.sql
      .exec(
        'INSERT INTO logs (ts, tipo, quem, alvo, texto, dados) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
        Date.now(),
        TIPOS.includes(e.tipo) ? e.tipo : 'admin',
        String(e.quem || '').slice(0, 20),
        String(e.alvo || '').slice(0, 20),
        String(e.texto || '').slice(0, 400),
        dadosDoLog(e.dados),
      )
      .one()
    this.sql.exec('DELETE FROM logs WHERE id <= ?', id - MAX_LINHAS) // pelo id (chave primária): não percorre a tabela
    return { ok: true }
  }

  listar(c) {
    const limite = Math.min(200, Math.max(1, Number(c.limite) || 100))
    const onde = []
    const args = []
    if (TIPOS.includes(c.tipo)) {
      onde.push('tipo = ?')
      args.push(c.tipo)
    }
    if (Number(c.antes) > 0) {
      onde.push('id < ?')
      args.push(Number(c.antes))
    }
    const q = String(c.q || '').trim().toLowerCase().slice(0, 60)
    if (q) {
      onde.push('(LOWER(texto) LIKE ? OR quem LIKE ? OR alvo LIKE ?)')
      args.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    const linhas = this.sql.exec(`SELECT id, ts, tipo, quem, alvo, texto, dados FROM logs ${onde.length ? 'WHERE ' + onde.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`, ...args, limite + 1).toArray()
    return { logs: linhas.slice(0, limite).map((l) => ({ ...l, dados: l.dados ? JSON.parse(l.dados) : null })), mais: linhas.length > limite }
  }
}

// Os dados extras da linha, sempre em JSON válido: grandes demais viram { cortado: "<começo do texto>" }
function dadosDoLog(dados) {
  if (dados == null) return ''
  const texto = JSON.stringify(dados)
  return texto.length <= MAX_DADOS ? texto : JSON.stringify({ cortado: texto.slice(0, MAX_DADOS - 40) })
}

const objeto = (env) => objetoGlobal(env.REGISTRO)

export const registrar = (env, entrada) => semDerrubar(objeto(env).fetch('https://registro/', { method: 'POST', body: JSON.stringify({ acao: 'add', entrada }) }), 'registro do log')

// GET /admin/logs (o index.js confere a aba "logs")
export async function rotaAdminLogs(url, env, cors) {
  const p = url.searchParams
  const r = await objeto(env).fetch('https://registro/', { method: 'POST', body: JSON.stringify({ acao: 'listar', tipo: p.get('tipo'), q: p.get('q'), antes: p.get('antes'), limite: p.get('limite') }) })
  return reenviar(r, cors)
}
