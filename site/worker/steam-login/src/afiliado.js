import { chamarContas } from './contas.js'
import { ErroPedido } from './erros.js'
import { json } from './http.js'
import { pedirAoJogador } from './objetos.js'
import { nomesDe } from './usuarios.js'
import { mandarPara } from './amigos.js'

export async function concluirAfiliacao(env, steam) {
  const convite = await chamarContas(env, { acao: 'afiliado-elegivel', steam })
  if (!convite) return
  await pedirAoJogador(env, convite.convidante, { acao: 'afiliado-recompensar', convidado: steam })
  await chamarContas(env, { acao: 'afiliado-confirmar', steam })
  await mandarPara(env, [convite.convidante], { tipo: 'bonus' })
}

export async function rotaAfiliado(req, env, quem, cors) {
  if (req.method !== 'GET') throw new ErroPedido('metodo')
  let d = await chamarContas(env, { acao: 'afiliado-lista', steam: quem.id })
  await concluirAfiliacao(env, quem.id)
  // Retoma entregas interrompidas sem duplicar NP ou caixa.
  for (const id of d.pendentes) await concluirAfiliacao(env, id)
  d = await chamarContas(env, { acao: 'afiliado-lista', steam: quem.id })
  const nomes = await nomesDe(env, d.lista.map(p => p.id))
  return json({ cadastrados: d.cadastrados, premios: d.premios, np: 1000, caixa: 'Caixa Facas', lista: d.lista.map(p => ({ ...p, ...nomes[p.id] })) }, 200, { ...cors, 'Cache-Control': 'no-store' })
}
