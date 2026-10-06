// Limpeza das séries canceladas (workflow .github/workflows/limpar-series.yml), rodando na raiz do repositório.
//   node site/scripts/limpar-series.mjs esperar
//       se alguma série cancelada vence nos próximos minutos, espera até ela vencer (a contagem do site acabar)
//   node site/scripts/limpar-series.mjs aplicar <arquivo-de-tags>
//       apaga do repositório tudo das séries vencidas: pasta de cada partida (partida.json), a entrada no
//       partidas.json e o anúncio no series.json; anota em partidas/removidas.json (para apagar também o que chegar
//       atrasado: partida pendente do plugin, demo enviada depois) e grava as tags dos releases de demo a apagar.
// O workflow roda o "aplicar" sempre em cima do commit mais novo e tenta de novo se o plugin enviar algo no meio,
// então nada que o plugin mandou é perdido: só sai o que é da série cancelada.
import fs from 'node:fs'
import path from 'node:path'
import { analisarCanceladas } from '../src/comum/series.js'

const PASTA = 'partidas'
const ESPERA_MAX_MS = 6 * 60 * 1000 // o workflow não fica parado mais que isso (o cron pega o resto)
const GUARDAR = 200 // quantas séries/partidas removidas ficam anotadas

const lerJson = (arq, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'))
  } catch {
    return padrao
  }
}
const gravarJson = (arq, v) => fs.writeFileSync(arq, JSON.stringify(v, null, 2) + '\n')
const dados = () => ({
  partidas: lerJson(path.join(PASTA, 'partidas.json'), []),
  series: lerJson(path.join(PASTA, 'series.json'), []),
  removidas: lerJson(path.join(PASTA, 'removidas.json'), {}),
})

// Todas as partida.json que existem (para achar partida da série que ficou sem entrada na lista)
function pastasDePartida(dir = PASTA, base = '') {
  const achadas = []
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    if (!e.isDirectory()) continue
    const rel = base ? `${base}/${e.name}` : e.name
    if (fs.existsSync(path.join(dir, e.name, 'partida.json'))) achadas.push(rel)
    else achadas.push(...pastasDePartida(path.join(dir, e.name), rel))
  }
  return achadas
}

const [modo, arquivoTags] = process.argv.slice(2)

if (modo === 'esperar') {
  const { pendentes } = analisarCanceladas(dados())
  const agora = Date.now()
  const proxima = pendentes.map((p) => p.fim).filter((f) => f - agora <= ESPERA_MAX_MS).sort((a, b) => a - b)[0]
  if (!proxima) {
    console.log('Nenhuma série cancelada vencendo nos próximos minutos.')
  } else {
    const ms = Math.max(0, proxima - agora) + 5000 // 5 s de folga depois do fim da contagem
    console.log(`Esperando ${Math.round(ms / 1000)} s até a contagem da série cancelada acabar...`)
    await new Promise((ok) => setTimeout(ok, ms))
  }
} else if (modo === 'aplicar') {
  const d = dados()
  const c = analisarCanceladas(d)
  // Partidas que saem: as da lista e as pastas da série que não estão na lista
  const sai = new Map() // caminho -> nome
  for (const p of d.partidas.filter(c.sai)) sai.set(p.caminho || p.nome, p.nome)
  for (const caminho of pastasDePartida()) {
    if (sai.has(caminho)) continue
    const p = lerJson(path.join(PASTA, caminho, 'partida.json'), null)
    if (p?.serie?.id && c.vencidas.has(p.serie.id)) sai.set(caminho, caminho.split('/').pop())
  }

  for (const caminho of sai.keys()) fs.rmSync(path.join(PASTA, caminho), { recursive: true, force: true })
  const partidas = d.partidas.filter((p) => !sai.has(p.caminho || p.nome) && !c.sai(p))
  const series = d.series.filter((a) => !c.vencidas.has(a.id))
  if (partidas.length !== d.partidas.length) gravarJson(path.join(PASTA, 'partidas.json'), partidas)
  if (series.length !== d.series.length) gravarJson(path.join(PASTA, 'series.json'), series)

  // Anota o que saiu (mais recentes primeiro)
  const nomes = [...sai.values()]
  const removidas = {
    series: [...new Set([...c.vencidas, ...(d.removidas.series || [])])].slice(0, GUARDAR),
    partidas: [...new Set([...nomes, ...(d.removidas.partidas || [])])].slice(0, GUARDAR),
  }
  if (JSON.stringify(removidas) !== JSON.stringify({ series: d.removidas.series || [], partidas: d.removidas.partidas || [] }))
    gravarJson(path.join(PASTA, 'removidas.json'), removidas)

  // Releases de demo a apagar: os das partidas que saíram agora e os das últimas removidas (demo que subiu atrasada)
  const tags = [...new Set([...nomes, ...removidas.partidas.slice(0, 30)])].map((n) => `demo-${n}`)
  if (arquivoTags) fs.writeFileSync(arquivoTags, tags.join('\n') + (tags.length ? '\n' : ''))
  console.log(`Séries vencidas: ${[...c.vencidas].join(', ') || 'nenhuma'}`)
  console.log(`Partidas apagadas agora: ${nomes.join(', ') || 'nenhuma'}`)
  console.log(`Canceladas ainda na contagem: ${c.pendentes.map((p) => `${p.id} (até ${new Date(p.fim).toISOString()})`).join(', ') || 'nenhuma'}`)
} else {
  console.error('Uso: limpar-series.mjs esperar | aplicar <arquivo-de-tags>')
  process.exit(1)
}
