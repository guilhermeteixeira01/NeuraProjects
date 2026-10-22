// Times de jogadores (worker: src/equipes.js). Chamadas e utilidades da página "Times".
import { CONFIG } from './config.js'
import { tokenConta } from './conta.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')

async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}${rota}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || 'falhou')
  return d
}

export const lerEquipes = (q = '') => chamar(`/equipes${q ? `?q=${encodeURIComponent(q)}` : ''}`)
export const lerMeuTime = () => chamar('/equipes/meu')
export const lerChatDoTime = () => chamar('/equipes/chat')
export const acaoEquipe = (acao, corpo = {}) => chamar(`/equipes/${acao}`, corpo)
export const urlImagemEquipe = (caminho) => (caminho ? `${base()}${caminho}` : '')

// Cada permissão que um cargo pode ter (o dono tem todas)
export const PERMISSOES = [
  ['convidar', 'Convidar jogadores', 'Pode convidar jogadores para o time e cancelar convites.'],
  ['expulsar', 'Tirar membros', 'Pode tirar membros comuns do time (não quem também tem permissões).'],
  ['editar', 'Editar o time', 'Pode mudar nome, tag, descrição, imagem e deixar público ou privado.'],
  ['moderar', 'Moderar o chat', 'Pode apagar mensagens do chat do time.'],
]

export const MENSAGENS = {
  login: 'Entre com a Steam.',
  saldo: 'Você não tem NP suficientes.',
  nome: 'O nome precisa ter de 3 a 24 letras, números ou espaços.',
  tag: 'A tag tem de 2 a 5 letras ou números.',
  'nome-em-uso': 'Já existe um time com esse nome.',
  'tag-em-uso': 'Já existe um time com essa tag.',
  'ja-tem-time': 'Você já está em um time. Saia dele antes.',
  'alvo-ja-tem-time': 'Essa pessoa já está em um time.',
  privado: 'Esse time é privado: só entra com convite.',
  cheio: 'O time está cheio (50 membros).',
  jogador: 'Jogador não encontrado (ele precisa já ter entrado no site).',
  'sem-permissao': 'Você não tem permissão para isso.',
  'dono-nao-sai': 'O dono não pode sair: passe a liderança para outra pessoa ou apague o time.',
  'muitos-convites': 'Já há muitos convites pendentes.',
  'muitos-cargos': 'No máximo 12 cargos por time.',
  imagem: 'Essa imagem não serve. Use PNG, JPG ou WebP.',
  devagar: 'Devagar! Espere um instante para mandar outra mensagem.',
  'sem-time': 'Você não está em um time.',
}
export const textoErro = (e) => MENSAGENS[e?.message] || 'Não deu para fazer isso agora. Tente de novo.'

// Foto escolhida -> quadrado de 256 px em WebP (data URL), pequeno o bastante para o servidor guardar
export async function reduzirImagem(arquivo) {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falha(new Error('imagem'))
      i.src = url
    })
    const lado = Math.min(img.width, img.height)
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    cv.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256)
    for (const q of [0.85, 0.7, 0.5, 0.35]) {
      const d = cv.toDataURL('image/webp', q)
      if (d.length <= 85000) return d
    }
    throw new Error('imagem')
  } finally {
    URL.revokeObjectURL(url)
  }
}
