// Durable Objects: como achar cada um, como pedir uma ação e como responder lá dentro. O erro tipado atravessa a fronteira:
// o objeto responde { erro, ...dados } com o status da classe, e quem pediu recebe de volta o mesmo tipo de erro (erroDaResposta).
import { erroDaResposta } from './erros.js'
import { json, respostaDeErro } from './http.js'

export const objetoGlobal = (ns) => ns.get(ns.idFromName('global'))
// Objeto do jogador (class Loja): saldo, aberturas, depósitos, inventário de skins e notificações dele
export const objetoDoJogador = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))

// Pede uma ação ao objeto e devolve o JSON da resposta; se o objeto recusou, lança o erro tipado correspondente
export async function pedir(stub, corpo, endereco = 'https://objeto/') {
  const r = await stub.fetch(endereco, { method: 'POST', body: JSON.stringify(corpo) })
  const dados = await r.json()
  if (!r.ok) throw erroDaResposta(r.status, dados)
  return dados
}
export const pedirAoJogador = (env, id, corpo) => pedir(objetoDoJogador(env, id), { id, ...corpo })

// Dentro do objeto: roda a ação e responde em JSON (erro tipado com o status certo; bug vira 500 e vai para o log)
export async function responder(acao) {
  try {
    return json(await acao())
  } catch (e) {
    return respostaDeErro(e)
  }
}

// Uma ação de cada vez dentro do objeto. Entre um await e outro (outro objeto, crypto, fetch) o Durable Object aceita o próximo pedido;
// sem a fila, dois pedidos juntos leriam o mesmo estado e o último a gravar apagaria o outro.
export class Fila {
  ultima = Promise.resolve()

  rodar(acao) {
    const r = this.ultima.then(acao)
    this.ultima = r.then(
      () => {},
      () => {},
    )
    return r
  }
}

// Efeito que não pode derrubar a ação principal (aviso ao vivo, linha de log, notificação extra): roda, e a falha vai para o log
// com o que era, em vez de sumir.
export const semDerrubar = (promessa, oQue) => promessa.catch((e) => console.error(`${oQue} falhou:`, e))
