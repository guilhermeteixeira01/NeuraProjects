// Quem já entrou no site (coleção "usuarios" do objeto Dados): { nome, apelido?, avatar, primeiro, visto }. O apelido escolhido no site
// vale no lugar do nome da Steam em tudo que lê daqui (lobby, trocas, mercado, times, painel).
import { lerColecao, mudar } from './dados.js'
import { ErroServico } from './erros.js'
import { resumosSteam } from './steam.js'

export const lerUsuarios = (env) => lerColecao(env, 'usuarios')

const HORA_MS = 3600_000

// Registra a entrada/visita. visita = chamada do /eu: só grava se for novo, se o nome ou a foto mudou ou se a última visita tem mais de 1 hora
export async function registrarUsuario(env, id, perfil, visita = false, entradaRef = null) {
  const { resultado } = await mudar(env, 'usuarios', [id], (usuarios) => {
    const novo = !usuarios[id]
    const antes = usuarios[id] || {}
    const limpar = perfil.apelido === null
    const apelido = limpar ? '' : perfil.apelido || antes.apelido || ''
    const nome = apelido || perfil.nome || (limpar ? id : antes.nome) || ''
    const mudou = !usuarios[id] || nome !== antes.nome || (perfil.avatar && perfil.avatar !== antes.avatar)
    if (visita && !mudou && Date.now() - new Date(antes.visto || 0).getTime() < HORA_MS) return
    const agora = new Date().toISOString()
    usuarios[id] = { ...antes, nome, ...(apelido ? { apelido } : {}), avatar: perfil.avatar || antes.avatar || '', primeiro: antes.primeiro || agora, visto: agora,
      ...(novo && entradaRef !== null ? { indicacaoEntrada: { ref: entradaRef } } : {}) }
    if (limpar) delete usuarios[id].apelido
    return { novo, indicacaoEntrada: usuarios[id].indicacaoEntrada }
  })
  return resultado
}

// Nome e foto de vários jogadores: quem já entrou no site vem da coleção; os outros, da Steam numa chamada só.
// O que veio da Steam fica 10 min na memória (o lobby pergunta nomes a cada pedido); se a Steam falhar, o site mostra o SteamID por 30 s.
const daSteam = new Map() // id -> { nome, avatar, ate }
export async function nomesDe(env, ids) {
  const usuarios = await lerUsuarios(env)
  const agora = Date.now()
  const fora = ids.filter((id) => !usuarios[id]?.nome && !(daSteam.get(id)?.ate > agora))
  if (fora.length) {
    try {
      const achados = await resumosSteam(env, fora, 2500)
      for (const id of fora) daSteam.set(id, { ...(achados.get(id) || { nome: '', avatar: '' }), ate: agora + (achados.has(id) ? 10 * 60_000 : 60_000) })
    } catch (e) {
      if (!(e instanceof ErroServico)) throw e
      console.error('steam: nomes', e.cause ?? e.dados)
      for (const id of fora) daSteam.set(id, { nome: '', avatar: '', ate: agora + 30_000 })
    }
  }
  return Object.fromEntries(ids.map((id) => [id, { nome: usuarios[id]?.nome || daSteam.get(id)?.nome || '', avatar: usuarios[id]?.avatar || daSteam.get(id)?.avatar || '' }]))
}
