/*
 * Monta o site publicado a partir do build (npm run build) e dos dados do repositório:
 *   1. copia dist/ (páginas e arquivos do React) para a pasta de saída
 *   2. copia os dados: lista de times (assets/data) e partidas (partidas.json + <caminho>/partida.json)
 *   3. tira do histórico as partidas cuja pasta foi apagada
 *   4. gera o ranking (ranking/ranking.json)
 *   5. cria a página de cada partida (partidas/<caminho>/index.html)
 *   6. gera o HTML de todas as páginas já com o conteúdo (rápido e bom para o Google); o React assume no navegador
 *   7. sitemap.xml com todas as páginas
 *
 * Uso: node scripts/gerar-site.mjs --dados <raiz do repositório> --saida <pasta do site>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gerarRanking } from './ranking.mjs'

const SITE = 'https://neuraproject.com.br'
const aqui = path.dirname(fileURLToPath(import.meta.url))
const projeto = path.resolve(aqui, '..')

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : padrao
}
const dados = path.resolve(arg('dados', path.join(projeto, '..')))
const saida = path.resolve(arg('saida', path.join(projeto, 'dist-final')))
const dist = path.join(projeto, 'dist')
const ssr = path.join(projeto, 'dist-ssr', 'ssr.js')

if (!fs.existsSync(dist) || !fs.existsSync(ssr)) {
  console.error('Rode "npm run build" antes (faltam dist/ ou dist-ssr/ssr.js).')
  process.exit(1)
}

const ler = (arq) => fs.readFileSync(arq, 'utf8')
const lerJson = (arq) => JSON.parse(ler(arq))
const escrever = (arq, texto) => {
  fs.mkdirSync(path.dirname(arq), { recursive: true })
  fs.writeFileSync(arq, texto)
}
// Texto dentro de atributo/tag HTML
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// JSON dentro de <script>: "<" escapado para nenhum texto fechar a tag
const jsonNoHtml = (v) => JSON.stringify(v).replace(/</g, '\\u003c')

// ── 1. Build ──
fs.rmSync(saida, { recursive: true, force: true })
fs.cpSync(dist, saida, { recursive: true })

// ── 2. Dados ──
const pastaTimes = path.join(dados, 'assets', 'data')
if (fs.existsSync(pastaTimes)) fs.cpSync(pastaTimes, path.join(saida, 'assets', 'data'), { recursive: true })

// Da pasta partidas/ do repositório só vão os JSON (partidas.json e o partida.json de cada partida)
const origemPartidas = path.join(dados, 'partidas')
const saidaPartidas = path.join(saida, 'partidas')
if (fs.existsSync(origemPartidas)) {
  fs.cpSync(origemPartidas, saidaPartidas, {
    recursive: true,
    filter: (o) => fs.statSync(o).isDirectory() || o.endsWith('.json'),
  })
}

// ── 3. Histórico só com partidas que existem ──
const arquivoLista = path.join(saidaPartidas, 'partidas.json')
const listaBruta = fs.existsSync(arquivoLista) ? lerJson(arquivoLista) : []
const lista = listaBruta.filter((p) => fs.existsSync(path.join(saidaPartidas, p.caminho || p.nome, 'partida.json')))
escrever(arquivoLista, JSON.stringify(lista, null, 2))
console.log(`Partidas no histórico: ${lista.length} (removidas: ${listaBruta.length - lista.length})`)

// ── 4. Ranking ──
const ranking = await gerarRanking(saidaPartidas, { premier: arg('premier', 'sim') !== 'nao' })
escrever(path.join(saida, 'ranking', 'ranking.json'), JSON.stringify(ranking, null, 2))
console.log(`Ranking: ${ranking.jogadores.length} jogador(es) em ${ranking.partidas} mapa(s)`)

// ── 5 e 6. HTML com conteúdo ──
const { renderizar } = await import(pathToFileURL(ssr).href)

function montarPagina(modelo, pagina, dadosPagina, trocar = {}) {
  let html = modelo
    .replace('<!--app-->', renderizar(pagina, dadosPagina))
    .replace('<!--dados-->', dadosPagina === undefined ? '' : `<script id="dados-pagina" type="application/json">${jsonNoHtml(dadosPagina)}</script>`)
  if (trocar.titulo) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(trocar.titulo)}</title>`)
  if (trocar.descricao) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(trocar.descricao)}">`)
  if (trocar.url) html = html.replace('</title>', `</title>\n<link rel="canonical" href="${SITE}${trocar.url}">`)
  return html
}

const PAGINAS = [
  ['index.html', 'inicio'],
  ['launcher/index.html', 'launcher'],
  ['neurapick/index.html', 'neurapick'],
  ['times/index.html', 'times'],
  ['admin.html', 'admin'],
  ['partidas/index.html', 'partidas', lista],
  ['ranking/index.html', 'ranking', ranking],
]
for (const [arq, pagina, dadosPagina] of PAGINAS) {
  const destino = path.join(saida, arq)
  escrever(destino, montarPagina(ler(destino), pagina, dadosPagina))
}

// Página de cada partida (a partir do modelo partidas/partida.html)
const modeloPartida = path.join(saidaPartidas, 'partida.html')
const modelo = ler(modeloPartida)
const nomeMapa = (m) => String(m || '').replace(/^de_/, '').replace(/^./, (c) => c.toUpperCase())
const urls = ['/', '/neurapick/', '/partidas/', '/ranking/', '/launcher/']
for (const p of lista) {
  const caminho = p.caminho || p.nome
  const d = lerJson(path.join(saidaPartidas, caminho, 'partida.json'))
  // Mapas da mesma série já jogados (a seção "Série" mostra o resultado de cada um e o link para a página dele).
  // Cada mapa novo dispara o deploy, então todas as páginas da série saem atualizadas.
  if (p.serieId) d.serieJogos = lista.filter((x) => x.serieId === p.serieId)
  const url = `/partidas/${caminho.split('/').map(encodeURIComponent).join('/')}/`
  const titulo = `${d.timeA} ${d.placarA} x ${d.placarB} ${d.timeB} — ${nomeMapa(d.mapa)} | Neura Project`
  const descricao = `${d.timeA} ${d.placarA} x ${d.placarB} ${d.timeB} em ${nomeMapa(d.mapa)}${p.serie ? ` (${p.serie})` : ''}: placar, rounds, rating, ADR, KAST e destaques da partida.`
  escrever(path.join(saidaPartidas, caminho, 'index.html'), montarPagina(modelo, 'partida', d, { titulo, descricao, url }))
  urls.push(url)
}
fs.rmSync(modeloPartida)
console.log(`Páginas de partida: ${lista.length}`)

// ── 7. Sitemap ──
escrever(
  path.join(saida, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${SITE}${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
)
console.log(`Site pronto em ${saida}`)
