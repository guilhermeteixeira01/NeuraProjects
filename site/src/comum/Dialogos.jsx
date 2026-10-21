// Caixas de aviso do site (no lugar de confirm()/prompt() do navegador): confirmar(texto) e perguntar(texto) devolvem uma Promise.
//   if (!(await confirmar('Apagar?', { perigo: true, ok: 'Apagar' }))) return
//   const nome = await perguntar('Nome da caixa nova:')   // string, ou null se cancelou
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useT } from './i18n.js'
import './dialogos.css'

function Caixa({ texto, titulo, ok, cancelar, perigo, campo, aoResponder }) {
  const t = useT()
  const [valor, setValor] = useState('')
  const entrada = useRef(null)
  useEffect(() => {
    document.documentElement.classList.add('dlg-aberto')
    entrada.current?.focus()
    const tecla = (e) => {
      if (e.key === 'Escape') aoResponder(campo ? null : false)
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.documentElement.classList.remove('dlg-aberto')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoResponder, campo])
  const confirmar = () => aoResponder(campo ? valor : true)
  return (
    <div className="dlg-fundo" onClick={() => aoResponder(campo ? null : false)}>
      <div className={`dlg${perigo ? ' dlg-perigo' : ''}`} role="alertdialog" aria-modal="true" aria-label={titulo || texto} onClick={(e) => e.stopPropagation()}>
        {titulo && <h3>{titulo}</h3>}
        <p>{texto}</p>
        {campo && (
          <input
            ref={entrada}
            className="dlg-campo"
            value={valor}
            maxLength={60}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valor.trim() && confirmar()}
          />
        )}
        <div className="dlg-botoes">
          <button type="button" className="dlg-btn" onClick={() => aoResponder(campo ? null : false)}>
            {cancelar || t('Cancelar')}
          </button>
          <button type="button" className={`dlg-btn ${perigo ? 'dlg-btn-perigo' : 'dlg-btn-p'}`} disabled={campo && !valor.trim()} onClick={confirmar}>
            {ok || t('Continuar')}
          </button>
        </div>
      </div>
    </div>
  )
}

function abrir(props) {
  return new Promise((resolver) => {
    const no = document.createElement('div')
    document.body.appendChild(no)
    const raiz = createRoot(no)
    const aoResponder = (r) => {
      raiz.unmount()
      no.remove()
      resolver(r)
    }
    raiz.render(<Caixa {...props} aoResponder={aoResponder} />)
  })
}

export const confirmar = (texto, opcoes = {}) => abrir({ texto, ...opcoes })
export const perguntar = (texto, opcoes = {}) => abrir({ texto, campo: true, ...opcoes }).then((v) => (v == null ? null : String(v).trim() || null))
