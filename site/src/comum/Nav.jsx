import { useEffect, useRef, useState } from 'react'
import { CONFIG, MENU } from './config.js'
import { entrar, linkPerfil, loginAtivo, sair, useConta } from './conta.js'
import { ICONES_MENU, IconeKivo, IconeSteam } from './Icones.jsx'
import { useAdmin } from './Moldura.jsx'
import Configuracoes from './Configuracoes.jsx'
import { useT } from './i18n.js'

// Aba do painel de administrador (só aparece para admin; o worker confere de novo em toda ação)
const ITEM_ADMIN = { id: 'admin', rotulo: 'Admin', href: '/admin/', icone: 'escudo' }
import { ComMoldura } from './Moldura.jsx'

function LinkMenu({ item, atual }) {
  const t = useT()
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
      <span className="nx-dica">{t(item.rotulo)}</span>
      {item.selo && <span className="nx-selo">{item.selo}</span>}
    </a>
  )
}

// Login pela Steam: botão "Entrar" ou o avatar com o menu da conta
function Conta() {
  const t = useT()
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
        <span className="nx-dica">{t('Entrar')}</span>
      </button>
    )

  const nome = conta.nome || t('Minha conta')
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
        <span className="nx-conta-nome nx-dica">{nome}</span>
      </button>
      {aberto && (
        <div className="nx-conta-menu" role="menu">
          <a role="menuitem" href={linkPerfil(conta.id)}>
            {t('Meu perfil')}
          </a>
          <a role="menuitem" href={`https://steamcommunity.com/profiles/${conta.id}`} target="_blank" rel="noopener">
            {t('Perfil na Steam')}
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false)
              sair()
            }}
          >
            {t('Sair')}
          </button>
        </div>
      )}
    </div>
  )
}

// Menu de todas as páginas. No computador (> 1024px) é uma barra fina na lateral esquerda, só com ícones
// (o nome aparece ao passar o mouse: .nx-dica). No celular é a barra do topo, e o ☰ abre uma gaveta em
// tela cheia: a página por trás some e não rola enquanto ela está aberta.
export default function Nav({ pagina }) {
  const t = useT()
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
    const tamanho = () => window.innerWidth > 1024 && setAberto(false)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', tamanho)
    return () => {
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', tamanho)
    }
  }, [aberto])

  const conta = useConta()
  const { admin } = useAdmin(conta)
  // Páginas do site de um lado; Admin (só para admin) separado delas, no topo e na gaveta
  const paginas = MENU.map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)
  const linkAdmin = admin && <LinkMenu item={ITEM_ADMIN} atual={pagina} />

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
        <nav className="nx-links" aria-label={t('Menu principal')}>
          {paginas}
          {linkAdmin && (
            <>
              <span className="nx-links-sep" aria-hidden="true" />
              {linkAdmin}
            </>
          )}
        </nav>
        <div className="nx-acoes">
          {CONFIG.comunidade && (
            <a className="nx-btn nx-btn-ghost nx-comunidade" href={CONFIG.comunidade} target="_blank" rel="noopener" aria-label={t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}>
              <IconeKivo />
              <span className="nx-dica">{t('Comunidade')}</span>
            </a>
          )}
          <Configuracoes />
          <Conta />
          <button
            className="nx-burger"
            type="button"
            aria-label={aberto ? t('Fechar menu') : t('Abrir menu')}
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
          <span className="nx-gaveta-rotulo">{t('Páginas')}</span>
          {paginas}
          {(linkAdmin || CONFIG.comunidade) && (
            <div className="nx-gaveta-extra">
              {linkAdmin && (
                <>
                  <span className="nx-gaveta-rotulo">{t('Administração')}</span>
                  {linkAdmin}
                </>
              )}
              {CONFIG.comunidade && (
                <>
                  <span className="nx-gaveta-rotulo">{t('Comunidade')}</span>
                  <a className="nx-link nx-link-kivo" href={CONFIG.comunidade} target="_blank" rel="noopener">
                    <IconeKivo /> {t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  )
}
