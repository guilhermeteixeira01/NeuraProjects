// Depósito de NP com Pix ou cartão (worker: src/pagamentos.js, pelo Asaas). O servidor calcula tudo; aqui só chamamos.
import { CONFIG } from './config.js'
import { tokenConta } from './conta.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')

async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}${rota}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

// metodo: 'pix' | 'cartao'. Devolve { id, metodo, centavos, np, pix: { payload, imagem, expira } } ou { ..., url }
// extra: { tipo: 'sub', meses } para assinatura (o preço sai do plano, no servidor)
export const criarPagamento = (metodo, centavos, nome, cpf, extra) => chamar('/pagamentos/criar', { metodo, centavos, nome, cpf, ...(extra || {}) })
// Planos da assinatura Premium: [{ meses, centavos }]
export const lerPlanosSub = () => chamar('/pagamentos/planos').then((d) => d.planos)
// { estado: 'pendente' | 'pago' | 'estornado', np?, saldo? }  (o servidor confere no Asaas e credita)
export const estadoPagamento = (id) => chamar(`/pagamentos/estado?id=${encodeURIComponent(id)}`)

// Configuração dos depósitos (mínimo, NP por real, pacotes e bônus): o dono muda no painel, o servidor calcula com ela
export const lerConfigPagamento = () => chamar('/pagamentos/config').then((d) => d.cfg)

export const MENSAGENS_PAGAMENTO = {
  indisponivel: 'Os depósitos ainda não estão ativos. Volte em breve!',
  valor: 'Valor fora do permitido.',
  nome: 'Digite seu nome completo (nome e sobrenome).',
  cpf: 'CPF inválido. Confira os 11 números.',
  'muitos-pagamentos': 'Você já criou várias cobranças seguidas. Espere um pouco ou pague uma das que estão abertas.',
  plano: 'Esse plano não existe mais. Feche e abra de novo.',
  asaas: 'O banco recusou a cobrança agora. Tente de novo em instantes.',
  login: 'Entre com a Steam para depositar.',
}

export const formatarCpf = (v) => {
  const d = String(v).replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
