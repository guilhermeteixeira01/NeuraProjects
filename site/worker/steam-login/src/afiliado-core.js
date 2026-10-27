// Apenas o callback Steam pode registrar a primeira indicação de uma conta nova.
export function prepararAfiliados(sql) {
  sql.exec('CREATE TABLE IF NOT EXISTS afiliado_entradas (steam TEXT PRIMARY KEY, criado INTEGER)')
  sql.exec('CREATE TABLE IF NOT EXISTS afiliados (convidado TEXT PRIMARY KEY, convidante TEXT NOT NULL, criado INTEGER, entregue INTEGER)')
  sql.exec('CREATE INDEX IF NOT EXISTS afiliados_convidante ON afiliados (convidante, criado)')
}

export function acaoAfiliado(obj, c) {
  const { sql } = obj
  if (c.acao === 'afiliado-entrada') {
    obj.ctx.storage.transactionSync(() => {
      if (sql.exec('SELECT steam FROM afiliado_entradas WHERE steam = ?', c.steam).toArray().length) return
      sql.exec('INSERT INTO afiliado_entradas (steam, criado) VALUES (?, ?)', c.steam, Date.now())
      const dono = /^\d{17}$/.test(c.ref || '') ? obj.conta(c.ref) : null
      if (c.novo === true && c.ref !== c.steam && dono?.nick && dono?.hash)
        sql.exec('INSERT OR IGNORE INTO afiliados (convidado, convidante, criado) VALUES (?, ?, ?)', c.steam, c.ref, Date.now())
    })
    return { ok: true }
  }
  if (c.acao === 'afiliado-elegivel') {
    const conta = obj.conta(c.steam)
    if (!conta?.nick || !conta.hash || (obj.env.EMAIL_PRONTO === '1' && !conta.email)) return null
    return sql.exec('SELECT * FROM afiliados WHERE convidado = ? AND entregue IS NULL', c.steam).toArray()[0] || null
  }
  if (c.acao === 'afiliado-confirmar') {
    sql.exec('UPDATE afiliados SET entregue = COALESCE(entregue, ?) WHERE convidado = ?', Date.now(), c.steam)
    return { ok: true }
  }
  if (c.acao === 'afiliado-lista') {
    const total = sql.exec('SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN entregue IS NOT NULL THEN 1 ELSE 0 END), 0) AS premios FROM afiliados WHERE convidante = ?', c.steam).one()
    const lista = sql.exec('SELECT convidado AS id, criado, entregue FROM afiliados WHERE convidante = ? ORDER BY criado DESC LIMIT 100', c.steam).toArray()
    const pendentes = sql.exec(`SELECT a.convidado FROM afiliados a JOIN contas c ON c.steam = a.convidado WHERE a.convidante = ? AND a.entregue IS NULL AND c.nick IS NOT NULL AND c.hash IS NOT NULL ${obj.env.EMAIL_PRONTO === '1' ? 'AND c.email IS NOT NULL' : ''} ORDER BY a.criado LIMIT 20`, c.steam).toArray().map(p => p.convidado)
    return { cadastrados: total.n, premios: total.premios, lista, pendentes }
  }
  return undefined
}
