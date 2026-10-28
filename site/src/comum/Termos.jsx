import IconeUI from './IconeUI.jsx'
// Caixa de Termos de Uso: aparece antes do login com a Steam e só deixa continuar com a caixinha de aceite marcada.
//   if (!(await exigirTermos())) return   // true = já aceitou (esta versão) ou aceitou agora
import { useEffect, useId, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useT } from './i18n.js'
import { RESUMO_TERMOS, SECOES_TERMOS, VERSAO_TERMOS } from './termosTexto.js'
import './termos.css'

const CHAVE = 'np-termos'
const jaAceitou = () => {
  try {
    return localStorage.getItem(CHAVE) === VERSAO_TERMOS
  } catch {
    return false
  }
}
const guardar = () => {
  try {
    localStorage.setItem(CHAVE, VERSAO_TERMOS)
  } catch {
    // sem armazenamento: pergunta de novo no próximo login
  }
}

// **negrito** dentro do texto
function Texto({ s }) {
  return s.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <b key={i}>{parte}</b> : parte))
}

function CaixaTermos({ aoResponder }) {
  const t = useT()
  const [aceito, setAceito] = useState(false)
  const [fim, setFim] = useState(false)
  const corpo = useRef(null)
  const id = useId()
  useEffect(() => {
    document.documentElement.classList.add('dlg-aberto')
    const tecla = (e) => e.key === 'Escape' && aoResponder(false)
    document.addEventListener('keydown', tecla)
    const c = corpo.current
    if (c && c.scrollHeight - c.clientHeight < 8) setFim(true)
    return () => {
      document.documentElement.classList.remove('dlg-aberto')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoResponder])
  const rolou = (e) => {
    const c = e.currentTarget
    if (c.scrollTop + c.clientHeight >= c.scrollHeight - 12) setFim(true)
  }
  return (
    <div className="trm-fundo" onClick={() => aoResponder(false)}>
      <div className="trm" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onClick={(e) => e.stopPropagation()}>
        <header className="trm-cab">
          <span className="trm-icone" aria-hidden="true">
            <IconeUI tipo="escudo" tamanho={26}/>
          </span>
          <div>
            <h2 id={`${id}-t`}>{t('Termos de Uso')}</h2>
            <p>{t('Leia antes de entrar na Neura')}</p>
          </div>
          <button type="button" className="trm-x" onClick={() => aoResponder(false)} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <div className="trm-corpo" ref={corpo} onScroll={rolou} tabIndex={0}>
          <p className="trm-resumo">
            <Texto s={RESUMO_TERMOS} />
          </p>
          {SECOES_TERMOS.map((sec) => (
            <section key={sec.t} className={sec.t.startsWith('3.') ? 'trm-risco' : ''}>
              <h3>{sec.t}</h3>
              {sec.b.map((bloco, i) =>
                bloco.p ? (
                  <p key={i}>
                    <Texto s={bloco.p} />
                  </p>
                ) : (
                  <ul key={i}>
                    {bloco.ul.map((li) => (
                      <li key={li}>
                        <Texto s={li} />
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
          <p className="trm-versao">
            {t('Versão de')} {VERSAO_TERMOS.split('-').reverse().join('/')} · <a href="/termos-de-uso.pdf" target="_blank" rel="noopener">{t('Baixar em PDF')}</a>
          </p>
        </div>
        {!fim && <p className="trm-dica">{t('Role até o fim para ler tudo')} ↓</p>}
        <footer className="trm-rodape">
          <label className="trm-aceite">
            <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
            <span>{t('Li e concordo com os Termos de Uso. Entendo que tudo na Neura é virtual, que o site pode fechar e que, se eu comprar algo com dinheiro de verdade (da Neura ou de outro jogador), o risco é meu.')}</span>
          </label>
          <div className="trm-botoes">
            <button type="button" className="trm-btn" onClick={() => aoResponder(false)}>
              {t('Cancelar')}
            </button>
            <button type="button" className="trm-btn trm-btn-p" disabled={!aceito} onClick={() => aoResponder(true)}>
              {t('Aceitar e entrar com a Steam')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function exigirTermos() {
  if (jaAceitou()) return Promise.resolve(true)
  return new Promise((resolver) => {
    const no = document.createElement('div')
    document.body.appendChild(no)
    const raiz = createRoot(no)
    const aoResponder = (ok) => {
      if (ok) guardar()
      raiz.unmount()
      no.remove()
      resolver(ok)
    }
    raiz.render(<CaixaTermos aoResponder={aoResponder} />)
  })
}
