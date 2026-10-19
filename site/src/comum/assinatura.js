// Assinatura Premium: emblema no canto superior direito do avatar, que evolui com o tempo de assinatura.
//
// Dado de cada jogador (perfis[steamId].sub, gravado pelo painel admin → aba Assinaturas; depois a API/banco de pagamentos vai
// escrever o mesmo formato):
//   { inicio: ms, meses: n, expira: ms | null }
//   meses  = meses de assinatura acumulados (a cada renovação de 1 mês soma 1)
//   expira = quando vence a assinatura; null = SEM DATA: assinatura infinita (não vence)
//   Vencida (expira no passado) = sem emblema. Sem data (infinita), o tempo corre sozinho desde o `inicio`: os meses contados são
//   o maior entre `meses` e os meses inteiros passados desde o início, e o emblema evolui sem ninguém renovar.
//
// Nível = o mais alto cujo tempo mínimo (em meses) o jogador já atingiu. O Subscriber é o 1º mês (qualquer assinatura ativa); os
// outros têm o tempo editável no painel (config.subMeses; padrão abaixo, o mesmo do worker: SUB_MESES_PADRAO em src/index.js).
//
// Imagens em public/assets/sub/<id>.webp (sem fundo, 128 x 128). Diamond, Elite e Legend são animadas; para elas existe também
// <id>-parado.webp (1º quadro), usada com "Melhorar desempenho" ou movimento reduzido. Geradas por ferramentas/sub/processar.mjs.

export const NIVEIS_SUB = [
  { id: 'subscriber', nome: 'Subscriber', animado: false },
  { id: 'gold', nome: 'Gold', animado: false },
  { id: 'platinum', nome: 'Platinum', animado: false },
  { id: 'diamond', nome: 'Diamond', animado: true },
  { id: 'elite', nome: 'Elite', animado: true },
  { id: 'legend', nome: 'Legend', animado: true },
]

// Meses de assinatura que cada nível exige (o Subscriber não aparece: é o 1º mês). Editável no painel.
export const SUB_MESES_PADRAO = { gold: 3, platinum: 6, diamond: 12, elite: 18, legend: 24 }

export const tituloNivel = (nivel) => `Premium ${nivel.nome}`
export const urlEmblema = (id, parado = false) => {
  const n = NIVEIS_SUB.find((x) => x.id === id)
  return `/assets/sub/${id}${n?.animado && parado ? '-parado' : ''}.webp`
}

const MES_MS = 30.4375 * 24 * 3600 * 1000 // mês médio, para contar meses inteiros desde o início
export const mesesDesde = (inicio, agora = Date.now()) => (inicio > 0 ? Math.max(0, Math.floor((agora - inicio) / MES_MS)) : 0)

// Soma 1 mês de calendário a uma data (ms); mantém o dia, ou o último dia do mês quando ele não existe (31 → 28/29/30)
export function maisUmMes(ms) {
  const d = new Date(ms)
  const dia = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return d.getTime()
}

// Estado da assinatura: null (sem assinatura ou vencida) ou { ...nivel, meses, infinita, expira, proximo, faltam }
//   proximo = o próximo nível (null no último) e faltam = meses que faltam para ele
export function nivelDaSub(sub, subMeses = SUB_MESES_PADRAO, agora = Date.now()) {
  if (!sub || typeof sub !== 'object') return null
  const infinita = sub.expira == null
  if (!infinita && !(Number(sub.expira) > agora)) return null // vencida
  const base = Math.max(0, Math.floor(Number(sub.meses) || 0))
  const meses = infinita ? Math.max(base, mesesDesde(Number(sub.inicio), agora)) : base
  const minimo = (n) => (n.id === 'subscriber' ? 0 : Number(subMeses?.[n.id]) || SUB_MESES_PADRAO[n.id])
  let i = 0
  NIVEIS_SUB.forEach((n, k) => {
    if (meses >= minimo(n)) i = k
  })
  const proximo = NIVEIS_SUB[i + 1] || null
  return { ...NIVEIS_SUB[i], meses, infinita, expira: infinita ? null : Number(sub.expira), proximo, faltam: proximo ? Math.max(0, minimo(proximo) - meses) : 0 }
}
