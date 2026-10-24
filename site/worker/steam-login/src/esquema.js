// Migrações do SQLite de um Durable Object: cada passo roda uma vez, em ordem, numa transação; a versão fica na tabela "esquema".
// passos[0] leva à versão 1, passos[1] à 2... Acrescente passos no fim (nunca mude um que já rodou).
export function migrarEsquema(ctx, passos) {
  const sql = ctx.storage.sql
  sql.exec('CREATE TABLE IF NOT EXISTS esquema (versao INTEGER NOT NULL)')
  const atual = sql.exec('SELECT versao FROM esquema').toArray()[0]?.versao ?? 0
  if (atual >= passos.length) return
  ctx.storage.transactionSync(() => {
    for (let v = atual; v < passos.length; v++) passos[v](sql)
    sql.exec('DELETE FROM esquema')
    sql.exec('INSERT INTO esquema (versao) VALUES (?)', passos.length)
  })
}
