// Mercado entre jogadores (worker: src/mercado.js): anunciar uma skin pelo preço que quiser, cancelar (volta para o inventário) e comprar.
// Quando vendem um item meu, o worker manda "mercado" pela presença (amigos.js): o evento np-mercado atualiza o sino e as listas na hora.
import { CONFIG } from './config.js'
import { tokenConta } from './conta.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')
export const EVENTO_MERCADO = 'np-mercado'

async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}${rota}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw Object.assign(new Error(d?.erro || 'falhou'), { dados: d || {} })
  return d
}

// { anuncios: [{ id, vendedor, vendedorNome, vendedorAvatar, item, preco, ref, criado }] } (ref = valor de referência do item em NP)
export const lerMercado = () => chamar('/mercado')
export const anunciarItem = (id, preco, nome, senha) => chamar('/mercado/anunciar', { id, preco, nome, senha })
export const cancelarAnuncio = (id) => chamar('/mercado/cancelar', { id })
export const comprarAnuncio = (id) => chamar('/mercado/comprar', { id })
export const avisarMercado = () => window.dispatchEvent(new Event(EVENTO_MERCADO))

// Mensagens de erro do worker -> texto para o jogador
export const erroDoMercado = (codigo) =>
  ({
    saldo: 'Você não tem Neura Pontos suficientes.',
    cheio: 'O inventário está cheio.',
    preco: 'Escolha um preço entre 1 e 10.000.000 NP.',
    'muitos-anuncios': 'Você já tem 30 itens à venda. Cancele algum para anunciar outro.',
    'nao-achou': 'Esse anúncio não está mais no mercado.',
    proprio: 'Esse anúncio é seu.',
    'item-invalido': 'Esse item não está mais no seu inventário.',
    bloqueado: 'Muitas tentativas erradas: aguarde 15 minutos e tente de novo.',
    'sem-senha': 'Crie a sua senha de segurança para continuar.',
    'senha-errada': 'Senha incorreta.',
  })[codigo] || 'Não deu agora. Tente de novo.'
