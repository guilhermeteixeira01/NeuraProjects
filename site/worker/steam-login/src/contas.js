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
import { ErroConflito, ErroLimite, ErroPedido, ErroPermissao, ErroSenha } from './erros.js'
import { lerCorpo } from './http.js'
import { chaveDoNick, erroDoNick } from './nick-filtro.js'
import { Fila, objetoGlobal, pedir, responder } from './objetos.js'
export { chaveDoNick }

export const DIAS_TROCA_NICK = 15
const TROCA_MS = DIAS_TROCA_NICK * 24 * 3600 * 1000
const MAX_ERROS = 5
const BLOQUEIO_MS = 15 * 60 * 1000
const ITERACOES = 100000 // o máximo que o Workers aceita no PBKDF2
const ID_STEAM = /^\d{17}$/

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
    this.fila = new Fila() // a verificação de senha espera o PBKDF2 (await): sem a fila, duas tentativas juntas contariam um erro só
  }

  fetch(req) {
    return responder(async () => {
      const corpo = await lerCorpo(req)
      return this.fila.rodar(() => this.acao(corpo))
    })
  }

  conta(steam) {
    return this.sql.exec('SELECT * FROM contas WHERE steam = ?', steam).toArray()[0] || null
  }

  async acao(c) {
    const a = c.acao
    if (a === 'nicks') {
      const ids = (Array.isArray(c.ids) ? c.ids : []).filter((x) => ID_STEAM.test(x)).slice(0, 200)
      if (!ids.length) return {}
      const linhas = this.sql.exec(`SELECT steam, nick FROM contas WHERE nick IS NOT NULL AND steam IN (${ids.map(() => '?').join(',')})`, ...ids).toArray()
      return Object.fromEntries(linhas.map((l) => [l.steam, l.nick]))
    }
    if (a === 'todos-nicks') return Object.fromEntries(this.sql.exec('SELECT steam, nick FROM contas WHERE nick IS NOT NULL').toArray().map((l) => [l.steam, l.nick]))
    if (!ID_STEAM.test(c.steam || '')) throw new ErroPedido('id')
    if (a === 'estado') return this.estado(c.steam, !!c.premium)
    if (a === 'livre') {
      // validação ao vivo do campo de apelido: o mesmo que definirNick confere, sem gravar
      const nick = String(c.nick ?? '').trim().replace(/\s+/g, ' ')
      const erro = erroDoNick(nick)
      if (erro) return { livre: false, erro }
      const dono = this.sql.exec('SELECT steam FROM contas WHERE chave = ?', chaveDoNick(nick)).toArray()[0]
      return dono && dono.steam !== c.steam ? { livre: false, erro: 'nick-em-uso' } : { livre: true, seu: !!dono }
    }
    if (a === 'nick') return this.definirNick(c.steam, c.nick, !!c.premium, !!c.admin)
    if (a === 'senha') return this.definirSenha(c.steam, String(c.senha ?? ''), c.atual == null ? null : String(c.atual))
    if (a === 'verificar') return this.verificar(c.steam, String(c.senha ?? ''))
    if (a === 'reset-senha') {
      this.sql.exec('UPDATE contas SET sal = NULL, hash = NULL, senha_em = NULL, erros = 0, bloqueio = 0 WHERE steam = ?', c.steam)
      return { ok: true }
    }
    throw new ErroPedido('acao')
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
    const invalido = erroDoNick(nick) // formato, reservado ou impróprio
    if (invalido) throw new ErroPedido(invalido)
    const chave = chaveDoNick(nick)
    const l = this.conta(steam)
    const agora = Date.now()
    if (l?.nick && !admin) {
      if (!premium) throw new ErroPermissao('so-premium')
      if (agora < l.nick_em + TROCA_MS) throw new ErroLimite('espere', { proximaTroca: l.nick_em + TROCA_MS })
    }
    const dono = this.sql.exec('SELECT steam FROM contas WHERE chave = ?', chave).toArray()[0]
    if (dono && dono.steam !== steam) throw new ErroConflito('nick-em-uso')
    // trocar para o mesmo texto só com outra caixa/acento do próprio apelido é permitido (a chave é a mesma)
    if (l) this.sql.exec('UPDATE contas SET nick = ?, chave = ?, nick_em = ?, trocas = trocas + ? WHERE steam = ?', nick, chave, agora, l.nick ? 1 : 0, steam)
    else this.sql.exec('INSERT INTO contas (steam, nick, chave, nick_em, trocas) VALUES (?, ?, ?, ?, 0)', steam, nick, chave, agora)
    return { ...this.estado(steam, premium), nick }
  }

  async definirSenha(steam, senha, atual) {
    if (senha.length < 6 || senha.length > 64) throw new ErroPedido('senha-curta')
    if (senha.includes(steam)) throw new ErroPedido('senha-fraca')
    const l = this.conta(steam)
    if (l?.hash) {
      if (atual == null) throw new ErroPedido('senha-atual')
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
    if (!l?.hash) throw new ErroSenha('sem-senha')
    if (!senha) throw new ErroSenha('senha-pedir') // campo vazio: só pede a senha, não conta como tentativa errada
    const agora = Date.now()
    if (l.bloqueio > agora) throw new ErroLimite('bloqueado', { ate: l.bloqueio })
    const calculado = hex(await derivar(senha, deHex(l.sal)))
    if (iguais(calculado, l.hash)) {
      if (l.erros) this.sql.exec('UPDATE contas SET erros = 0 WHERE steam = ?', steam)
      return { ok: true }
    }
    const erros = (l.erros || 0) + 1
    if (erros >= MAX_ERROS) {
      this.sql.exec('UPDATE contas SET erros = 0, bloqueio = ? WHERE steam = ?', agora + BLOQUEIO_MS, steam)
      throw new ErroLimite('bloqueado', { ate: agora + BLOQUEIO_MS })
    }
    this.sql.exec('UPDATE contas SET erros = ? WHERE steam = ?', erros, steam)
    throw new ErroPermissao('senha-errada', { restantes: MAX_ERROS - erros })
  }
}

// Pede uma ação ao objeto de contas (erro do objeto volta tipado)
export const chamarContas = (env, corpo) => pedir(objetoGlobal(env.CONTAS), corpo, 'https://contas/')

// Confere a senha de segurança antes de uma ação sensível (troca, anúncio no mercado); errada, faltando ou bloqueada: lança o erro tipado
export const exigirSenha = (env, steam, senha) => chamarContas(env, { acao: 'verificar', steam, senha: String(senha ?? '') })
