/*
 * Depósito de Neura Pontos com dinheiro de verdade e assinatura Premium, pelo Asaas (Pix e cartão). Mínimo R$ 5,00 = 2.000 NP (PAGAMENTO em loja-core.js).
 *
 *   POST /pagamentos/criar  { metodo: 'pix'|'cartao', centavos, nome, cpf, tipo?: 'sub', meses?, recorrente? }  (login)
 *        -> pix:    { id, metodo, centavos, np, pix: { payload, imagem, expira } }
 *        -> cartao: { id, metodo, centavos, np, url }   (página segura do Asaas: o cartão nunca passa por aqui)
 *   GET  /pagamentos/estado?id=...  (login)  -> { estado: 'pendente'|'pago'|'estornado', np?, saldo? }
 *   GET/POST /pagamentos/recorrencia (login) -> renovação automática da assinatura: { ativa, valor, proxima } / cancela
 *   GET  /pagamentos/planos · /pagamentos/config (login)
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
import { lerDoc, gravarDoc } from './dados.js'
import { ErroConflito, ErroNaoEncontrado, ErroPedido, ErroServico } from './erros.js'
import { exigirToken, json, lerCorpo } from './http.js'
import { PAGAMENTO, limparConfigPagamento, npDoPagamento } from './loja-core.js'
import { notificar } from './notificacoes.js'
import { pedirAoJogador, semDerrubar } from './objetos.js'
import { concederSub, revogarSub } from './perfis.js'
import { registrar } from './registro.js'

const PAGO = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
const ESTORNADO = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'])
const ID_COBRANCA = /^[A-Za-z0-9_-]{4,60}$/
const reais = (centavos) => (centavos / 100).toFixed(2).replace('.', ',')
const ambiente = (env) => (/sandbox/i.test(env.ASAAS_URL || 'sandbox') ? 'sandbox' : 'prod')

// ── Configuração (o dono edita no painel) ──
export async function lerConfigPagamento(env) {
  const salva = await lerDoc(env, 'pagamento-config')
  return (salva && limparConfigPagamento(salva).cfg) || PAGAMENTO
}

// GET/POST /admin/pagamento-config (aba Pontos do painel): { cfg } ou grava e devolve { cfg }
export async function rotaAdminPagamento(req, env, cors) {
  if (req.method === 'GET') return json({ cfg: await lerConfigPagamento(env) }, 200, cors)
  const r = limparConfigPagamento(await lerCorpo(req))
  if (r.erro) throw new ErroPedido(r.erro)
  await gravarDoc(env, 'pagamento-config', r.cfg)
  return json({ ok: true, cfg: r.cfg }, 200, cors)
}

// Planos da assinatura Premium (o dono edita na aba Assinaturas): { meses, centavos }
const PLANOS_PADRAO = [
  { meses: 1, centavos: 1500 },
  { meses: 3, centavos: 4000 },
  { meses: 6, centavos: 7500 },
  { meses: 12, centavos: 14000 },
]
export function limparPlanosSub(lista) {
  const planos = (Array.isArray(lista) ? lista : [])
    .map((x) => ({ meses: Math.round(Number(x?.meses)), centavos: Math.round(Number(x?.centavos)) }))
    .filter((x) => x.meses >= 1 && x.meses <= 60 && x.centavos >= 500 && x.centavos <= 10000000) // o Asaas não cobra menos de R$ 5,00
  const unicos = [...new Map(planos.map((x) => [x.meses, x])).values()].sort((a, b) => a.meses - b.meses).slice(0, 8)
  return unicos.length ? { planos: unicos } : { erro: 'planos' }
}
export async function lerPlanosSub(env) {
  const salvo = await lerDoc(env, 'assinatura-planos')
  return (salvo && limparPlanosSub(salvo).planos) || PLANOS_PADRAO
}
// GET/POST /admin/assinatura-planos (aba Assinaturas)
export async function rotaAdminPlanosSub(req, env, cors) {
  if (req.method === 'GET') return json({ planos: await lerPlanosSub(env) }, 200, cors)
  const r = limparPlanosSub((await lerCorpo(req)).planos)
  if (r.erro) throw new ErroPedido(r.erro)
  await gravarDoc(env, 'assinatura-planos', r.planos)
  return json({ ok: true, planos: r.planos }, 200, cors)
}

// ── Asaas ──
// Resposta de erro do Asaas: status HTTP e a lista { code, description } que ele devolve
export class ErroAsaas extends ErroServico {
  constructor(http, erros) {
    super('asaas')
    this.http = http
    this.erros = Array.isArray(erros) ? erros : []
  }
  // 4xx: o Asaas recusou o pedido (dado inválido, cliente/assinatura que não existe mais); 5xx e rede: ele falhou
  get recusado() {
    return this.http >= 400 && this.http < 500
  }
}

async function asaas(env, caminho, metodo = 'GET', corpo) {
  const base = (env.ASAAS_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '')
  let r
  try {
    r = await fetch(base + caminho, {
      method: metodo,
      headers: { access_token: env.ASAAS_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'neuraproject-site' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch (e) {
    throw new ErroServico('asaas', undefined, { indisponivel: true, causa: e })
  }
  // corpo JSON quando há (DELETE pode vir vazio; erro de proxy na frente do Asaas vem em HTML)
  const texto = await r.text()
  const d = texto && (r.headers.get('Content-Type') || '').includes('json') ? JSON.parse(texto) : null
  if (r.ok) return d
  console.error('asaas', metodo, caminho, r.status, JSON.stringify(d)?.slice(0, 400))
  // CPF recusado pelo Asaas é erro de quem digitou, não do serviço
  if (r.status === 400 && (d?.errors || []).some((x) => /cpf|cnpj/i.test(`${x.code} ${x.description}`))) throw new ErroPedido('cpf')
  throw new ErroAsaas(r.status, d?.errors)
}
// GET que pode não existir mais (assinatura cancelada lá, cliente apagado): null nesse caso; qualquer outra falha segue como erro
async function asaasSeExistir(env, caminho) {
  try {
    return await asaas(env, caminho)
  } catch (e) {
    if (e instanceof ErroAsaas && e.http === 404) return null
    throw e
  }
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

// O que o site pediu, validado: método, tipo (depósito ou assinatura), valor (do servidor), nome e CPF
async function validarPedido(env, corpo) {
  if (!env.ASAAS_API_KEY) throw new ErroServico('indisponivel', undefined, { indisponivel: true })
  const metodo = corpo.metodo === 'pix' || corpo.metodo === 'cartao' ? corpo.metodo : null
  if (!metodo) throw new ErroPedido('metodo')
  const tipo = corpo.tipo === 'sub' ? 'sub' : 'deposito'
  const cfg = await lerConfigPagamento(env)
  let centavos = Math.round(Number(corpo.centavos))
  let plano = null
  if (tipo === 'sub') {
    // assinatura: o preço sai do plano guardado no servidor, nunca do que o site mandou
    plano = (await lerPlanosSub(env)).find((x) => x.meses === Math.round(Number(corpo.meses)))
    if (!plano) throw new ErroPedido('plano')
    centavos = plano.centavos
  } else if (!Number.isFinite(centavos) || centavos < cfg.minCentavos || centavos > cfg.maxCentavos) throw new ErroPedido('valor')
  const nome = String(corpo.nome || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80)
  if (nome.split(/\s+/).filter(Boolean).length < 2) throw new ErroPedido('nome')
  if (!cpfValido(corpo.cpf)) throw new ErroPedido('cpf')
  // Renovação automática (opcional): o Asaas cobra o cartão todo mês, e cada cobrança paga soma 1 mês (conciliar). Só cartão e só o plano de 1 mês.
  const recorrente = tipo === 'sub' && corpo.recorrente === true
  if (recorrente && (metodo !== 'cartao' || plano.meses !== 1)) throw new ErroPedido('recorrencia')
  return { metodo, tipo, centavos, plano, nome, cpf: String(corpo.cpf).replace(/\D/g, ''), recorrente, np: tipo === 'sub' ? 0 : npDoPagamento(centavos, cfg) }
}

async function criar(env, quem, corpo) {
  const { metodo, tipo, centavos, plano, nome, cpf, recorrente, np } = await validarPedido(env, corpo)
  const amb = ambiente(env)
  const doJogador = (c) => pedirAoJogador(env, quem.id, { ...c, amb })
  const pode = await doJogador({ acao: 'dep-pode' }) // no máximo 5 cobranças pendentes por hora (ErroLimite)
  const novoCliente = async () => {
    const id = (await asaas(env, '/customers', 'POST', { name: nome, cpfCnpj: cpf, externalReference: quem.id, notificationDisabled: true })).id
    await doJogador({ acao: 'dep-cliente', cliente: id })
    return id
  }
  let cliente = pode.cliente || (await novoCliente())
  // O cliente guardado pode não valer mais (apagado no Asaas, ou de outro ambiente): se o Asaas recusar, cria outro e tenta uma vez
  const comCliente = async (fn) => {
    try {
      return await fn(cliente)
    } catch (e) {
      if (!(pode.cliente && e instanceof ErroAsaas && e.recusado)) throw e
      cliente = await novoCliente()
      return fn(cliente)
    }
  }

  let cobranca
  let assinaturaId = null
  if (recorrente) {
    const atual = (await doJogador({ acao: 'dep-recorrencia' })).id
    if (atual && (await asaasSeExistir(env, `/subscriptions/${atual}`))?.status === 'ACTIVE') throw new ErroConflito('ja-recorrente')
    const assinatura = await comCliente((customer) =>
      asaas(env, '/subscriptions', 'POST', { customer, billingType: 'CREDIT_CARD', value: centavos / 100, nextDueDate: hojeSP(), cycle: 'MONTHLY', description: 'Neura Project: Assinatura Premium (renovação mensal)', externalReference: `np:${quem.id}` }),
    )
    assinaturaId = assinatura.id
    // a 1ª cobrança da assinatura (o Asaas cria em seguida): é nela que o jogador digita o cartão; as seguintes saem sozinhas
    for (let t = 0; t < 4 && !cobranca; t++) {
      if (t) await new Promise((r) => setTimeout(r, 700))
      cobranca = (await asaas(env, `/subscriptions/${assinaturaId}/payments`)).data?.[0]
    }
    if (!cobranca) throw new ErroServico('asaas', { etapa: 'primeira-cobranca' })
    await doJogador({ acao: 'dep-recorrencia', set: assinaturaId })
  } else {
    const descricao = tipo === 'sub' ? `Neura Project: Assinatura Premium (${plano.meses} ${plano.meses === 1 ? 'mês' : 'meses'})` : `Neura Project: ${np.toLocaleString('pt-BR')} Neura Pontos (NP)`
    cobranca = await comCliente((customer) => asaas(env, '/payments', 'POST', { customer, billingType: metodo === 'pix' ? 'PIX' : 'CREDIT_CARD', value: centavos / 100, dueDate: hojeSP(), description: descricao, externalReference: `np:${quem.id}` }))
  }
  await doJogador({ acao: 'dep-registrar', pid: cobranca.id, centavos, np, metodo, tipo, dados: plano ? { meses: plano.meses, ...(recorrente ? { recorrente: true, assinatura: assinaturaId } : {}) } : null })
  await registrar(env, { tipo: 'pagamento', quem: quem.id, texto: `${recorrente ? 'ativou a renovação automática no cartão:' : 'criou cobrança'} ${metodo === 'pix' ? 'Pix' : 'cartão'} de R$ ${reais(centavos)} (${tipo === 'sub' ? `assinatura ${plano.meses} mês(es)` : `${np} NP`})`, dados: { pid: cobranca.id, tipo, metodo } })
  const base = { id: cobranca.id, metodo, centavos, np, tipo, recorrente }
  if (metodo === 'cartao') return { ...base, url: cobranca.invoiceUrl }
  const qr = await asaas(env, `/payments/${cobranca.id}/pixQrCode`)
  return { ...base, pix: { payload: qr.payload, imagem: qr.encodedImage, expira: qr.expirationDate || null } }
}

// Confere a cobrança no Asaas e credita (ou estorna) uma única vez. Devolve { estado, np?, saldo?, tipo?, jogador }
export async function conciliar(env, pid, donoEsperado) {
  if (!env.ASAAS_API_KEY) throw new ErroServico('indisponivel', undefined, { indisponivel: true })
  if (!ID_COBRANCA.test(String(pid))) throw new ErroPedido('pagamento')
  const c = await asaasSeExistir(env, `/payments/${encodeURIComponent(pid)}`)
  if (!c) throw new ErroNaoEncontrado('pagamento')
  // cobrança de assinatura recorrente (o Asaas gera sozinho a cada mês): o dono vem da própria assinatura
  let ref = String(c.externalReference || '')
  if (!/^np:\d{17}$/.test(ref) && c.subscription) ref = String((await asaasSeExistir(env, `/subscriptions/${encodeURIComponent(c.subscription)}`))?.externalReference || '')
  const id = /^np:(\d{17})$/.exec(ref)?.[1]
  if (!id || (donoEsperado && donoEsperado !== id)) throw new ErroNaoEncontrado('pagamento') // cobrança que não é nossa (ou de outro jogador)
  const centavos = Math.round(Number(c.value) * 100)
  const doJogador = (corpo) => pedirAoJogador(env, id, corpo)

  if (PAGO.has(c.status)) {
    // a cobrança recorrente entra na lista do jogador na primeira vez que aparece
    if (c.subscription && !(await doJogador({ acao: 'dep-ler', pid })).deposito) await doJogador({ acao: 'dep-registrar', pid, centavos, np: 0, metodo: 'cartao', tipo: 'sub', dados: { meses: 1, recorrente: true, assinatura: c.subscription } })
    const r = await doJogador({ acao: 'dep-creditar', pid, centavos })
    if (r.tipo === 'sub') {
      // assinatura paga: dá os meses uma única vez (se a entrega falhou antes, o próximo aviso tenta de novo)
      if (r.novo || r.entregue === 0) {
        const meses = Number(r.dados?.meses) || 1
        await concederSub(env, id, meses, pid)
        await doJogador({ acao: 'dep-entregue', pid })
        await registrar(env, { tipo: 'assinatura', quem: id, alvo: id, texto: `assinatura Premium paga: ${meses} mês(es), R$ ${reais(centavos)}`, dados: { pid } })
        await semDerrubar(notificar(env, id, { id: `assinatura:${pid}`, titulo: 'Assinatura Premium ativada!', texto: `${meses} mês(es) de Premium. Obrigado por apoiar a Neura!`, link: '/', quando: Date.now(), lida: false }), 'notificação de assinatura')
      }
      return { estado: r.estado, novo: r.novo, tipo: 'sub', jogador: id }
    }
    if (r.novo) {
      await registrar(env, { tipo: 'pagamento', quem: id, alvo: id, texto: `depósito pago: R$ ${reais(centavos)} → ${r.np} NP`, dados: { pid } })
      await semDerrubar(notificar(env, id, { id: `deposito:${pid}`, titulo: 'Depósito confirmado!', texto: `${r.np.toLocaleString('pt-BR')} NP já estão na sua conta.`, link: '/loja/', quando: Date.now(), lida: false }), 'notificação de depósito')
    }
    return { estado: r.estado, novo: r.novo, np: r.np, saldo: r.saldo, jogador: id }
  }
  if (ESTORNADO.has(c.status)) {
    const e = await doJogador({ acao: 'dep-estornar', pid })
    if (e.novo && e.tipo === 'sub') {
      // assinatura estornada/contestada: tira os meses que esse pagamento deu
      const meses = Number(e.dados?.meses) || 1
      const tirou = await revogarSub(env, id, meses, pid)
      await registrar(env, { tipo: 'assinatura', quem: id, alvo: id, texto: tirou ? `pagamento estornado/contestado: ${meses} mês(es) de assinatura retirados` : 'pagamento estornado/contestado, mas não achei os meses desse pagamento na assinatura: revisar à mão', dados: { pid } })
      await semDerrubar(notificar(env, id, { id: `assinatura-estorno:${pid}`, titulo: 'Assinatura Premium cancelada', texto: 'O pagamento foi estornado ou contestado, então os meses desse pagamento foram retirados.', link: '/', quando: Date.now(), lida: false }), 'notificação de estorno')
    } else if (e.novo) await registrar(env, { tipo: 'pagamento', quem: id, alvo: id, texto: 'pagamento estornado/contestado (NP retirados)', dados: { pid } })
    return { estado: 'estornado', jogador: id }
  }
  return { estado: 'pendente', status: c.status, jogador: id }
}

// Rotas com login: /pagamentos/*
export async function rotaPagamentos(req, env, quem, cors, rota, url) {
  if (rota === '/pagamentos/criar' && req.method === 'POST') {
    const corpo = await lerCorpo(req)
    try {
      return json(await criar(env, quem, corpo), 200, cors)
    } catch (e) {
      if (e instanceof ErroServico) await registrar(env, { tipo: 'erro', quem: quem.id, texto: `falha ao criar cobrança (${e.codigo})`, dados: { tipo: corpo.tipo, metodo: corpo.metodo } })
      throw e
    }
  }
  if (rota === '/pagamentos/recorrencia' && (req.method === 'GET' || req.method === 'POST')) {
    // GET: a renovação automática do jogador · POST: cancela (o Asaas para de cobrar; o mês já pago continua valendo)
    const amb = ambiente(env)
    const id = (await pedirAoJogador(env, quem.id, { acao: 'dep-recorrencia', amb })).id
    if (req.method === 'GET') {
      const a = id ? await asaasSeExistir(env, `/subscriptions/${id}`) : null
      return json({ ativa: a?.status === 'ACTIVE', valor: a?.value ?? null, proxima: a?.nextDueDate ?? null }, 200, cors)
    }
    if (!id) throw new ErroNaoEncontrado('sem-recorrencia')
    await asaas(env, `/subscriptions/${id}`, 'DELETE')
    await pedirAoJogador(env, quem.id, { acao: 'dep-recorrencia', amb, set: '' })
    await registrar(env, { tipo: 'assinatura', quem: quem.id, alvo: quem.id, texto: 'cancelou a renovação automática da assinatura' })
    return json({ ok: true }, 200, cors)
  }
  if (rota === '/pagamentos/planos' && req.method === 'GET') return json({ planos: await lerPlanosSub(env) }, 200, cors)
  if (rota === '/pagamentos/config' && req.method === 'GET') return json({ cfg: await lerConfigPagamento(env) }, 200, cors)
  if (rota === '/pagamentos/estado' && req.method === 'GET') {
    const r = await conciliar(env, url.searchParams.get('id') || '', quem.id)
    return json({ estado: r.estado, np: r.np, saldo: r.saldo, tipo: r.tipo }, 200, cors)
  }
  throw new ErroNaoEncontrado('rota')
}

// Aviso do Asaas (sem login): só vale com o token certo, e mesmo assim a cobrança é conferida direto no Asaas.
// Erro ao conciliar responde erro (o Asaas tenta de novo mais tarde).
export async function rotaWebhookAsaas(req, env) {
  if (!env.ASAAS_WEBHOOK_TOKEN) throw new ErroNaoEncontrado('rota')
  exigirToken(req.headers.get('asaas-access-token'), env.ASAAS_WEBHOOK_TOKEN)
  const { payment } = await lerCorpo(req)
  if (payment?.id && (String(payment.externalReference || '').startsWith('np:') || payment.subscription)) await conciliar(env, payment.id)
  return json({ ok: true })
}

