/*
 * Worker do neuraproject.com.br (Cloudflare): login pela Steam e tudo que o site estático (GitHub Pages) não faz sozinho.
 * Este arquivo só encaminha: cada rota vive no módulo dela. Erro tipado (erros.js) vira { erro } com o status da classe; qualquer outra
 * exceção é bug: 500 "falhou", log no console e uma linha "erro" no registro do painel.
 *
 * Públicas:      /login /retorno (auth.js) · /perfis /nicks /config /jogador /avatares /premier (publico.js) · /status/cs2 · /partidas/*
 *                /skins/publico /skins/inventario · /equipes/publico /equipes/imagem · /loja/caixas /loja/drops /loja/perfil
 * Serviço:       /servidor/* (plugin do CS2, SERVIDOR_TOKEN) · /pagamentos/webhook (Asaas) · /manutencao/zerar-tudo (ZERAR_TOKEN)
 * Com login:     /eu /perfil /conta/* (rotas-conta.js) · /amigos /lobby /chat /presenca · /skins/* · /loja/* · /notificacoes · /trocas/* · /mercado/*
 *                /equipes/* · /pagamentos/* · /usuarios/buscar · /admin/* (admin.js, cada rota com a aba que exige)
 *
 * Dados: objeto Dados (perfis, usuarios, docs: dados.js), um objeto por jogador (Loja: saldo, inventário, notificações), objetos globais
 * (Presenca, Trocas, Mercado, Registro, Equipes, Contas). O KV MOLDURAS guarda só as páginas de partida recentes e os formatos antigos.
 *
 * Variáveis (wrangler.toml / painel da Cloudflare):
 *   SITE               endereço do site (padrão https://neuraproject.com.br)
 *   DONO               SteamID64 do dono: sempre admin e o único que muda a lista de admins
 *   SERVIDOR_CONECTAR  ip:porta do servidor de CS2; aparece no botão Entrar na partida
 *   ORIGENS_EXTRAS     outros endereços que podem usar o login, separados por vírgula (ex.: http://localhost:5173 no `npm run dev`)
 * Segredos (npx wrangler secret put <NOME>):
 *   SEGREDO            texto aleatório longo que assina os tokens (obrigatório)
 *   SERVIDOR_TOKEN     senha que o plugin do servidor de CS2 usa em /servidor/*
 *   SERVIDOR_SENHA     senha do servidor de CS2 (opcional): só os 10 jogadores da partida a recebem
 *   STEAM_API_KEY      chave da Web API da Steam (opcional; sem ela o token vai sem nome/avatar)
 *   ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, CS2_AGENTE_URL, CS2_AGENTE_TOKEN, ZERAR_TOKEN (ver pagamentos.js, servidor-cs2.js, zerar.js)
 */
import { rotaAdmin } from './admin.js'
import { hallPublico, rotaHall } from './hall.js'
import { rotaDadosConta, rotaPerfilPublico, exigirVisibilidade, filtrarConquistasPublicas } from './conta-dados.js'
import { rotaAmigos, rotaChat, rotaDm, rotaLobby, rotaPresenca, rotaServidor } from './amigos.js'
import { conferirToken, exigirLogin, login, origensPermitidas, retorno } from './auth.js'
import { ErroApi, ErroLogin, ErroNaoEncontrado, ErroPedido, ErroPermissao, ErroServico } from './erros.js'
import { rotaEquipes, rotaImagemEquipe, rotaListaPublicaEquipes } from './equipes.js'
import { exigirToken, json, lerCorpo, respostaDeErro } from './http.js'
import { rotaDrops, rotaMercado } from './mercado.js'
import { limparInventariosCaixasAntigas, rotaLoja, rotaLojaPerfil, rotaLojaPublica } from './loja.js'
import { rotaNotificacoes } from './notificacoes.js'
import { semDerrubar } from './objetos.js'
import { rotaPagamentos, rotaWebhookAsaas } from './pagamentos.js'
import { rotaPartidaServidor, rotaPartidasPublico } from './partidas-novas.js'
import { darInsigniaTop3, lerConfig, tirarExclusivasSemCargo } from './perfis.js'
import { atualizarPremier, rotaAvatares, rotaBuscarUsuarios, rotaConfig, rotaJogador, rotaNicks, rotaPerfis, rotaPremier } from './publico.js'
import { registrar } from './registro.js'
import { rotaConta, rotaEu, salvarPerfil } from './rotas-conta.js'
import { rotaServidorSkins, rotaSkins, rotaSkinsExcluir, rotaSkinsInventarioPublico, rotaSkinsPresentes, rotaSkinsPublico } from './skins.js'
import { statusCs2 } from './status-cs2.js'
import { rotaTrocas } from './trocas.js'
import { zerarTudo } from './zerar.js'

export { Presenca } from './amigos.js'
export { Contas } from './contas.js'
export { Dados } from './dados.js'
export { Equipes } from './equipes.js'
export { Loja } from './loja.js'
export { Mercado } from './mercado.js'
export { Registro } from './registro.js'
export { Trocas } from './trocas.js'

const qualquerOrigem = { 'Access-Control-Allow-Origin': '*' }
const enderecoDoSite = (env) => (env.SITE || 'https://neuraproject.com.br').replace(/\/$/, '')

function corsDe(req, env) {
  const origem = req.headers.get('Origin') || ''
  return origensPermitidas(env, enderecoDoSite(env)).includes(origem) ? { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' } : {}
}

// Rotas sem login: "MÉTODO /caminho" -> atender(c), c = { req, env, ctx, url, site }
const PUBLICAS = {
  'GET /hall/publico': async (c) => { await exigirVisibilidade(c.req,c.env,c.url.searchParams.get('id'),'perfil'); return hallPublico(c.env,c.url.searchParams.get('id'),{'Access-Control-Allow-Origin':'*'}) },
  'GET /login': (c) => login(c.url, c.env, c.site),
  'GET /retorno': (c) => retorno(c.url, c.env, c.site),
  'GET /perfis': async (c) => filtrarConquistasPublicas(await rotaPerfis(c.env),c.req,c.env),
  'GET /nicks': (c) => rotaNicks(c.url, c.env),
  'GET /config': (c) => rotaConfig(c.env),
  'GET /jogador': (c) => rotaJogador(c.url, c.env),
  'GET /avatares': (c) => rotaAvatares(c.url, c.env),
  'GET /premier': (c) => rotaPremier(c.env, c.ctx),
  // aviso do lobby: saiu atualização do CS2? o nosso servidor está no ar?
  'GET /status/cs2': async (c) => json(await statusCs2(c.env, c.ctx), 200, { ...qualquerOrigem, 'Cache-Control': 'no-store' }),
  // partidas recém-jogadas (o plugin manda assim que o mapa termina; o site lê sem esperar o deploy)
  'POST /servidor/partida': (c) => rotaPartidaServidor(c.req, c.env),
  'GET /partidas/recentes': (c) => rotaPartidasPublico(c.url, c.env),
  'GET /partidas/dados': (c) => rotaPartidasPublico(c.url, c.env),
  // plugin do servidor de CS2 (BaseComp): próxima partida pronta, fase dela, elenco e skins de quem está no servidor
  'POST /servidor/proxima': (c) => rotaServidor(c.req, c.env, '/servidor/proxima'),
  'POST /servidor/estado': (c) => rotaServidor(c.req, c.env, '/servidor/estado'),
  'POST /servidor/elenco': (c) => rotaServidor(c.req, c.env, '/servidor/elenco'),
  'POST /servidor/skins': (c) => rotaServidorSkins(c.req, c.env),
  // só o ambiente de teste local (MODO_TESTE=1): apaga partidas/lobbies
  'POST /teste/limpar': (c) => {
    if (c.env.MODO_TESTE !== '1') throw new ErroNaoEncontrado('rota')
    return rotaServidor(c.req, c.env, '/teste/limpar')
  },
  'GET /skins/publico': async (c) => { await exigirVisibilidade(c.req,c.env,c.url.searchParams.get('id'),'inventario'); const r=await rotaSkinsPublico(c.url,c.env,qualquerOrigem);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization, Origin');return r },
  'GET /skins/inventario': async (c) => { await exigirVisibilidade(c.req,c.env,c.url.searchParams.get('id'),'inventario'); const r=await rotaSkinsInventarioPublico(c.url,c.env,qualquerOrigem);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization, Origin');return r },
  'GET /equipes/publico': (c) => rotaListaPublicaEquipes(c.url, c.env),
  'GET /equipes/imagem': (c) => rotaImagemEquipe(c.req, c.url, c.env, c.ctx),
  'POST /pagamentos/webhook': (c) => rotaWebhookAsaas(c.req, c.env),
  'GET /loja/drops': (c) => rotaDrops(c.req, c.env, qualquerOrigem, c.ctx),
  'GET /loja/perfil': (c) => rotaLojaPerfil(c.url, c.env, { ...qualquerOrigem, 'Cache-Control': 'public, max-age=5' }),
  'GET /loja/caixas': (c) => rotaLojaPublica(c.env, qualquerOrigem, c.ctx),
  // Zerar tudo pela manutenção (sem login Steam): só existe enquanto o segredo ZERAR_TOKEN estiver configurado
  'POST /manutencao/zerar-tudo': async (c) => {
    if (!c.env.ZERAR_TOKEN) throw new ErroNaoEncontrado('rota')
    exigirToken(c.req.headers.get('X-Zerar'), c.env.ZERAR_TOKEN)
    const { confirmar, simular } = await lerCorpo(c.req)
    if (confirmar !== 'ZERAR TUDO') throw new ErroPedido('confirmar')
    return json(await zerarTudo(c.env, simular === true))
  },
}

// Rotas com login: caminho exato ("/loja") ou prefixo ("/loja/" = tudo que vem depois) -> atender(c),
// c = { req, env, ctx, url, rota, site, cors, quem, config }. A rota devolve a resposta; método que ela não atende: ErroNaoEncontrado
const naoAtende = () => {
  throw new ErroNaoEncontrado('rota')
}
const so = (metodo, atender) => (c) => (c.req.method === metodo ? atender(c) : naoAtende())
const COM_LOGIN = [
  ['/conta/dados', (c) => rotaDadosConta(c.req,c.env,c.quem,c.cors)],
  ['/perfil/publico', (c) => rotaPerfilPublico(c.req,c.env,c.quem,c.cors,c.url)],
  ['/hall', (c) => rotaHall(c.req,c.env,c.quem,c.config,c.cors,c.url)],
  ['/hall/revisao', (c) => rotaHall(c.req,c.env,c.quem,c.config,c.cors,c.url)],
  ['/eu', so('GET', (c) => rotaEu(c.env, c.quem, c.config, c.cors))],
  ['/perfil', so('POST', (c) => salvarPerfil(c.req, c.env, c.quem, c.config, c.cors))],
  ['/conta/', (c) => rotaConta(c.req, c.env, c.quem, c.config, c.cors, c.rota, c.url)],
  ['/amigos', (c) => rotaAmigos(c.req, c.env, c.quem, c.cors)],
  ['/usuarios/buscar', so('GET', (c) => rotaBuscarUsuarios(c.url, c.env, c.quem, c.cors))],
  ['/lobby', async (c) => { if(c.req.method==='POST'){const p=await lerCorpo(c.req.clone());if(p.acao==='convidar')await exigirVisibilidade(c.req,c.env,p.id,'convites',c.quem.id)}return rotaLobby(c.req,c.env,c.quem,c.cors) }],
  ['/chat', (c) => rotaChat(c.req, c.env, c.quem, c.cors)],
  ['/dm', (c) => rotaDm(c.req, c.env, c.quem, c.cors, c.url)],
  ['/skins', (c) => rotaSkins(c.req, c.env, c.quem, c.cors)],
  ['/skins/presentes', so('POST', (c) => rotaSkinsPresentes(c.req, c.env, c.quem, c.cors))],
  ['/skins/excluir', so('POST', (c) => rotaSkinsExcluir(c.req, c.env, c.quem, c.cors))],
  ['/loja', (c) => rotaLoja(c.req, c.env, c.quem, c.cors, c.rota)],
  ['/loja/', (c) => rotaLoja(c.req, c.env, c.quem, c.cors, c.rota)],
  ['/notificacoes', (c) => rotaNotificacoes(c.req, c.env, c.quem, c.cors)],
  ['/trocas', (c) => rotaTrocas(c.req, c.env, c.quem, c.cors, c.rota)],
  ['/trocas/', (c) => rotaTrocas(c.req, c.env, c.quem, c.cors, c.rota)],
  ['/pagamentos/', (c) => rotaPagamentos(c.req, c.env, c.quem, c.cors, c.rota, c.url)],
  ['/equipes', (c) => rotaEquipes(c.req, c.env, c.quem, c.cors, c.rota, c.url)],
  ['/equipes/', (c) => rotaEquipes(c.req, c.env, c.quem, c.cors, c.rota, c.url)],
  ['/mercado', (c) => rotaMercado(c.req, c.env, c.quem, c.cors, c.rota)],
  ['/mercado/', (c) => rotaMercado(c.req, c.env, c.quem, c.cors, c.rota)],
  ['/admin/', (c) => rotaAdmin(c.req, c.env, c.quem, c.config, c.cors, c.rota, c.url)],
]
const casa = (rota, caminho) => (caminho.endsWith('/') ? rota.startsWith(caminho) : rota === caminho)

async function atender(req, env, ctx) {
  const url = new URL(req.url)
  const rota = url.pathname
  const site = enderecoDoSite(env)
  const publica = PUBLICAS[`${req.method} ${rota}`]
  if (publica) return publica({ req, env, ctx, url, site })

  // Presença em tempo real (WebSocket): o navegador não manda cabeçalho de login, então o token vem no endereço
  if (rota === '/presenca') {
    if (!origensPermitidas(env, site).includes(req.headers.get('Origin') || '')) throw new ErroPermissao('origem')
    const quem = await conferirToken(url.searchParams.get('t') || '', env.SEGREDO)
    if (!quem) throw new ErroLogin('login')
    return rotaPresenca(req, env, quem.id)
  }

  // Daqui para baixo: só o próprio site, com login
  const cors = corsDe(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (!cors['Access-Control-Allow-Origin']) throw new ErroPermissao('origem')
  const atenderRota = COM_LOGIN.find(([prefixo]) => casa(rota, prefixo))?.[1]
  if (!atenderRota) throw new ErroNaoEncontrado('rota')
  const [quem, config] = await Promise.all([exigirLogin(req, env), lerConfig(env)])
  return atenderRota({ req, env, ctx, url, rota, site, cors, quem, config })
}

export default {
  // Cron (wrangler.toml, a cada 10 min): quem saiu do top N perde o cargo automático (e a moldura exclusiva dele), o top 3 ganha a insígnia
  // e, na primeira rodada de cada hora, o Premier (Leetify) é atualizado
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(semDerrubar(limparInventariosCaixasAntigas(env), 'cron: remover caixas antigas sem reembolso'))
    ctx.waitUntil(semDerrubar(lerConfig(env).then((config) => tirarExclusivasSemCargo(env, config)).then(() => darInsigniaTop3(env)), 'cron: cargos e insígnia top 3'))
    if (new Date(evento.scheduledTime).getUTCMinutes() < 10) ctx.waitUntil(semDerrubar(atualizarPremier(env), 'cron: Premier'))
  },

  async fetch(req, env, ctx) {
    try {
      return await atender(req, env, ctx)
    } catch (e) {
      // bug ou serviço fora: linha "erro" no registro do painel (erro esperado do jogador, como saldo ou senha errada, não)
      if (!(e instanceof ErroApi) || e instanceof ErroServico) ctx.waitUntil(registrar(env, { tipo: 'erro', texto: `${e instanceof ErroServico ? `serviço fora (${e.codigo})` : 'erro no servidor'} em ${new URL(req.url).pathname}: ${String(e?.cause?.message || e?.message || e).slice(0, 160)}` }))
      // sempre com CORS: senão o navegador só mostra "bloqueado por CORS" no lugar do código do erro
      return respostaDeErro(e, corsDe(req, env))
    }
  },
}
