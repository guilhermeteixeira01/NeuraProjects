/*
 * Times de jogadores (página "Times" do site). Qualquer jogador cria um time pagando CUSTO_CRIAR NP; quem cria vira o dono. O dono coloca a imagem, deixa o time
 * público (qualquer um entra) ou privado (só entra convidado), convida jogadores, tira membros, cria cargos com permissões e entrega esses cargos. Cada time tem
 * um chat só dele. Um jogador só pode estar em um time.
 *
 * Um Durable Object GLOBAL ("Equipes", SQLite) guarda tudo e roda um pedido de cada vez (dois jogadores nunca entram na última vaga ao mesmo tempo, nem dois times
 * ficam com o mesmo nome). Tudo que muda dispara um aviso ao vivo para os membros (mensagem "equipe" / "equipe-chat" na presença).
 *
 *   GET  /equipes?q=            (login) -> { equipes: [{ id, nome, tag, publico, membros, dono, donoNome, imagem }], meu }
 *   GET  /equipes/meu           (login) -> { time | null, convites: [...] }   (time: dados, membros, cargos, minhas permissões)
 *   GET  /equipes/ver?id=       (login) -> time (visão pública: membros e cargos)
 *   POST /equipes/<acao>        (login) -> criar, editar, imagem, entrar, sair, convidar, convite-cancelar, convite-aceitar, convite-recusar, expulsar,
 *                                           cargo-salvar, cargo-apagar, cargo-dar, transferir, apagar, chat-enviar, chat-apagar
 *   GET  /equipes/chat          (login) -> { mensagens }
 *   GET  /equipes/imagem?id=&v= (público) -> a imagem do time (WebP/PNG/JPEG, guardada no próprio objeto)
 */
import { mandarPara } from './amigos.js'
import { pontosGanhos } from './loja.js'
import { registrar } from './registro.js'

export const CUSTO_CRIAR = 10000 // NP para criar um time
const MAX_MEMBROS = 50
const MAX_CONVITES = 20
const MAX_CARGOS = 12
const MAX_MSG = 500 // mensagens guardadas por time
const PERMISSOES = ['convidar', 'expulsar', 'editar', 'moderar']
const ID_STEAM = /^\d{17}$/
const COR = /^#[0-9a-fA-F]{6}$/
const NOME = /^[\p{L}\p{N} ._\-!]{3,24}$/u
const TAG = /^[\p{L}\p{N}]{2,5}$/u
const IMAGEM_MAX = 90000 // caracteres do data URL (o site reduz para 256x256)

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const lojaDe = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))
const chamarLoja = async (env, id, corpo) => {
  const r = await lojaDe(env, id).fetch('https://loja/', { method: 'POST', body: JSON.stringify({ id, ...corpo }) })
  const d = await r.json().catch(() => ({ erro: 'falhou' }))
  if (!r.ok || d.erro) throw new Error(d.erro || 'falhou')
  return d
}

// nomes e fotos de quem já entrou no site ("usuarios"), com cache curto
let usuariosGuardados = { dados: null, ate: 0 }
async function usuarios(env) {
  if (usuariosGuardados.dados && usuariosGuardados.ate > Date.now()) return usuariosGuardados.dados
  const dados = (await env.MOLDURAS.get('usuarios', 'json').catch(() => null)) || {}
  usuariosGuardados = { dados, ate: Date.now() + 20000 }
  return dados
}

const novoId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export class Equipes {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS equipes (id TEXT PRIMARY KEY, nome TEXT, tag TEXT, descricao TEXT, publico INTEGER, dono TEXT, criada INTEGER, imagem TEXT, img_ver INTEGER)')
    this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS equipes_nome ON equipes (nome COLLATE NOCASE)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS cargos (equipe TEXT, id TEXT, nome TEXT, cor TEXT, permissoes TEXT, padrao INTEGER, PRIMARY KEY (equipe, id))')
    this.sql.exec('CREATE TABLE IF NOT EXISTS membros (steam TEXT PRIMARY KEY, equipe TEXT, cargo TEXT, entrou INTEGER)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS membros_equipe ON membros (equipe)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS convites (equipe TEXT, steam TEXT, por TEXT, ts INTEGER, PRIMARY KEY (equipe, steam))')
    this.sql.exec('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, equipe TEXT, ts INTEGER, de TEXT, texto TEXT)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS chat_equipe ON chat (equipe, id)')
    this.fila = Promise.resolve()
    this.ultimaMsg = new Map()
  }

  exclusivo(fn) {
    const r = this.fila.then(fn)
    this.fila = r.then(() => {}, () => {})
    return r
  }

  async fetch(req) {
    const corpo = await req.json().catch(() => ({}))
    return this.exclusivo(async () => {
      try {
        return json(await this.acao(corpo))
      } catch (e) {
        const m = /^[a-z-]{2,30}$/.test(e?.message || '') ? e.message : 'falhou'
        if (m === 'falhou') console.error('equipes', e)
        return json({ erro: m }, m === 'falhou' ? 500 : 400)
      }
    })
  }

  // ── leitura ──
  linha(id) {
    return this.sql.exec('SELECT id, nome, tag, descricao, publico, dono, criada, img_ver FROM equipes WHERE id = ?', id).toArray()[0] || null
  }
  meuMembro(quem) {
    return this.sql.exec('SELECT steam, equipe, cargo, entrou FROM membros WHERE steam = ?', quem).toArray()[0] || null
  }
  cargosDe(equipe) {
    return this.sql.exec('SELECT id, nome, cor, permissoes, padrao FROM cargos WHERE equipe = ? ORDER BY padrao DESC, nome', equipe).toArray().map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, permissoes: JSON.parse(c.permissoes || '[]'), padrao: !!c.padrao }))
  }
  // permissões de quem: o dono tem todas; os outros, as do cargo
  permissoesDe(equipe, quem) {
    const t = this.linha(equipe)
    if (!t) return []
    if (t.dono === quem) return [...PERMISSOES, 'cargos', 'dono']
    const m = this.meuMembro(quem)
    if (!m || m.equipe !== equipe) return []
    const c = this.sql.exec('SELECT permissoes FROM cargos WHERE equipe = ? AND id = ?', equipe, m.cargo).toArray()[0]
    return c ? JSON.parse(c.permissoes || '[]') : []
  }
  async detalhe(equipe, quem, completo) {
    const t = this.linha(equipe)
    if (!t) throw new Error('nao-achou')
    const u = await usuarios(this.env)
    const cargos = this.cargosDe(equipe)
    const membros = this.sql.exec('SELECT steam, cargo, entrou FROM membros WHERE equipe = ? ORDER BY entrou', equipe).toArray().map((m) => ({ id: m.steam, nome: u[m.steam]?.nome || '', avatar: u[m.steam]?.avatar || '', cargo: m.cargo, entrou: m.entrou, dono: m.steam === t.dono }))
    const minhas = this.permissoesDe(equipe, quem)
    const euSou = membros.some((m) => m.id === quem)
    const base = {
      id: t.id,
      nome: t.nome,
      tag: t.tag,
      descricao: t.descricao,
      publico: !!t.publico,
      dono: t.dono,
      donoNome: u[t.dono]?.nome || '',
      criada: t.criada,
      imagem: t.img_ver ? `/equipes/imagem?id=${t.id}&v=${t.img_ver}` : '',
      membros,
      cargos,
      souMembro: euSou,
      minhas,
    }
    if (completo && euSou && (minhas.includes('convidar') || minhas.includes('dono'))) {
      base.convitesEnviados = this.sql.exec('SELECT steam, por, ts FROM convites WHERE equipe = ? ORDER BY ts DESC', equipe).toArray().map((c) => ({ id: c.steam, nome: u[c.steam]?.nome || '', avatar: u[c.steam]?.avatar || '', por: c.por, ts: c.ts }))
    }
    return base
  }
  convitesDe(quem) {
    return this.sql.exec('SELECT equipe, por, ts FROM convites WHERE steam = ? ORDER BY ts DESC', quem).toArray()
  }

  // ── avisos ──
  async avisarMembros(equipe, msg, fora) {
    const ids = this.sql.exec('SELECT steam FROM membros WHERE equipe = ?', equipe).toArray().map((m) => m.steam).filter((i) => i !== fora)
    if (ids.length) await mandarPara(this.env, ids, msg)
  }
  async notificar(para, titulo, texto) {
    const n = { id: `equipe:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, titulo, texto, link: '/equipes/', quando: Date.now(), lida: false }
    await chamarLoja(this.env, para, { acao: 'notif-sync', doc: { lista: [n], vistos: [n.id], limpoEm: 0 } }).catch(() => null)
    await mandarPara(this.env, [para], { tipo: 'mercado' }).catch(() => null) // o sino busca a notificação nova
  }

  // ── ações ──
  async acao({ acao, quem, ...p }) {
    // Lista pública (sem login): só os times criados no site, para o carrossel, o Pick & Ban e o plugin
    if (acao === 'publico') {
      const linhas = this.sql.exec('SELECT id, nome, tag, img_ver FROM equipes ORDER BY nome COLLATE NOCASE LIMIT 500').toArray()
      return { times: linhas.map((e) => ({ nome: e.nome, tag: e.tag, logo: e.img_ver ? `/equipes/imagem?id=${e.id}&v=${e.img_ver}` : '' })) }
    }
    if (!ID_STEAM.test(String(quem))) throw new Error('login')
    const u = await usuarios(this.env)
    const nomeDe = (id) => u[id]?.nome || id

    if (acao === 'listar') {
      const q = String(p.q || '').trim().toLowerCase().slice(0, 40)
      const linhas = this.sql
        .exec('SELECT e.id, e.nome, e.tag, e.publico, e.dono, e.img_ver, (SELECT COUNT(*) FROM membros m WHERE m.equipe = e.id) AS n FROM equipes e ORDER BY n DESC, e.nome COLLATE NOCASE LIMIT 200')
        .toArray()
        .filter((e) => !q || e.nome.toLowerCase().includes(q) || (e.tag || '').toLowerCase().includes(q))
      return { equipes: linhas.map((e) => ({ id: e.id, nome: e.nome, tag: e.tag, publico: !!e.publico, membros: e.n, dono: e.dono, donoNome: nomeDe(e.dono), imagem: e.img_ver ? `/equipes/imagem?id=${e.id}&v=${e.img_ver}` : '' })), meu: this.meuMembro(quem)?.equipe || null }
    }
    if (acao === 'meu') {
      const m = this.meuMembro(quem)
      const convites = []
      for (const c of this.convitesDe(quem)) {
        const t = this.linha(c.equipe)
        if (t) convites.push({ equipe: t.id, nome: t.nome, tag: t.tag, por: c.por, porNome: nomeDe(c.por), ts: c.ts, imagem: t.img_ver ? `/equipes/imagem?id=${t.id}&v=${t.img_ver}` : '' })
      }
      return { time: m ? await this.detalhe(m.equipe, quem, true) : null, convites, custo: CUSTO_CRIAR }
    }
    if (acao === 'ver') return { time: await this.detalhe(String(p.id), quem, false) }
    if (acao === 'imagem') {
      const l = this.sql.exec('SELECT imagem FROM equipes WHERE id = ?', String(p.id)).toArray()[0]
      return { imagem: l?.imagem || '' }
    }

    // criar: paga, e só então cria (se algo falhar depois de pagar, devolve)
    if (acao === 'criar') {
      if (this.meuMembro(quem)) throw new Error('ja-tem-time')
      const nome = String(p.nome || '').replace(/ +/g, ' ').trim()
      const tag = String(p.tag || '').trim()
      if (!NOME.test(nome)) throw new Error('nome')
      if (tag && !TAG.test(tag)) throw new Error('tag')
      if (this.sql.exec('SELECT 1 FROM equipes WHERE nome = ? COLLATE NOCASE', nome).toArray().length) throw new Error('nome-em-uso')
      const descricao = String(p.descricao || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 280)
      const pontos = await pontosGanhos(this.env, quem)
      const bonus = (await this.env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)) || []
      const cobrado = await chamarLoja(this.env, quem, { acao: 'cobrar', valor: CUSTO_CRIAR, motivo: `criar o time ${nome}`, pontos, bonus }).catch((e) => {
        throw new Error(e.message === 'saldo' ? 'saldo' : 'falhou')
      })
      const id = novoId()
      try {
        this.ctx.storage.transactionSync(() => {
          this.sql.exec('INSERT INTO equipes (id, nome, tag, descricao, publico, dono, criada, imagem, img_ver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, nome, tag, descricao, p.publico === false ? 0 : 1, quem, Date.now(), '', 0)
          this.sql.exec('INSERT INTO cargos (equipe, id, nome, cor, permissoes, padrao) VALUES (?, ?, ?, ?, ?, ?)', id, 'membro', 'Membro', '#9aa0a8', '[]', 1)
          this.sql.exec('INSERT INTO membros (steam, equipe, cargo, entrou) VALUES (?, ?, ?, ?)', quem, id, 'membro', Date.now())
        })
      } catch (e) {
        await chamarLoja(this.env, quem, { acao: 'creditar', pontos, bonus, valor: CUSTO_CRIAR, motivo: 'reembolso: não deu para criar o time' }).catch(() => null)
        throw new Error('nome-em-uso')
      }
      registrar(this.env, { tipo: 'admin', quem, texto: `criou o time "${nome}" (${CUSTO_CRIAR} NP)`, dados: { equipe: id } })
      return { ok: true, id, saldo: cobrado.saldo }
    }

    // daqui para baixo: quase tudo exige estar num time
    const meu = this.meuMembro(quem)
    if (acao === 'entrar') {
      if (meu) throw new Error('ja-tem-time')
      const t = this.linha(String(p.id))
      if (!t) throw new Error('nao-achou')
      if (!t.publico) throw new Error('privado')
      if (this.sql.exec('SELECT COUNT(*) AS n FROM membros WHERE equipe = ?', t.id).one().n >= MAX_MEMBROS) throw new Error('cheio')
      this.sql.exec('INSERT INTO membros (steam, equipe, cargo, entrou) VALUES (?, ?, ?, ?)', quem, t.id, 'membro', Date.now())
      this.sql.exec('DELETE FROM convites WHERE steam = ?', quem)
      await this.avisarMembros(t.id, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'convite-aceitar' || acao === 'convite-recusar') {
      const t = this.linha(String(p.id))
      const c = t && this.sql.exec('SELECT 1 FROM convites WHERE equipe = ? AND steam = ?', t.id, quem).toArray()[0]
      if (!c) throw new Error('nao-achou')
      if (acao === 'convite-recusar') {
        this.sql.exec('DELETE FROM convites WHERE equipe = ? AND steam = ?', t.id, quem)
        return { ok: true }
      }
      if (meu) throw new Error('ja-tem-time')
      if (this.sql.exec('SELECT COUNT(*) AS n FROM membros WHERE equipe = ?', t.id).one().n >= MAX_MEMBROS) throw new Error('cheio')
      this.sql.exec('INSERT INTO membros (steam, equipe, cargo, entrou) VALUES (?, ?, ?, ?)', quem, t.id, 'membro', Date.now())
      this.sql.exec('DELETE FROM convites WHERE steam = ?', quem) // entrou num time: os outros convites perdem a validade
      await this.avisarMembros(t.id, { tipo: 'equipe' })
      return { ok: true }
    }
    if (!meu) throw new Error('sem-time')
    const eq = meu.equipe
    const t = this.linha(eq)
    const perm = this.permissoesDe(eq, quem)
    const exige = (...ps) => {
      if (!ps.some((x) => perm.includes(x))) throw new Error('sem-permissao')
    }

    if (acao === 'sair') {
      if (t.dono === quem) throw new Error('dono-nao-sai') // transfere ou apaga o time
      this.sql.exec('DELETE FROM membros WHERE steam = ?', quem)
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'editar') {
      exige('editar')
      const campos = {}
      if (p.nome !== undefined) {
        const nome = String(p.nome).replace(/ +/g, ' ').trim()
        if (!NOME.test(nome)) throw new Error('nome')
        if (this.sql.exec('SELECT 1 FROM equipes WHERE nome = ? COLLATE NOCASE AND id != ?', nome, eq).toArray().length) throw new Error('nome-em-uso')
        campos.nome = nome
      }
      if (p.tag !== undefined) {
        const tag = String(p.tag).trim()
        if (tag && !TAG.test(tag)) throw new Error('tag')
        campos.tag = tag
      }
      if (p.descricao !== undefined) campos.descricao = String(p.descricao).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 280)
      if (p.publico !== undefined) campos.publico = p.publico ? 1 : 0
      for (const [k, v] of Object.entries(campos)) this.sql.exec(`UPDATE equipes SET ${k} = ? WHERE id = ?`, v, eq)
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'imagem-salvar') {
      exige('editar')
      const d = String(p.dataUrl || '')
      if (d && (d.length > IMAGEM_MAX || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d))) throw new Error('imagem')
      this.sql.exec('UPDATE equipes SET imagem = ?, img_ver = ? WHERE id = ?', d, d ? Date.now() % 1e9 : 0, eq)
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'convidar') {
      exige('convidar')
      const alvo = String(p.alvo || '')
      if (!ID_STEAM.test(alvo) || alvo === quem) throw new Error('jogador')
      if (!u[alvo]) throw new Error('jogador') // precisa já ter entrado no site
      if (this.meuMembro(alvo)) throw new Error('alvo-ja-tem-time')
      if (this.sql.exec('SELECT COUNT(*) AS n FROM convites WHERE equipe = ?', eq).one().n >= MAX_CONVITES) throw new Error('muitos-convites')
      if (this.sql.exec('SELECT COUNT(*) AS n FROM membros WHERE equipe = ?', eq).one().n >= MAX_MEMBROS) throw new Error('cheio')
      this.sql.exec('INSERT OR REPLACE INTO convites (equipe, steam, por, ts) VALUES (?, ?, ?, ?)', eq, alvo, quem, Date.now())
      await this.notificar(alvo, `${nomeDe(quem)} convidou você para o time ${t.nome}`, 'Abra a página Times para aceitar ou recusar o convite.')
      await mandarPara(this.env, [alvo], { tipo: 'equipe' })
      await this.avisarMembros(eq, { tipo: 'equipe' }, quem)
      return { ok: true }
    }
    if (acao === 'convite-cancelar') {
      exige('convidar')
      this.sql.exec('DELETE FROM convites WHERE equipe = ? AND steam = ?', eq, String(p.alvo || ''))
      await mandarPara(this.env, [String(p.alvo || '')], { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'expulsar') {
      exige('expulsar')
      const alvo = String(p.alvo || '')
      const m = this.meuMembro(alvo)
      if (!m || m.equipe !== eq || alvo === quem) throw new Error('jogador')
      if (alvo === t.dono) throw new Error('sem-permissao')
      // quem não é dono não tira alguém que também tem permissões (só o dono tira "cargos de cima")
      if (t.dono !== quem && this.permissoesDe(eq, alvo).length) throw new Error('sem-permissao')
      this.sql.exec('DELETE FROM membros WHERE steam = ?', alvo)
      await this.notificar(alvo, `Você saiu do time ${t.nome}`, 'Um responsável do time tirou você da lista de membros.')
      await mandarPara(this.env, [alvo], { tipo: 'equipe' })
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }

    // cargos e dono: só o dono
    if (['cargo-salvar', 'cargo-apagar', 'cargo-dar', 'transferir', 'apagar'].includes(acao)) exige('dono')
    if (acao === 'cargo-salvar') {
      const nome = String(p.nome || '').replace(/ +/g, ' ').trim().slice(0, 20)
      if (nome.length < 2) throw new Error('nome')
      const cor = COR.test(String(p.cor || '')) ? String(p.cor) : '#9aa0a8'
      const permissoes = [...new Set((Array.isArray(p.permissoes) ? p.permissoes : []).filter((x) => PERMISSOES.includes(x)))]
      const id = p.id ? String(p.id) : novoId()
      const existe = this.sql.exec('SELECT padrao FROM cargos WHERE equipe = ? AND id = ?', eq, id).toArray()[0]
      if (!existe) {
        if (this.sql.exec('SELECT COUNT(*) AS n FROM cargos WHERE equipe = ?', eq).one().n >= MAX_CARGOS) throw new Error('muitos-cargos')
        this.sql.exec('INSERT INTO cargos (equipe, id, nome, cor, permissoes, padrao) VALUES (?, ?, ?, ?, ?, 0)', eq, id, nome, cor, JSON.stringify(permissoes))
      } else this.sql.exec('UPDATE cargos SET nome = ?, cor = ?, permissoes = ? WHERE equipe = ? AND id = ?', nome, cor, JSON.stringify(existe.padrao ? [] : permissoes), eq, id) // o cargo padrão (Membro) não tem permissões
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true, id }
    }
    if (acao === 'cargo-apagar') {
      const id = String(p.id || '')
      const c = this.sql.exec('SELECT padrao FROM cargos WHERE equipe = ? AND id = ?', eq, id).toArray()[0]
      if (!c || c.padrao) throw new Error('cargo')
      this.sql.exec("UPDATE membros SET cargo = 'membro' WHERE equipe = ? AND cargo = ?", eq, id) // quem tinha volta a ser Membro
      this.sql.exec('DELETE FROM cargos WHERE equipe = ? AND id = ?', eq, id)
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'cargo-dar') {
      const alvo = String(p.alvo || '')
      const m = this.meuMembro(alvo)
      if (!m || m.equipe !== eq || alvo === t.dono) throw new Error('jogador')
      if (!this.sql.exec('SELECT 1 FROM cargos WHERE equipe = ? AND id = ?', eq, String(p.cargo || '')).toArray().length) throw new Error('cargo')
      this.sql.exec('UPDATE membros SET cargo = ? WHERE steam = ?', String(p.cargo), alvo)
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'transferir') {
      const alvo = String(p.alvo || '')
      const m = this.meuMembro(alvo)
      if (!m || m.equipe !== eq || alvo === quem) throw new Error('jogador')
      this.sql.exec('UPDATE equipes SET dono = ? WHERE id = ?', alvo, eq)
      this.sql.exec("UPDATE membros SET cargo = 'membro' WHERE steam = ?", alvo)
      await this.notificar(alvo, `Você agora é o dono do time ${t.nome}`, `${nomeDe(quem)} passou a liderança para você.`)
      await this.avisarMembros(eq, { tipo: 'equipe' })
      return { ok: true }
    }
    if (acao === 'apagar') {
      const ids = this.sql.exec('SELECT steam FROM membros WHERE equipe = ?', eq).toArray().map((m) => m.steam)
      this.ctx.storage.transactionSync(() => {
        for (const tabela of ['membros', 'cargos', 'convites', 'chat']) this.sql.exec(`DELETE FROM ${tabela} WHERE equipe = ?`, eq)
        this.sql.exec('DELETE FROM equipes WHERE id = ?', eq)
      })
      for (const id of ids) if (id !== quem) await this.notificar(id, `O time ${t.nome} foi apagado`, 'O dono desfez o time.')
      if (ids.length) await mandarPara(this.env, ids, { tipo: 'equipe' })
      registrar(this.env, { tipo: 'admin', quem, texto: `apagou o time "${t.nome}"`, dados: { equipe: eq } })
      return { ok: true }
    }

    // chat do time
    if (acao === 'chat-listar') {
      const linhas = this.sql.exec('SELECT id, ts, de, texto FROM chat WHERE equipe = ? ORDER BY id DESC LIMIT 100', eq).toArray().reverse()
      return { mensagens: linhas.map((l) => ({ id: l.id, ts: l.ts, de: l.de, nome: nomeDe(l.de), texto: l.texto })), equipe: eq }
    }
    if (acao === 'chat-enviar') {
      const texto = String(p.texto || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
      if (!texto) throw new Error('mensagem')
      const agora = Date.now()
      if (agora - (this.ultimaMsg.get(quem) || 0) < 800) throw new Error('devagar')
      this.ultimaMsg.set(quem, agora)
      const r = this.sql.exec('INSERT INTO chat (equipe, ts, de, texto) VALUES (?, ?, ?, ?) RETURNING id', eq, agora, quem, texto).one()
      this.sql.exec('DELETE FROM chat WHERE equipe = ? AND id <= ?', eq, r.id - MAX_MSG)
      const msg = { id: r.id, ts: agora, de: quem, nome: nomeDe(quem), texto }
      await this.avisarMembros(eq, { tipo: 'equipe-chat', equipe: eq, msg }, quem)
      return { ok: true, msg }
    }
    if (acao === 'chat-apagar') {
      exige('moderar')
      this.sql.exec('DELETE FROM chat WHERE equipe = ? AND id = ?', eq, Number(p.id) || 0)
      await this.avisarMembros(eq, { tipo: 'equipe-chat', equipe: eq, apagou: Number(p.id) || 0 })
      return { ok: true }
    }
    throw new Error('acao')
  }
}

const objeto = (env) => env.EQUIPES.get(env.EQUIPES.idFromName('global'))
const chamar = (env, corpo) => objeto(env).fetch('https://equipes/', { method: 'POST', body: JSON.stringify(corpo) })

// Rotas /equipes (com login)
export async function rotaEquipes(req, env, quem, cors, rota, url) {
  let pedido
  if (req.method === 'GET') {
    if (rota === '/equipes') pedido = { acao: 'listar', q: url.searchParams.get('q') }
    else if (rota === '/equipes/meu') pedido = { acao: 'meu' }
    else if (rota === '/equipes/ver') pedido = { acao: 'ver', id: url.searchParams.get('id') }
    else if (rota === '/equipes/chat') pedido = { acao: 'chat-listar' }
    else return json({ erro: 'rota' }, 404, cors)
  } else if (req.method === 'POST') {
    const acao = rota.replace('/equipes/', '')
    if (!/^[a-z-]{3,20}$/.test(acao)) return json({ erro: 'rota' }, 404, cors)
    pedido = { ...(await req.json().catch(() => ({}))), acao }
  } else return json({ erro: 'rota' }, 404, cors)
  const r = await chamar(env, { ...pedido, quem: quem.id })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
}

// GET /equipes/publico (público): { times: [{ nome, tag, logo }] } só com os times criados; o logo vai como link completo
export async function rotaListaPublicaEquipes(url, env) {
  const r = await chamar(env, { acao: 'publico' })
  const d = await r.json().catch(() => ({ times: [] }))
  const times = (d.times || []).map((t) => ({ ...t, logo: t.logo ? url.origin + t.logo : '' }))
  return new Response(JSON.stringify({ times }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30', 'Access-Control-Allow-Origin': '*' } })
}

// GET /equipes/imagem?id=&v= (público): a imagem do time; o "v" muda quando a imagem muda, então o navegador pode guardar por muito tempo
export async function rotaImagemEquipe(url, env) {
  const id = url.searchParams.get('id') || ''
  if (!/^[a-z0-9]{6,16}$/.test(id)) return new Response('', { status: 404 })
  const r = await chamar(env, { acao: 'imagem', quem: '76561190000000000', id })
  const d = await r.json().catch(() => null)
  const m = /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(d?.imagem || '')
  if (!m) return new Response('', { status: 404 })
  const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
  return new Response(bin, { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' } })
}
