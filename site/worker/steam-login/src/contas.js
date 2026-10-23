/*
 * Conta do jogador: APELIDO (nick) único e SENHA DE SEGURANÇA (pede para trocar itens e para colocar algo à venda no mercado: evita golpe).
 *
 * Um Durable Object GLOBAL ("Contas", SQLite) guarda tudo e roda um pedido de cada vez: dois jogadores nunca ficam com o mesmo apelido e
 * as tentativas erradas de senha não passam em corrida. A senha nunca é guardada: só um hash PBKDF2-SHA256 com sal próprio de cada conta.
 *
 *   Apelido: 3 a 20 letras/números (com espaço, ponto, _ e -), sem repetir (sem diferenciar maiúscula, acento nem separadores).
 *            A primeira escolha é livre; depois, só assinante Premium troca, no máximo uma vez a cada 15 dias.
 *   Senha:   6 a 64 caracteres. 5 erros seguidos bloqueiam as verificações por 15 minutos.
 *
 *   GET  /conta/seguranca     (login) -> { nick, temSenha, premium, podeTrocarNick, proximaTroca }
 *   POST /conta/nick          (login) { nick }
 *   POST /conta/senha         (login) { senha, atual? }   (criar; para trocar, "atual" é obrigatória)
 *   GET  /nicks?ids=a,b,c     (público) -> { "<SteamID64>": "apelido" }
 *   POST /admin/senha-reset   (dono) { id }   ·   POST /admin/nick (dono) { id, nick }
 */
export const DIAS_TROCA_NICK = 15
const TROCA_MS = DIAS_TROCA_NICK * 24 * 3600 * 1000
const MAX_ERROS = 5
const BLOQUEIO_MS = 15 * 60 * 1000
const ITERACOES = 100000 // o máximo que o Workers aceita no PBKDF2
const NICK = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,18}[\p{L}\p{N}]$/u
const RESERVADOS = new Set(['admin', 'administrador', 'moderador', 'moderacao', 'suporte', 'staff', 'neura', 'neuraproject', 'neurapick', 'dono', 'owner', 'system', 'sistema', 'steam', 'valve', 'null', 'undefined'])
const ID_STEAM = /^\d{17}$/

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

// "João_Silva 99" e "joao silva99" são o mesmo apelido para quem confere repetidos
export const chaveDoNick = (n) =>
  String(n || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const deHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))
async function derivar(senha, sal) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACOES }, chave, 256)
}
const iguais = (a, b) => {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export class Contas {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS contas (steam TEXT PRIMARY KEY, nick TEXT, chave TEXT, nick_em INTEGER, trocas INTEGER DEFAULT 0, sal TEXT, hash TEXT, senha_em INTEGER, erros INTEGER DEFAULT 0, bloqueio INTEGER DEFAULT 0)')
    this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS contas_chave ON contas (chave) WHERE chave IS NOT NULL')
    this.fila = Promise.resolve()
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
        if (e?.dados) return json({ erro: e.message, ...e.dados }, e.status || 400)
        const m = /^[a-z-]{2,30}$/.test(e?.message || '') ? e.message : 'falhou'
        if (m === 'falhou') console.error('contas', e)
        return json({ erro: m }, m === 'falhou' ? 500 : 400)
      }
    })
  }

  conta(steam) {
    return this.sql.exec('SELECT * FROM contas WHERE steam = ?', steam).toArray()[0] || null
  }

  async acao(c) {
    const a = c.acao
    if (a === 'nicks') {
      const ids = (Array.isArray(c.ids) ? c.ids : []).filter((x) => ID_STEAM.test(x)).slice(0, 200)
      const saida = {}
      for (const id of ids) {
        const l = this.conta(id)
        if (l?.nick) saida[id] = l.nick
      }
      return saida
    }
    if (a === 'todos-nicks') {
      const saida = {}
      for (const l of this.sql.exec('SELECT steam, nick FROM contas WHERE nick IS NOT NULL').toArray()) saida[l.steam] = l.nick
      return saida
    }
    if (!ID_STEAM.test(c.steam || '')) throw new Error('id')
    if (a === 'estado') return this.estado(c.steam, !!c.premium)
    if (a === 'nick') return this.definirNick(c.steam, c.nick, !!c.premium, !!c.admin)
    if (a === 'senha') return this.definirSenha(c.steam, String(c.senha ?? ''), c.atual == null ? null : String(c.atual))
    if (a === 'verificar') return this.verificar(c.steam, String(c.senha ?? ''))
    if (a === 'reset-senha') {
      this.sql.exec('UPDATE contas SET sal = NULL, hash = NULL, senha_em = NULL, erros = 0, bloqueio = 0 WHERE steam = ?', c.steam)
      return { ok: true }
    }
    throw new Error('acao')
  }

  estado(steam, premium) {
    const l = this.conta(steam)
    const agora = Date.now()
    const proxima = l?.nick_em ? l.nick_em + TROCA_MS : 0
    return {
      nick: l?.nick || null,
      temSenha: !!l?.hash,
      premium,
      // depois da primeira escolha: só Premium, e a cada 15 dias
      podeTrocarNick: !l?.nick || (premium && agora >= proxima),
      proximaTroca: l?.nick && proxima > agora ? proxima : 0,
    }
  }

  definirNick(steam, bruto, premium, admin) {
    const nick = String(bruto ?? '').trim().replace(/\s+/g, ' ')
    if (!NICK.test(nick) || nick.length > 20) throw new Error('nick-invalido')
    const chave = chaveDoNick(nick)
    if (chave.length < 3 || RESERVADOS.has(chave)) throw new Error(chave.length < 3 ? 'nick-invalido' : 'nick-reservado')
    const l = this.conta(steam)
    const agora = Date.now()
    if (l?.nick && !admin) {
      if (!premium) throw new Error('so-premium')
      if (agora < l.nick_em + TROCA_MS) throw Object.assign(new Error('espere'), { dados: { proximaTroca: l.nick_em + TROCA_MS }, status: 429 })
    }
    const dono = this.sql.exec('SELECT steam FROM contas WHERE chave = ?', chave).toArray()[0]
    if (dono && dono.steam !== steam) throw new Error('nick-em-uso')
    // trocar para o mesmo texto só com outra caixa/acento do próprio apelido é permitido (a chave é a mesma)
    if (l) this.sql.exec('UPDATE contas SET nick = ?, chave = ?, nick_em = ?, trocas = trocas + ? WHERE steam = ?', nick, chave, agora, l.nick ? 1 : 0, steam)
    else this.sql.exec('INSERT INTO contas (steam, nick, chave, nick_em, trocas) VALUES (?, ?, ?, ?, 0)', steam, nick, chave, agora)
    return { ...this.estado(steam, premium), nick }
  }

  async definirSenha(steam, senha, atual) {
    if (senha.length < 6 || senha.length > 64) throw new Error('senha-curta')
    if (senha.includes(steam)) throw new Error('senha-fraca')
    const l = this.conta(steam)
    if (l?.hash) {
      if (atual == null) throw new Error('senha-atual')
      await this.verificar(steam, atual) // erra: conta como tentativa e bloqueia
    }
    const sal = crypto.getRandomValues(new Uint8Array(16))
    const hash = hex(await derivar(senha, sal))
    if (l) this.sql.exec('UPDATE contas SET sal = ?, hash = ?, senha_em = ?, erros = 0, bloqueio = 0 WHERE steam = ?', hex(sal), hash, Date.now(), steam)
    else this.sql.exec('INSERT INTO contas (steam, sal, hash, senha_em) VALUES (?, ?, ?, ?)', steam, hex(sal), hash, Date.now())
    return { ok: true, temSenha: true }
  }

  async verificar(steam, senha) {
    const l = this.conta(steam)
    if (!l?.hash) throw new Error('sem-senha')
    if (!senha) throw new Error('senha-pedir') // campo vazio: só pede a senha, não conta como tentativa errada
    const agora = Date.now()
    if (l.bloqueio > agora) throw Object.assign(new Error('bloqueado'), { dados: { ate: l.bloqueio }, status: 429 })
    const calculado = hex(await derivar(senha, deHex(l.sal)))
    if (iguais(calculado, l.hash)) {
      if (l.erros) this.sql.exec('UPDATE contas SET erros = 0 WHERE steam = ?', steam)
      return { ok: true }
    }
    const erros = (l.erros || 0) + 1
    if (erros >= MAX_ERROS) {
      this.sql.exec('UPDATE contas SET erros = 0, bloqueio = ? WHERE steam = ?', agora + BLOQUEIO_MS, steam)
      throw Object.assign(new Error('bloqueado'), { dados: { ate: agora + BLOQUEIO_MS }, status: 429 })
    }
    this.sql.exec('UPDATE contas SET erros = ? WHERE steam = ?', erros, steam)
    throw Object.assign(new Error('senha-errada'), { dados: { restantes: MAX_ERROS - erros }, status: 403 })
  }
}

const objeto = (env) => env.CONTAS.get(env.CONTAS.idFromName('global'))
export const chamarContas = async (env, corpo) => {
  const r = await objeto(env).fetch('https://contas/', { method: 'POST', body: JSON.stringify(corpo) })
  return { ok: r.ok, status: r.status, dados: await r.json().catch(() => ({ erro: 'falhou' })) }
}

// Confere a senha de segurança antes de uma ação sensível (troca, anúncio no mercado). Devolve null se está certa, ou a Response de erro.
export async function exigirSenha(env, steam, senha, cors) {
  const r = await chamarContas(env, { acao: 'verificar', steam, senha: String(senha ?? '') })
  if (r.ok) return null
  return new Response(JSON.stringify(r.dados), { status: r.status === 400 ? 428 : r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } })
}
