// Texto dos avisos de partida. Usado pelo site (card no canto da tela) e pelo deploy (push do OneSignal),
// então o aviso é igual nos dois. Só JavaScript puro (o deploy roda isto no Node).
import { nomeMapa } from './mapas.js'

const NOMES_CAT = { md1: 'MD1', md3: 'MD3', md5: 'MD5' }

export const linkPartida = (p) => `/partidas/${(p.caminho || p.nome).split('/').map(encodeURIComponent).join('/')}/`

// Resultado do mapa + status da série (lista = histórico inteiro, para contar a série)
export function descreverPartida(p, lista) {
  const org = String(p.caminho || '').split('/')[0].toUpperCase()
  const resultado = `${p.timeA} ${p.placarA ?? 0} x ${p.placarB ?? 0} ${p.timeB} · ${nomeMapa(p.mapa)}`
  if (!p.serieId) return { titulo: `${org ? `${org} · ` : ''}Partida encerrada`, texto: resultado, link: linkPartida(p) }

  const daSerie = lista.filter((x) => x.serieId === p.serieId)
  const vA = daSerie.filter((x) => x.placarA > x.placarB).length
  const vB = daSerie.filter((x) => x.placarB > x.placarA).length
  const total = Number((p.categoria || '').match(/^md(\d)$/)?.[1]) || daSerie.length
  const paraVencer = Math.floor(total / 2) + 1
  const numero = Number(/mapa (\d+)\//.exec(p.serie || '')?.[1]) || daSerie.length
  const timeA = p.serieTimeA || p.timeA
  const timeB = p.serieTimeB || p.timeB
  let status
  if (daSerie.some((x) => x.serieCancelada)) status = 'Série CANCELADA'
  else if (vA >= paraVencer || vB >= paraVencer || daSerie.length >= total)
    status = `Série FINALIZADA — ${vA > vB ? timeA : vB > vA ? timeB : 'empate'}${vA === vB ? '' : ' venceu'}`
  else {
    const proximo = p.serieMapas?.[numero]
    status = `Série EM ANDAMENTO${proximo ? ` · próximo: ${nomeMapa(proximo)}` : ''}`
  }
  return {
    titulo: `${org ? `${org} · ` : ''}${NOMES_CAT[p.categoria] || 'Série'} · mapa ${numero}/${total} encerrado`,
    texto: `${resultado}\n${timeA} ${vA} x ${vB} ${timeB} · ${status}`,
    link: linkPartida(p),
  }
}

// Aviso de série cancelada no servidor (quando o plugin marca a série depois de mapas jogados)
export function descreverCancelamento(p, lista) {
  const daSerie = lista.filter((x) => x.serieId === p.serieId)
  const vA = daSerie.filter((x) => x.placarA > x.placarB).length
  const vB = daSerie.filter((x) => x.placarB > x.placarA).length
  const org = String(p.caminho || '').split('/')[0].toUpperCase()
  return {
    titulo: `${org ? `${org} · ` : ''}${NOMES_CAT[p.categoria] || 'Série'} cancelada`,
    texto: `${p.serieTimeA || p.timeA} ${vA} x ${vB} ${p.serieTimeB || p.timeB} · a série foi cancelada no servidor`,
    link: linkPartida(p),
  }
}

// Avisos que o histórico novo tem em relação ao antigo (partidas novas e séries canceladas agora).
// No máximo `limite` partidas (o resto fica de fora para não encher a tela/celular de notificações).
export function novidadesEntre(antes, depois, limite = 3) {
  const vistos = new Set(antes.map((p) => p.nome))
  const novas = depois.filter((p) => !vistos.has(p.nome)).slice(0, limite).reverse()
  const avisos = novas.map((p) => ({ id: p.nome, ...descreverPartida(p, depois) }))
  const canceladaAntes = new Set(antes.filter((p) => p.serieCancelada).map((p) => p.serieId))
  const series = new Set()
  for (const p of depois) {
    if (!p.serieCancelada || canceladaAntes.has(p.serieId) || series.has(p.serieId)) continue
    series.add(p.serieId)
    avisos.push({ id: `cancelada-${p.serieId}`, ...descreverCancelamento(p, depois) })
  }
  return avisos
}

// Avisos das séries anunciadas pelo plugin (partidas/series.json): série nova ("iniciando") e
// série cancelada antes de qualquer mapa terminar (a cancelada com mapa jogado já avisa pelo histórico).
export function novidadesSeries(antes, depois) {
  const eraCancelada = new Set(antes.filter((a) => a.status === 'cancelada').map((a) => a.id))
  const existia = new Set(antes.map((a) => a.id))
  const avisos = []
  for (const a of depois) {
    const org = String(a.organizacao || '').toUpperCase()
    const cabeca = `${org ? `${org} · ` : ''}${NOMES_CAT[a.categoria] || a.formato || 'Série'}`
    if (!existia.has(a.id) && a.status !== 'cancelada')
      avisos.push({
        id: `serie-${a.id}`,
        titulo: `${cabeca} iniciando`,
        texto: `${a.timeA} x ${a.timeB}\nMapas: ${(a.mapas || []).map(nomeMapa).join(', ')}`,
        link: '/partidas/',
      })
    else if (a.status === 'cancelada' && existia.has(a.id) && !eraCancelada.has(a.id))
      avisos.push({ id: `serie-cancelada-${a.id}`, titulo: `${cabeca} cancelada`, texto: `${a.timeA} x ${a.timeB} · a série foi cancelada no servidor`, link: '/partidas/' })
  }
  return avisos
}
