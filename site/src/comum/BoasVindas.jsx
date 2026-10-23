// Primeira visita (logado): janela que não dá para fechar até a pessoa
//   1) escolher o APELIDO (único; só Premium troca depois, a cada 15 dias) e
//   2) criar a SENHA DE SEGURANÇA (pedida para trocar itens e para vender no mercado: evita golpe e fraude).
// Quem já tem apelido mas ainda não criou a senha cai direto no passo 2. Também abre sozinha quando uma ação pede a senha e ela não existe.
import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { EVENTO_PEDIR_SENHA, avisarMudancaConta, definirSenha, escolherNick, textoErroConta, useSeguranca } from './seguranca.js'
import { useT } from './i18n.js'
import './boasvindas.css'

const NICK_OK = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,18}[\p{L}\p{N}]$/u

export default function BoasVindas() {
  const t = useT()
  const seg = useSeguranca()
  const [passo, setPasso] = useState(null) // 'nick' | 'senha' | null
  const [nick, setNick] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [forcarSenha, setForcarSenha] = useState(false)

  // alguma ação (troca, mercado) pediu a senha e ela ainda não existe
  useEffect(() => {
    const abrir = () => setForcarSenha(true)
    window.addEventListener(EVENTO_PEDIR_SENHA, abrir)
    return () => window.removeEventListener(EVENTO_PEDIR_SENHA, abrir)
  }, [])

  const pendente = !seg ? null : !seg.nick ? 'nick' : !seg.temSenha ? 'senha' : null
  const atual = pendente || (forcarSenha && seg && !seg.temSenha ? 'senha' : null)
  useEffect(() => {
    setPasso(atual)
    if (atual) document.documentElement.classList.add('dlg-aberto')
    return () => document.documentElement.classList.remove('dlg-aberto')
  }, [atual])
  if (!passo) return null

  const enviarNick = async (e) => {
    e.preventDefault()
    const limpo = nick.trim().replace(/\s+/g, ' ')
    if (!NICK_OK.test(limpo) || limpo.length > 20) return setErro(t(textoErroConta({ message: 'nick-invalido' })))
    setOcupado(true)
    setErro('')
    try {
      await escolherNick(limpo)
      avisarMudancaConta()
    } catch (er) {
      setErro(t(textoErroConta(er)))
    } finally {
      setOcupado(false)
    }
  }
  const enviarSenha = async (e) => {
    e.preventDefault()
    if (senha.length < 6) return setErro(t(textoErroConta({ message: 'senha-curta' })))
    if (senha !== senha2) return setErro(t('As duas senhas não são iguais.'))
    setOcupado(true)
    setErro('')
    try {
      await definirSenha(senha)
      setForcarSenha(false)
      setSenha('')
      setSenha2('')
      avisarMudancaConta()
    } catch (er) {
      setErro(t(textoErroConta(er)))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="bv-fundo" role="presentation">
      <div className="bv" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
        <ol className="bv-passos" aria-label={t('Etapas')}>
          <li className={passo === 'nick' ? 'ativo' : 'feito'}>
            <i>1</i> {t('Apelido')}
          </li>
          <li className={passo === 'senha' ? 'ativo' : ''}>
            <i>2</i> {t('Senha de segurança')}
          </li>
        </ol>

        {passo === 'nick' ? (
          <form onSubmit={enviarNick}>
            <h2 id="bv-titulo">{t('Bem-vindo à Neura! Escolha o seu apelido')}</h2>
            <p>{t('É o nome que os outros jogadores veem no site: nas trocas, no mercado, no lobby e nos times. Não pode ser igual ao de outra pessoa.')}</p>
            <label className="bv-campo">
              <span>{t('Apelido')}</span>
              <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} placeholder={t('Ex.: Teixeira')} autoComplete="off" spellCheck="false" autoFocus />
              <small>{t('3 a 20 caracteres: letras, números, espaço, ponto, _ ou -.')}</small>
            </label>
            <div className="bv-aviso">
              <b>⭐ {t('Assinantes Premium')}</b>
              <span>{t('podem trocar de apelido a cada 15 dias. Para os demais, o apelido fica definitivo: pense bem antes de confirmar.')}</span>
            </div>
            {erro && (
              <p className="bv-erro" role="alert">
                {erro}
              </p>
            )}
            <button type="submit" className="bv-botao" disabled={ocupado || nick.trim().length < 3}>
              {ocupado ? t('Verificando…') : t('Confirmar apelido')}
            </button>
          </form>
        ) : (
          <form onSubmit={enviarSenha}>
            <h2 id="bv-titulo">{t('Crie a sua senha de segurança')}</h2>
            <p>{t('Ela será pedida sempre que você propor ou aceitar uma troca e quando colocar um item à venda no mercado. Assim, ninguém consegue tirar itens da sua conta nem aplicar golpe se estiver usando o seu computador.')}</p>
            <div className="bv-aviso bv-aviso-atencao">
              <b>🔒 {t('Importante')}</b>
              <span>{t('Não é a senha da Steam: nunca use a da Steam e não passe a sua para ninguém (nem para a equipe da Neura). Se esquecer, só o dono do site consegue apagar para você criar outra.')}</span>
            </div>
            <label className="bv-campo">
              <span>{t('Senha')}</span>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={64} autoComplete="new-password" autoFocus />
              <small>{t('De 6 a 64 caracteres.')}</small>
            </label>
            <label className="bv-campo">
              <span>{t('Repita a senha')}</span>
              <input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} maxLength={64} autoComplete="new-password" />
            </label>
            {erro && (
              <p className="bv-erro" role="alert">
                {erro}
              </p>
            )}
            <button type="submit" className="bv-botao" disabled={ocupado || senha.length < 6 || !senha2}>
              {ocupado ? t('Salvando…') : t('Criar senha')}
            </button>
            {forcarSenha && !pendente && (
              <button type="button" className="bv-link" onClick={() => setForcarSenha(false)}>
                {t('Agora não')}
              </button>
            )}
          </form>
        )}
        {CONFIG.comunidade && <small className="bv-rodape">{t('Dúvidas? Fale com a gente no Discord.')}</small>}
      </div>
    </div>
  )
}
