// Conta do jogador: apelido único e senha de segurança (worker: src/contas.js).
//   • O apelido é escolhido na primeira visita (janela BoasVindas). Depois só assinante Premium troca, a cada 15 dias.
//   • A senha de segurança é pedida para propor/aceitar troca e para colocar item à venda no mercado (evita golpe e fraude).
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { tokenConta, useConta } from './conta.js'
import { perguntarSenha } from './Dialogos.jsx'
import { traduzir } from './i18n.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')
export const EVENTO_SEGURANCA = 'np-seguranca' // a janela de boas-vindas (ou Configurações) mudou algo: quem usa o estado relê
export const EVENTO_PEDIR_SENHA = 'np-pedir-senha' // alguém precisa criar a senha agora (ação bloqueada por falta dela)

async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token || !CONFIG.loginSteam) throw new Error('login')
  const r = await fetch(`${base()}${rota}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw Object.assign(new Error(d?.erro || 'falhou'), { dados: d || {} })
  return d
}

export const lerSeguranca = () => chamar('/conta/seguranca')
export const escolherNick = (nick) => chamar('/conta/nick', { nick })
export const definirSenha = (senha, atual) => chamar('/conta/senha', atual == null ? { senha } : { senha, atual })

const quando = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
const minutos = (ate) => Math.max(1, Math.ceil((ate - Date.now()) / 60000))

// Texto (em português) de cada erro das rotas de conta; passe por t() na tela
export function textoErroConta(e) {
  const c = e?.message
  const d = e?.dados || {}
  if (c === 'senha-errada') return `Senha incorreta. Tentativas restantes: ${d.restantes ?? '?'}.`
  if (c === 'bloqueado') return `Muitas tentativas erradas. Tente de novo em ${d.ate ? minutos(d.ate) : 15} minutos.`
  if (c === 'espere') return `Você já trocou o apelido há pouco. A próxima troca é em ${d.proximaTroca ? quando(d.proximaTroca) : '15 dias'}.`
  return (
    {
      'nick-invalido': 'O apelido precisa ter de 3 a 20 caracteres: letras, números, espaço, ponto, _ ou -.',
      'nick-em-uso': 'Esse apelido já está em uso. Escolha outro.',
      'nick-reservado': 'Esse apelido não pode ser usado. Escolha outro.',
      'so-premium': 'Só assinantes Premium trocam de apelido (uma vez a cada 15 dias).',
      'senha-curta': 'A senha precisa ter de 6 a 64 caracteres.',
      'senha-fraca': 'Escolha uma senha que não tenha o seu ID da Steam.',
      'senha-atual': 'Digite a senha atual para trocar a senha.',
      'senha-pedir': 'Digite a sua senha de segurança.',
      'sem-senha': 'Você ainda não criou a sua senha de segurança.',
      login: 'Seu login venceu. Entre de novo com a Steam.',
    }[c] || 'Não deu agora. Tente de novo.'
  )
}

// Estado da conta logada: { nick, temSenha, premium, podeTrocarNick, proximaTroca } (null enquanto carrega ou sem login)
export function useSeguranca() {
  const conta = useConta()
  const [estado, setEstado] = useState(null)
  const id = conta?.id
  useEffect(() => {
    if (!id) return setEstado(null)
    let vivo = true
    const ler = () =>
      lerSeguranca()
        .then((d) => vivo && setEstado(d))
        .catch(() => {})
    ler()
    window.addEventListener(EVENTO_SEGURANCA, ler)
    return () => {
      vivo = false
      window.removeEventListener(EVENTO_SEGURANCA, ler)
    }
  }, [id])
  return estado
}

export const avisarMudancaConta = () => window.dispatchEvent(new CustomEvent(EVENTO_SEGURANCA))

// Roda uma ação que exige a senha de segurança: pede a senha numa caixinha e tenta de novo se estiver errada.
//   const r = await comSenha('Para propor a troca, digite a sua senha de segurança.', (senha) => chamar('/trocas', { ...corpo, senha }))
// Devolve { cancelado: true } se a pessoa fechou a caixinha; os outros erros (sem senha criada, bloqueio…) saem como exceção.
export async function comSenha(motivo, executar) {
  let aviso = ''
  for (;;) {
    const senha = await perguntarSenha(aviso ? `${traduzir(motivo)}\n\n⚠ ${traduzir(aviso)}` : traduzir(motivo), { titulo: traduzir('Senha de segurança'), ok: traduzir('Confirmar') })
    if (senha == null) return { cancelado: true }
    try {
      return { dados: await executar(senha) }
    } catch (e) {
      if (e?.message === 'senha-errada') {
        aviso = textoErroConta(e)
        continue
      }
      if (e?.message === 'sem-senha') window.dispatchEvent(new CustomEvent(EVENTO_PEDIR_SENHA)) // abre a criação da senha
      throw e
    }
  }
}
