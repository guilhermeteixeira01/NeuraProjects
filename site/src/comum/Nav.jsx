import { useEffect, useRef, useState } from 'react'
import { CONFIG, MENU } from './config.js'
import { entrar, linkPerfil, loginAtivo, sair, useConta } from './conta.js'
import { ICONES_MENU, IconeKivo, IconeSteam } from './Icones.jsx'
import { useAdmin } from './Moldura.jsx'

// Aba do painel de administrador (só aparece para admin; o worker confere de novo em toda ação)
const ITEM_ADMIN = { id: 'admin', rotulo: 'Admin', href: '/admin/', icone: 'escudo' }
import { ComMoldura } from './Moldura.jsx'

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

// Login pela Steam: botão "Entrar" ou o avatar com o menu da conta
function Conta() {
  const conta = useConta()
  const [aberto, setAberto] = useState(false)
  const [erroAvatar, setErroAvatar] = useState(false)
  const caixa = useRef(null)

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

  if (!loginAtivo()) return null
  if (!conta)
    return (
      <button type="button" className="nx-btn nx-steam" onClick={entrar}>
        <IconeSteam />
        <span>Entrar</span>
      </button>
    )

  const nome = conta.nome || 'Minha conta'
  return (
    <div className="nx-conta" ref={caixa}>
      <button type="button" className="nx-conta-btn" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <ComMoldura steamId={conta.id}>
          {conta.avatar && !erroAvatar ? (
            <img src={conta.avatar} alt="" width="28" height="28" onError={() => setErroAvatar(true)} />
          ) : (
            <span className="nx-conta-ini">{nome.slice(0, 2).toUpperCase()}</span>
          )}
        </ComMoldura>
        <span className="nx-conta-nome">{nome}</span>
      </button>
      {aberto && (
        <div className="nx-conta-menu" role="menu">
          <a role="menuitem" href={linkPerfil(conta.id)}>
            Meu perfil
          </a>
          <a role="menuitem" href={`https://steamcommunity.com/profiles/${conta.id}`} target="_blank" rel="noopener">
            Perfil na Steam
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false)
              sair()
            }}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

// Menu do topo de todas as páginas. No celular vira uma gaveta em tela cheia:
// a página por trás some e não rola enquanto ela está aberta.
export default function Nav({ pagina }) {
  const [aberto, setAberto] = useState(false)
  const [rolou, setRolou] = useState(false)

  // Rolou a página: o menu fica com o vidro mais forte e a linha luminosa embaixo
  useEffect(() => {
    const ver = () => setRolou(window.scrollY > 12)
    ver()
    window.addEventListener('scroll', ver, { passive: true })
    return () => window.removeEventListener('scroll', ver)
  }, [])

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

  const conta = useConta()
  const { admin } = useAdmin(conta)
  const links = [...MENU, ...(admin ? [ITEM_ADMIN] : [])].map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)

  return (
    <header data-site-nav="" className={`nx-nav${aberto ? ' is-open' : ''}${rolou ? ' is-scrolled' : ''}`}>
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
          {CONFIG.comunidade && (
            <a className="nx-btn nx-btn-ghost nx-comunidade" href={CONFIG.comunidade} target="_blank" rel="noopener" title={`Comunidade na ${CONFIG.comunidadeNome}`}>
              <IconeKivo />
              <span>Comunidade</span>
            </a>
          )}
          <Conta />
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
          {CONFIG.comunidade && (
            <a className="nx-link" href={CONFIG.comunidade} target="_blank" rel="noopener">
              <IconeKivo /> Comunidade na {CONFIG.comunidadeNome}
            </a>
          )}
        </div>
      )}
    </header>
  )
}
