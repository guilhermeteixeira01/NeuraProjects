import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..') // raiz do repositório (partidas/ e assets/data/ ficam lá)

// Uma entrada por página do site (cada uma com o seu CSS, sem misturar)
const PAGINAS = {
  inicio: 'index.html',
  neurapick: 'neurapick/index.html',
  partidas: 'partidas/index.html',
  partida: 'partidas/partida.html',
  ranking: 'ranking/index.html',
  perfil: 'perfil/index.html',
  admin: 'admin/index.html',
  times: 'times/index.html',
  naoencontrada: '404.html', // GitHub Pages mostra para qualquer endereço que não existe
}

// `npm run dev`: dados que ficam fora de site/ (no deploy eles são copiados para o site publicado)
//   /partidas/*.json         -> <repo>/partidas/            (enviados pelo plugin do servidor)
//   /partidas/<partida>/     -> página da partida (partidas/partida.html)
//   /assets/data/*           -> <repo>/assets/data/          (lista de times)
//   /ranking/ranking.json    -> gerado na hora com scripts/ranking.mjs
//   /perfil/historico/<id>.json -> idem (histórico do jogador)
function dadosNoDev() {
  const enviar = (res, arquivo) => {
    res.setHeader('Content-Type', arquivo.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream')
    fs.createReadStream(arquivo).pipe(res)
  }
  return {
    name: 'neura-dados-no-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0])
        const historico = /^\/perfil\/historico\/(\d+)\.json$/.exec(url)
        if (url === '/ranking/ranking.json' || historico) {
          const { gerarRanking } = await import('./scripts/ranking.mjs')
          const { historicos, ...ranking } = await gerarRanking(path.join(raiz, 'partidas'))
          const resposta = historico ? historicos[historico[1]] : ranking
          if (!resposta) return next()
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(resposta))
          return
        }
        const deFora = url.startsWith('/partidas/') || url.startsWith('/assets/data/') ? path.join(raiz, url) : null
        if (deFora && deFora.startsWith(raiz) && url.endsWith('.json') && fs.existsSync(deFora)) return enviar(res, deFora)
        // Pasta de uma partida: abre o modelo da página (ele busca o partida.json da própria pasta)
        if (deFora && url.endsWith('/') && fs.existsSync(path.join(deFora, 'partida.json'))) req.url = '/partidas/partida.html'
        next()
      })
    },
  }
}

// Listas de imagens que o painel e o perfil usam para escolher: é só colocar o arquivo na pasta (png, webp, avif, svg, jpg
// ou gif). Cada pasta vira um módulo virtual com a lista de arquivos:
//   public/assets/selos-equipe/  -> 'virtual:selos-equipe'  (selo do dono e dos admins, aba Cargos do painel)
//   public/assets/cards/<tema>/  -> 'virtual:cards-perfil'  (banner do card do perfil, janela Personalizar; cada subpasta é um
//                                   tema/coleção, como nas molduras: "funcoes/awper.avif")
//   public/assets/cards/mini/<tema>/<nome>.webp -> 'virtual:cards-mini' (miniaturas leves da grade) e cards/med/ -> 'virtual:cards-med'
//                                   (versão de 400 px do card no perfil e no pódio): ambas por  node scripts/gerar-miniaturas.mjs
// recursivo: percorre as subpastas e devolve "tema/arquivo" (ignorando as pastas em "ignorar").
// Imagem animada de verdade? Olha o começo do arquivo: AVIF em sequência (marca "avis"), WebP animado (chunk "ANIM"), APNG (chunk
// "acTL") ou GIF com mais de um quadro.
function ehAnimada(arquivo) {
  try {
    const fd = fs.openSync(arquivo, 'r')
    const buf = Buffer.alloc(4096)
    const n = fs.readSync(fd, buf, 0, 4096, 0)
    fs.closeSync(fd)
    const topo = buf.subarray(0, n)
    const txt = topo.toString('latin1')
    if (/\.avif$/i.test(arquivo)) return txt.slice(0, 64).includes('avis')
    if (/\.webp$/i.test(arquivo)) return txt.slice(0, 64).includes('ANIM') || txt.includes('ANIM')
    if (/\.png$/i.test(arquivo)) return txt.includes('acTL')
    if (/\.gif$/i.test(arquivo)) return fs.readFileSync(arquivo).toString('latin1').split('\x00\x21\xf9\x04').length > 2
  } catch {
    // ilegível: trata como imagem parada
  }
  return false
}

function imagensDaPasta(id, subpasta, { recursivo = false, ignorar = [], animadas = false } = {}) {
  const pasta = path.resolve(aqui, 'public/assets', subpasta)
  const imagem = /\.(png|webp|avif|svg|jpe?g|gif)$/i
  const ler = (dir = pasta, prefixo = '') => {
    if (!fs.existsSync(dir)) return []
    const lista = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (recursivo && !(prefixo === '' && ignorar.includes(e.name))) lista.push(...ler(path.join(dir, e.name), prefixo + e.name + '/'))
      } else if (imagem.test(e.name)) lista.push(prefixo + e.name)
    }
    return lista.sort()
  }
  return {
    name: 'neura-' + subpasta.replace('/', '-'),
    resolveId: (origem) => (origem === id ? '\0' + id : null),
    // animadas: além da lista, exporta "animados" (as que são animadas de verdade)
    load: (origem) => {
      if (origem !== '\0' + id) return null
      const lista = ler()
      const extra = animadas ? `\nexport const animados = ${JSON.stringify(lista.filter((n) => ehAnimada(path.join(pasta, n))))}` : ''
      return `export default ${JSON.stringify(lista)}${extra}`
    },
    configureServer(server) {
      server.watcher.add(pasta)
      const recarregar = (arq) => {
        if (!path.resolve(arq).startsWith(pasta)) return
        const mod = server.moduleGraph.getModuleById('\0' + id)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', recarregar)
      server.watcher.on('unlink', recarregar)
    },
  }
}

export default defineConfig({
  plugins: [react(), dadosNoDev(), imagensDaPasta('virtual:selos-equipe', 'selos-equipe'), imagensDaPasta('virtual:cards-perfil', 'cards', { recursivo: true, ignorar: ['mini', 'med', 'parado'], animadas: true }), imagensDaPasta('virtual:cards-mini', 'cards/mini', { recursivo: true }), imagensDaPasta('virtual:cards-med', 'cards/med', { recursivo: true })],
  build: {
    // Arquivos do React em /static/ (a pasta /assets/ é das imagens e dos dados do site)
    assetsDir: 'static',
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGINAS).map(([nome, arq]) => [nome, path.resolve(aqui, arq)])),
    },
  },
})
