// Primeira visita (logado): janela que não dá para fechar até a pessoa
//   1) escolher o APELIDO (único, sem palavra imprópria; só Premium troca depois, a cada 15 dias),
//   2) criar a SENHA DE SEGURANÇA (pedida para trocar itens e para vender no mercado: evita golpe e fraude) e
//   3) confirmar o E-MAIL (código de 6 dígitos): é por ele que dá pra recuperar a senha sozinho se esquecer.
// Quem já tem apelido mas não tem os outros dois cai direto no passo que falta. Também abre sozinha quando uma ação pede a senha e ela não existe.
// Os campos validam ao vivo (CamposConta.jsx). TrocarNick, TrocarSenha e RecuperarSenha (lá embaixo) são as janelas das Configurações.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CONFIG } from './config.js'
import {
  EVENTO_PEDIR_SENHA,
  avisarMudancaConta,
  confirmarRecuperacaoSenha,
  definirSenha,
  escolherNick,
  pedirEmail,
  pedirRecuperacaoSenha,
  textoErroConta,
  verificarEmail,
} from './seguranca.js'
import { CampoNick, CampoSenha, analisarSenha, useValidacaoNick } from './CamposConta.jsx'
import { useT } from './i18n.js'
import './boasvindas.css'

// Conta regressiva (segundos) pro botão de reenviar código ficar liberado de novo
function useContagem(ate) {
  const [restam, setRestam] = useState(() => Math.max(0, Math.ceil((ate - Date.now()) / 1000)))
  useEffect(() => {
    if (!ate) return
    setRestam(Math.max(0, Math.ceil((ate - Date.now()) / 1000)))
    const id = setInterval(() => setRestam((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(id)
  }, [ate])
  return restam
}

function useTravaRolagem(ativo) {
  useEffect(() => {
    if (!ativo) return
    document.documentElement.classList.add('dlg-aberto')
    return () => document.documentElement.classList.remove('dlg-aberto')
  }, [ativo])
}

// Formulário do apelido (boas-vindas e troca nas Configurações)
function FormNick({ atual = '', titulo, texto, botao, aoSalvo, aviso = true }) {
  const t = useT()
  const [nick, setNick] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [feito, setFeito] = useState(false)
  const estado = useValidacaoNick(nick, atual)
  const enviar = async (e) => {
    e.preventDefault()
    if (estado.tipo !== 'ok') return
    setOcupado(true)
    setErro('')
    try {
      await escolherNick(nick.trim().replace(/\s+/g, ' '))
      setFeito(true)
      setTimeout(() => {
        avisarMudancaConta()
        aoSalvo?.()
      }, 650)
    } catch (er) {
      setErro(t(textoErroConta(er)))
      setOcupado(false)
    }
  }
  return (
    <form onSubmit={enviar}>
      <h2 id="bv-titulo">{titulo}</h2>
      <p>{texto}</p>
      <CampoNick valor={nick} aoMudar={setNick} estado={estado} autoFocus rotulo={atual ? t('Novo apelido') : t('Apelido')} />
      {aviso && (
        <div className="bv-aviso">
          <b>⭐ {t('Assinantes Premium')}</b>
          <span>{t('podem trocar de apelido a cada 15 dias. Para os demais, o apelido fica definitivo: pense bem antes de confirmar.')}</span>
        </div>
      )}
      {erro && (
        <p className="bv-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className={`bv-botao${feito ? ' bv-feito' : ''}`} disabled={ocupado || estado.tipo !== 'ok'}>
        {feito ? `✓ ${t('Pronto!')}` : ocupado ? <i className="bv-spin" aria-label={t('Salvando…')} /> : botao}
      </button>
    </form>
  )
}

// Formulário da senha (criar na primeira visita, ou trocar: com a senha atual)
function FormSenha({ trocar = false, titulo, texto, aoSalvo, aoAgoraNao }) {
  const t = useT()
  const [atual, setAtual] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [feito, setFeito] = useState(false)
  const a = analisarSenha(senha)
  const pode = a.valida && senha === senha2 && (!trocar || atual.length > 0)
  const enviar = async (e) => {
    e.preventDefault()
    if (!pode) return
    setOcupado(true)
    setErro('')
    try {
      await definirSenha(senha, trocar ? atual : undefined)
      setFeito(true)
      setTimeout(() => {
        avisarMudancaConta()
        aoSalvo?.()
      }, 650)
    } catch (er) {
      setErro(t(textoErroConta(er)))
      setOcupado(false)
    }
  }
  return (
    <form onSubmit={enviar}>
      <h2 id="bv-titulo">{titulo}</h2>
      <p>{texto}</p>
      {!trocar && (
        <div className="bv-aviso bv-aviso-atencao">
          <b>🔒 {t('Importante')}</b>
          <span>{t('Não é a senha da Steam: nunca use a da Steam e não passe a sua para ninguém (nem para a equipe da Neura). Se esquecer, só o dono do site consegue apagar para você criar outra.')}</span>
        </div>
      )}
      {trocar && <CampoSenha valor={atual} aoMudar={setAtual} rotulo={t('Senha atual')} autoFocus autoComplete="current-password" />}
      <CampoSenha valor={senha} aoMudar={setSenha} rotulo={trocar ? t('Nova senha') : t('Senha')} autoFocus={!trocar} medidor />
      <CampoSenha valor={senha2} aoMudar={setSenha2} rotulo={t('Repita a senha')} confirmar={senha} />
      {erro && (
        <p className="bv-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className={`bv-botao${feito ? ' bv-feito' : ''}`} disabled={ocupado || !pode}>
        {feito ? `✓ ${t('Pronto!')}` : ocupado ? <i className="bv-spin" aria-label={t('Salvando…')} /> : trocar ? t('Trocar senha') : t('Criar senha')}
      </button>
      {aoAgoraNao && (
        <button type="button" className="bv-link" onClick={aoAgoraNao}>
          {t('Agora não')}
        </button>
      )}
    </form>
  )
}

// Formulário do e-mail: primeiro pede o e-mail e manda o código, depois pede o código de 6 dígitos pra confirmar.
// Usado na primeira visita (obrigatório) e nas Configurações (pra criar/trocar o e-mail).
function FormEmail({ titulo, texto, aoSalvo }) {
  const t = useT()
  const [fase, setFase] = useState('email') // 'email' | 'codigo'
  const [email, setEmail] = useState('')
  const [emailEnviado, setEmailEnviado] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [feito, setFeito] = useState(false)
  const [reenviarEm, setReenviarEm] = useState(0)
  const restam = useContagem(reenviarEm)
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const enviarEmail = async (e) => {
    e.preventDefault()
    if (!emailValido || ocupado) return
    setOcupado(true)
    setErro('')
    try {
      const r = await pedirEmail(email.trim())
      setEmailEnviado(r.emailPendente || email.trim())
      setReenviarEm(Date.now() + 60000)
      setFase('codigo')
    } catch (er) {
      setErro(t(textoErroConta(er)))
    } finally {
      setOcupado(false)
    }
  }
  const confirmarCodigo = async (e) => {
    e.preventDefault()
    if (codigo.trim().length !== 6 || ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await verificarEmail(codigo.trim())
      setFeito(true)
      setTimeout(() => {
        avisarMudancaConta()
        aoSalvo?.()
      }, 650)
    } catch (er) {
      setErro(t(textoErroConta(er)))
      setOcupado(false)
    }
  }
  const reenviar = async () => {
    if (restam > 0 || ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await pedirEmail(emailEnviado)
      setReenviarEm(Date.now() + 60000)
    } catch (er) {
      setErro(t(textoErroConta(er)))
    } finally {
      setOcupado(false)
    }
  }

  if (fase === 'codigo') {
    return (
      <form onSubmit={confirmarCodigo}>
        <h2 id="bv-titulo">{t('Confirme o seu e-mail')}</h2>
        <p>{t('Mandamos um código de 6 dígitos para {email}. Ele vale por 15 minutos.', { email: emailEnviado })}</p>
        <div className="cc-campo">
          <span className="cc-rot">{t('Código')}</span>
          <span className="cc-caixa">
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} autoFocus autoComplete="one-time-code" />
          </span>
        </div>
        {erro && (
          <p className="bv-erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" className={`bv-botao${feito ? ' bv-feito' : ''}`} disabled={ocupado || feito || codigo.trim().length !== 6}>
          {feito ? `✓ ${t('Pronto!')}` : ocupado ? <i className="bv-spin" aria-label={t('Confirmando…')} /> : t('Confirmar código')}
        </button>
        <button type="button" className="bv-link" onClick={reenviar} disabled={restam > 0 || ocupado}>
          {restam > 0 ? t('Reenviar em {n}s', { n: restam }) : t('Reenviar código')}
        </button>
        <button
          type="button"
          className="bv-link"
          onClick={() => {
            setFase('email')
            setCodigo('')
            setErro('')
          }}
        >
          {t('Trocar e-mail')}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={enviarEmail}>
      <h2 id="bv-titulo">{titulo}</h2>
      <p>{texto}</p>
      <div className="cc-campo">
        <span className="cc-rot">{t('E-mail')}</span>
        <span className="cc-caixa">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={180} autoFocus autoComplete="email" />
        </span>
      </div>
      {erro && (
        <p className="bv-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="bv-botao" disabled={ocupado || !emailValido}>
        {ocupado ? <i className="bv-spin" aria-label={t('Enviando…')} /> : t('Mandar código')}
      </button>
    </form>
  )
}

// Recuperar a senha de segurança pelo e-mail já confirmado: pede um código, depois o código + a nova senha (sem a atual)
function FormRecuperarSenha({ aoSalvo }) {
  const t = useT()
  const [fase, setFase] = useState('pedir') // 'pedir' | 'codigo'
  const [emailMascarado, setEmailMascarado] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [feito, setFeito] = useState(false)
  const [reenviarEm, setReenviarEm] = useState(0)
  const restam = useContagem(reenviarEm)
  const a = analisarSenha(senha)
  const pode = a.valida && senha === senha2 && codigo.trim().length === 6

  const pedirCodigo = async () => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      const r = await pedirRecuperacaoSenha()
      setEmailMascarado(r.email || '')
      setReenviarEm(Date.now() + 60000)
      setFase('codigo')
    } catch (er) {
      setErro(t(textoErroConta(er)))
    } finally {
      setOcupado(false)
    }
  }
  const reenviar = async () => {
    if (restam > 0 || ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await pedirRecuperacaoSenha()
      setReenviarEm(Date.now() + 60000)
    } catch (er) {
      setErro(t(textoErroConta(er)))
    } finally {
      setOcupado(false)
    }
  }
  const enviar = async (e) => {
    e.preventDefault()
    if (!pode) return
    setOcupado(true)
    setErro('')
    try {
      await confirmarRecuperacaoSenha(codigo.trim(), senha)
      setFeito(true)
      setTimeout(() => {
        avisarMudancaConta()
        aoSalvo?.()
      }, 650)
    } catch (er) {
      setErro(t(textoErroConta(er)))
      setOcupado(false)
    }
  }

  if (fase === 'pedir') {
    return (
      <div>
        <h2 id="bv-titulo">{t('Esqueci minha senha')}</h2>
        <p>{t('Vamos mandar um código de 6 dígitos para o seu e-mail confirmado. Use-o para criar uma nova senha de segurança.')}</p>
        {erro && (
          <p className="bv-erro" role="alert">
            {erro}
          </p>
        )}
        <button type="button" className="bv-botao" onClick={pedirCodigo} disabled={ocupado}>
          {ocupado ? <i className="bv-spin" aria-label={t('Enviando…')} /> : t('Mandar código por e-mail')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar}>
      <h2 id="bv-titulo">{t('Crie a nova senha')}</h2>
      <p>{t('Mandamos um código para {email}. Digite-o e escolha a nova senha.', { email: emailMascarado })}</p>
      <div className="cc-campo">
        <span className="cc-rot">{t('Código')}</span>
        <span className="cc-caixa">
          <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} autoFocus autoComplete="one-time-code" />
        </span>
      </div>
      <CampoSenha valor={senha} aoMudar={setSenha} rotulo={t('Nova senha')} medidor />
      <CampoSenha valor={senha2} aoMudar={setSenha2} rotulo={t('Repita a senha')} confirmar={senha} />
      {erro && (
        <p className="bv-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className={`bv-botao${feito ? ' bv-feito' : ''}`} disabled={ocupado || !pode}>
        {feito ? `✓ ${t('Pronto!')}` : ocupado ? <i className="bv-spin" aria-label={t('Salvando…')} /> : t('Trocar senha')}
      </button>
      <button type="button" className="bv-link" onClick={reenviar} disabled={restam > 0 || ocupado}>
        {restam > 0 ? t('Reenviar em {n}s', { n: restam }) : t('Reenviar código')}
      </button>
    </form>
  )
}

export default function BoasVindas({ seg }) {
  const t = useT()
  const [forcarSenha, setForcarSenha] = useState(false)

  // alguma ação (troca, mercado) pediu a senha e ela ainda não existe
  useEffect(() => {
    const abrir = () => setForcarSenha(true)
    window.addEventListener(EVENTO_PEDIR_SENHA, abrir)
    return () => window.removeEventListener(EVENTO_PEDIR_SENHA, abrir)
  }, [])

  // O servidor preserva quais cadastros precisam concluir a etapa obrigatória.
  const pendente = !seg ? null : !seg.nick ? 'nick' : !seg.temSenha ? 'senha' : seg.emailObrigatorio && !seg.email ? 'email' : null
  const passo = pendente || (forcarSenha && seg && !seg.temSenha ? 'senha' : null)
  useTravaRolagem(!!passo)
  if (!passo) return !seg.email && seg.emailDisponivel ? <LembreteEmail /> : null

  const numero = { nick: 1, senha: 2, email: 3 }
  const estadoPasso = (p) => (passo === p ? 'ativo' : numero[p] < numero[passo] ? 'feito' : '')

  return createPortal(
    <div className="bv-fundo" role="presentation">
      <div className="bv" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
        <ol className="bv-passos" aria-label={t('Etapas')}>
          <li className={estadoPasso('nick')}>
            <i>{estadoPasso('nick') === 'feito' ? '✓' : '1'}</i> {t('Apelido')}
          </li>
          <li className={estadoPasso('senha')}>
            <i>{estadoPasso('senha') === 'feito' ? '✓' : '2'}</i> {t('Senha de segurança')}
          </li>
          {(seg?.emailDisponivel || seg?.emailObrigatorio) && (
            <li className={estadoPasso('email')}>
              <i>3</i> {t('E-mail')}
            </li>
          )}
        </ol>
        <div className="bv-passo" key={passo}>
          {passo === 'nick' && (
            <FormNick
              titulo={t('Bem-vindo à Neura! Escolha o seu apelido')}
              texto={t('É o nome que os outros jogadores veem no site: nas trocas, no mercado, no lobby e nos times. Não pode ser igual ao de outra pessoa.')}
              botao={t('Confirmar apelido')}
            />
          )}
          {passo === 'senha' && (
            <FormSenha
              titulo={t('Crie a sua senha de segurança')}
              texto={t('Ela será pedida sempre que você propor ou aceitar uma troca e quando colocar um item à venda no mercado. Assim, ninguém consegue tirar itens da sua conta nem aplicar golpe se estiver usando o seu computador.')}
              aoSalvo={() => setForcarSenha(false)}
              aoAgoraNao={forcarSenha && !pendente ? () => setForcarSenha(false) : null}
            />
          )}
          {passo === 'email' && (
            <FormEmail
              titulo={t('Confirme o seu e-mail')}
              texto={t('É por ele que você recupera a senha de segurança sozinho(a), caso esqueça. Vamos mandar um código de 6 dígitos.')}
            />
          )}
        </div>
        {CONFIG.comunidade && <small className="bv-rodape">{t('Dúvidas? Fale com a gente no Discord.')}</small>}
      </div>
    </div>, document.body
  )
}

function LembreteEmail() {
  const t = useT()
  const [aberto, setAberto] = useState(() => new URLSearchParams(window.location.search).has('verificar-email'))
  return <>
    <aside className="bv-email-aviso" aria-label={t('Verificação de e-mail pendente')}>
      <div><strong>{t('Confirme seu e-mail para proteger sua conta')}</strong><p>{t('A confirmação permite recuperar sua senha de segurança. Você ainda não verificou seu e-mail.')}</p></div>
      <button type="button" className="bv-botao" onClick={() => setAberto(true)}>{t('Verificar e-mail')}</button>
    </aside>
    {aberto && <VerificarEmail aoFechar={() => setAberto(false)} />}
  </>
}

// Janela com X para fechar (Configurações → Conta)
function JanelaConta({ aoFechar, children }) {
  const t = useT()
  useTravaRolagem(true)
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return createPortal(
    <div className="bv-fundo" onClick={aoFechar}>
      <div className="bv" role="dialog" aria-modal="true" aria-labelledby="bv-titulo" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="bv-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="bv-passo">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function TrocarNick({ atual, aoFechar }) {
  const t = useT()
  return (
    <JanelaConta aoFechar={aoFechar}>
      <FormNick
        atual={atual}
        aviso={false}
        titulo={t('Trocar apelido')}
        texto={t('Como assinante Premium, você pode trocar de apelido uma vez a cada 15 dias. O novo nome aparece no site e no servidor.')}
        botao={t('Trocar apelido')}
        aoSalvo={aoFechar}
      />
    </JanelaConta>
  )
}

export function TrocarSenha({ aoFechar }) {
  const t = useT()
  return (
    <JanelaConta aoFechar={aoFechar}>
      <FormSenha trocar titulo={t('Trocar senha de segurança')} texto={t('Digite a senha atual e escolha a nova.')} aoSalvo={aoFechar} />
    </JanelaConta>
  )
}

// Confirmar/trocar o e-mail pelas Configurações (fora do fluxo obrigatório de boas-vindas)
export function VerificarEmail({ aoFechar }) {
  const t = useT()
  return (
    <JanelaConta aoFechar={aoFechar}>
      <FormEmail titulo={t('Confirme o seu e-mail')} texto={t('É por ele que você recupera a senha de segurança sozinho(a), caso esqueça. Vamos mandar um código de 6 dígitos.')} aoSalvo={aoFechar} />
    </JanelaConta>
  )
}

// Esqueci a senha: só aparece pra quem já tem e-mail confirmado (Configurações → Conta)
export function RecuperarSenha({ aoFechar }) {
  return (
    <JanelaConta aoFechar={aoFechar}>
      <FormRecuperarSenha aoSalvo={aoFechar} />
    </JanelaConta>
  )
}
