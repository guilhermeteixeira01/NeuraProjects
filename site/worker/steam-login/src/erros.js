// Erros da API. Toda falha esperada (pedido inválido, sem permissão, saldo insuficiente, serviço de fora caiu...) é lançada como uma
// subclasse de ErroApi: o código vai para o site ({ erro: código, ...dados }), que traduz a mensagem, e a classe define o status HTTP.
// Qualquer outra exceção é bug: vira 500 "falhou" e vai para o log (http.js: respostaDeErro). Nada de adivinhar pelo texto da mensagem.

export class ErroApi extends Error {
  /** @param {string} codigo  código curto que o site entende (ex.: 'saldo', 'nao-achou')
   *  @param {Record<string, unknown>} [dados]  campos extras da resposta (ex.: { restantes: 3 }) */
  constructor(codigo, dados) {
    super(codigo)
    this.name = new.target.name
    this.codigo = codigo
    this.dados = dados
  }

  /** @type {number} */
  get status() {
    return 400
  }
}

// 400: o pedido veio com dados inválidos (corpo, id, valor fora do limite...)
export class ErroPedido extends ErroApi {}

// 401: sem login, login vencido ou token de serviço errado
export class ErroLogin extends ErroApi {
  get status() {
    return 401
  }
}

// 403: logado, mas sem permissão para isso
export class ErroPermissao extends ErroApi {
  get status() {
    return 403
  }
}

// 404: o que foi pedido não existe (rota, anúncio, proposta, time...)
export class ErroNaoEncontrado extends ErroApi {
  get status() {
    return 404
  }
}

// 409: o estado atual não permite (saldo, inventário cheio, item já mudou, nome em uso...)
export class ErroConflito extends ErroApi {
  get status() {
    return 409
  }
}

// 428: a ação pede a senha de segurança (falta digitar ou falta criar)
export class ErroSenha extends ErroApi {
  get status() {
    return 428
  }
}

// 429: devagar (muitas tentativas, muitas cobranças, mensagens seguidas)
export class ErroLimite extends ErroApi {
  get status() {
    return 429
  }
}

// 502/503: um serviço de fora (KV, Steam, Asaas, VPS do servidor, site) não respondeu como deveria
export class ErroServico extends ErroApi {
  /** @param {string} codigo  @param {Record<string, unknown>} [dados]  @param {{ indisponivel?: boolean, causa?: unknown }} [opcoes] */
  constructor(codigo, dados, { indisponivel = false, causa } = {}) {
    super(codigo, dados)
    this.indisponivel = indisponivel // 503 (fora do ar / limite do plano) em vez de 502 (resposta ruim)
    if (causa !== undefined) this.cause = causa
  }

  get status() {
    return this.indisponivel ? 503 : 502
  }
}

const POR_STATUS = { 400: ErroPedido, 401: ErroLogin, 403: ErroPermissao, 404: ErroNaoEncontrado, 409: ErroConflito, 428: ErroSenha, 429: ErroLimite }

// Refaz o erro tipado a partir da resposta de outro objeto (Durable Object) ou serviço que fala o mesmo formato { erro, ...dados }.
export function erroDaResposta(status, corpo) {
  const { erro, ...dados } = corpo && typeof corpo === 'object' ? corpo : {}
  const codigo = typeof erro === 'string' && erro ? erro : 'falhou'
  const extra = Object.keys(dados).length ? dados : undefined
  if (status === 500) return new Error(`erro interno do objeto: ${codigo}`) // bug do outro lado: segue como bug (500 e log)
  if (status > 500) return new ErroServico(codigo, extra, { indisponivel: status === 503 })
  const Classe = POR_STATUS[status] || ErroPedido
  return new Classe(codigo, extra)
}
