// Primeira visita (logado): janela que não dá para fechar até a pessoa
//   1) escolher o APELIDO (único, sem palavra imprópria; só Premium troca depois, a cada 15 dias) e
//   2) criar a SENHA DE SEGURANÇA (pedida para trocar itens e para vender no mercado: evita golpe e fraude).
// Quem já tem apelido mas ainda não criou a senha cai direto no passo 2. Também abre sozinha quando uma ação pede a senha e ela não existe.
// Os campos validam ao vivo (CamposConta.jsx). TrocarNick e TrocarSenha (lá embaixo) são as janelas das Configurações.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CONFIG } from './config.js'
import { EVENTO_PEDIR_SENHA, avisarMudancaConta, definirSenha, escolherNick, textoErroConta, useSeguranca } from './seguranca.js'
import { CampoNick, CampoSenha, analisarSenha, useValidacaoNick } from './CamposConta.jsx'
import { useT } from './i18n.js'
import './boasvindas.css'

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

export default function BoasVindas() {
  const t = useT()
  const seg = useSeguranca()
  const [forcarSenha, setForcarSenha] = useState(false)

  // alguma ação (troca, mercado) pediu a senha e ela ainda não existe
  useEffect(() => {
    const abrir = () => setForcarSenha(true)
    window.addEventListener(EVENTO_PEDIR_SENHA, abrir)
    return () => window.removeEventListener(EVENTO_PEDIR_SENHA, abrir)
  }, [])

  const pendente = !seg ? null : !seg.nick ? 'nick' : !seg.temSenha ? 'senha' : null
  const passo = pendente || (forcarSenha && seg && !seg.temSenha ? 'senha' : null)
  useTravaRolagem(!!passo)
  if (!passo) return null

  return (
    <div className="bv-fundo" role="presentation">
      <div className="bv" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
        <ol className="bv-passos" aria-label={t('Etapas')}>
          <li className={passo === 'nick' ? 'ativo' : 'feito'}>
            <i>{passo === 'nick' ? '1' : '✓'}</i> {t('Apelido')}
          </li>
          <li className={passo === 'senha' ? 'ativo' : ''}>
            <i>2</i> {t('Senha de segurança')}
          </li>
        </ol>
        <div className="bv-passo" key={passo}>
          {passo === 'nick' ? (
            <FormNick
              titulo={t('Bem-vindo à Neura! Escolha o seu apelido')}
              texto={t('É o nome que os outros jogadores veem no site: nas trocas, no mercado, no lobby e nos times. Não pode ser igual ao de outra pessoa.')}
              botao={t('Confirmar apelido')}
            />
          ) : (
            <FormSenha
              titulo={t('Crie a sua senha de segurança')}
              texto={t('Ela será pedida sempre que você propor ou aceitar uma troca e quando colocar um item à venda no mercado. Assim, ninguém consegue tirar itens da sua conta nem aplicar golpe se estiver usando o seu computador.')}
              aoSalvo={() => setForcarSenha(false)}
              aoAgoraNao={forcarSenha && !pendente ? () => setForcarSenha(false) : null}
            />
          )}
        </div>
        {CONFIG.comunidade && <small className="bv-rodape">{t('Dúvidas? Fale com a gente no Discord.')}</small>}
      </div>
    </div>
  )
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
          ×
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
