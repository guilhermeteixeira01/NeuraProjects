// Botão ⚙ Configurações do topo: idioma, tema e "Melhorar desempenho". Vale para todas as páginas e fica
// guardado no navegador e, com login, na conta (vale nos outros aparelhos; preferencias.js).
import { useEffect, useRef, useState } from 'react'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from './desempenho.js'
import { IDIOMAS, useT } from './i18n.js'
import { escolherDesempenho, escolherIdioma, escolherTema } from './preferencias.js'
import { EVENTO_TEMA, TEMAS, temaAtual } from './tema.js'

function IconeEngrenagem() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

export default function Configuracoes() {
  const t = useT()
  const [aberto, setAberto] = useState(false)
  const [tema, setTema] = useState('padrao') // igual ao HTML gerado; o efeito lê o de verdade
  const [desempenho, setDesempenho] = useState(false)
  const caixa = useRef(null)

  useEffect(() => {
    const ler = () => {
      setTema(temaAtual())
      setDesempenho(desempenhoAtivo())
    }
    ler()
    window.addEventListener(EVENTO_TEMA, ler)
    window.addEventListener(EVENTO_DESEMPENHO, ler)
    return () => {
      window.removeEventListener(EVENTO_TEMA, ler)
      window.removeEventListener(EVENTO_DESEMPENHO, ler)
    }
  }, [])

  // Fecha clicando fora ou com Esc
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !caixa.current?.contains(e.target) && setAberto(false)
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div className="nx-config" ref={caixa}>
      <button type="button" className="nx-config-btn" aria-label={t('Configurações')} title={t('Configurações')} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <IconeEngrenagem />
      </button>
      {aberto && (
        <div className="nx-config-painel" role="dialog" aria-label={t('Configurações')}>
          <div className="nx-config-cab">{t('Configurações')}</div>

          <label className="nx-config-campo">
            <span>{t('Idioma')}</span>
            <select value={t.idioma} onChange={(e) => escolherIdioma(e.target.value)}>
              {IDIOMAS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>

          <div className="nx-config-campo">
            <span>{t('Tema')}</span>
            <div className="nx-config-temas" role="radiogroup" aria-label={t('Tema')}>
              {TEMAS.map((tm) => (
                <button key={tm.id} type="button" role="radio" aria-checked={tema === tm.id} className={`nx-config-tema tema-${tm.id}${tema === tm.id ? ' sel' : ''}`} onClick={() => escolherTema(tm.id)}>
                  <i aria-hidden="true" />
                  {t(tm.nome)}
                </button>
              ))}
            </div>
          </div>

          <label className="nx-config-switch">
            <input type="checkbox" checked={desempenho} onChange={(e) => escolherDesempenho(e.target.checked)} />
            <span className="nx-config-chave" aria-hidden="true" />
            <span>
              <b>{t('Melhorar desempenho')}</b>
              <small>{t('Desliga animações, transições e efeitos visuais. Ideal para computador ou celular mais fraco.')}</small>
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
