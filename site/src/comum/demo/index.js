// Modo demo (npm run dev:demo): prévia completa e determinística, sem Steam, servidor CS2 nem APIs externas.
// Liga a prévia local (previewLocal.js, que responde no lugar do worker) com fixtures próprias e um seletor de cenários.
// Só roda em desenvolvimento, em localhost, com --mode demo (cenarios.js: demoPermitido); fora disso nada acontece.
import { ativarPreviewLocal } from '../previewLocal.js'
import { cenarioAtual, demoPermitido, lobbyAtual } from './cenarios.js'
import { avatarDemo, estenderDemo, interceptarDemo, respostaDeArquivo } from './dados.js'
import { montarSeletor } from './seletor.js'

export async function ativarDemo() {
  if (!demoPermitido()) return false
  const cenario = cenarioAtual()
  const lobby = lobbyAtual()
  ativarPreviewLocal({
    id: '76561198000000011',
    nome: 'Neura Demo',
    avatar: avatarDemo('Neura Demo', '#3478f6'),
    chaveEstado: `np-demo-dados-${cenario}`,
    semLogin: cenario === 'sem-login',
    estender: (ctx) => estenderDemo(ctx, cenario),
    interceptar: interceptarDemo(cenario, lobby),
  })
  // arquivos de dados (ranking, partidas, histórico) servidos pelo Vite com as fixtures: aqui só os cenários vazio/carregando/erro
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    try {
      const u = new URL(input instanceof Request ? input.url : String(input), location.href)
      if (u.origin === location.origin && /^\/(ranking\/ranking\.json|partidas\/|perfil\/historico\/)/.test(u.pathname)) {
        const r = respostaDeArquivo(cenario, u.pathname)
        if (r) return Promise.resolve(r)
      }
    } catch { /* URL inválida: segue o fluxo normal */ }
    return original(input, init)
  }
  const montar = () => montarSeletor(cenario, lobby)
  if (document.body) montar()
  else document.addEventListener('DOMContentLoaded', montar, { once: true })
  return true
}
