/*
 * Plugin do Vite do modo demo (npm run dev:demo). Substitui o plugin de dados do desenvolvimento normal (vite.config.js: dadosNoDev):
 * em vez de ler a pasta partidas/ do repositório (dados reais), serve só as fixtures de demo/fixtures.mjs, com o mesmo formato:
 *   /partidas/partidas.json · /partidas/<caminho>/partida.json · /ranking/ranking.json · /perfil/historico/<id>.json · /assets/data/*
 * O ranking sai do scripts/ranking.mjs de verdade, lendo uma cópia temporária das fixtures (site/.demo-dados/, fora do git).
 */
import fs from 'node:fs'
import path from 'node:path'
import { gerarFixtures, PESSOAS } from './fixtures.mjs'

export function dadosDeDemo(aqui) {
  const pasta = path.join(aqui, '.demo-dados', 'partidas')
  let fixtures = null
  let ranking = null
  const preparar = async () => {
    if (ranking) return
    fixtures = gerarFixtures()
    fs.rmSync(path.join(aqui, '.demo-dados'), { recursive: true, force: true })
    fs.mkdirSync(pasta, { recursive: true })
    fs.writeFileSync(path.join(pasta, 'partidas.json'), JSON.stringify(fixtures.lista))
    for (const [caminho, doc] of Object.entries(fixtures.docs)) {
      fs.mkdirSync(path.join(pasta, caminho), { recursive: true })
      fs.writeFileSync(path.join(pasta, caminho, 'partida.json'), JSON.stringify(doc))
    }
    const { gerarRanking } = await import('../scripts/ranking.mjs')
    ranking = await gerarRanking(pasta)
  }
  const json = (res, corpo, status = 200) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(corpo))
  }
  return {
    name: 'neura-dados-de-demo',
    async configureServer(server) {
      await preparar()
      server.middlewares.use(async (req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0])
        await preparar()
        if (url === '/ranking/ranking.json') {
          const { historicos, ...resto } = ranking
          return json(res, resto)
        }
        const historico = /^\/perfil\/historico\/(\d+)\.json$/.exec(url)
        if (historico) return historicos(res, historico[1])
        if (url === '/partidas/partidas.json') return json(res, fixtures.lista)
        if (url === '/partidas/series.json') return json(res, { series: [], partidas: [] })
        if (url === '/partidas/removidas.json') return json(res, [])
        const doc = /^\/partidas\/(demo\/md1\/[^/]+)\/partida\.json$/.exec(url)
        if (doc && fixtures.docs[doc[1]]) return json(res, fixtures.docs[doc[1]])
        if (/^\/partidas\/demo\/md1\/[^/]+\/?$/.test(url) && fixtures.docs[url.replace(/^\/partidas\//, '').replace(/\/$/, '')]) req.url = '/partidas/partida.html'
        else if (url === '/assets/data/times.json') return json(res, { atualizado: new Date().toISOString(), times: PESSOAS.length ? [...new Set(PESSOAS.map((p) => p.time))].map((nome) => ({ nome, logo: '/assets/logos/logo-np-64.png' })) : [] })
        else if (url === '/assets/data/twitch.json') return json(res, { canais: [], chat: false })
        next()
      })
      function historicos(res, id) {
        const h = ranking.historicos[id]
        return h ? json(res, h) : json(res, { erro: 'sem-historico' }, 404)
      }
    },
  }
}
