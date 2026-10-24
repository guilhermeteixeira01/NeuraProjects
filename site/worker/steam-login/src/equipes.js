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
 *   POST /equipes/<acao>        (login) -> criar, editar, imagem-salvar, entrar, sair, convidar, convite-cancelar, convite-aceitar, convite-recusar, expulsar,
 *                                           cargo-salvar, cargo-apagar, cargo-dar, transferir, apagar, chat-enviar, chat-apagar
 *   GET  /equipes/chat          (login) -> { mensagens }
 *   GET  /equipes/publico       (público) -> { times: [{ nome, tag, logo }] }
 *   GET  /equipes/imagem?id=&v= (público) -> a imagem do time (WebP/PNG/JPEG, guardada no próprio objeto)
 */
import { mandarPara } from './amigos.js'
import { ErroConflito, ErroLimite, ErroLogin, ErroNaoEncontrado, ErroPedido, ErroPermissao } from './erros.js'
import { json, lerCorpo, reenviar } from './http.js'
import { notificar } from './notificacoes.js'
import { Fila, objetoGlobal, pedir, pedirAoJogador, responder, semDerrubar } from './objetos.js'
import { registrar } from './registro.js'
import { lerUsuarios } from './usuarios.js'

export const CUSTO_CRIAR = 10000 // NP para criar um time
const MAX_MEMBROS = 50
const MAX_CONVITES = 20
const MAX_CARGOS = 12
const MAX_MSG = 500 // mensagens guardadas por time
const PERMISSOES = ['convidar', 'expulsar', 'editar', 'moderar']
const ID_STEAM = /^\d{17}$/
const ID_EQUIPE = /^[a-z0-9]{6,16}$/
const COR = /^#[0-9a-fA-F]{6}$/
const NOME = /^[\p{L}\p{N} ._\-!]{3,24}$/u
const TAG = /^[\p{L}\p{N}]{2,5}$/u
const IMAGEM_MAX = 90000 // caracteres do data URL (o site reduz para 256x256)
const IMAGEM = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/

const novoId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
const linkImagem = (e) => (e.img_ver ? `/equipes/imagem?id=${e.id}&v=${e.img_ver}` : '')

export class Equipes {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS equipes (id TEXT PRIMARY KEY, nome TEXT, tag TEXT, descricao TEXT, publico INTEGER, dono TEXT, criada INTEGER, imagem TEXT, img_ver INTEGER)')
    this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS equipes_nome ON equipes (nome COLLATE NOCASE)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS equipes_tag ON equipes (tag COLLATE NOCASE)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS cargos (equipe TEXT, id TEXT, nome TEXT, cor TEXT, permissoes TEXT, padrao INTEGER, PRIMARY KEY (equipe, id))')
    this.sql.exec('CREATE TABLE IF NOT EXISTS membros (steam TEXT PRIMARY KEY, equipe TEXT, cargo TEXT, entrou INTEGER)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS membros_equipe ON membros (equipe)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS convites (equipe TEXT, steam TEXT, por TEXT, ts INTEGER, PRIMARY KEY (equipe, steam))')
    this.sql.exec('CREATE INDEX IF NOT EXISTS convites_steam ON convites (steam)')
    this.sql.exec('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, equipe TEXT, ts INTEGER, de TEXT, texto TEXT)')
    this.sql.exec('CREATE INDEX IF NOT EXISTS chat_equipe ON chat (equipe, id)')
    this.fila = new Fila()
    this.ultimaMsg = new Map()
  }

  fetch(req) {
    return responder(async () => {
      const corpo = await lerCorpo(req)
      return this.fila.rodar(() => this.acao(corpo))
    })
  }

  // ── leitura ──
  linha(id) {
    return this.sql.exec('SELECT id, nome, tag, descricao, publico, dono, criada, img_ver FROM equipes WHERE id = ?', id).toArray()[0] || null
  }
  meuMembro(quem) {
    return this.sql.exec('SELECT steam, equipe, cargo, entrou FROM membros WHERE steam = ?', quem).toArray()[0] || null
  }
  contar(tabela, equipe) {
    return this.sql.exec(`SELECT COUNT(*) AS n FROM ${tabela} WHERE equipe = ?`, equipe).one().n
  }
  cargosDe(equipe) {
    return this.sql.exec('SELECT id, nome, cor, permissoes, padrao FROM cargos WHERE equipe = ? ORDER BY padrao DESC, nome', equipe).toArray().map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, permissoes: JSON.parse(c.permissoes || '[]'), padrao: !!c.padrao }))
  }
  // permissões de quem: o dono tem todas; os outros, as do cargo
  permissoesDe(equipe, quem) {
    const t = this.linha(equipe)
    if (!t) return []
    if (t.dono === quem) return [...PERMISSOES, 'cargos', 'dono']
    const c = this.sql.exec('SELECT c.permissoes FROM membros m JOIN cargos c ON c.equipe = m.equipe AND c.id = m.cargo WHERE m.steam = ? AND m.equipe = ?', quem, equipe).toArray()[0]
    return c ? JSON.parse(c.permissoes || '[]') : []
  }
  detalhe(equipe, quem, completo, u) {
    const t = this.linha(equipe)
    if (!t) throw new ErroNaoEncontrado('nao-achou')
    const pessoa = (id) => ({ nome: u[id]?.nome || '', avatar: u[id]?.avatar || '' })
    const membros = this.sql.exec('SELECT steam, cargo, entrou FROM membros WHERE equipe = ? ORDER BY entrou', equipe).toArray().map((m) => ({ id: m.steam, ...pessoa(m.steam), cargo: m.cargo, entrou: m.entrou, dono: m.steam === t.dono }))
    const minhas = this.permissoesDe(equipe, quem)
    const souMembro = membros.some((m) => m.id === quem)
    const base = { id: t.id, nome: t.nome, tag: t.tag, descricao: t.descricao, publico: !!t.publico, dono: t.dono, donoNome: u[t.dono]?.nome || '', criada: t.criada, imagem: linkImagem(t), membros, cargos: this.cargosDe(equipe), souMembro, minhas }
    if (completo && souMembro && (minhas.includes('convidar') || minhas.includes('dono'))) {
      base.convitesEnviados = this.sql.exec('SELECT steam, por, ts FROM convites WHERE equipe = ? ORDER BY ts DESC', equipe).toArray().map((c) => ({ id: c.steam, ...pessoa(c.steam), por: c.por, ts: c.ts }))
    }
    return base
  }

  // ── avisos ──
  async avisarMembros(equipe, msg, fora) {
    const ids = this.sql.exec('SELECT steam FROM membros WHERE equipe = ?', equipe).toArray().map((m) => m.steam).filter((i) => i !== fora)
    if (ids.length) await mandarPara(this.env, ids, msg)
  }
  async avisarJogador(para, titulo, texto) {
    const n = { id: `equipe:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, titulo, texto, link: '/equipes/', quando: Date.now(), lida: false }
    await semDerrubar(notificar(this.env, para, n), 'notificação de time')
    await mandarPara(this.env, [para], { tipo: 'mercado' }) // o sino busca a notificação nova
  }

  // ── ações ──
  async acao({ acao, quem, ...p }) {
    // Sem login: a lista pública (carrossel, Pick & Ban, plugin) e a imagem de um time
    if (acao === 'publico') {
      const linhas = this.sql.exec('SELECT id, nome, tag, img_ver FROM equipes ORDER BY nome COLLATE NOCASE LIMIT 500').toArray()
      const membros = Object.fromEntries(this.sql.exec('SELECT m.steam, e.nome FROM membros m JOIN equipes e ON e.id = m.equipe').toArray().map((m) => [m.steam, m.nome]))
      return { membros, times: linhas.map((e) => ({ nome: e.nome, tag: e.tag, logo: linkImagem(e) })) }
    }
    if (acao === 'imagem') return { imagem: this.sql.exec('SELECT imagem FROM equipes WHERE id = ?', String(p.id)).toArray()[0]?.imagem || '' }
    if (!ID_STEAM.test(String(quem))) throw new ErroLogin('login')
    const u = await lerUsuarios(this.env)
    const nomeDe = (id) => u[id]?.nome || id

    if (acao === 'listar') {
      const q = String(p.q || '').trim().toLowerCase().slice(0, 40)
      const linhas = this.sql
        .exec('SELECT e.id, e.nome, e.tag, e.publico, e.dono, e.img_ver, COUNT(m.steam) AS n FROM equipes e LEFT JOIN membros m ON m.equipe = e.id GROUP BY e.id ORDER BY n DESC, e.nome COLLATE NOCASE LIMIT 200')
        .toArray()
        .filter((e) => !q || e.nome.toLowerCase().includes(q) || (e.tag || '').toLowerCase().includes(q))
      return { equipes: linhas.map((e) => ({ id: e.id, nome: e.nome, tag: e.tag, publico: !!e.publico, membros: e.n, dono: e.dono, donoNome: nomeDe(e.dono), imagem: linkImagem(e) })), meu: this.meuMembro(quem)?.equipe || null }
    }
    if (acao === 'meu') {
      const m = this.meuMembro(quem)
      const convites = this.sql
        .exec('SELECT e.id, e.nome, e.tag, e.img_ver, c.por, c.ts FROM convites c JOIN equipes e ON e.id = c.equipe WHERE c.steam = ? ORDER BY c.ts DESC', quem)
        .toArray()
        .map((c) => ({ equipe: c.id, nome: c.nome, tag: c.tag, por: c.por, porNome: nomeDe(c.por), ts: c.ts, imagem: linkImagem(c) }))
      return { time: m ? this.detalhe(m.equipe, quem, true, u) : null, convites, custo: CUSTO_CRIAR }
    }
    if (acao === 'ver') return { time: this.detalhe(String(p.id), quem, false, u) }
    if (acao === 'criar') return this.criar(quem, p)

    // daqui para baixo: quase tudo exige estar num time
    const meu = this.meuMembro(quem)
    if (acao === 'entrar' || acao === 'convite-aceitar' || acao === 'convite-recusar') {
      const t = this.linha(String(p.id))
      if (!t) throw new ErroNaoEncontrado('nao-achou')
      const convidado = this.sql.exec('SELECT 1 FROM convites WHERE equipe = ? AND steam = ?', t.id, quem).toArray().length > 0
      if (acao !== 'entrar' && !convidado) throw new ErroNaoEncontrado('nao-achou')
      if (acao === 'convite-recusar') {
        this.sql.exec('DELETE FROM convites WHERE equipe = ? AND steam = ?', t.id, quem)
        return { ok: true }
      }
      if (meu) throw new ErroConflito('ja-tem-time')
      if (acao === 'entrar' && !t.publico) throw new ErroPermissao('privado')
      if (this.contar('membros', t.id) >= MAX_MEMBROS) throw new ErroConflito('cheio')
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('INSERT INTO membros (steam, equipe, cargo, entrou) VALUES (?, ?, ?, ?)', quem, t.id, 'membro', Date.now())
        this.sql.exec('DELETE FROM convites WHERE steam = ?', quem) // entrou num time: os outros convites perdem a validade
      })
      await this.avisarMembros(t.id, { tipo: 'equipe' })
      return { ok: true }
    }
    if (!meu) throw new ErroConflito('sem-time')
    const eq = meu.equipe
    const t = this.linha(eq)
    const perm = this.permissoesDe(eq, quem)
    const exige = (...ps) => {
      if (!ps.some((x) => perm.includes(x))) throw new ErroPermissao('sem-permissao')
    }
    const membroDoTime = (alvo) => {
      const m = this.meuMembro(alvo)
      if (!m || m.equipe !== eq) throw new ErroPedido('jogador')
      return m
    }

    switch (acao) {
      case 'sair':
        if (t.dono === quem) throw new ErroConflito('dono-nao-sai') // transfere ou apaga o time
        this.sql.exec('DELETE FROM membros WHERE steam = ?', quem)
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      case 'editar': {
        exige('editar')
        const campos = {}
        if (p.nome !== undefined) {
          const nome = String(p.nome).replace(/ +/g, ' ').trim()
          if (!NOME.test(nome)) throw new ErroPedido('nome')
          if (this.sql.exec('SELECT 1 FROM equipes WHERE nome = ? COLLATE NOCASE AND id != ?', nome, eq).toArray().length) throw new ErroConflito('nome-em-uso')
          campos.nome = nome
        }
        if (p.tag !== undefined) {
          const tag = String(p.tag).trim()
          if (tag && !TAG.test(tag)) throw new ErroPedido('tag')
          if (tag && this.sql.exec('SELECT 1 FROM equipes WHERE tag = ? COLLATE NOCASE AND id != ?', tag, eq).toArray().length) throw new ErroConflito('tag-em-uso')
          campos.tag = tag
        }
        if (p.descricao !== undefined) campos.descricao = String(p.descricao).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 280)
        if (p.publico !== undefined) campos.publico = p.publico ? 1 : 0
        const nomes = Object.keys(campos)
        if (nomes.length) this.sql.exec(`UPDATE equipes SET ${nomes.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(campos), eq)
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      }
      case 'imagem-salvar': {
        exige('editar')
        const d = String(p.dataUrl || '')
        if (d && (d.length > IMAGEM_MAX || !IMAGEM.test(d))) throw new ErroPedido('imagem')
        this.sql.exec('UPDATE equipes SET imagem = ?, img_ver = ? WHERE id = ?', d, d ? Date.now() % 1e9 : 0, eq)
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      }
      case 'convidar': {
        exige('convidar')
        const alvo = String(p.alvo || '')
        if (!ID_STEAM.test(alvo) || alvo === quem) throw new ErroPedido('jogador')
        if (!u[alvo]) throw new ErroNaoEncontrado('jogador') // precisa já ter entrado no site
        if (this.meuMembro(alvo)) throw new ErroConflito('alvo-ja-tem-time')
        if (this.contar('convites', eq) >= MAX_CONVITES) throw new ErroConflito('muitos-convites')
        if (this.contar('membros', eq) >= MAX_MEMBROS) throw new ErroConflito('cheio')
        this.sql.exec('INSERT OR REPLACE INTO convites (equipe, steam, por, ts) VALUES (?, ?, ?, ?)', eq, alvo, quem, Date.now())
        await this.avisarJogador(alvo, `${nomeDe(quem)} convidou você para o time ${t.nome}`, 'Abra a página Times para aceitar ou recusar o convite.')
        await mandarPara(this.env, [alvo], { tipo: 'equipe' })
        await this.avisarMembros(eq, { tipo: 'equipe' }, quem)
        return { ok: true }
      }
      case 'convite-cancelar': {
        exige('convidar')
        const alvo = String(p.alvo || '')
        this.sql.exec('DELETE FROM convites WHERE equipe = ? AND steam = ?', eq, alvo)
        await mandarPara(this.env, [alvo], { tipo: 'equipe' })
        return { ok: true }
      }
      case 'expulsar': {
        exige('expulsar')
        const alvo = String(p.alvo || '')
        membroDoTime(alvo)
        if (alvo === quem) throw new ErroPedido('jogador')
        // ninguém tira o dono; quem não é dono não tira alguém que também tem permissões (só o dono tira "cargos de cima")
        if (alvo === t.dono || (t.dono !== quem && this.permissoesDe(eq, alvo).length)) throw new ErroPermissao('sem-permissao')
        this.sql.exec('DELETE FROM membros WHERE steam = ?', alvo)
        await this.avisarJogador(alvo, `Você saiu do time ${t.nome}`, 'Um responsável do time tirou você da lista de membros.')
        await mandarPara(this.env, [alvo], { tipo: 'equipe' })
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      }
      case 'chat-listar': {
        const linhas = this.sql.exec('SELECT id, ts, de, texto FROM chat WHERE equipe = ? ORDER BY id DESC LIMIT 100', eq).toArray().reverse()
        return { mensagens: linhas.map((l) => ({ id: l.id, ts: l.ts, de: l.de, nome: nomeDe(l.de), texto: l.texto })), equipe: eq }
      }
      case 'chat-enviar': {
        const texto = String(p.texto || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
        if (!texto) throw new ErroPedido('mensagem')
        const agora = Date.now()
        if (agora - (this.ultimaMsg.get(quem) || 0) < 800) throw new ErroLimite('devagar')
        this.ultimaMsg.set(quem, agora)
        const { id } = this.sql.exec('INSERT INTO chat (equipe, ts, de, texto) VALUES (?, ?, ?, ?) RETURNING id', eq, agora, quem, texto).one()
        this.sql.exec('DELETE FROM chat WHERE equipe = ? AND id <= ?', eq, id - MAX_MSG)
        const msg = { id, ts: agora, de: quem, nome: nomeDe(quem), texto }
        await this.avisarMembros(eq, { tipo: 'equipe-chat', equipe: eq, msg }, quem)
        return { ok: true, msg }
      }
      case 'chat-apagar': {
        exige('moderar')
        const id = Number(p.id) || 0
        this.sql.exec('DELETE FROM chat WHERE equipe = ? AND id = ?', eq, id)
        await this.avisarMembros(eq, { tipo: 'equipe-chat', equipe: eq, apagou: id })
        return { ok: true }
      }
    }

    // cargos e dono: só o dono
    exige('dono')
    switch (acao) {
      case 'cargo-salvar': {
        const nome = String(p.nome || '').replace(/ +/g, ' ').trim().slice(0, 20)
        if (nome.length < 2) throw new ErroPedido('nome')
        const cor = COR.test(String(p.cor || '')) ? String(p.cor) : '#9aa0a8'
        const permissoes = [...new Set((Array.isArray(p.permissoes) ? p.permissoes : []).filter((x) => PERMISSOES.includes(x)))]
        const id = p.id ? String(p.id) : novoId()
        const existe = this.sql.exec('SELECT padrao FROM cargos WHERE equipe = ? AND id = ?', eq, id).toArray()[0]
        if (!existe) {
          if (this.contar('cargos', eq) >= MAX_CARGOS) throw new ErroConflito('muitos-cargos')
          this.sql.exec('INSERT INTO cargos (equipe, id, nome, cor, permissoes, padrao) VALUES (?, ?, ?, ?, ?, 0)', eq, id, nome, cor, JSON.stringify(permissoes))
        } else this.sql.exec('UPDATE cargos SET nome = ?, cor = ?, permissoes = ? WHERE equipe = ? AND id = ?', nome, cor, JSON.stringify(existe.padrao ? [] : permissoes), eq, id) // o cargo padrão (Membro) não tem permissões
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true, id }
      }
      case 'cargo-apagar': {
        const id = String(p.id || '')
        const c = this.sql.exec('SELECT padrao FROM cargos WHERE equipe = ? AND id = ?', eq, id).toArray()[0]
        if (!c || c.padrao) throw new ErroPedido('cargo')
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE membros SET cargo = 'membro' WHERE equipe = ? AND cargo = ?", eq, id) // quem tinha volta a ser Membro
          this.sql.exec('DELETE FROM cargos WHERE equipe = ? AND id = ?', eq, id)
        })
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      }
      case 'cargo-dar': {
        const alvo = String(p.alvo || '')
        membroDoTime(alvo)
        if (alvo === t.dono) throw new ErroPedido('jogador')
        if (!this.sql.exec('SELECT 1 FROM cargos WHERE equipe = ? AND id = ?', eq, String(p.cargo || '')).toArray().length) throw new ErroPedido('cargo')
        this.sql.exec('UPDATE membros SET cargo = ? WHERE steam = ?', String(p.cargo), alvo)
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      }
      case 'transferir': {
        const alvo = String(p.alvo || '')
        membroDoTime(alvo)
        if (alvo === quem) throw new ErroPedido('jogador')
        this.ctx.storage.transactionSync(() => {
          this.sql.exec('UPDATE equipes SET dono = ? WHERE id = ?', alvo, eq)
          this.sql.exec("UPDATE membros SET cargo = 'membro' WHERE steam = ?", alvo)
        })
        await this.avisarJogador(alvo, `Você agora é o dono do time ${t.nome}`, `${nomeDe(quem)} passou a liderança para você.`)
        await this.avisarMembros(eq, { tipo: 'equipe' })
        return { ok: true }
      }
      case 'apagar': {
        const ids = this.sql.exec('SELECT steam FROM membros WHERE equipe = ?', eq).toArray().map((m) => m.steam)
        this.ctx.storage.transactionSync(() => {
          for (const tabela of ['membros', 'cargos', 'convites', 'chat']) this.sql.exec(`DELETE FROM ${tabela} WHERE equipe = ?`, eq)
          this.sql.exec('DELETE FROM equipes WHERE id = ?', eq)
        })
        for (const id of ids) if (id !== quem) await this.avisarJogador(id, `O time ${t.nome} foi apagado`, 'O dono desfez o time.')
        if (ids.length) await mandarPara(this.env, ids, { tipo: 'equipe' })
        await registrar(this.env, { tipo: 'admin', quem, texto: `apagou o time "${t.nome}"`, dados: { equipe: eq } })
        return { ok: true }
      }
    }
    throw new ErroPedido('acao')
  }

  // Cria pagando: cobra primeiro e só então grava; se a gravação falhar, devolve os NP
  async criar(quem, p) {
    if (this.meuMembro(quem)) throw new ErroConflito('ja-tem-time')
    const nome = String(p.nome || '').replace(/ +/g, ' ').trim()
    const tag = String(p.tag || '').trim()
    if (!NOME.test(nome)) throw new ErroPedido('nome')
    if (tag && !TAG.test(tag)) throw new ErroPedido('tag')
    if (this.sql.exec('SELECT 1 FROM equipes WHERE nome = ? COLLATE NOCASE', nome).toArray().length) throw new ErroConflito('nome-em-uso')
    if (tag && this.sql.exec('SELECT 1 FROM equipes WHERE tag = ? COLLATE NOCASE', tag).toArray().length) throw new ErroConflito('tag-em-uso')
    const descricao = String(p.descricao || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 280)
    const cobrado = await pedirAoJogador(this.env, quem, { acao: 'cobrar', valor: CUSTO_CRIAR, motivo: `criar o time ${nome}` })
    const id = novoId()
    try {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('INSERT INTO equipes (id, nome, tag, descricao, publico, dono, criada, imagem, img_ver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, nome, tag, descricao, p.publico === false ? 0 : 1, quem, Date.now(), '', 0)
        this.sql.exec('INSERT INTO cargos (equipe, id, nome, cor, permissoes, padrao) VALUES (?, ?, ?, ?, ?, ?)', id, 'membro', 'Membro', '#9aa0a8', '[]', 1)
        this.sql.exec('INSERT INTO membros (steam, equipe, cargo, entrou) VALUES (?, ?, ?, ?)', quem, id, 'membro', Date.now())
      })
    } catch (e) {
      await pedirAoJogador(this.env, quem, { acao: 'creditar', valor: CUSTO_CRIAR, motivo: 'reembolso: não deu para criar o time' })
      throw e
    }
    await registrar(this.env, { tipo: 'admin', quem, texto: `criou o time "${nome}" (${CUSTO_CRIAR} NP)`, dados: { equipe: id } })
    return { ok: true, id, saldo: cobrado.saldo }
  }
}

const objeto = (env) => objetoGlobal(env.EQUIPES)
const chamar = (env, corpo) => objeto(env).fetch('https://equipes/', { method: 'POST', body: JSON.stringify(corpo) })
const ROTAS_GET = { '/equipes': 'listar', '/equipes/meu': 'meu', '/equipes/ver': 'ver', '/equipes/chat': 'chat-listar' }

// Rotas /equipes (com login)
export async function rotaEquipes(req, env, quem, cors, rota, url) {
  let pedido
  if (req.method === 'GET' && ROTAS_GET[rota]) pedido = { acao: ROTAS_GET[rota], q: url.searchParams.get('q'), id: url.searchParams.get('id') }
  else if (req.method === 'POST' && /^\/equipes\/[a-z-]{3,20}$/.test(rota)) pedido = { ...(await lerCorpo(req)), acao: rota.slice('/equipes/'.length) }
  else throw new ErroNaoEncontrado('rota')
  return reenviar(await chamar(env, { ...pedido, quem: quem.id }), cors)
}

// GET /equipes/publico (público): { times: [{ nome, tag, logo }] } só com os times criados; o logo vai como link completo
export async function rotaListaPublicaEquipes(url, env) {
  const { times } = await pedir(objeto(env), { acao: 'publico' }, 'https://equipes/')
  return json({ times: times.map((t) => ({ ...t, logo: t.logo ? url.origin + t.logo : '' })) }, 200, { 'Cache-Control': 'public, max-age=30', 'Access-Control-Allow-Origin': '*' })
}

// Time de cada jogador (o que vale é o time em que ele está): { steamId: nomeDoTime }, guardado na memória por 15 s
let timesDosJogadores = { ate: 0, mapa: {} }
export async function timeDosJogadores(env) {
  if (Date.now() < timesDosJogadores.ate) return timesDosJogadores.mapa
  const { membros } = await pedir(objeto(env), { acao: 'publico' }, 'https://equipes/')
  timesDosJogadores = { ate: Date.now() + 15_000, mapa: membros }
  return membros
}

// GET /equipes/imagem?id=&v= (público): a imagem do time. O "v" muda quando a imagem muda: navegador e borda guardam para sempre
export async function rotaImagemEquipe(req, url, env, ctx) {
  const id = url.searchParams.get('id') || ''
  if (!ID_EQUIPE.test(id)) throw new ErroNaoEncontrado('imagem')
  const cache = caches.default
  const salvo = await cache.match(req)
  if (salvo) return salvo
  const { imagem } = await pedir(objeto(env), { acao: 'imagem', id }, 'https://equipes/')
  const m = IMAGEM.exec(imagem)
  if (!m) throw new ErroNaoEncontrado('imagem')
  const resposta = new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' } })
  ctx.waitUntil(cache.put(req, resposta.clone()))
  return resposta
}

