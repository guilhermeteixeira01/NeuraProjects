// Campos da conta com validação ao vivo, no jeito de aplicativo:
//   CampoNick:  confere o formato e as palavras impróprias na hora (no próprio navegador) e, parado de digitar, pergunta ao worker se o
//               apelido está livre (spinner → ✓ verde ou ✕ vermelho com o motivo). O botão só libera com o ✓.
//   CampoSenha: olho para mostrar/ocultar, barra de força animada e lista de requisitos que se marcam conforme a pessoa digita.
import { useEffect, useState } from 'react'
import { useT } from './i18n.js'
import { textoErroConta } from './seguranca.js'
import { erroDoNick } from '../../worker/steam-login/src/nick-filtro.js'
import './camposconta.css'
import { ErroApi, chamarApi } from './api.js'

// estado: 'vazio' | 'digitando' | 'conferindo' | 'ok' | 'erro'
export function useValidacaoNick(nick, atual = '') {
  const [estado, setEstado] = useState({ tipo: 'vazio', erro: '' })
  useEffect(() => {
    const limpo = nick.trim().replace(/\s+/g, ' ')
    if (!limpo) return setEstado({ tipo: 'vazio', erro: '' })
    if (atual && limpo === atual) return setEstado({ tipo: 'erro', erro: 'mesmo-nick' })
    const local = erroDoNick(limpo)
    if (local) return setEstado({ tipo: limpo.length < 3 ? 'digitando' : 'erro', erro: local })
    setEstado({ tipo: 'conferindo', erro: '' })
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const d = await chamarApi(`/conta/nick-livre?nick=${encodeURIComponent(limpo)}`)
        if (vivo) setEstado(d.livre ? { tipo: 'ok', erro: '' } : { tipo: 'erro', erro: d.erro || 'falhou' })
      } catch (e) {
        if (!(e instanceof ErroApi)) throw e
        if (vivo) setEstado({ tipo: 'ok', erro: '' }) // sem resposta: o worker confere de novo ao salvar
      }
    }, 450)
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [nick, atual])
  return estado
}

function IconeEstado({ tipo }) {
  if (tipo === 'conferindo') return <i className="cc-spin" aria-hidden="true" />
  if (tipo === 'ok')
    return (
      <svg className="cc-ico cc-ico-ok" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m7 12.5 3.2 3.2L17 9" />
      </svg>
    )
  if (tipo === 'erro')
    return (
      <svg className="cc-ico cc-ico-erro" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m8.5 8.5 7 7m0-7-7 7" />
      </svg>
    )
  return null
}

const MSG_NICK = {
  'mesmo-nick': 'Esse já é o seu apelido.',
  'nick-improprio': 'Esse apelido tem palavra imprópria. Escolha outro.',
}

export function CampoNick({ valor, aoMudar, estado, autoFocus = false, rotulo }) {
  const t = useT()
  const msg = estado.tipo === 'erro' ? t(MSG_NICK[estado.erro] || textoErroConta({ message: estado.erro })) : estado.tipo === 'ok' ? t('Apelido disponível!') : estado.tipo === 'conferindo' ? t('Verificando disponibilidade…') : t('3 a 20 caracteres: letras, números, espaço, ponto, _ ou -.')
  return (
    <label className={`cc-campo cc-${estado.tipo}`}>
      <span className="cc-rot">{rotulo || t('Apelido')}</span>
      <span className="cc-caixa">
        <input value={valor} onChange={(e) => aoMudar(e.target.value)} maxLength={20} autoComplete="off" spellCheck="false" autoFocus={autoFocus} aria-invalid={estado.tipo === 'erro'} />
        <span className="cc-estado">
          <IconeEstado tipo={estado.tipo} />
        </span>
      </span>
      <small className="cc-msg" key={msg} aria-live="polite">
        {msg}
      </small>
      <span className="cc-contador">{valor.trim().length}/20</span>
    </label>
  )
}

// força 0..4 e a lista de requisitos
export function analisarSenha(senha, extras = []) {
  const req = [
    ['tamanho', senha.length >= 8, 'Pelo menos 8 caracteres'],
    ['letra', /\p{Ll}/u.test(senha) && /\p{Lu}/u.test(senha), 'Letras maiúsculas e minúsculas'],
    ['numero', /\d/.test(senha), 'Pelo menos um número'],
    ['simbolo', /[^\p{L}\p{N}\s]/u.test(senha), 'Um símbolo (! @ # $ …)'],
    ...extras,
  ]
  const feitos = req.filter((r) => r[1]).length
  let forca = 0
  if (senha.length >= 6) forca = 1
  if (senha.length >= 8 && feitos >= 2) forca = 2
  if (senha.length >= 8 && feitos >= 3) forca = 3
  if (senha.length >= 10 && feitos >= 4) forca = 4
  return { req, forca, valida: senha.length >= 6 && senha.length <= 64 }
}
const NOMES_FORCA = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte']

function Olho({ aberto }) {
  return aberto ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

export function CampoSenha({ valor, aoMudar, rotulo, autoFocus = false, medidor = false, confirmar = null, autoComplete = 'new-password' }) {
  const t = useT()
  const [ver, setVer] = useState(false)
  const a = analisarSenha(valor)
  const confere = confirmar != null && valor.length > 0 ? valor === confirmar : null
  return (
    <div className={`cc-campo${confere === true ? ' cc-ok' : confere === false ? ' cc-erro' : ''}`}>
      <span className="cc-rot">{rotulo}</span>
      <span className="cc-caixa">
        <input type={ver ? 'text' : 'password'} value={valor} onChange={(e) => aoMudar(e.target.value)} maxLength={64} autoComplete={autoComplete} autoFocus={autoFocus} spellCheck="false" />
        {confere != null && (
          <span className="cc-estado">
            <IconeEstado tipo={confere ? 'ok' : 'erro'} />
          </span>
        )}
        <button type="button" className="cc-olho" onClick={() => setVer((v) => !v)} aria-label={ver ? t('Ocultar senha') : t('Mostrar senha')} aria-pressed={ver} title={ver ? t('Ocultar senha') : t('Mostrar senha')}>
          <Olho aberto={!ver} />
        </button>
      </span>
      {medidor && (
        <>
          <span className={`cc-forca cc-forca-${valor ? a.forca : 'x'}`} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={valor && i < Math.max(1, a.forca) ? 'on' : ''} />
            ))}
          </span>
          <small className="cc-msg">
            {valor ? (
              <>
                {t('Força')}: <b>{t(NOMES_FORCA[a.forca])}</b>
              </>
            ) : (
              t('De 6 a 64 caracteres.')
            )}
          </small>
          <ul className="cc-req">
            {a.req.map(([id, ok, texto]) => (
              <li key={id} className={ok ? 'ok' : ''}>
                <i aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="m6 12.5 4 4L18 8" />
                  </svg>
                </i>
                {t(texto)}
              </li>
            ))}
          </ul>
        </>
      )}
      {confere === false && <small className="cc-msg cc-msg-erro">{t('As duas senhas não são iguais.')}</small>}
      {confere === true && <small className="cc-msg cc-msg-ok">{t('As senhas conferem.')}</small>}
    </div>
  )
}
