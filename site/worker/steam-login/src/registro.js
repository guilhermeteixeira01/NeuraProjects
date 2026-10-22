/*
 * Registro (log) do site, para o painel de admin (aba Logs). Um objeto global ("Registro") guarda as entradas em SQLite (não usa o KV, que tem
 * limite de gravações por dia). Guarda as últimas 20 mil; as mais velhas saem sozinhas.
 *
 * Tipos: admin (ações do painel), pagamento (depósitos e assinaturas pagas), troca, mercado, venda, assinatura, erro.
 *
 *   registrar(env, { tipo, quem, alvo?, texto, dados? })   -> nunca falha (se o registro estiver fora, só some a linha)
 *   GET /admin/logs?tipo=&q=&antes=<id>&limite=             -> { logs: [{ id, ts, tipo, quem, alvo, texto, dados }], mais }
 */
const MAX_LINHAS = 20000
const TIPOS = ['admin', 'pagamento', 'troca', 'mercado', 'venda', 'assinatura', 'erro']

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

export class Registro {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, tipo TEXT, quem TEXT, alvo TEXT, texto TEXT, dados TEXT)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS logs_tipo ON logs (tipo, id)')
  }

  async fetch(req) {
    const c = await req.json().catch(() => ({}))
    try {
      if (c.acao === 'add') {
        const e = c.entrada || {}
        this.sql.exec(
          'INSERT INTO logs (ts, tipo, quem, alvo, texto, dados) VALUES (?, ?, ?, ?, ?, ?)',
          Date.now(),
          TIPOS.includes(e.tipo) ? e.tipo : 'admin',
          String(e.quem || '').slice(0, 20),
          String(e.alvo || '').slice(0, 20),
          String(e.texto || '').slice(0, 400),
          e.dados ? JSON.stringify(e.dados).slice(0, 1500) : '',
        )
        // de vez em quando apaga as mais velhas
        if (Math.random() < 0.02) this.sql.exec('DELETE FROM logs WHERE id <= (SELECT MAX(id) FROM logs) - ?', MAX_LINHAS)
        return json({ ok: true })
      }
      if (c.acao === 'listar') {
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
        const mais = linhas.length > limite
        return json({ logs: linhas.slice(0, limite).map((l) => ({ ...l, dados: l.dados ? safeJson(l.dados) : null })), mais })
      }
      return json({ erro: 'acao' }, 400)
    } catch (e) {
      return json({ erro: 'falhou' }, 500)
    }
  }
}

const safeJson = (t) => {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

const objeto = (env) => env.REGISTRO.get(env.REGISTRO.idFromName('global'))

// Nunca derruba quem chama: se o registro falhar, a ação segue
export async function registrar(env, entrada) {
  try {
    if (!env.REGISTRO) return
    await objeto(env).fetch('https://registro/', { method: 'POST', body: JSON.stringify({ acao: 'add', entrada }) })
  } catch {
    // sem registro agora
  }
}

// GET /admin/logs (o index.js confere a aba "logs")
export async function rotaAdminLogs(url, env, cors) {
  const p = url.searchParams
  const r = await objeto(env).fetch('https://registro/', {
    method: 'POST',
    body: JSON.stringify({ acao: 'listar', tipo: p.get('tipo'), q: p.get('q'), antes: p.get('antes'), limite: p.get('limite') }),
  })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
}
