/*
 * Depósito de Neura Pontos com dinheiro de verdade, pelo Asaas (só Pix e cartão). Mínimo R$ 5,00 = 2.000 NP (ver PAGAMENTO em loja-core.js).
 *
 *   POST /pagamentos/criar  { metodo: 'pix'|'cartao', centavos, nome, cpf }  (login)
 *        -> pix:    { id, metodo, centavos, np, pix: { payload, imagem, expira } }
 *        -> cartao: { id, metodo, centavos, np, url }   (página segura do Asaas: o cartão nunca passa por aqui)
 *   GET  /pagamentos/estado?id=...  (login)  -> { estado: 'pendente'|'pago'|'estornado', np?, saldo? }
 *   POST /pagamentos/webhook        (Asaas)  -> avisa que uma cobrança mudou (header asaas-access-token = ASAAS_WEBHOOK_TOKEN)
 *
 * Segurança:
 *  - o valor e os NP saem do servidor; o site só escolhe quanto quer pagar (dentro do mínimo e do máximo);
 *  - quem credita é sempre uma conferência direta no Asaas (GET /payments/{id} com a nossa chave), nunca o que chega no webhook ou no navegador;
 *  - cada cobrança credita uma única vez (tabela "depositos" no objeto do jogador) e estorno/chargeback tira os NP de volta;
 *  - o CPF vai direto para o Asaas (que o exige para Pix) e não fica guardado aqui.
 *
 * Configuração (wrangler): ASAAS_URL (var; sandbox: https://api-sandbox.asaas.com/v3 · produção: https://api.asaas.com/v3),
 * segredos ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN (npx wrangler secret put ...). Sem ASAAS_API_KEY o depósito fica "indisponível".
 */
import { PAGAMENTO, npDoPagamento } from './loja-core.js'
import { pontosGanhos } from './loja.js'

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } })

const PAGO = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
const ESTORNADO = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'])

const lojaDe = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))
const chamarLoja = async (env, id, corpo) => {
  const r = await lojaDe(env, id).fetch('https://loja/', { method: 'POST', body: JSON.stringify({ id, ...corpo }) })
  const d = await r.json().catch(() => ({ erro: 'falhou' }))
  if (!r.ok || d.erro) throw new Error(d.erro || 'falhou')
  return d
}

// ── Asaas ──
async function asaas(env, caminho, metodo = 'GET', corpo) {
  const base = (env.ASAAS_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '')
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { access_token: env.ASAAS_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'neuraproject-site' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) {
    console.error('asaas', metodo, caminho, r.status, JSON.stringify(d)?.slice(0, 400))
    const msg = d?.errors?.[0]?.description || ''
    const e = new Error(/cpf|cnpj/i.test(msg) ? 'cpf' : 'asaas')
    throw e
  }
  return d
}

// CPF: 11 dígitos, dígitos verificadores certos, sem sequência repetida
export function cpfValido(valor) {
  const c = String(valor || '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

const hojeSP = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

async function criar(env, quem, corpo) {
  if (!env.ASAAS_API_KEY) return { status: 503, dados: { erro: 'indisponivel' } }
  const metodo = corpo.metodo === 'pix' ? 'pix' : corpo.metodo === 'cartao' ? 'cartao' : null
  const centavos = Math.round(Number(corpo.centavos))
  const nome = String(corpo.nome || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80)
  if (!metodo) return { status: 400, dados: { erro: 'metodo' } }
  if (!Number.isFinite(centavos) || centavos < PAGAMENTO.minCentavos || centavos > PAGAMENTO.maxCentavos) return { status: 400, dados: { erro: 'valor' } }
  if (nome.split(/\s+/).filter(Boolean).length < 2) return { status: 400, dados: { erro: 'nome' } }
  if (!cpfValido(corpo.cpf)) return { status: 400, dados: { erro: 'cpf' } }
  const cpf = String(corpo.cpf).replace(/\D/g, '')

  try {
    const pode = await chamarLoja(env, quem.id, { acao: 'dep-pode' })
    let cliente = pode.cliente
    if (!cliente) {
      cliente = (await asaas(env, '/customers', 'POST', { name: nome, cpfCnpj: cpf, externalReference: quem.id, notificationDisabled: true })).id
      await chamarLoja(env, quem.id, { acao: 'dep-cliente', cliente })
    }
    const np = npDoPagamento(centavos)
    const cobranca = await asaas(env, '/payments', 'POST', {
      customer: cliente,
      billingType: metodo === 'pix' ? 'PIX' : 'CREDIT_CARD',
      value: centavos / 100,
      dueDate: hojeSP(),
      description: `Neura Project: ${np.toLocaleString('pt-BR')} Neura Pontos (NP)`,
      externalReference: `np:${quem.id}`,
    })
    await chamarLoja(env, quem.id, { acao: 'dep-registrar', pid: cobranca.id, centavos, np, metodo })
    const base = { id: cobranca.id, metodo, centavos, np }
    if (metodo === 'cartao') return { status: 200, dados: { ...base, url: cobranca.invoiceUrl } }
    const qr = await asaas(env, `/payments/${cobranca.id}/pixQrCode`)
    return { status: 200, dados: { ...base, pix: { payload: qr.payload, imagem: qr.encodedImage, expira: qr.expirationDate || null } } }
  } catch (e) {
    const m = /^[a-z-]{2,30}$/.test(e?.message || '') ? e.message : 'falhou'
    return { status: m === 'muitos-pagamentos' ? 429 : m === 'cpf' ? 400 : 502, dados: { erro: m } }
  }
}

// Confere a cobrança no Asaas e credita (ou estorna) uma única vez. Devolve { estado, np?, saldo? }
export async function conciliar(env, pid, donoEsperado) {
  if (!env.ASAAS_API_KEY || !/^[A-Za-z0-9_-]{4,60}$/.test(String(pid))) throw new Error('pagamento')
  const c = await asaas(env, `/payments/${encodeURIComponent(pid)}`)
  const m = /^np:(\d{17})$/.exec(String(c.externalReference || ''))
  if (!m) throw new Error('pagamento') // cobrança que não é nossa
  const id = m[1]
  if (donoEsperado && donoEsperado !== id) throw new Error('pagamento')
  const centavos = Math.round(Number(c.value) * 100)
  const pontos = await pontosGanhos(env, id)
  if (PAGO.has(c.status)) {
    const r = await chamarLoja(env, id, { acao: 'dep-creditar', pid, centavos, pontos })
    if (r.novo) {
      const n = { id: `deposito:${pid}`, titulo: 'Depósito confirmado!', texto: `${r.np.toLocaleString('pt-BR')} NP já estão na sua conta.`, link: '/loja/', quando: Date.now(), lida: false }
      await chamarLoja(env, id, { acao: 'notif-sync', doc: { lista: [n], vistos: [n.id], limpoEm: 0 } }).catch(() => null)
    }
    return { estado: r.estado, novo: r.novo, np: r.np, saldo: r.saldo, jogador: id }
  }
  if (ESTORNADO.has(c.status)) {
    await chamarLoja(env, id, { acao: 'dep-estornar', pid })
    return { estado: 'estornado', jogador: id }
  }
  return { estado: 'pendente', status: c.status, jogador: id }
}

// Rotas com login: /pagamentos/criar e /pagamentos/estado
export async function rotaPagamentos(req, env, quem, cors, rota, url) {
  if (rota === '/pagamentos/criar' && req.method === 'POST') {
    const corpo = await req.json().catch(() => ({}))
    const r = await criar(env, quem, corpo || {})
    return json(r.dados, r.status, cors)
  }
  if (rota === '/pagamentos/estado' && req.method === 'GET') {
    try {
      const r = await conciliar(env, url.searchParams.get('id') || '', quem.id)
      return json({ estado: r.estado, np: r.np, saldo: r.saldo }, 200, cors)
    } catch {
      return json({ erro: 'pagamento' }, 404, cors)
    }
  }
  return json({ erro: 'rota' }, 404, cors)
}

// Aviso do Asaas (sem login): só vale com o token certo, e mesmo assim a cobrança é conferida direto no Asaas
export async function rotaWebhookAsaas(req, env) {
  const dado = new TextEncoder().encode(req.headers.get('asaas-access-token') || '')
  const certo = new TextEncoder().encode(env.ASAAS_WEBHOOK_TOKEN || '')
  let dif = dado.length ^ certo.length
  for (let i = 0; i < certo.length; i++) dif |= (dado[i] ?? 0) ^ certo[i]
  if (!env.ASAAS_WEBHOOK_TOKEN || dif !== 0) return json({ erro: 'rota' }, 404)
  const corpo = await req.json().catch(() => null)
  const pid = corpo?.payment?.id
  if (pid && String(corpo.payment.externalReference || '').startsWith('np:')) {
    try {
      await conciliar(env, pid)
    } catch (e) {
      console.error('webhook asaas', pid, e?.message)
      return json({ erro: 'falhou' }, 500) // o Asaas tenta de novo
    }
  }
  return json({ ok: true })
}
