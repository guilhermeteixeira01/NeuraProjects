// Emblema da assinatura Premium, no canto superior direito do avatar (ComMoldura, com emblema). Passando o mouse (ou focando) abre
// uma caixinha com o nível ("Premium Gold"); clicando abre a janela com os 6 níveis (a 3ª imagem de referência). Subscriber, Gold e
// Platinum são imagens paradas; Diamond, Elite e Legend são animadas. A caixinha e a janela vão para o <body> (portal): o avatar fica
// dentro de cartões com overflow: hidden.
// nivel: { id, nome, meses, proximo, faltam } (assinatura.js: nivelDaSub). parado: usa a versão sem animação.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CONFIG } from './config.js'
import { NIVEIS_SUB, tituloNivel, urlEmblema } from './assinatura.js'
import { useT } from './i18n.js'

function JanelaPremium({ nivel, parado, aoFechar }) {
  const t = useT()
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="pm-fundo" onClick={aoFechar}>
      <div className="pm-janela" role="dialog" aria-modal="true" aria-labelledby="pm-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="pm-cab">
          <h2 id="pm-titulo">{t('Emblema de assinatura Premium')}</h2>
          <button type="button" className="pm-x" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <div className="pm-niveis">
          {NIVEIS_SUB.map((n) => (
            <figure key={n.id} className={n.id === nivel.id ? 'atual' : ''} title={tituloNivel(n)}>
              <img src={urlEmblema(n.id, parado)} alt="" draggable={false} />
              <figcaption>{n.nome}</figcaption>
            </figure>
          ))}
        </div>
        <p className="pm-atual">
          {t('Este jogador está no nível {nivel}.', { nivel: nivel.nome })}
          {nivel.proximo && ` ${t('Evolui para {proximo} com mais tempo de assinatura.', { proximo: nivel.proximo.nome })}`}
        </p>
        <p className="pm-texto">{t('Seja Premium e evolua o seu emblema com o tempo de assinatura, do Subscriber até o Legend. O emblema aparece no seu avatar em todo o site.')}</p>
        <div className="pm-rodape">
          <button type="button" className="pm-fechar" onClick={aoFechar}>
            {t('FECHAR')}
          </button>
          {CONFIG.premium ? (
            <a className="pm-premium" href={CONFIG.premium} target="_blank" rel="noopener">
              {t('SEJA PREMIUM')}
            </a>
          ) : (
            <span className="pm-premium desligado" title={t('Em breve')}>
              {t('SEJA PREMIUM')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EmblemaSub({ nivel, parado = false }) {
  const t = useT()
  const [dica, setDica] = useState(null) // { x, y } da caixinha (tela)
  const [aberta, setAberta] = useState(false)
  const abrirDica = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setDica({ x: Math.min(Math.max(r.left + r.width / 2, 70), window.innerWidth - 70), y: r.top })
  }
  const abrirJanela = (e) => {
    // o avatar costuma estar dentro de um link (perfil): clicar no emblema não navega
    e.preventDefault()
    e.stopPropagation()
    setDica(null)
    setAberta(true)
  }
  return (
    <>
      <span
        className="emblema-sub"
        role="button"
        tabIndex={0}
        aria-label={tituloNivel(nivel)}
        onMouseEnter={abrirDica}
        onMouseLeave={() => setDica(null)}
        onFocus={abrirDica}
        onBlur={() => setDica(null)}
        onClick={abrirJanela}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && abrirJanela(e)}
      >
        <img src={urlEmblema(nivel.id, parado)} alt="" draggable={false} />
      </span>
      {dica &&
        createPortal(
          <span className="emblema-dica" role="tooltip" style={{ left: dica.x, top: dica.y }}>
            {t('Premium {nivel}', { nivel: nivel.nome })}
          </span>,
          document.body,
        )}
      {aberta && createPortal(<JanelaPremium nivel={nivel} parado={parado} aoFechar={() => setAberta(false)} />, document.body)}
    </>
  )
}
