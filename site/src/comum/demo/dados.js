// Dados e respostas do modo demo, por cima da prévia local (comum/previewLocal.js). Tudo em memória do navegador
// (sessionStorage da aba): nada sai daqui para o worker, a Steam, o servidor CS2 ou qualquer API. Os jogadores e partidas vêm das mesmas
// fixtures do servidor de desenvolvimento (site/demo/fixtures.mjs), então ranking, histórico e perfis batem entre si.
import { CARDS } from '../cardsPerfil.js'
import { INSIGNIAS } from '../insignias.js'
import { criarSimuladorLobby } from './lobby.js'

const MIN = 60000, HORA = 3600000, DIA = 86400000
const FUSO = 3 * HORA
const COR = { A: '#3478f6', B: '#8a5cf6', C: '#1fbf87' }
const SEED = [
  ['76561198000000012', 'Luna', 'A', 'online'], ['76561198000000013', 'Rafa', 'A', 'jogando'], ['76561198000000014', 'Nico', 'A', 'ausente'], ['76561198000000015', 'Vini', 'A', 'online'],
]
const OUTROS = [
  ['76561198000000021', 'Duda', 'B'], ['76561198000000022', 'Theo', 'B'], ['76561198000000023', 'Maya', 'B'], ['76561198000000024', 'Caio', 'B'], ['76561198000000025', 'Bia', 'B'],
  ['76561198000000031', 'Ravi', 'C'], ['76561198000000032', 'Lara', 'C'], ['76561198000000033', 'Otto', 'C'], ['76561198000000034', 'Yuri', 'C'], ['76561198000000035', 'Zeca', 'C'],
]
const NOME_TIME = { A: 'Aurora', B: 'Vortex', C: 'Nimbus' }

// Avatar sem URL externa (iniciais sobre um degradê), igual ao das fixtures do servidor
export const avatarDemo = (nome, cor = '#3478f6') => {
  const ini = (String(nome).match(/[\p{L}\p{N}]/gu) || []).slice(0, 2).join('').toUpperCase() || '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#06101a"/></linearGradient></defs><rect width="128" height="128" rx="0" fill="url(#g)"/><text x="64" y="82" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-weight="700" font-size="52" fill="#f4f7fc">${ini}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const respostaJson = (corpo, status = 200) => Response.json(corpo, { status })
const INV_VAZIO = { v: 2, itens: {}, equip: { ct: {}, tr: {} }, criado: {} }

// Inventário variado: itens de várias caixas, das 6 raridades (0 a 5), com desgastes diferentes, alguns StatTrak e caixas fechadas
function montarInventario(caixas, agora) {
  const itens = {}, criado = {}
  let n = 0
  const add = (it, extra = {}) => {
    const k = 'demo' + (n++).toString(36) + 'i'
    // as primeiras armas vêm com adesivos e chaveiro (para ver o card com enfeites na prévia)
    const enfeitada = (it.t || 'arma') === 'arma' && n < 3
    itens[k] = { t: it.t || 'arma', d: it.d, p: it.p, f: extra.f ?? 0.03 + ((n * 37) % 90) / 100, s: (n * 131) % 1000, st: extra.st ?? (n % 5 === 0 ? 1 : 0), a: enfeitada ? [{ i: 6026 }, { i: 6028 }, n ? null : { i: 6026 }, null, null] : [null, null, null, null, null], ...(extra.k ? { k: extra.k } : enfeitada ? { k: { i: 78, s: 0 } } : {}) }
    criado[k] = agora - n * 2 * HORA
    return k
  }
  const alvo = caixas.filter((c) => !c.arquivada).slice(0, 14)
  for (const r of [0, 1, 2, 3, 4]) {
    let cota = r < 2 ? 3 : 4
    for (const c of alvo) {
      const pool = c.itens.filter((x) => x.r === r)
      if (!pool.length) continue
      const it = pool[n % pool.length]
      add(it)
      if (--cota <= 0) break
    }
  }
  for (const c of alvo.slice(0, 3)) {
    const faca = c.facas[0]
    if (faca) add(faca, { f: 0.02 + n / 200, st: n % 2 })
  }
  const diaria = caixas.find((c) => c.slug === 'caixa-diaria')
  const fechadas = [...alvo.slice(0, 3), ...(diaria ? [diaria] : [])]
  for (const c of fechadas) {
    const k = 'demo' + (n++).toString(36) + 'c'
    itens[k] = { t: 'caixa', d: c.id, p: 0 }
    criado[k] = agora - n * HORA
  }
  // C4: item fixo, sempre equipada no TR (igual ao worker: id 'c4', defIndex 49)
  // itens de perfil (um de cada tipo equipado nos dois times)
  for (const [k, t, d, p] of [['pin1', 'emblema', 6130, 0], ['pin2', 'emblema', 6134, 0], ['kit1', 'trilha', 62, 0], ['kit2', 'trilha', 5, 0], ['spr1', 'grafite', 1653, 0]]) {
    itens[k] = { t, d, p }
    criado[k] = agora - 3 * HORA
  }
  itens.c4 = { t: 'arma', d: 49, p: 0, f: 0.0001, s: 0, st: 0, a: [null, null, null, null, null], k: null, cadeado: true }
  criado.c4 = 1
  const arma = Object.keys(itens).filter((k) => k !== 'c4' && itens[k].t === 'arma')
  const equip = { ct: Object.fromEntries(arma.slice(0, 2).map((k) => [String(itens[k].d), k])), tr: { ...Object.fromEntries(arma.slice(2, 4).map((k) => [String(itens[k].d), k])), 49: 'c4' } }
  for (const lado of ['ct', 'tr']) Object.assign(equip[lado], { emblema: 'pin1', trilha: 'kit1', grafite: 'spr1' })
  return { v: 2, itens, equip, criado }
}

// Estado inicial do demo (mensagens, notificações, saldo, caixa diária, inventário...). Roda uma vez por aba e cenário.
function estadoInicial(ctx) {
  const { pessoas, caixas } = ctx
  const agora = Date.now()
  const dia = Math.floor((agora - FUSO) / DIA)
  const amigas = pessoas.slice(1)
  const inv = montarInventario(caixas, agora)
  return {
    demo: true,
    saldo: 48250,
    abertas: 61,
    inv,
    amigos: amigas.map((p) => p.id),
    diario: { sequencia: 5, pontosDia: dia }, // Dia 5 já resgatado; a caixa de hoje ainda não
    mensagens: [
      { id: 'dm1', de: amigas[0].id, texto: 'Bora fechar o 5x5 hoje às 21h?', ts: agora - 22 * MIN },
      { id: 'dm2', de: ctx.id, texto: 'Fechado! Vou chamar o Rafa e o Nico.', ts: agora - 18 * MIN },
      { id: 'dm3', de: amigas[0].id, texto: 'Perfeito. Mirage ou Dust II?', ts: agora - 9 * MIN },
    ],
    chat: [
      { id: 'tc1', de: amigas[1].id, nome: amigas[1].nome, texto: 'Treino liberado às 20h, galera.', ts: agora - 55 * MIN },
      { id: 'tc2', de: amigas[2].id, nome: amigas[2].nome, texto: 'Confirmado! Levo as smokes novas.', ts: agora - 40 * MIN },
      { id: 'tc3', de: ctx.id, nome: ctx.nome, texto: 'Bora subir esse ranking 💪', ts: agora - 12 * MIN },
    ],
    notificacoes: {
      lista: [
        { id: 'n1', titulo: 'Você subiu para o 4º lugar do ranking', texto: 'Sua vitória na Dust II rendeu +25 XP.', link: '/ranking/', imagem: ctx.avatar, quando: agora - 8 * MIN, lida: false },
        { id: 'n2', titulo: 'Luna convidou você para o lobby', texto: 'Entre agora e jogue com o time.', link: '/lobby/', imagem: amigas[0].avatar, quando: agora - 25 * MIN, lida: false },
        { id: 'n3', titulo: 'Sua skin foi vendida no mercado', texto: 'Rafa comprou seu item por 450 NP. Os pontos já estão na sua conta.', link: '/loja/?aba=skins', imagem: amigas[1].avatar, raridade: 4, quando: agora - 2 * HORA, lida: false },
        { id: 'n4', titulo: 'Nova insígnia desbloqueada', texto: 'Você conquistou uma insígnia de combate.', link: '/perfil/', imagem: ctx.avatar, quando: agora - 5 * HORA, lida: true },
        { id: 'n5', titulo: 'Login diário resgatado', texto: 'Dia 5 de 7: +80 NP na sua conta.', link: '/', imagem: ctx.avatar, quando: agora - 9 * HORA, lida: true },
      ],
      vistos: [],
      limpoEm: 0,
    },
    consumiveis: { boost: 3, freeze: 2, ativo: null },
  }
}

export function estenderDemo(ctx, cenario) {
  const { id, perfisDemo, config, respostas, pessoas } = ctx
  const semPermissao = cenario === 'sem-permissao'

  // pessoas: o usuário demo e os colegas de time (mesmos ids das fixtures)
  pessoas.splice(0, pessoas.length,
    { id, nome: ctx.nome, avatar: ctx.avatar, st: 'online', dono: true, cargo: 'dono' },
    ...SEED.map(([pid, nome, t, st], i) => ({ id: pid, nome, avatar: avatarDemo(nome, COR[t]), st, cargo: i === 0 ? 'capitao' : 'membro' })))
  const outros = OUTROS.map(([pid, nome, t]) => ({ id: pid, nome, avatar: avatarDemo(nome, COR[t]), time: NOME_TIME[t] }))

  // configuração do site: cargos (um automático pelo top 3 do ranking), selos da equipe e quem é o dono
  config.cargos = [
    { id: 'campeao', nome: 'Campeão', cor: '#6bd4ff', icone: 'trofeu', top: 3, numerar: true },
    { id: 'premium', nome: 'Premium', cor: '#e9b94c', icone: 'diamante' },
    { id: 'vip', nome: 'VIP', cor: '#8a5cf6', icone: 'estrela' },
    { id: 'mod', nome: 'Moderador', cor: '#29d89c', icone: 'escudo', acessos: ['usuarios'] },
  ]
  config.equipe = { dono: semPermissao ? outros[0].id : id, admins: [] }
  config.selos = { dono: { pick: !semPermissao, mostrar: true }, admin: { pick: false, mostrar: true } }
  respostas['/eu'] = semPermissao
    ? { id, admin: false, dono: false, painel: false, abas: [] }
    : { id, admin: true, dono: true, painel: true, abas: ['usuarios', 'molduras', 'cards', 'cargos', 'pontos', 'logs', 'servidor'] }

  // perfis: moldura, cargos, time, card e insígnias do usuário; apelido e time dos demais
  const insignias = perfisDemo[id].insignias
  perfisDemo[id] = {
    ...perfisDemo[id], nick: ctx.nome, moldura: 'times/furia', molduraLivre: true, time: 'Aurora', card: CARDS[0],
    cargos: semPermissao ? ['vip'] : ['premium', 'vip'], insignias: { ...insignias, ...Object.fromEntries(INSIGNIAS.filter((i) => i.categoria === 'combate').slice(4, 8).map((i) => [i.id, Date.now() - 6 * DIA])) },
  }
  // já "viu" o nível (3, o das fixtures) e as insígnias: sem janelas de aviso por cima da primeira tela
  perfisDemo[id].vistos = { ins: Object.keys(perfisDemo[id].insignias), nivel: 3 }
  for (const p of pessoas.slice(1)) perfisDemo[p.id] = { nick: p.nome, time: 'Aurora', cargos: p.cargo === 'capitao' ? ['mod'] : [], insignias: {} }
  for (const o of outros) perfisDemo[o.id] = { nick: o.nome, time: o.time, cargos: [], insignias: {} }

  // time com membros, cargos, convites pendentes
  const time = ctx.time
  Object.assign(time, {
    id: 'equipe-aurora', nome: 'Aurora', tag: 'AUR', descricao: 'Time competitivo da comunidade Neura. Treinos às terças e quintas, mix aos fins de semana.',
    criada: Date.now() - 45 * DIA, minhas: semPermissao ? [] : ['dono', 'editar', 'convidar', 'expulsar', 'moderar'],
    cargos: [
      { id: 'capitao', nome: 'Capitão', cor: '#e9b94c', permissoes: ['convidar', 'expulsar', 'editar'] },
      { id: 'membro', nome: 'Membro', cor: '#a6c5ed', permissoes: [] },
    ],
    membros: pessoas.map((p) => ({ ...p, cargo: p.dono ? undefined : p.cargo })),
    convitesEnviados: [{ id: outros[2].id, nome: outros[2].nome, avatar: outros[2].avatar }, { id: outros[5].id, nome: outros[5].nome, avatar: outros[5].avatar }],
  })
  respostas['/equipes/meu'] = { time, convites: [{ equipe: 'equipe-vortex', nome: 'Vortex', imagem: '', porNome: outros[0].nome }], custo: 1000 }
  respostas['/equipes'] = { equipes: [time] }
  respostas['/equipes/publico'] = {
    times: [
      { ...time, n: pessoas.length, ids: pessoas.map((p) => p.id), aberto: true },
      { id: 'equipe-vortex', nome: 'Vortex', tag: 'VTX', logo: '', n: 5, ids: outros.slice(0, 5).map((o) => o.id), descricao: 'Time ofensivo, foco em ranking.', aberto: false, criada: Date.now() - 80 * DIA },
      { id: 'equipe-nimbus', nome: 'Nimbus', tag: 'NMB', logo: '', n: 5, ids: outros.slice(5).map((o) => o.id), descricao: 'Mix das quartas.', aberto: true, criada: Date.now() - 30 * DIA },
    ],
  }

  // admin: usuários demonstrativos (a lista do painel) e catálogo
  respostas['/admin/dados'] = { usuarios: Object.fromEntries([...pessoas, ...outros].map((p) => [p.id, { nome: p.nome, avatar: p.avatar }])), perfis: perfisDemo, config, dono: config.equipe.dono }
  respostas['/loja/drops'] = { recentes: [], bons: [], top: [], agora: Date.now() }

  // estado em memória (uma vez por aba e cenário)
  const estado = ctx.estado()
  if (!estado.demo) {
    Object.assign(estado, estadoInicial(ctx))
    ctx.guardar()
  }
  // Acrescenta o kit uma vez inclusive nas sessões de demonstração já abertas.
  if (!estado.kitEnfeites && cenario !== 'vazio') {
    for (const [tipo, defs] of [['adesivo', [6026, 6028, 6027, 6025]], ['chaveiro', [78, 21, 30, 17]]]) {
      for (const def of defs) for (let copia = 0; copia < 5; copia++) {
        const chave = `demo-enfeite-${tipo}-${def}-${copia}`
        estado.inv.itens[chave] = { t: tipo, d: def, p: 0 }
        estado.inv.criado[chave] = Date.now()
      }
    }
    estado.kitEnfeites = true
    ctx.guardar()
  }
}

// Respostas do demo que valem antes da prévia local (devolve undefined para a prévia responder). `lobby`: 'cinco' ou 'vagas'.
export function interceptarDemo(cenario, lobby) {
  const simularLobby = criarSimuladorLobby()
  return async (rota, metodo, corpo, url, ctx) => {
    if (cenario === 'carregando') return new Promise(() => {}) // nunca responde: telas de carregamento
    if (cenario === 'erro') return respostaJson({ erro: 'demo-erro' }, 500)
    if (cenario === 'sem-permissao' && rota.startsWith('/admin')) return respostaJson({ erro: 'sem-permissao' }, 403)
    const { id, pessoas, respostas } = ctx
    const agora = Date.now()

    if (cenario === 'vazio') {
      const vazio = {
        '/amigos': { amigos: [], recebidos: [], enviados: [] },
        '/skins': INV_VAZIO, '/skins/inventario': { ...INV_VAZIO, valores: {} },
        '/loja/saldo': { saldo: 0 }, '/loja/valores': { valores: {} },
        '/notificacoes': { doc: { lista: [], vistos: [], limpoEm: 0 } },
        '/equipes/meu': { time: null, convites: [], custo: 1000 }, '/equipes/publico': { times: [] }, '/equipes': { equipes: [] },
        '/dm': { conversas: [] }, '/mercado': { anuncios: [] }, '/loja/drops': { recentes: [], bons: [], top: [], agora },
        '/perfis': { [id]: { nick: ctx.nome } },
        '/chat/global': { mensagens: [], fixado: null },
        '/lobby': { eu: id, lider: id, souLider: true, publico: false, max: 5, membros: [{ id, nome: ctx.nome, avatar: ctx.avatar, st: 'online' }], convites: [], convitesRecebidos: [], abertos: [], emLobby: [], emPartida: [], partida: null },
        '/missoes': undefined,
      }
      if (rota === '/loja' && metodo === 'GET') return respostaJson({ ...respostas['/loja'], saldo: 0, pontos: 0, fechadas: {}, ganhas: {} })
      if (rota === '/loja/diario' && metodo === 'GET') return respostaJson({ dia: 0, sequencia: 1, pontos: 20, pontosResgatados: false, caixaResgatada: false, viraEm: agora + 6 * HORA, agora, recompensas: [20, 30, 40, 60, 80, 100, 200], caixa: ctx.caixas[0], caixasDisponiveis: 0 })
      if (metodo === 'GET' && vazio[rota]) return respostaJson(vazio[rota])
      return undefined
    }

    // preenchido: lobby com cinco jogadores ou com vagas, amigos com lobby aberto, convite recebido
    if (rota === '/lobby' && (metodo === 'GET' || metodo === 'POST')) {
      const membros = pessoas.slice(0, lobby === 'cinco' ? 5 : 2).map((p) => ({ id: p.id, nome: p.nome, avatar: p.avatar, st: p.st === 'ausente' ? 'online' : p.st }))
      const baseLobby = {
        ...respostas['/lobby'], eu: id, lider: id, souLider: true, publico: lobby === 'cinco', max: 5, membros,
        convites: lobby === 'cinco' ? [] : [{ id: pessoas[3].id, nome: pessoas[3].nome, avatar: pessoas[3].avatar }],
        convitesRecebidos: [], abertos: [{ lider: { id: pessoas[2].id, nome: pessoas[2].nome, avatar: pessoas[2].avatar }, membros: [{ id: pessoas[2].id, nome: pessoas[2].nome, avatar: pessoas[2].avatar }] }],
        emLobby: [], emPartida: [], partida: null,
      }
      const adversarios = OUTROS.slice(0, 5).map(([id, nome, tm]) => ({ id, nome, avatar: avatarDemo(nome, COR[tm]), st: 'online' }))
      return respostaJson(simularLobby(baseLobby, metodo, corpo, ctx, adversarios))
    }
    if (rota === '/loja/drops' && metodo === 'GET') {
      const caixa = ctx.caixas[0]
      const item = caixa.itens.find((x) => x.r === 5) || caixa.facas[0] || caixa.itens[0]
      const drops = [
        { id: 'd1', ts: agora - 4 * MIN, r: 5, v: 41500, t: item.t || 'arma', d: item.d, p: item.p, quem: pessoas[1].id, nome: pessoas[1].nome, avatar: pessoas[1].avatar, caixa: caixa.slug },
        { id: 'd2', ts: agora - 18 * MIN, r: 4, v: 14500, t: 'arma', d: caixa.itens[2].d, p: caixa.itens[2].p, quem: pessoas[2].id, nome: pessoas[2].nome, avatar: pessoas[2].avatar, caixa: caixa.slug },
        { id: 'd3', ts: agora - 52 * MIN, r: 4, v: 9800, t: 'arma', d: caixa.itens[3].d, p: caixa.itens[3].p, quem: pessoas[3].id, nome: pessoas[3].nome, avatar: pessoas[3].avatar, caixa: caixa.slug },
      ]
      return respostaJson({ agora, recentes: drops, bons: drops.slice(0, 2), top: drops.slice(0, 1) })
    }
    if (rota === '/mercado' && metodo === 'GET') {
      const anuncios = ctx.caixas.filter((c) => !c.arquivada).slice(0, 8).map((c, i) => {
        const x = c.itens.find((it) => it.r === 2 + (i % 3)) || c.itens[0]
        return { id: 'demoad' + i, vendedor: pessoas[1 + (i % 3)].id, vendedorNome: pessoas[1 + (i % 3)].nome, vendedorAvatar: pessoas[1 + (i % 3)].avatar, item: { t: 'arma', d: x.d, p: x.p, f: 0.04 + i * 0.07, s: i * 77, st: i % 3 === 0 ? 1 : 0, a: [null, null, null, null, null] }, preco: 300 + i * 175, ref: 350 + i * 160, criado: agora - i * 40 * MIN }
      })
      return respostaJson({ anuncios })
    }
    if (rota === '/partidas/recentes' && metodo === 'GET') return respostaJson([])
    return undefined
  }
}

// Dados de partidas/ranking (vêm de arquivos, não do worker) nos cenários sem dados ou com falha
export function respostaDeArquivo(cenario, caminho) {
  if (cenario === 'carregando') return new Promise(() => {})
  if (cenario === 'erro') return respostaJson({ erro: 'demo-erro' }, 500)
  if (cenario === 'vazio') {
    if (caminho === '/ranking/ranking.json') return respostaJson({ atualizado: new Date().toISOString(), partidas: 0, niveis: [], xpRegras: {}, jogadores: [] })
    if (caminho === '/partidas/partidas.json') return respostaJson([])
    if (/^\/perfil\/historico\//.test(caminho)) return respostaJson([])
    if (/^\/partidas\/demo\//.test(caminho)) return respostaJson({ erro: 'sem-partida' }, 404)
  }
  return undefined
}
