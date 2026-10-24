/*
 * Rotas do jogador logado sobre a própria conta:
 *   GET  /eu                   -> quem é o dono do token, se é admin e quais abas do painel vê (registra a visita para o painel)
 *   POST /perfil               -> { moldura?, time?, card?, tema?, idioma?, desempenho?, vistos?, ocultoRanking? }
 *   GET  /conta/seguranca      -> { nick, temSenha, premium, podeTrocarNick, proximaTroca }
 *   GET  /conta/nick-livre?nick= -> validação ao vivo do campo de apelido
 *   POST /conta/nick { nick } · POST /conta/senha { senha, atual? }
 */
import { lembrarApelido } from './auth.js'
import { chamarContas } from './contas.js'
import { ErroNaoEncontrado, ErroPedido, ErroPermissao } from './erros.js'
import { json, lerCorpo } from './http.js'
import { semDerrubar } from './objetos.js'
import { abasDe, cargosDoJogador, ehAdmin, faltaSub, indiceSub, lerPerfil, lerPerfis, mudarPerfil, podeUsarCargo, precisaDoRanking } from './perfis.js'
import { esquecerJogador } from './publico.js'
import { lerRanking, nivelDoJogador } from './ranking.js'
import { registrar } from './registro.js'
import { registrarUsuario } from './usuarios.js'

export const ID_MOLDURA = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,60}$/
export const NOME_TIME = /^[^\u0000-\u001f<>]{1,40}$/ // nome da lista de times (o site só mostra se ainda existir na lista)
// Id de um card do perfil: "tema/arquivo.ext" (pasta do tema dentro de public/assets/cards/); o nome sem pasta também vale (cards antigos)
export const CARD_ID = /^([\p{L}0-9_ -]{1,40}\/)?[\p{L}0-9._ -]{1,80}\.(png|webp|avif|svg|jpe?g|gif)$/iu
// 'vistos' = avisos que a pessoa já viu ({ ins: ['top3'], nivel: 3 }): vale em todos os aparelhos
export const PREFERENCIAS = ['tema', 'idioma', 'desempenho', 'vistos']
const OPCOES = { tema: ['padrao', 'branco', 'escuro', 'claro'], idioma: ['pt', 'en', 'es'], desempenho: ['ligado', 'desligado'] }

// Valida o que veio do site e devolve os campos a mudar (null = tirar); campo inválido: ErroPedido com o nome do campo
export function validarPerfil(corpo) {
  const mudar = {}
  const formato = (campo, regex) => {
    if (!(campo in corpo)) return
    const v = typeof corpo[campo] === 'string' ? corpo[campo].trim() : corpo[campo] ?? null
    if (v !== null && (typeof v !== 'string' || !regex.test(v))) throw new ErroPedido(campo)
    mudar[campo] = v
  }
  formato('moldura', ID_MOLDURA)
  formato('time', NOME_TIME)
  formato('card', CARD_ID) // card (banner) do perfil: arquivo da pasta public/assets/cards/ do site
  // Preferências do ⚙ Configurações do site: ficam guardadas mesmo no valor padrão, para valer nos outros aparelhos
  for (const [campo, valores] of Object.entries(OPCOES)) {
    if (!(campo in corpo)) continue
    if (!valores.includes(corpo[campo])) throw new ErroPedido(campo)
    mudar[campo] = corpo[campo]
  }
  // Avisos já vistos (insígnia nova / nível): o site manda só o que acabou de ver e salvarPerfil junta com o que já tinha
  if ('vistos' in corpo) {
    const v = corpo.vistos
    if (!v || typeof v !== 'object') throw new ErroPedido('vistos')
    const vistos = {}
    if ('ins' in v) {
      // marca = id da insígnia (formato atual) ou "id:data" (formato antigo, ainda guardado em navegadores)
      if (!Array.isArray(v.ins) || v.ins.length > 50 || v.ins.some((m) => typeof m !== 'string' || !/^[a-z0-9_-]{1,60}(:\d{1,15})?$/.test(m))) throw new ErroPedido('vistos')
      vistos.ins = v.ins
    }
    if ('nivel' in v) {
      if (!Number.isInteger(v.nivel) || v.nivel < 0 || v.nivel > 99) throw new ErroPedido('vistos')
      vistos.nivel = v.nivel
    }
    mudar.vistos = vistos
  }
  // "Ocultar do ranking" (só dono e admins: salvarPerfil confere)
  if ('ocultoRanking' in corpo) mudar.ocultoRanking = corpo.ocultoRanking === true || null
  return mudar
}

// Moldura/card liberado por nível, exclusivo de um cargo ou só para assinantes (admins não têm trava). Bloqueia com ErroPermissao + o que falta
async function conferirItem(env, quem, config, perfis, { item, nivelPor, tabelaNivel, tabelaCargo, tabelaSub, erros }) {
  const perfil = perfis[quem.id]
  const precisaSub = faltaSub(config, tabelaSub, item, perfil, false)
  if (precisaSub) throw new ErroPermissao(erros.sub, { precisa: precisaSub })
  const precisa = config[nivelPor] ? Number(config[tabelaNivel]?.[item]) || 1 : 1
  if (precisa > 1) {
    const nivel = await nivelDoJogador(env, quem.id, perfil)
    if (nivel < precisa) throw new ErroPermissao(erros.nivel, { precisa, nivel })
  }
  const cargo = config[tabelaCargo]?.[item]
  if (cargo) {
    const ranking = precisaDoRanking(config) ? await lerRanking(env) : null
    if (!podeUsarCargo(cargo, quem.id, env, config, cargosDoJogador(quem.id, perfis, config, ranking))) throw new ErroPermissao(erros.cargo, { cargo })
  }
}

// POST /perfil
export async function salvarPerfil(req, env, quem, config, cors) {
  const mudar = validarPerfil(await lerCorpo(req))
  const admin = ehAdmin(quem.id, env, config)
  const perfis = await lerPerfis(env)
  // Bloqueado não troca o que os outros veem (moldura, time...); tema, idioma e desempenho são só de quem olha: continuam livres
  if (perfis[quem.id]?.bloqueado && !admin && Object.keys(mudar).some((k) => !PREFERENCIAS.includes(k))) throw new ErroPermissao('bloqueado')
  if (mudar.ocultoRanking && !admin) throw new ErroPermissao('admin') // só dono e admins se escondem do ranking
  if (!admin) {
    if (mudar.moldura) await conferirItem(env, quem, config, perfis, { item: mudar.moldura, nivelPor: 'molduraPorNivel', tabelaNivel: 'nivelMoldura', tabelaCargo: 'molduraCargo', tabelaSub: 'molduraSub', erros: { sub: 'sub', nivel: 'nivel', cargo: 'cargo' } })
    if (mudar.card) await conferirItem(env, quem, config, perfis, { item: mudar.card, nivelPor: 'cardPorNivel', tabelaNivel: 'nivelCard', tabelaCargo: 'cardCargo', tabelaSub: 'cardSub', erros: { sub: 'cardSub', nivel: 'cardNivel', cargo: 'cardCargo' } })
  }
  // molduraLivre: moldura posta por um admin aparece sempre (as outras exclusivas somem se o cargo sair)
  if ('moldura' in mudar) mudar.molduraLivre = admin && mudar.moldura ? true : null
  if (mudar.vistos) {
    const antes = perfis[quem.id]?.vistos || {}
    const ins = [...new Set([...(antes.ins || []), ...(mudar.vistos.ins || [])])].slice(-50)
    const nivel = mudar.vistos.nivel ?? antes.nivel
    mudar.vistos = { ...(ins.length ? { ins } : {}), ...(nivel !== undefined ? { nivel } : {}) }
  }
  return json({ ok: true, perfis: await mudarPerfil(env, quem.id, mudar) }, 200, cors)
}

// GET /eu: toda página com login chama; registra a visita (nome/avatar do próprio login) para o painel
export async function rotaEu(env, quem, config, cors) {
  const abas = await abasDe(quem.id, env, config)
  await semDerrubar(registrarUsuario(env, quem.id, { nome: quem.nome, avatar: quem.avatar }, true), 'registro da visita')
  if (quem.id === env.DONO) abas.push('servidor') // aba só do dono (fora de ABAS_ADMIN: nenhum cargo libera)
  return json({ id: quem.id, admin: ehAdmin(quem.id, env, config), dono: quem.id === env.DONO, painel: abas.length > 0, abas }, 200, cors)
}

const ehPremium = async (env, id, config) => indiceSub((await lerPerfil(env, id))?.sub, config) >= 0

// /conta/*: apelido único e senha de segurança (src/contas.js)
export async function rotaConta(req, env, quem, config, cors, rota, url) {
  if (rota === '/conta/seguranca' && req.method === 'GET') return json(await chamarContas(env, { acao: 'estado', steam: quem.id, premium: await ehPremium(env, quem.id, config) }), 200, cors)
  if (rota === '/conta/nick-livre' && req.method === 'GET') return json(await chamarContas(env, { acao: 'livre', steam: quem.id, nick: url.searchParams.get('nick') || '' }), 200, cors)
  if (rota === '/conta/nick' && req.method === 'POST') {
    const { nick } = await lerCorpo(req)
    const r = await chamarContas(env, { acao: 'nick', steam: quem.id, nick, premium: await ehPremium(env, quem.id, config) })
    await aplicarApelido(env, quem.id, r.nick, quem.avatar)
    await registrar(env, { tipo: 'conta', quem: quem.id, texto: `escolheu o apelido "${r.nick}"` })
    return json(r, 200, cors)
  }
  if (rota === '/conta/senha' && req.method === 'POST') {
    const { senha, atual } = await lerCorpo(req)
    const r = await chamarContas(env, { acao: 'senha', steam: quem.id, senha, atual })
    await registrar(env, { tipo: 'conta', quem: quem.id, texto: atual != null ? 'trocou a senha de segurança' : 'criou a senha de segurança' })
    return json(r, 200, cors)
  }
  throw new ErroNaoEncontrado('rota')
}

// Apelido novo vale na hora: memória do login, lista de usuários e o nome público em cache (/jogador)
export async function aplicarApelido(env, id, nick, avatar) {
  lembrarApelido(id, nick)
  await esquecerJogador(id)
  await registrarUsuario(env, id, { apelido: nick, ...(avatar ? { avatar } : {}) })
}
