// Notificações do sino gravadas na conta do jogador (no objeto dele: valem em todos os aparelhos). A regra de junção é a de notif-core.js.
//   GET/POST /notificacoes (login): POST { doc } junta o que o aparelho tem com o que a conta tem e devolve { doc }
import { json, lerCorpo } from './http.js'
import { pedirAoJogador } from './objetos.js'
import { chamarContas } from './contas.js'

// Uma notificação nova para o jogador: { id (único: a mesma nunca entra duas vezes), titulo, texto?, link?, imagem?, quando, lida }
export const notificar = (env, id, notif) => pedirAoJogador(env, id, { acao: 'notif-sync', doc: { lista: [notif], vistos: [notif.id], limpoEm: 0 } })

export async function rotaNotificacoes(req, env, quem, cors) {
  const doc = req.method === 'POST' ? (await lerCorpo(req)).doc : null
  let resultado = await pedirAoJogador(env, quem.id, { acao: 'notif-sync', doc, acesso:true })
  if (env.EMAIL_PRONTO === '1') {
    const conta = await chamarContas(env, { acao: 'estado', steam: quem.id })
    const prefixo = 'conta:email-pendente:'
    const agora = Date.now()
    if (conta.email) {
      // Tombstones também apagam a cópia antiga de outros aparelhos ao sincronizar.
      const avisos = resultado.doc.lista.filter(n => n.id.startsWith(prefixo))
      if (avisos.length) resultado = await pedirAoJogador(env, quem.id, { acao: 'notif-sync', doc: { lista: [], vistos: [], limpoEm: 0, removidas: Object.fromEntries(avisos.map(n => [n.id, Math.max(agora, n.quando)])) } })
    } else if (conta.nick && conta.temSenha) {
      const dia = new Date(agora - 3 * 3600000).toISOString().slice(0, 10)
      const id = prefixo + dia
      if (!resultado.doc.vistos.includes(id)) resultado = await notificar(env, quem.id, {
        id, titulo: 'Verifique seu e-mail', texto: 'Confirme seu e-mail para proteger sua conta e recuperar a senha de segurança.',
        link: '/perfil/?verificar-email=1', quando: agora, lida: false,
      })
    }
  }
  return json(resultado, 200, cors)
}
