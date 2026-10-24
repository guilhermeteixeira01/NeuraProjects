// Acesso ao KV MOLDURAS. Hoje ele guarda só o que não precisa de transação: as páginas de partida recém-jogadas (com validade) e os
// formatos antigos, lidos uma vez para migrar (perfis, usuarios, config... -> objeto Dados; skins:<id> -> objeto do jogador; amigos -> Presenca).
// Uma falha do KV nunca vira "vazio": quem chamou recebe ErroServico e nada é gravado em cima do que existe.
import { ErroServico } from './erros.js'

// O KV só diz que o limite do plano estourou pelo texto da mensagem: este é o único lugar que olha para ele
function falhaDoKv(e) {
  const limite = /limit exceeded/i.test(String(e?.message))
  return new ErroServico(limite ? 'limite-diario' : 'banco', undefined, { indisponivel: true, causa: e })
}

async function noKv(operacao) {
  try {
    return await operacao()
  } catch (e) {
    throw falhaDoKv(e)
  }
}

export const lerTextoKv = (env, chave) => noKv(() => env.MOLDURAS.get(chave, 'text'))

export async function lerJsonKv(env, chave, padrao = null) {
  const texto = await lerTextoKv(env, chave)
  return texto == null ? padrao : JSON.parse(texto)
}

export const gravarKv = (env, chave, valor, opcoes) => noKv(() => env.MOLDURAS.put(chave, typeof valor === 'string' ? valor : JSON.stringify(valor), opcoes))

export const apagarKv = (env, chave) => noKv(() => env.MOLDURAS.delete(chave))

// Todas as chaves com o prefixo (o KV devolve de 1.000 em 1.000)
export async function listarKv(env, prefixo) {
  const nomes = []
  let cursor
  do {
    const r = await noKv(() => env.MOLDURAS.list({ prefix: prefixo, cursor }))
    for (const k of r.keys) nomes.push(k.name)
    cursor = r.list_complete ? undefined : r.cursor
  } while (cursor)
  return nomes
}
