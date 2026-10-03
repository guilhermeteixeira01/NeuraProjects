import { useEffect, useState } from 'react'
import { CONFIG, MENU } from './config.js'
import { ICONES_MENU, IconeDiscord } from './Icones.jsx'

function LinkMenu({ item, atual }) {
  const ativo = item.id === atual
  const IconeItem = item.icone ? ICONES_MENU[item.icone] : null
  return (
    <a
      className={`nx-link${ativo ? ' is-active' : ''}`}
      href={item.href}
      {...(item.externo ? { target: '_blank', rel: 'noopener' } : {})}
      {...(ativo ? { 'aria-current': 'page' } : {})}
    >
      {IconeItem && <IconeItem />}
      {item.rotulo}
      {item.selo && <span className="nx-selo">{item.selo}</span>}
    </a>
  )
}

// Menu do topo de todas as páginas. No celular vira uma gaveta em tela cheia:
// a página por trás some e não rola enquanto ela está aberta.
export default function Nav({ pagina }) {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('nx-menu-aberto', aberto)
    if (!aberto) return
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    // Virou tela grande (ex.: girou o tablet): o menu de cima volta, a gaveta fecha
    const tamanho = () => window.innerWidth > 900 && setAberto(false)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', tamanho)
    return () => {
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', tamanho)
    }
  }, [aberto])

  const links = MENU.map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)

  return (
    <header data-site-nav="" className={`nx-nav${aberto ? ' is-open' : ''}`}>
      <div className="nx-nav-inner">
        <a className="nx-brand" href="/">
          <img src="/assets/logos/logo-np-64.png" alt="" width="30" height="30" />
          <span>
            NEURA <span className="nx-outline">PROJECT</span>
            <span className="nx-sub">GAME STUDIO</span>
          </span>
        </a>
        <nav className="nx-links" aria-label="Menu principal">
          {links}
        </nav>
        <div className="nx-acoes">
          {CONFIG.discord && (
            <a className="nx-btn nx-btn-ghost nx-discord" href={CONFIG.discord} target="_blank" rel="noopener">
              <IconeDiscord />
              <span>Comunidade</span>
            </a>
          )}
          <button
            className="nx-burger"
            type="button"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            onClick={() => setAberto((a) => !a)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      {aberto && (
        // Tocar num link fecha a gaveta
        <div className="nx-gaveta" onClick={(e) => e.target.closest('a') && setAberto(false)}>
          {links}
          {CONFIG.discord && (
            <a className="nx-link" href={CONFIG.discord} target="_blank" rel="noopener">
              <IconeDiscord /> Comunidade no Discord
            </a>
          )}
        </div>
      )}
    </header>
  )
}
