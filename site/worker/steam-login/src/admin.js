import { lerPainelMissoes, salvarConfigMissoes } from './missoes.js'
import { insigniaMissao } from './missoes-core.js'
/*
 * Painel de administrador (/admin/*). Cada rota declara do que precisa: uma aba do painel ou ser o dono (ROTAS_ADMIN, no fim).
 *
 * Abas: usuarios, molduras, cards, cargos, assinaturas, skins, caixas, pontos, logs, admins.
 *  - o DONO tem todas;
 *  - quem é admin (config.admins) tem as do selo "Admins" (o dono edita em Cargos → Selos da equipe; sem nada salvo: usuarios, molduras, cards, cargos);
 *  - qualquer jogador ganha mais abas (ou só as abas) pelos CARGOS dele: cada cargo tem uma lista "acessos" que o dono marca ao editar o cargo.
 * Ação de admin que deu certo (POST) vira uma linha no log (registro.js), com quem, o quê e em quem.
 */
import { aplicarApelido, CARD_ID, ID_MOLDURA, NOME_TIME, PREFERENCIAS, validarPerfil } from './rotas-conta.js'
import { avisarPerfil, avisarSkin } from './amigos.js'
import { chamarContas } from './contas.js'
import { mudar, mudarDoc } from './dados.js'
import { ErroNaoEncontrado, ErroPedido, ErroPermissao } from './erros.js'
import { json, lerCorpo } from './http.js'
import { ehInsigniaLoja, ID_MESTRE } from './loja-core.js'
import { rotaAdminLoja } from './loja.js'
import { rotaAdminPagamento, rotaAdminPlanosSub } from './pagamentos.js'
import { ABAS_ADMIN, abasDe, cargosDoJogador, configDoPainel, ehAdmin, faltaSub, lerPerfis, mudarPerfil, NIVEIS_SUB, precisaDoRanking, selosDe, SUB_IDS, tirarExclusivasSemCargo } from './perfis.js'
import { lerRanking } from './ranking.js'
import { registrar, rotaAdminLogs } from './registro.js'
import { rotaAdminServidorCs2 } from './servidor-cs2.js'
import { rotaAdminSkin, rotaAdminSkins } from './skins.js'
import { lerUsuarios } from './usuarios.js'
import { zerarTudo } from './zerar.js'

const ID_STEAM = /^\d{17}$/
const ID_CARGO = /^[a-z0-9-]{1,24}$/
const COR = /^#[0-9a-f]{6}$/i
const NIVEL_MAX = 11 // 10 níveis + o Elite (src/comum/niveis.js): molduras e cards podem ser liberados até o Elite
const CARGOS_MAX = 20
const XP_LIMITE = 1000000 // ajuste de XP do admin: de -1.000.000 a +1.000.000
const IMAGEM_SELO = /^[A-Za-z0-9._-]{1,80}\.(png|webp|avif|svg|jpe?g|gif)$/i // arquivo de public/assets/selos-equipe/ do site
// Ícones do selo do cargo (o desenho de cada um fica no site: src/comum/cargos.jsx)
const ICONES_CARGO = ['coroa', 'cifrao', 'estrela', 'diamante', 'raio', 'escudo', 'fogo', 'caveira', 'trofeu', 'coracao', 'verificado', 'mira', 'microfone', 'controle']
// Insígnias dadas à mão (arte e descrição ficam no site: src/comum/insignias.js). "top3" também vem sozinha (cron)
const INSIGNIAS = ['top3', 'staff', 'embaixador', 'designer']

// ── Linha do log para cada ação do painel ──
const ROTULO_ADMIN = {
  '/admin/perfil': 'editou o perfil',
  '/admin/config': 'mudou as configurações',
  '/admin/selos': 'mudou os selos da equipe',
  '/admin/admins': 'mudou administradores',
  '/admin/skin': 'mexeu nas skins do jogador',
  '/admin/caixas': 'mudou as caixas da loja',
  '/admin/loja-config': 'mudou a configuração da loja',
  '/admin/loja-pontos': 'mexeu nos pontos',
  '/admin/loja-bonus': 'apagou um bônus de pontos para todos',
  '/admin/loja-bonus-caixa': 'deu um bônus de caixa para todos',
  '/admin/pagamento-config': 'mudou a configuração dos depósitos',
  '/admin/assinatura-planos': 'mudou os planos de assinatura',
  '/admin/zerar-tudo': 'ZEROU TUDO',
  '/admin/senha-reset': 'apagou a senha de segurança do jogador',
  '/admin/nick': 'trocou o apelido do jogador',
}
const ROTULO_SERVIDOR = { iniciar: 'iniciou o servidor de CS2', parar: 'parou o servidor de CS2', reiniciar: 'reiniciou o servidor de CS2', comando: 'mandou comando ao servidor de CS2', gameinfo: 'conferiu o gameinfo.gi (Metamod) do servidor de CS2', plugins: 'atualizou o Metamod e o CounterStrikeSharp do servidor de CS2' }
function descreverAcao(rota, quem, c) {
  if (rota.startsWith('/admin/servidor/')) {
    const acao = rota.replace('/admin/servidor/', '')
    // o comando de console pode ter senha (sv_password, rcon): só a primeira palavra vai para o log
    const extra = acao === 'comando' ? ` (${String(c.cmd || '').trim().split(/\s+/)[0].slice(0, 40)})` : [c.validar ? 'validando arquivos' : '', c.plugins ? 'atualizando plugins' : ''].filter(Boolean).map((x) => ` (${x})`).join('')
    return { tipo: 'admin', quem, alvo: '', texto: (ROTULO_SERVIDOR[acao] || 'ação no servidor de CS2') + extra, dados: { rota } }
  }
  const chaves = Object.keys(c).filter((k) => !['id', 'alvo'].includes(k))
  let texto = ROTULO_ADMIN[rota] || `ação em ${rota.replace('/admin/', '')}`
  if (rota === '/admin/perfil') texto = c.limpar ? 'apagou os dados do jogador' : c.sub === null ? 'removeu a assinatura' : `editou o perfil (${chaves.join(', ') || 'sem mudanças'})`
  else if (rota === '/admin/admins') texto = c.admin === true ? 'promoveu a administrador' : 'removeu de administrador'
  else if (rota === '/admin/loja-pontos') texto = `${c.acao || 'mexeu'} ${c.valor ?? ''} NP ${c.alvo === 'todos' ? 'para TODOS' : ''}${c.motivo ? ` (${String(c.motivo).slice(0, 60)})` : ''}`.replace(/ +/g, ' ').trim()
  else if (rota === '/admin/skin') texto = c.remover ? 'tirou uma skin do jogador' : 'deu itens ao jogador'
  else if (chaves.length && rota === '/admin/config') texto = `mudou as configurações (${chaves.join(', ')})`
  const alvo = ID_STEAM.test(String(c.id || c.alvo || '')) ? String(c.id || c.alvo) : ''
  return { tipo: 'admin', quem, alvo, texto, dados: rota === '/admin/zerar-tudo' || rota.includes('pontos') ? { rota, simular: c.simular === true } : { rota, campos: chaves.slice(0, 12) } }
}

// ── Rotas ──
async function adminDados(env, config, cors) {
  const [perfis, usuarios] = await Promise.all([lerPerfis(env), lerUsuarios(env)])
  return json({ perfis, usuarios, config: configDoPainel(config, env), dono: env.DONO || null }, 200, cors)
}

// Moldura/card exclusivo: nem o admin dá para quem não tem o cargo ou o nível de assinatura exigido (dê o cargo/assinatura primeiro)
async function conferirExclusivas(env, config, alvo, mudar, perfis) {
  const comNovos = { ...perfis, [alvo]: { ...perfis[alvo], ...('cargos' in mudar ? { cargos: mudar.cargos } : {}), ...('sub' in mudar ? { sub: mudar.sub } : {}) } }
  const daEquipe = ehAdmin(alvo, env, config)
  for (const exige of [mudar.moldura && config.molduraCargo?.[mudar.moldura], mudar.card && config.cardCargo?.[mudar.card]].filter(Boolean)) {
    const pode = exige === '_dono' ? alvo === env.DONO : exige === '_admin' || daEquipe ? daEquipe : cargosDoJogador(alvo, comNovos, config, precisaDoRanking(config) ? await lerRanking(env) : null).includes(exige)
    if (!pode) throw new ErroPedido('exclusiva', { cargo: exige })
  }
  const precisa = (mudar.moldura && faltaSub(config, 'molduraSub', mudar.moldura, comNovos[alvo], daEquipe)) || (mudar.card && faltaSub(config, 'cardSub', mudar.card, comNovos[alvo], daEquipe))
  if (precisa) throw new ErroPedido('exclusiva-sub', { precisa })
}

// POST /admin/perfil { id, moldura?, time?, xp? (ajuste), bloqueado?, cargos? ([idCargo]), insignias? ([id]), sub? ({ inicio?, meses, expira } ou null), limpar? }
async function adminPerfil(corpo, env, config, cors) {
  if (!ID_STEAM.test(String(corpo.id))) throw new ErroPedido('id')
  const alvo = String(corpo.id)
  if (corpo.limpar) {
    // Limpa moldura, time, XP, cargos e bloqueio; as preferências da pessoa (tema, idioma, desempenho), as insígnias e a assinatura ficam
    const { mapa } = await mudar(env, 'perfis', [alvo], (perfis) => {
      const fica = Object.fromEntries([...PREFERENCIAS, 'insignias', 'sub'].filter((k) => perfis[alvo]?.[k] !== undefined).map((k) => [k, perfis[alvo][k]]))
      if (Object.keys(fica).length) perfis[alvo] = fica
      else delete perfis[alvo]
    })
    await avisarPerfil(env, alvo, mapa[alvo])
    return json({ ok: true, perfis: await lerPerfis(env) }, 200, cors)
  }
  const mudarCampos = validarPerfil(corpo)
  const perfis = await lerPerfis(env)
  const antes = perfis[alvo] || {}
  if ('xp' in corpo) {
    const xp = Math.round(Number(corpo.xp) || 0)
    if (Math.abs(xp) > XP_LIMITE) throw new ErroPedido('xp')
    mudarCampos.xp = xp
  }
  if ('bloqueado' in corpo) mudarCampos.bloqueado = corpo.bloqueado === true
  if ('moldura' in mudarCampos) mudarCampos.molduraLivre = mudarCampos.moldura ? true : null // dada pelo admin (fora as exclusivas, aparece sempre)
  if ('cargos' in corpo) {
    const existem = new Set((config.cargos || []).map((c) => c.id))
    const cargos = [...new Set(Array.isArray(corpo.cargos) ? corpo.cargos : [])]
    if (cargos.some((c) => !existem.has(c))) throw new ErroPedido('cargo')
    mudarCampos.cargos = cargos
  }
  // Assinatura Premium: { inicio, meses, expira } ("expira": null = sem data, infinita) ou null para remover
  if ('sub' in corpo) {
    const s = corpo.sub
    if (s === null) mudarCampos.sub = null
    else {
      const meses = Math.round(Number(s?.meses))
      const expira = s?.expira === null ? null : Math.round(Number(s?.expira))
      const inicio = s?.inicio ? Math.round(Number(s.inicio)) : antes.sub?.inicio || Date.now()
      if (!(meses >= 0 && meses <= 1200) || (expira !== null && !(expira > 0 && expira < 4e12)) || !(inicio > 0 && inicio < 4e12)) throw new ErroPedido('sub')
      mudarCampos.sub = { inicio, meses, expira, ...(antes.sub?.pagamentos ? { pagamentos: antes.sub.pagamentos } : {}) } // mantém o resumo dos pagamentos (um estorno tira os meses certos)
    }
  }
  // Insígnias: lista das que o jogador fica tendo; as que ele já tinha mantêm a data em que ganhou
  if ('insignias' in corpo) {
    const lista = [...new Set(Array.isArray(corpo.insignias) ? corpo.insignias : [])]
    if (lista.some((i) => !INSIGNIAS.includes(i) && !ehInsigniaLoja(i) && !insigniaMissao(i))) throw new ErroPedido('insignia')
    const tinha = antes.insignias || {}
    for (const k of Object.keys(tinha)) if (ID_MESTRE.test(k) && !lista.includes(k)) lista.push(k) // "Mestre da [Caixa]" não tem caixinha no painel: o que já ganhou fica
    mudarCampos.insignias = lista.length ? Object.fromEntries(lista.map((i) => [i, Number(tinha[i]) || Date.now()])) : null
  }
  await conferirExclusivas(env, config, alvo, mudarCampos, perfis)
  const gravados = await mudarPerfil(env, alvo, mudarCampos)
  // Tirou um cargo ou a assinatura: a moldura/card exclusivos dele saem do perfil na hora
  const atuais = 'cargos' in mudarCampos || 'sub' in mudarCampos ? await tirarExclusivasSemCargo(env, config) : gravados
  await avisarPerfil(env, alvo, atuais[alvo]) // a pessoa vê a mudança na hora se estiver com o site aberto (insígnia nova: aviso com som)
  return json({ ok: true, perfis: atuais }, 200, cors)
}

// Mapa { id: valor } validado (ids pelo formato, valor pela função); inválido: ErroPedido com o nome do campo
function mapaValido(campo, origem, formato, valor) {
  const mapa = {}
  for (const [id, v] of Object.entries(origem || {})) {
    if (!formato.test(id)) throw new ErroPedido(campo)
    const x = valor(v)
    if (x === undefined) throw new ErroPedido(campo)
    if (x !== null) mapa[id] = x
  }
  return mapa
}
const nivelOk = (n) => {
  const nivel = Math.round(Number(n))
  return nivel >= 1 && nivel <= NIVEL_MAX ? (nivel > 1 ? nivel : null) : undefined // nível 1 = liberada para todos (não precisa guardar)
}

function cargosValidos(lista) {
  if (!Array.isArray(lista) || lista.length > CARGOS_MAX) throw new ErroPedido('cargos')
  const vistos = new Set()
  return lista.map((c) => {
    const nome = String(c?.nome || '').trim()
    const top = Math.round(Number(c?.top) || 0)
    const imagem = c?.imagem ? String(c.imagem) : '' // imagem do selo (arquivo de selos-equipe/); sem imagem, vale o ícone
    if (!ID_CARGO.test(String(c?.id)) || vistos.has(c.id) || !NOME_TIME.test(nome) || nome.length > 24 || !COR.test(String(c?.cor)) || top < 0 || top > 15 || (imagem && !IMAGEM_SELO.test(imagem))) throw new ErroPedido('cargos')
    vistos.add(c.id)
    const acessos = (Array.isArray(c.acessos) ? c.acessos : []).filter((a, i, l) => ABAS_ADMIN.includes(a) && l.indexOf(a) === i)
    // numerar: o automático mostra a posição ("Campeão 1", "Campeão 2"...)
    return { id: c.id, nome, cor: c.cor, icone: ICONES_CARGO.includes(c.icone) ? c.icone : 'coroa', ...(acessos.length ? { acessos } : {}), ...(imagem ? { imagem } : {}), ...(top > 0 ? { top } : {}), ...(top > 0 && c.numerar === true ? { numerar: true } : {}), ...(c.oculto === true ? { oculto: true } : {}), ...(c.pick === true ? { pick: true } : {}) }
  })
}

// POST /admin/config { molduraPorNivel?, nivelMoldura?, molduraSub?, cardSub?, subMeses?, cargos?, molduraCargo?, cardPorNivel?, nivelCard?, cardCargo? }
// Os acessos dos cargos (abas liberadas) só o dono muda
async function adminConfig(corpo, env, quem, cors) {
  const novo = await mudarDoc(
    env,
    'config',
    (config) => {
      const novo = { ...config }
      if (Array.isArray(corpo.cargos) && quem.id !== env.DONO) {
        const antes = new Map((config.cargos || []).map((x) => [x.id, JSON.stringify([...(x.acessos || [])].sort())]))
        if (corpo.cargos.some((x) => (antes.get(x.id) ?? '[]') !== JSON.stringify([...(x.acessos || [])].sort()))) throw new ErroPermissao('dono')
      }
      if ('molduraPorNivel' in corpo) novo.molduraPorNivel = corpo.molduraPorNivel === true
      if ('cardPorNivel' in corpo) novo.cardPorNivel = corpo.cardPorNivel === true
      if ('nivelMoldura' in corpo) novo.nivelMoldura = mapaValido('nivelMoldura', corpo.nivelMoldura, ID_MOLDURA, nivelOk)
      if ('nivelCard' in corpo) novo.nivelCard = mapaValido('nivelCard', corpo.nivelCard, CARD_ID, nivelOk)
      // Moldura / card só para assinantes: { id: nível mínimo da assinatura } (subscriber = qualquer assinante)
      if ('molduraSub' in corpo) novo.molduraSub = mapaValido('molduraSub', corpo.molduraSub, ID_MOLDURA, (n) => (SUB_IDS.includes(n) ? n : undefined))
      if ('cardSub' in corpo) novo.cardSub = mapaValido('cardSub', corpo.cardSub, CARD_ID, (n) => (SUB_IDS.includes(n) ? n : undefined))
      // Meses de assinatura de cada nível do emblema Premium: inteiros de 1 a 600, sempre crescentes (Gold < Platinum < ... < Legend)
      if ('subMeses' in corpo) {
        const valores = NIVEIS_SUB.map((id) => Math.round(Number(corpo.subMeses?.[id])))
        if (valores.some((v, i) => !(v >= 1 && v <= 600) || (i > 0 && v <= valores[i - 1]))) throw new ErroPedido('subMeses')
        novo.subMeses = Object.fromEntries(NIVEIS_SUB.map((id, i) => [id, valores[i]]))
      }
      if ('cargos' in corpo) novo.cargos = cargosValidos(corpo.cargos)
      // Moldura/card exclusivo só de cargo que existe (cargo apagado libera as molduras e os cards dele)
      const existem = new Set([...(novo.cargos || []).map((c) => c.id), '_dono', '_admin'])
      const doCargo = (c) => (c && existem.has(c) ? c : null)
      if ('molduraCargo' in corpo || 'cargos' in corpo) novo.molduraCargo = mapaValido('molduraCargo', 'molduraCargo' in corpo ? corpo.molduraCargo : novo.molduraCargo, ID_MOLDURA, doCargo)
      if ('cardCargo' in corpo || 'cargos' in corpo) novo.cardCargo = mapaValido('cardCargo', 'cardCargo' in corpo ? corpo.cardCargo : novo.cardCargo, CARD_ID, doCargo)
      return novo
    },
    {},
  )
  if (['cargos', 'molduraCargo', 'cardCargo', 'molduraSub', 'cardSub', 'subMeses'].some((k) => k in corpo)) await tirarExclusivasSemCargo(env, novo)
  return json({ ok: true, config: configDoPainel(novo, env) }, 200, cors)
}

// POST /admin/selos { dono?: { nome, cor, icone, imagem, mostrar, pick }, admin?: {..., acessos} }  (só o DONO)
async function adminSelos(corpo, env, cors) {
  const novo = await mudarDoc(
    env,
    'config',
    (config) => {
      const selos = selosDe(config)
      for (const qual of ['dono', 'admin']) {
        if (!(qual in corpo)) continue
        const s = corpo[qual] || {}
        const nome = String(s.nome || '').trim()
        const imagem = s.imagem ?? selos[qual].imagem ?? 'verified.png'
        if (!NOME_TIME.test(nome) || nome.length > 24 || !COR.test(String(s.cor)) || !ICONES_CARGO.includes(s.icone) || !IMAGEM_SELO.test(String(imagem))) throw new ErroPedido('selos')
        selos[qual] = { nome, cor: s.cor, icone: s.icone, imagem, mostrar: s.mostrar !== false, pick: s.pick === true, ...(qual === 'admin' && selos.admin.acessos ? { acessos: selos.admin.acessos } : {}) }
        if (qual === 'admin' && Array.isArray(s.acessos)) selos.admin.acessos = s.acessos.filter((a, i, l) => ABAS_ADMIN.includes(a) && l.indexOf(a) === i)
      }
      return { ...config, selos }
    },
    {},
  )
  return json({ ok: true, config: configDoPainel(novo, env) }, 200, cors)
}

// POST /admin/admins { id, admin: bool }. Quem deixa de ser admin volta para o ranking ("Ocultar do ranking" é só da equipe)
async function adminAdmins(corpo, env, cors) {
  if (!ID_STEAM.test(String(corpo.id))) throw new ErroPedido('id')
  const novo = await mudarDoc(
    env,
    'config',
    (config) => {
      const admins = new Set(config.admins || [])
      if (corpo.admin === true) admins.add(corpo.id)
      else admins.delete(corpo.id)
      return { ...config, admins: [...admins] }
    },
    {},
  )
  if (corpo.admin !== true && corpo.id !== env.DONO) await mudarPerfil(env, corpo.id, { ocultoRanking: null })
  return json({ ok: true, config: configDoPainel(novo, env) }, 200, cors)
}

// Conta de um jogador (só o dono): apagar a senha de segurança (ele cria outra) ou trocar o apelido (ofensivo, golpe)
async function adminConta(rota, corpo, env, cors) {
  if (!ID_STEAM.test(String(corpo.id || ''))) throw new ErroPedido('id')
  if (rota === '/admin/senha-reset') return json(await chamarContas(env, { acao: 'reset-senha', steam: corpo.id }), 200, cors)
  const r = await chamarContas(env, { acao: 'nick', steam: corpo.id, nick: corpo.nick, premium: true, admin: true })
  await aplicarApelido(env, corpo.id, r.nick)
  return json(r, 200, cors)
}

// Zerar tudo (só o dono): src/zerar.js. Corpo { confirmar: 'ZERAR TUDO', simular?: true }
async function adminZerar(corpo, env, quem, cors) {
  if (corpo.confirmar !== 'ZERAR TUDO') throw new ErroPedido('confirmar')
  const r = await zerarTudo(env, corpo.simular === true)
  if (corpo.simular !== true) await registrar(env, { tipo: 'admin', quem: quem.id, texto: 'ZEROU TUDO (NP, insígnias, inventários, mercado e trocas de todos)' })
  return json(r, 200, cors)
}

// Rota -> { metodos, precisa: aba | 'dono' | 'aba-do-corpo', atender }. "c" = { req, env, quem, config, cors, rota, url, corpo }
const ROTAS_ADMIN = {
  '/admin/missoes': {metodos:['GET','POST'],precisa:'usuarios',atender:async c=>json(c.req.method==='POST'?await salvarConfigMissoes(c.env,c.corpo):await lerPainelMissoes(c.env),200,c.cors)},
  '/admin/dados': { metodos: ['GET'], precisa: null, atender: (c) => adminDados(c.env, c.config, c.cors) },
  // editar assinatura pede a aba de assinaturas; o resto do perfil, a de usuários
  '/admin/perfil': { metodos: ['POST'], precisa: (corpo) => ('sub' in corpo ? 'assinaturas' : 'usuarios'), atender: (c) => adminPerfil(c.corpo, c.env, c.config, c.cors) },
  // cada campo da configuração pede a aba dele
  '/admin/config': {
    metodos: ['POST'],
    precisa: (corpo) => {
      const porAba = { molduraPorNivel: 'molduras', nivelMoldura: 'molduras', molduraCargo: 'molduras', molduraSub: 'molduras', cardPorNivel: 'cards', nivelCard: 'cards', cardCargo: 'cards', cardSub: 'cards', cargos: 'cargos', subMeses: 'assinaturas' }
      return [...new Set(Object.keys(corpo).map((k) => porAba[k] || 'admins'))]
    },
    atender: (c) => adminConfig(c.corpo, c.env, c.quem, c.cors),
  },
  '/admin/selos': { metodos: ['POST'], precisa: 'dono', atender: (c) => adminSelos(c.corpo, c.env, c.cors) },
  '/admin/admins': { metodos: ['POST'], precisa: 'admins', atender: (c) => adminAdmins(c.corpo, c.env, c.cors) },
  '/admin/senha-reset': { metodos: ['POST'], precisa: 'dono', atender: (c) => adminConta(c.rota, c.corpo, c.env, c.cors) },
  '/admin/nick': { metodos: ['POST'], precisa: 'dono', atender: (c) => adminConta(c.rota, c.corpo, c.env, c.cors) },
  '/admin/zerar-tudo': { metodos: ['POST'], precisa: 'dono', atender: (c) => adminZerar(c.corpo, c.env, c.quem, c.cors) },
  '/admin/logs': { metodos: ['GET'], precisa: 'logs', atender: (c) => rotaAdminLogs(c.url, c.env, c.cors) },
  '/admin/assinatura-planos': { metodos: ['GET', 'POST'], precisa: 'assinaturas', atender: (c) => rotaAdminPlanosSub(c.req, c.env, c.cors) },
  '/admin/pagamento-config': { metodos: ['GET', 'POST'], precisa: 'pontos', atender: (c) => rotaAdminPagamento(c.req, c.env, c.cors) },
  '/admin/skin': { metodos: ['POST'], precisa: 'skins', atender: (c) => rotaAdminSkin(c.req, c.env, c.cors, avisarSkin) },
  '/admin/skins': { metodos: ['GET'], precisa: 'skins', atender: (c) => rotaAdminSkins(c.url, c.env, c.cors) },
  '/admin/caixas': { metodos: ['POST'], precisa: 'caixas', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
  '/admin/caixas-lista': { metodos: ['POST'], precisa: 'caixas', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
  '/admin/loja-config': { metodos: ['POST'], precisa: 'caixas', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
  '/admin/loja-pontos': { metodos: ['POST'], precisa: 'pontos', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
  '/admin/loja-bonus-caixa': { metodos: ['POST'], precisa: 'pontos', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
  '/admin/loja-bonus': { metodos: ['GET', 'POST'], precisa: 'pontos', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
  '/admin/loja-saldo': { metodos: ['GET'], precisa: 'pontos', atender: (c) => rotaAdminLoja(c.req, c.env, c.rota, c.cors) },
}

// Rotas que leem o corpo elas mesmas (repassam o pedido): o corpo é lido de uma cópia para conferir a permissão e escrever o log
const LEEM_O_CORPO = new Set(['/admin/assinatura-planos', '/admin/pagamento-config', '/admin/skin', '/admin/caixas', '/admin/caixas-lista', '/admin/loja-config', '/admin/loja-pontos', '/admin/loja-bonus-caixa', '/admin/loja-bonus'])

export async function rotaAdmin(req, env, quem, config, cors, rota, url) {
  const abas = await abasDe(quem.id, env, config)
  if (!abas.length) throw new ErroPermissao('admin')
  // Painel do servidor de CS2: só o dono (derruba jogadores e roda comando de console na VPS)
  const doServidor = rota.startsWith('/admin/servidor/')
  const def = doServidor ? { metodos: ['GET', 'POST'], precisa: 'dono', atender: (c) => rotaAdminServidorCs2(c.req, c.env, c.rota, c.url, c.cors) } : ROTAS_ADMIN[rota]
  if (!def || !def.metodos.includes(req.method)) throw new ErroNaoEncontrado('rota')
  const corpo = req.method === 'POST' ? await lerCorpo(LEEM_O_CORPO.has(rota) || doServidor ? req.clone() : req) : {}
  const precisa = typeof def.precisa === 'function' ? def.precisa(corpo) : def.precisa
  if (precisa === 'dono' ? quem.id !== env.DONO : precisa && ![precisa].flat().every((a) => abas.includes(a))) throw new ErroPermissao(precisa === 'dono' ? 'dono' : 'aba')
  const resposta = await def.atender({ req, env, quem, config, cors, rota, url, corpo })
  if (req.method === 'POST' && resposta.ok) await registrar(env, descreverAcao(rota, quem.id, corpo))
  return resposta
}

