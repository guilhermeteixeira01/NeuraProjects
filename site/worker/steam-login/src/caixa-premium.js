import { CAIXA_PREMIUM, ehCaixaPremium } from './caixa-premium-core.js'
import { lerItem } from './dados.js'
import { subAtiva } from './perfis.js'
import { novoIdItem, limparSkins, tirarItem } from './skins.js'
import { ErroConflito, ErroPedido } from './erros.js'

// Chamado dentro da fila do jogador. Inventário, versão e recibo vão numa só gravação.
export async function entregarCaixaPremium(obj, id) {
  let recibo = await obj.ctx.storage.get('caixa-premium')
  if (!recibo) {
    if (!subAtiva((await lerItem(obj.env, 'perfis', id))?.sub)) return
    const inv = await obj.invOuVazio(id)
    if (Object.keys(inv.itens).length >= 2000) return // tenta de novo no próximo acesso
    const item = novoIdItem(), ts = Date.now()
    inv.itens[item] = { t: 'caixa', d: CAIXA_PREMIUM.id, p: 0 }
    inv.criado[item] = ts
    recibo = { item, ts }
    await obj.ctx.storage.put({ inv, invv: ((await obj.ctx.storage.get('invv')) || 0) + 1, 'caixa-premium': recibo })
  }
  if (!recibo.notificada) {
    await obj.notificar({ id: 'premium:caixa', titulo: 'Sua Caixa Premium chegou!', texto: 'Presente único da assinatura: escolha AWP Printstream, M4A1-S Printstream ou AK-47 Bloodsport.', link: `/loja/?abrir=${CAIXA_PREMIUM.id}`, imagem: CAIXA_PREMIUM.img, quando: recibo.ts, lida: false })
    await obj.ctx.storage.put('caixa-premium', { ...recibo, notificada: true })
  }
}

export async function escolherArmaPremium(obj, id, escolha) {
  const opcao = CAIXA_PREMIUM.itens.find(i => i.id === escolha)
  if (!opcao) throw new ErroPedido('escolha-premium')
  const recibo = await obj.ctx.storage.get('caixa-premium')
  if (recibo?.escolha) {
    if (recibo.escolha !== escolha) throw new ErroConflito('premium-ja-aberta')
    return { ok: true, item: recibo.arma, escolha } // repetir uma confirmação não cria outro item
  }
  const inv = await obj.invOuVazio(id)
  if (!recibo || !ehCaixaPremium(inv.itens[recibo.item])) throw new ErroConflito('sem-caixa')
  if (inv.itens[recibo.item].cadeado) throw new ErroConflito('item-trancado')
  tirarItem(inv, recibo.item)
  const item = novoIdItem()
  inv.itens[item] = { t: 'arma', d: opcao.d, p: opcao.p, l: opcao.l, f: 0.01, s: 0, st: 0, n: '', a: [null, null, null, null, null], k: null }
  inv.criado[item] = Date.now()
  await obj.ctx.storage.put({ inv: limparSkins(inv), invv: ((await obj.ctx.storage.get('invv')) || 0) + 1, 'caixa-premium': { ...recibo, escolha, arma: item, abertaEm: Date.now() } })
  return { ok: true, item, escolha }
}
