// Depósito de NP com Pix ou cartão (worker: src/pagamentos.js, pelo Asaas). O servidor calcula tudo; aqui só chamamos.
import { ErroApi, chamarApi } from './api.js'

const chamar = chamarApi

// metodo: 'pix' | 'cartao'. Devolve { id, metodo, centavos, np, pix: { payload, imagem, expira } } ou { ..., url }
// extra: { tipo: 'sub', meses } para assinatura (o preço sai do plano, no servidor)
// extra: { tipo: 'sub', meses, recorrente? } para assinatura (o preço sai do plano, no servidor)
export const criarPagamento = (metodo, centavos, nome, cpf, extra) => chamar('/pagamentos/criar', { metodo, centavos, nome, cpf, ...(extra || {}) })
// Planos da assinatura Premium: [{ meses, centavos }]
// Renovação automática no cartão: { ativa, valor, proxima } · cancelar para de cobrar (o mês já pago continua)
export const lerRecorrencia = () => chamar('/pagamentos/recorrencia')
export const cancelarRecorrencia = () => chamar('/pagamentos/recorrencia', {})
export const lerPlanosSub = () => chamar('/pagamentos/planos').then((d) => (Array.isArray(d?.planos) ? d.planos : []))
// { estado: 'pendente' | 'pago' | 'estornado', np?, saldo? }  (o servidor confere no Asaas e credita)
export const estadoPagamento = (id) => chamar(`/pagamentos/estado?id=${encodeURIComponent(id)}`)

// Configuração dos depósitos (mínimo, NP por real, pacotes e bônus): o dono muda no painel, o servidor calcula com ela
export const lerConfigPagamento = () => chamar('/pagamentos/config').then((d) => {
  // resposta sem a config (servidor antigo ou prévia local): o Deposito fica com os valores de fábrica
  if (!Array.isArray(d?.cfg?.pacotes) || !d.cfg.pacotes.length) throw new ErroApi('config')
  return d.cfg
})

export const MENSAGENS_PAGAMENTO = {
  indisponivel: 'Os depósitos ainda não estão ativos. Volte em breve!',
  valor: 'Valor fora do permitido.',
  nome: 'Digite seu nome completo (nome e sobrenome).',
  cpf: 'CPF inválido. Confira os 11 números.',
  'muitos-pagamentos': 'Você já criou várias cobranças seguidas. Espere um pouco ou pague uma das que estão abertas.',
  plano: 'Esse plano não existe mais. Feche e abra de novo.',
  recorrencia: 'A renovação automática só vale no cartão e no plano de 1 mês.',
  'ja-recorrente': 'Você já tem a renovação automática ativa.',
  asaas: 'O banco recusou a cobrança agora. Tente de novo em instantes.',
  login: 'Entre com a Steam para depositar.',
}

export const formatarCpf = (v) => {
  const d = String(v).replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
