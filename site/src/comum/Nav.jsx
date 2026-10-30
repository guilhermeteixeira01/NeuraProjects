import IconeUI from './IconeUI.jsx'
import { createPortal } from 'react-dom'
import { usePainelMobile } from './usePainelMobile.js'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG, MENU } from './config.js'
import { entrar, linkPerfil, loginAtivo, sair, useConta } from './conta.js'
import { ICONES_MENU, IconeDiscord, IconeSteam } from './Icones.jsx'
import { useAcessoPick, useAdmin, useTimeDe } from './Moldura.jsx'
import Configuracoes from './Configuracoes.jsx'
import { useT } from './i18n.js'

// Aba do painel de administrador (só aparece para admin; o worker confere de novo em toda ação)
const ITEM_ADMIN = { id: 'admin', rotulo: 'Admin', href: '/admin/', icone: 'escudo' }
import { ComMoldura } from './Moldura.jsx'
import { useSeguranca } from './seguranca.js'
import { useAvatar } from './avatares.js'
import PainelAmigos from './PainelAmigos.jsx'
import PainelNotificacoes from './PainelNotificacoes.jsx'
import PainelPartidas from './PainelPartidas.jsx'
import { iniciarAvisoEquipe, useAvisoEquipe } from './avisoEquipe.js'
import { useAmigos } from './amigos.js'
import ResumoMenuConta from './ResumoMenuConta.jsx'

const TrocarNick = lazy(() => import('./BoasVindas.jsx').then(m => ({ default: m.TrocarNick })))

function LinkMenu({ item, atual }) {
  const t = useT()
  const { pendente } = useAvisoEquipe()
  const ativo = item.id === atual
  const IconeItem = item.icone ? ICONES_MENU[item.icone] : null
  return (
    <a
      className={`nx-link${ativo ? ' is-active' : ''}`}
      href={item.href}
      title={t(item.rotulo)}
      {...(item.externo ? { target: '_blank', rel: 'noopener' } : {})}
      {...(ativo ? { 'aria-current': 'page' } : {})}
    >
      {item.id === 'equipes' && <LogoDoTime />}
      {IconeItem && <IconeItem />}
      <span className="nx-dica">{t(item.rotulo)}</span>
      {item.selo && <span className="nx-selo">{item.selo}</span>}
      {item.id === 'equipes' && pendente && <span className="nx-alerta" role="status" aria-label={t('Mensagem nova no chat do time')}>!</span>}
    </a>
  )
}

// Login pela Steam: botão "Entrar" ou o avatar com o menu da conta
function Conta() {
  const t = useT()
  const conta = useConta()
  const [aberto, setAberto] = useState(false)
  const [erroAvatar, setErroAvatar] = useState('')
  const [trocandoNick, setTrocandoNick] = useState(false)
  // A foto do token é a do dia do login (vale 30 dias): troca pela atual da Steam
  const fotoAtual = useAvatar(conta?.id)
  const caixa = useRef(null)
  const painel = useRef(null)
  const celular = usePainelMobile(aberto && !!conta, painel)
  const naTela = el => celular ? createPortal(el, document.body) : el
  const { conectado } = useAmigos()
  const seg = useSeguranca() // o apelido escolhido no site vale no lugar do nome da Steam

  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !caixa.current?.contains(e.target) && !painel.current?.contains(e.target) && setAberto(false)
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

  const nome = seg?.nick || conta.nome || t('Minha conta')
  const avatar = fotoAtual || conta.avatar
  return (
    <div className="nx-conta" ref={caixa}>
      <button type="button" className="nx-conta-btn" aria-label={t('Minha conta')} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <ComMoldura steamId={conta.id} emblema>
          {avatar && erroAvatar !== avatar ? (
            <img src={avatar} alt="" width="28" height="28" onError={() => setErroAvatar(avatar)} />
          ) : (
            <span className="nx-conta-ini">{nome.slice(0, 2).toUpperCase()}</span>
          )}
        </ComMoldura>
        <span className="nx-conta-nome nx-dica">{nome}</span>
      </button>
      {aberto && naTela(
        <div ref={painel} className={`nx-conta-menu nc-card${celular ? ' nx-painel-mobile' : ''}`} role="dialog" aria-modal={celular || undefined} aria-label={t('Minha conta')}>
          <ResumoMenuConta conta={conta} nome={nome} avatar={avatar} conectado={conectado} seg={seg} aoFechar={() => setAberto(false)} aoTrocarNick={() => { setAberto(false); setTrocandoNick(true) }} />
        </div>
      )}
      {trocandoNick && <Suspense fallback={null}><TrocarNick atual={seg?.nick} aoFechar={() => setTrocandoNick(false)} /></Suspense>}

    </div>
  )
}

// Logo do time do jogador, por trás do ícone "Times" do menu (nada se ele não tem time ou o time não tem logo)
function LogoDoTime() {
  const conta = useConta()
  const time = useTimeDe(conta?.id)
  const [erro, setErro] = useState(false)
  if (!time || !/^https?:\/\//.test(time.logo || '') || erro) return null
  return <img className="nx-time-logo" src={time.logo} alt="" aria-hidden="true" loading="lazy" onError={() => setErro(true)} />
}

// Páginas que aparecem no menu sem login
const SEM_LOGIN = ['inicio', 'lobby', 'ranking', 'inventario', 'loja'] // o ▶ Jogar aparece sempre (sem login a página pede para entrar)

// Páginas fora do MENU: só para o título da barra de cima no celular
const OUTRAS = {
  perfil: { rotulo: 'Perfil', icone: 'perfil' },
  times: { rotulo: 'Times', icone: 'mapa' },
  naoencontrada: { rotulo: 'Página não encontrada', icone: 'casa' },
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
        <a className="nx-link nx-link-discord" role="menuitem" href={CONFIG.comunidade} target="_blank" rel="noopener">
          <IconeDiscord /> <span className="nx-dica">{t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}</span>
        </a>
      )}
    </div>
  )
}

// Barra de rolagem do computador, do lado de dentro: fica encostada na barra da direita (a do navegador, que ficava
// do lado de fora dela, é escondida em site.css). A rolagem continua sendo a da janela (window), então nada
// que escuta o scroll da página muda. Celular e tablet continuam com a barra normal.
function BarraRolagem() {
  const trilho = useRef(null)
  const alca = useRef(null)

  useEffect(() => {
    const el = document.documentElement
    const t = trilho.current
    const a = alca.current
    if (!t || !a) return
    let quadro = 0
    const medidas = () => ({ vis: el.clientHeight, total: el.scrollHeight })

    const medir = () => {
      const { vis, total } = medidas()
      const cabe = total <= vis + 1
      t.classList.toggle('oculta', cabe)
      if (cabe) return
      const alt = Math.max(40, (vis / total) * vis)
      const topo = (window.scrollY / (total - vis)) * (vis - alt)
      a.style.height = `${alt}px`
      a.style.transform = `translateY(${topo}px)`
    }
    const agendar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', agendar, { passive: true })
    window.addEventListener('resize', agendar)
    const ro = new ResizeObserver(agendar)
    ro.observe(document.body)

    // arrastar a alça
    let arrasto = null
    const baixo = (e) => {
      e.preventDefault()
      arrasto = { y: e.clientY, topo: window.scrollY }
      a.setPointerCapture(e.pointerId)
      t.classList.add('arrastando')
    }
    const mexe = (e) => {
      if (!arrasto) return
      const { vis, total } = medidas()
      const razao = (total - vis) / Math.max(1, vis - a.offsetHeight)
      window.scrollTo({ top: arrasto.topo + (e.clientY - arrasto.y) * razao, behavior: 'instant' })
    }
    const solta = () => {
      arrasto = null
      t.classList.remove('arrastando')
    }
    // clicar no trilho leva a alça até ali
    const clicaTrilho = (e) => {
      if (e.target !== t) return
      const { vis, total } = medidas()
      const alt = a.offsetHeight
      window.scrollTo({ top: ((e.clientY - alt / 2) / Math.max(1, vis - alt)) * (total - vis), behavior: 'smooth' })
    }
    a.addEventListener('pointerdown', baixo)
    a.addEventListener('pointermove', mexe)
    a.addEventListener('pointerup', solta)
    a.addEventListener('pointercancel', solta)
    t.addEventListener('pointerdown', clicaTrilho)

    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('scroll', agendar)
      window.removeEventListener('resize', agendar)
      ro.disconnect()
      a.removeEventListener('pointerdown', baixo)
      a.removeEventListener('pointermove', mexe)
      a.removeEventListener('pointerup', solta)
      a.removeEventListener('pointercancel', solta)
      t.removeEventListener('pointerdown', clicaTrilho)
    }
  }, [])

  return (
    <div className="nx-rolagem oculta" ref={trilho} aria-hidden="true">
      <div className="nx-rolagem-alca" ref={alca} />
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
  const [busca, setBusca] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const campoBusca = useRef(null)
  const botaoBusca = useRef(null)
  useEffect(() => {
    if (menuAberto) campoBusca.current?.focus()
  }, [menuAberto])
  const recolherMenu = () => {
    setMenuAberto(false)
    setBusca('')
    requestAnimationFrame(() => botaoBusca.current?.focus())
  }
  const fecharMais = useCallback(() => setMais(false), [])
  useEffect(() => {
    let destino = null
    let timer = 0
    const raiz = document.documentElement
    const limpar = () => { clearTimeout(timer); destino = null; raiz.classList.remove('nx-fechando') }
    const navegar = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      if (!matchMedia('(min-width: 1025px)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (!document.querySelector('.nx-nav.nx-aberta')) return
      const a = e.target.closest?.('a[href]')
      if (!a || a.target || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || url.pathname === '/') return
      if (url.pathname === location.pathname && url.search === location.search) return
      e.preventDefault()
      if (destino) return
      destino = url.href
      raiz.classList.add('nx-fechando')
      timer = setTimeout(() => location.assign(destino), 240)
    }
    document.addEventListener('click', navegar)
    window.addEventListener('pageshow', limpar)
    return () => { document.removeEventListener('click', navegar); window.removeEventListener('pageshow', limpar); limpar() }
  }, [])

  // Rolou a página: o menu fica com o vidro mais forte e a linha luminosa
  useEffect(() => {
    const ver = () => setRolou(window.scrollY > 12)
    ver()
    window.addEventListener('scroll', ver, { passive: true })
    return () => window.removeEventListener('scroll', ver)
  }, [])

  // Só a página inicial mostra a barra da esquerda aberta (ícone + nome). Ao clicar em outra página ela encolhe até os ícones com
  // animação (classe nx-fechando, regras em estetica.css) e só depois a página nova abre, já com a barra do tamanho final.

  const conta = useConta()
  useEffect(() => iniciarAvisoEquipe(), [])
  const { pendente: avisoTime } = useAvisoEquipe()
  const { painel: admin } = useAdmin(conta) // o botão Admin aparece para quem tem acesso a alguma aba (admin ou cargo com acesso)
  // Sem login, o menu mostra só Início e Ranking (as outras páginas continuam abrindo pelo link; só não aparecem no menu).
  // Site sem login configurado: mostra tudo.
  const verPick = useAcessoPick()
  const menu = (conta || !loginAtivo() ? MENU : MENU.filter((m) => SEM_LOGIN.includes(m.id))).filter((m) => m.id !== 'pick' || verPick)
  // Páginas do site de um lado; Admin (só para admin) separado delas
  const termo = busca.trim().toLocaleLowerCase()
  const paginas = menu.filter((m) => !termo || t(m.rotulo).toLocaleLowerCase().includes(termo)).map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)
  const linkAdmin = admin && <LinkMenu item={ITEM_ADMIN} atual={pagina} />

  // Barra de baixo (celular): páginas do site; as de fora (Inventário) vão para o "Mais"
  const menuCel = menu.filter((m) => !m.soComputador) // o que só existe no computador (▶ Jogar) fica fora da barra de baixo e do "Mais"
  const botaoEntrar = loginAtivo() && !conta
  // Na barra de baixo ficam só estas (e o "Mais"); o resto das páginas (Pick & Ban, Times...) vai para o "Mais"
  const NA_BARRA = ['inicio', 'partidas', 'ranking', 'inventario', 'loja']
  const todasAbas = menuCel.filter((m) => !m.externo)
  const abas = todasAbas.filter((m) => NA_BARRA.includes(m.id))
  const noMais = todasAbas.filter((m) => !NA_BARRA.includes(m.id))
  const extras = [...noMais, ...menuCel.filter((m) => m.externo)].map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)
  const atual = [...MENU, ITEM_ADMIN].find((m) => m.id === pagina) || OUTRAS[pagina] || MENU[0]
  const IconeAtual = ICONES_MENU[atual.icone]
  const IconePerfil = ICONES_MENU.perfil
  const IconeMais = ICONES_MENU.mais
  const maisAtivo = pagina === 'admin' || noMais.some((m) => m.id === pagina)

  return (
    <>
      <header data-site-nav="" className={`nx-nav${pagina === 'inicio' || menuAberto ? ' nx-aberta' : ''}${rolou ? ' is-scrolled' : ''}`}>
        <div className="nx-nav-inner">
          <a className="nx-brand" href="/" aria-label="Neura Project">
            <img src="/assets/logos/logo-np-64.png" alt="" width="30" height="30" />
            <span>
              NEURA <span className="nx-outline">PROJECT</span>
              <span className="nx-sub">COUNTER-STRIKE 2</span>
            </span>
          </a>
          <div className="np-sidebar-reduzida">
            <button ref={botaoBusca} type="button" aria-label={t('Pesquisar no menu')} aria-expanded={menuAberto} aria-controls="np-menu-principal" onClick={() => setMenuAberto(true)}>
              <IconeUI tipo="busca" tamanho={18}/>
            </button>
            <a href="/lobby/" aria-label="Counter-Strike 2" title="Counter-Strike 2"><img src="/assets/logo%20cs2.webp" alt="" width="24" height="24" /></a>
          </div>
          <div className="np-sidebar-inicio">
            {pagina !== 'inicio' && <button className="np-menu-recolher" type="button" onClick={recolherMenu} aria-expanded={menuAberto} aria-controls="np-menu-principal">{t('Fechar')}</button>}
            <label className="np-pesquisa">
              <IconeUI tipo="busca" tamanho={18}/>
              <input ref={campoBusca} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && pagina !== 'inicio') recolherMenu() }} placeholder={t('Pesquisar')} aria-label={t('Pesquisar no menu')} aria-controls="np-menu-principal" />
            </label>
            <a className="np-jogo" href="/lobby/" aria-label="Counter-Strike 2" title="Counter-Strike 2"><img src="/assets/logo%20cs2.webp" alt="" width="24" height="24" /><span>CS2</span></a>
          </div>
          {/* Celular: no lugar da marca, o ícone e o nome da página atual */}
          <a className="nx-titulo" href="/" aria-label="Neura Project">
            {IconeAtual && <IconeAtual />}
            <span>{t(atual.rotulo)}</span>
          </a>
          <nav className="nx-links" id="np-menu-principal" aria-label={t('Menu principal')}>
            {paginas}
            {termo && paginas.length === 0 && <p className="np-sem-resultados">{t('Nenhum resultado')}</p>}
            {linkAdmin && (
              <>
                <span className="nx-links-sep" aria-hidden="true" />
                {linkAdmin}
              </>
            )}
          </nav>
          <div className="np-sidebar-fim">
            <a href="/times/">{t('Times')}</a>
            {CONFIG.comunidade && <a href={CONFIG.comunidade} target="_blank" rel="noopener"><IconeDiscord tamanho={18} />{t('Comunidade')}</a>}
          </div>
          <div className="nx-acoes">
            {CONFIG.comunidade && (
              <a className="nx-btn nx-btn-ghost nx-comunidade" href={CONFIG.comunidade} target="_blank" rel="noopener" aria-label={t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}>
                <IconeDiscord />
                <span className="nx-dica">{t('Comunidade')}</span>
              </a>
            )}
            <PainelPartidas celular />
            <PainelNotificacoes celular />
            <PainelAmigos celular />
            <Configuracoes />
            <Conta />
          </div>
        </div>
      </header>

      <BarraRolagem />

      {/* Computador (estilo FACEIT): barra fina à direita com a conta, ⚙ e Comunidade */}
      <aside className="nx-direita" aria-label={t('Conta e configurações')}>
        <Conta />
        <PainelPartidas />
        <span className="nx-direita-sep" aria-hidden="true" />
        <PainelNotificacoes />
        <PainelAmigos />
        <Configuracoes />
        {CONFIG.comunidade && (
          <a className="nx-btn nx-btn-ghost nx-comunidade" href={CONFIG.comunidade} target="_blank" rel="noopener" aria-label={t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}>
            <IconeDiscord />
            <span className="nx-dica">{t('Comunidade')}</span>
          </a>
        )}
      </aside>
      <nav className="nx-baixo" aria-label={t('Menu principal')}>
        {mais && <PainelMais itens={extras} admin={linkAdmin} fechar={fecharMais} />}
        {abas.map((m) => {
          const Icone = ICONES_MENU[m.icone]
          const ativo = m.id === pagina
          return (
            <a key={m.id} className={`nx-aba${ativo ? ' is-active' : ''}`} href={m.href} {...(ativo ? { 'aria-current': 'page' } : {})}>
              <i>{m.id === 'equipes' && <LogoDoTime />}{Icone && <Icone />}{m.id === 'equipes' && avisoTime && <span className="nx-alerta" role="status" aria-label={t('Mensagem nova no chat do time')}>!</span>}</i>
              <span>{t(m.rotulo)}</span>
            </a>
          )
        })}
        {botaoEntrar && (
            // logado: o perfil abre pelo cartão da conta (barra de cima); a barra de baixo só tem o botão de entrar
            <button type="button" className="nx-aba" onClick={entrar}>
              <i><IconePerfil /></i>
              <span>{t('Entrar')}</span>
            </button>
          )}
        <button type="button" className={`nx-aba nx-baixo-mais${mais || maisAtivo ? ' is-active' : ''}`} aria-expanded={mais} aria-haspopup="menu" onClick={() => setMais((m) => !m)}>
          <i><IconeMais /></i>
          <span>{t('Mais')}</span>
        </button>
      </nav>
    </>
  )
}
