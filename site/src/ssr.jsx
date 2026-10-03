// Usado só no build (scripts/gerar-site.mjs): gera o HTML de cada página para o site já abrir com o conteúdo
// (mais rápido e bom para o Google). No navegador, o React assume esse HTML (comum/montar.jsx).
import { renderToString } from 'react-dom/server'
import Admin from './paginas/admin/Admin.jsx'
import Inicio from './paginas/inicio/Inicio.jsx'
import Launcher from './paginas/launcher/Launcher.jsx'
import NeuraPick from './paginas/neurapick/App.jsx'
import Partida from './paginas/partida/Partida.jsx'
import Partidas from './paginas/partidas/Partidas.jsx'
import Ranking from './paginas/ranking/Ranking.jsx'
import Times from './paginas/times/Times.jsx'

const PAGINAS = { admin: Admin, inicio: Inicio, launcher: Launcher, neurapick: NeuraPick, partida: Partida, partidas: Partidas, ranking: Ranking, times: Times }

export function renderizar(pagina, dados) {
  const Pagina = PAGINAS[pagina]
  if (!Pagina) throw new Error(`Página desconhecida: ${pagina}`)
  return renderToString(<Pagina dados={dados} />)
}
