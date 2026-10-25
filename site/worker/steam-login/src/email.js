// Envio de e-mail (Resend): confirmação de e-mail e recuperação da senha de segurança (src/contas.js).
// Segredo: npx wrangler secret put RESEND_API_KEY. Sem ele, enviarEmail falha com ErroServico (indisponível).
import { ErroServico } from './erros.js'

const REMETENTE = 'Neura Project <naoresponda@neuraproject.com.br>'

export async function enviarEmail(env, { para, assunto, html }) {
  if (!env.RESEND_API_KEY) throw new ErroServico('indisponivel', undefined, { indisponivel: true })
  let r
  try {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html }),
    })
  } catch (e) {
    throw new ErroServico('email', undefined, { indisponivel: true, causa: e })
  }
  if (!r.ok) {
    const texto = await r.text().catch(() => '')
    console.error('resend', r.status, texto.slice(0, 300))
    throw new ErroServico('email', undefined, { indisponivel: r.status >= 500 })
  }
}

// 6 dígitos (sempre com zeros à esquerda se precisar)
export const codigoAleatorio = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')

// E-mail parcialmente escondido pra confirmar sem reexibir inteiro: "te***a@gmail.com"
export function mascararEmail(email) {
  const [usuario, dominio] = String(email).split('@')
  if (!dominio) return email
  const visivel = usuario.slice(0, Math.min(2, usuario.length))
  return `${visivel}${'*'.repeat(Math.max(1, usuario.length - visivel.length))}@${dominio}`
}

const modeloCodigo = (codigo, titulo) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;padding:28px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 14px;font-size:20px">${titulo}</h2>
  <p style="margin:0 0 22px;color:#555;line-height:1.5">Use o código abaixo no site da Neura Project. Ele vale por 15 minutos.</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:10px;text-align:center;background:#f4f4f6;border-radius:10px;padding:18px 0;margin:0 0 22px">${codigo}</div>
  <p style="margin:0;color:#999;font-size:12px;line-height:1.5">Se não foi você quem pediu, pode ignorar este e-mail: sua conta continua segura.</p>
</div>`

export const emailVerificacao = (codigo) => modeloCodigo(codigo, 'Confirme o seu e-mail')
export const emailRecuperacao = (codigo) => modeloCodigo(codigo, 'Recuperar a sua senha de segurança')
