import { ErroConflito, ErroNaoEncontrado } from './erros.js'
import { novoIdItem } from './skins.js'
import { docVazio, juntar } from './notif-core.js'

import { estadoDiario } from './diario-core.js'

export async function diarioDoJogador(obj, id, acao, caixas) {
  const s = (await obj.ctx.storage.get('diario')) || {}
  const estado = estadoDiario(s)
  const caixa = caixas.find(c => c.slug === 'caixa-diaria' && c.ativa)
  if (!caixa) throw new ErroNaoEncontrado('caixa')
  let inv = await obj.invOuVazio(id)
  const dados = { ...s }, gravar = {}
  let recebido = false
  if (acao === 'diario-pontos' && !estado.pontosResgatados) {
    dados.pontosDia = estado.dia; dados.sequencia = estado.sequencia
    gravar['diario-np'] = ((await obj.ctx.storage.get('diario-np')) || 0) + estado.pontos
    recebido = true
  }
  if (acao === 'diario-caixa' && !estado.caixaResgatada) {
    if (Object.keys(inv.itens).length >= 2000) throw new ErroConflito('cheio')
    const item = novoIdItem()
    inv.itens[item] = { t: 'caixa', d: caixa.id, p: 0 }; inv.criado[item] = Date.now()
    gravar.inv = inv; gravar.invv = ((await obj.ctx.storage.get('invv')) || 0) + 1
    dados.caixaDia = estado.dia; recebido = true
  }
  if (recebido) {
    const n = { id: `${acao}:${estado.dia}`, titulo: acao === 'diario-pontos' ? `Resgate diário: +${estado.pontos} NP` : 'Você recebeu a Caixa Diária', texto: 'Seu prêmio diário já está disponível na conta.', link: acao === 'diario-pontos' ? '/loja/' : `/loja/?abrir=${caixa.id}`, quando: Date.now(), lida: false }
    gravar.diario = dados
    gravar.notifs = juntar((await obj.ctx.storage.get('notifs')) || docVazio(), { lista: [n], vistos: [n.id], limpoEm: 0 })
    // Recibo, pontos, caixa e aviso são gravados juntos; a fila da Loja impede resgates concorrentes.
    await obj.ctx.storage.put(gravar)
  }
  return { ...estadoDiario(dados), recebido, caixa: { id: caixa.id, nome: caixa.nome, img: caixa.img, slug: caixa.slug }, caixasDisponiveis: Object.values(inv.itens).filter(i => i.t === 'caixa' && i.d === caixa.id).length }
}
