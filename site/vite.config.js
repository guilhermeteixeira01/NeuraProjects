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

export default defineConfig({
  plugins: [react(), dadosNoDev()],
  build: {
    // Arquivos do React em /static/ (a pasta /assets/ é das imagens e dos dados do site)
    assetsDir: 'static',
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGINAS).map(([nome, arq]) => [nome, path.resolve(aqui, arq)])),
    },
  },
})
