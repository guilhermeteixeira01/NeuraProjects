// Série abandonada (ficou em "iniciando" e outra série começou depois) sai na hora, sem contagem.
// Série cancelada (css_seriecancelar): fica no site por 5 minutos, com contagem regressiva, e depois sai de tudo
// (lista de partidas, páginas dos mapas, ranking, histórico dos jogadores e as demos). Quem apaga de verdade é o
// workflow .github/workflows/limpar-series.yml (scripts/limpar-series.mjs); o build e as páginas também já escondem
// a série vencida, para nada dela aparecer enquanto a limpeza não roda.
// Este arquivo não usa React: também é importado pelos scripts do build.

export const PRAZO_CANCELADA_MS = 5 * 60 * 1000

// Hora do cancelamento (ms), ou null se a série não está cancelada.
// "canceladaEm" (ISO, plugin novo) é exata; sem ele usa "atualizada" ("aaaa-mm-dd hh:mm", horário de Brasília).
export function horaCancelamento(anuncio) {
  if (!anuncio || anuncio.status !== 'cancelada') return null
  const exata = Date.parse(anuncio.canceladaEm || '')
  if (Number.isFinite(exata)) return exata
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(anuncio.atualizada || '')
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`) : null
}

// Quando a série cancelada sai do site (ms), ou null se ela não está cancelada
export function fimDaSerie(anuncio) {
  const h = horaCancelamento(anuncio)
  return h === null ? null : h + PRAZO_CANCELADA_MS
}

// Séries vencidas (já passaram dos 5 minutos) e o que sai junto com elas.
//   partidas  = partidas.json (lista)   series = series.json   removidas = removidas.json ({ series: [], partidas: [] })
// Partida marcada como de série cancelada cujo anúncio não existe mais (lista de séries só guarda as 40 últimas)
// também conta como vencida.
export function analisarCanceladas({ partidas = [], series = [], removidas = {} }, agora = Date.now()) {
  const vencidas = new Set(removidas.series || [])
  const pendentes = [] // canceladas ainda dentro dos 5 minutos: { id, fim }
  for (const a of series) {
    const fim = fimDaSerie(a)
    if (fim === null) continue
    if (fim <= agora) vencidas.add(a.id)
    else pendentes.push({ id: a.id, fim })
  }
  // Série abandonada: ficou em "iniciando" (nenhum mapa começou) e depois outra série foi criada. Sai na hora, junto
  // com as canceladas vencidas. Só se não tiver nenhuma partida dela (o que já foi jogado nunca é apagado por isso).
  const comPartida = new Set(partidas.map((p) => p.serieId).filter(Boolean))
  const quando = (a) => String(a.criada || a.id || '')
  for (const a of series) {
    if (a.status !== 'iniciando' || comPartida.has(a.id)) continue
    if (series.some((b) => b.id !== a.id && quando(b) > quando(a))) vencidas.add(a.id)
  }
  const conhecidas = new Set(series.map((a) => a.id))
  for (const p of partidas) if (p.serieCancelada && p.serieId && !conhecidas.has(p.serieId)) vencidas.add(p.serieId)
  const nomesRemovidos = new Set(removidas.partidas || [])
  const sai = (p) => (p.serieId && vencidas.has(p.serieId)) || nomesRemovidos.has(p.nome)
  return { vencidas, pendentes, sai, seriesQueSaem: series.filter((a) => vencidas.has(a.id)) }
}
