// Retira somente caixas descontinuadas, incluindo referências auxiliares. Nunca altera NP.
export function removerCaixasAntigas(inv, ids) {
  if (!inv?.itens) return 0
  const removidas = new Set(ids.map(Number))
  let total = 0
  for (const [id, item] of Object.entries(inv.itens)) {
    if (item.t !== 'caixa' || !removidas.has(Number(item.d))) continue
    delete inv.itens[id]
    if (inv.criado) delete inv.criado[id]
    for (const lado of Object.keys(inv.equip || {})) {
      inv.equip[lado] = Object.fromEntries(Object.entries(inv.equip[lado]).filter(([, v]) => v !== id))
    }
    inv.presentes = (inv.presentes || []).filter((p) => p.i !== id)
    total++
  }
  return total
}
