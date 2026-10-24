// Notificações do sino gravadas na conta do jogador (no objeto dele: valem em todos os aparelhos). A regra de junção é a de notif-core.js.
//   GET/POST /notificacoes (login): POST { doc } junta o que o aparelho tem com o que a conta tem e devolve { doc }
import { json, lerCorpo } from './http.js'
import { pedirAoJogador } from './objetos.js'

// Uma notificação nova para o jogador: { id (único: a mesma nunca entra duas vezes), titulo, texto?, link?, imagem?, quando, lida }
export const notificar = (env, id, notif) => pedirAoJogador(env, id, { acao: 'notif-sync', doc: { lista: [notif], vistos: [notif.id], limpoEm: 0 } })

export async function rotaNotificacoes(req, env, quem, cors) {
  const doc = req.method === 'POST' ? (await lerCorpo(req)).doc : null
  return json(await pedirAoJogador(env, quem.id, { acao: 'notif-sync', doc }), 200, cors)
}
