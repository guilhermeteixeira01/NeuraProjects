import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG, MENU } from './config.js'
import { entrar, linkPerfil, loginAtivo, sair, useConta } from './conta.js'
import { ICONES_MENU, IconeKivo, IconeSteam } from './Icones.jsx'
import { useAdmin } from './Moldura.jsx'
import Configuracoes from './Configuracoes.jsx'
import { useT } from './i18n.js'

// Aba do painel de administrador (só aparece para admin; o worker confere de novo em toda ação)
const ITEM_ADMIN = { id: 'admin', rotulo: 'Admin', href: '/admin/', icone: 'escudo' }
import { ComMoldura } from './Moldura.jsx'
import { useAvatar } from './avatares.js'

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
  const [erroAvatar, setErroAvatar] = useState('')
  // A foto do token é a do dia do login (vale 30 dias): troca pela atual da Steam
  const fotoAtual = useAvatar(conta?.id)
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
  const avatar = fotoAtual || conta.avatar
  return (
    <div className="nx-conta" ref={caixa}>
      <button type="button" className="nx-conta-btn" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <ComMoldura steamId={conta.id}>
          {avatar && erroAvatar !== avatar ? (
            <img src={avatar} alt="" width="28" height="28" onError={() => setErroAvatar(avatar)} />
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
              sair({ irParaInicio: true })
            }}
          >
            {t('Sair')}
          </button>
        </div>
      )}
    </div>
  )
}

// Páginas que aparecem no menu sem login
const SEM_LOGIN = ['inicio', 'ranking']

// Páginas fora do MENU: só para o título da barra de cima no celular
const OUTRAS = {
  perfil: { rotulo: 'Perfil', icone: 'perfil' },
  times: { rotulo: 'Times', icone: 'mapa' },
}

// Celular: "Mais" da barra de baixo abre este painel com o resto (Inventário, Admin, Comunidade)
function PainelMais({ itens, admin, fechar }) {
  const t = useT()
  const caixa = useRef(null)
  useEffect(() => {
    const fora = (e) => !caixa.current?.contains(e.target) && !e.target.closest('.nx-baixo-mais') && fechar()
    const tecla = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [fechar])
  return (
    <div className="nx-mais" ref={caixa} role="menu" onClick={(e) => e.target.closest('a') && fechar()}>
      {itens}
      {admin}
      {CONFIG.comunidade && (
        <a className="nx-link nx-link-kivo" role="menuitem" href={CONFIG.comunidade} target="_blank" rel="noopener">
          <IconeKivo /> <span className="nx-dica">{t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}</span>
        </a>
      )}
    </div>
  )
}

// Menu de todas as páginas.
// Computador (> 1024px): barra fina na lateral esquerda, só com ícones (o nome aparece ao passar o mouse: .nx-dica).
// Celular e tablet: barra de cima com o nome da página atual, ⚙ e a conta, e barra de abas fixa embaixo
// (páginas, Perfil e "Mais" com o resto).
export default function Nav({ pagina }) {
  const t = useT()
  const [rolou, setRolou] = useState(false)
  const [mais, setMais] = useState(false)
  const fecharMais = useCallback(() => setMais(false), [])

  // Rolou a página: o menu fica com o vidro mais forte e a linha luminosa
  useEffect(() => {
    const ver = () => setRolou(window.scrollY > 12)
    ver()
    window.addEventListener('scroll', ver, { passive: true })
    return () => window.removeEventListener('scroll', ver)
  }, [])

  const conta = useConta()
  const { admin } = useAdmin(conta)
  // Sem login, o menu mostra só Início e Ranking (as outras páginas continuam abrindo pelo link; só não aparecem no menu).
  // Site sem login configurado: mostra tudo.
  const menu = conta || !loginAtivo() ? MENU : MENU.filter((m) => SEM_LOGIN.includes(m.id))
  // Páginas do site de um lado; Admin (só para admin) separado delas
  const paginas = menu.map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)
  const linkAdmin = admin && <LinkMenu item={ITEM_ADMIN} atual={pagina} />

  // Barra de baixo (celular): páginas do site; as de fora (Inventário) vão para o "Mais"
  const abas = menu.filter((m) => !m.externo)
  const extras = menu.filter((m) => m.externo).map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)
  const atual = [...MENU, ITEM_ADMIN].find((m) => m.id === pagina) || OUTRAS[pagina] || MENU[0]
  const IconeAtual = ICONES_MENU[atual.icone]
  const IconePerfil = ICONES_MENU.perfil
  const IconeMais = ICONES_MENU.mais
  const maisAtivo = pagina === 'admin'

  return (
    <>
      <header data-site-nav="" className={`nx-nav${rolou ? ' is-scrolled' : ''}`}>
        <div className="nx-nav-inner">
          <a className="nx-brand" href="/">
            <img src="/assets/logos/logo-np-64.png" alt="" width="30" height="30" />
            <span>
              NEURA <span className="nx-outline">PROJECT</span>
              <span className="nx-sub">GAME STUDIO</span>
            </span>
          </a>
          {/* Celular: no lugar da marca, o ícone e o nome da página atual */}
          <a className="nx-titulo" href="/" aria-label="Neura Project">
            {IconeAtual && <IconeAtual />}
            <span>{t(atual.rotulo)}</span>
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
          </div>
        </div>
      </header>

      <nav className="nx-baixo" aria-label={t('Menu principal')}>
        {mais && <PainelMais itens={extras} admin={linkAdmin} fechar={fecharMais} />}
        {abas.map((m) => {
          const Icone = ICONES_MENU[m.icone]
          const ativo = m.id === pagina
          return (
            <a key={m.id} className={`nx-aba${ativo ? ' is-active' : ''}`} href={m.href} {...(ativo ? { 'aria-current': 'page' } : {})}>
              <i>{Icone && <Icone />}</i>
              <span>{t(m.rotulo)}</span>
            </a>
          )
        })}
        {loginAtivo() &&
          (conta ? (
            <a className={`nx-aba${pagina === 'perfil' ? ' is-active' : ''}`} href={linkPerfil(conta.id)}>
              <i><IconePerfil /></i>
              <span>{t('Perfil')}</span>
            </a>
          ) : (
            <button type="button" className="nx-aba" onClick={entrar}>
              <i><IconePerfil /></i>
              <span>{t('Perfil')}</span>
            </button>
          ))}
        <button type="button" className={`nx-aba nx-baixo-mais${mais || maisAtivo ? ' is-active' : ''}`} aria-expanded={mais} aria-haspopup="menu" onClick={() => setMais((m) => !m)}>
          <i><IconeMais /></i>
          <span>{t('Mais')}</span>
        </button>
      </nav>
    </>
  )
}
