import IconeUI from './IconeUI.jsx'
import { createPortal } from 'react-dom'
import { usePainelMobile } from './usePainelMobile.js'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG, MENU } from './config.js'
import { entrar, linkPerfil, loginAtivo, sair, useConta } from './conta.js'
import { ICONES_MENU, IconeDiscord, IconeSteam } from './Icones.jsx'
import { useAcessoPick, useAdmin, useTimeDe } from './Moldura.jsx'
import Configuracoes, { BotaoSom } from './Configuracoes.jsx'
import { useT } from './i18n.js'

// Aba do painel de administrador (só aparece para admin; o worker confere de novo em toda ação)
const ITEM_TIMES_REGISTRADOS = { id: 'times', rotulo: 'Times registrados', href: '/times/', icone: 'trofeu' }
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
import { useNivelDe } from './Nivel.jsx'
import { corNivel } from './niveis.js'

const Deposito = lazy(() => import("../paginas/loja/Deposito.jsx")) // só baixa quando alguém clica em "Seja Premium"
const TrocarNick = lazy(() => import('./BoasVindas.jsx').then(m => ({ default: m.TrocarNick })))

function LinkMenu({ item, atual }) {
  const t = useT()
  const { pendente } = useAvisoEquipe()
  const ativo = item.id === atual
  const IconeItem = item.icone ? ICONES_MENU[item.icone] : null
  const logoTime = useLogoDoTime(item.id === 'equipes')
  return (
    <a
      className={`nx-link${ativo ? ' is-active' : ''}`}
      href={item.href}
      title={t(item.rotulo)}
      {...(item.externo ? { target: '_blank', rel: 'noopener' } : {})}
      {...(ativo ? { 'aria-current': 'page' } : {})}
    >
      {/* Times: com logo, o logo do time é o ícone na frente do nome (no lugar do ícone de pessoas) */}
      {logoTime ? <img className="nx-icone nx-time-icone" src={logoTime.src} alt="" aria-hidden="true" loading="lazy" onError={logoTime.aoErro} /> : IconeItem && <IconeItem />}
      <span className="nx-dica">{t(item.rotulo)}</span>
      {item.selo && <span className="nx-selo">{item.selo}</span>}
      {item.id === 'equipes' && pendente && <span className="nx-alerta" role="status" aria-label={t('Mensagem nova no chat do time')}>!</span>}
    </a>
  )
}

// Nível Neura de quem está logado, embaixo do nome na barra de cima (XP do ranking.json + ajuste do perfil).
// O ranking é lido uma vez por página; sem partidas aparece "Sem classificação".
let rankingDaConta = null
function NivelDaConta({ id }) {
  const t = useT()
  const [j, setJ] = useState(null)
  useEffect(() => {
    let vivo = true
    rankingDaConta ??= fetch('/ranking/ranking.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    rankingDaConta.then((d) => vivo && setJ(d?.jogadores?.find((x) => x.steamId === id) || null))
    return () => {
      vivo = false
    }
  }, [id])
  const nivel = useNivelDe({ ...j, steamId: id })
  const progresso = nivel.classificado ? nivel.progresso : (nivel.partidas || 0) / Math.max(1, (nivel.partidas || 0) + (nivel.faltamPartidas || 0))
  return (
    <span className="nx-conta-nivel" aria-hidden="true" style={{ '--cor-nivel-conta': nivel.classificado ? corNivel(nivel.nivel) : '#5b616d' }}>
      <i style={{ '--p': `${Math.round(Math.max(0, Math.min(1, progresso)) * 100)}%` }} />
      {nivel.classificado ? t('Nível {n}', { n: nivel.nivel >= 11 ? 'Elite' : nivel.nivel }) : t('Sem classificação')}
    </span>
  )
}

// Login pela Steam: botão "Entrar" ou o avatar com o menu da conta
function Conta() {
  const t = useT()
  const conta = useConta()
  const [aberto, setAberto] = useState(false)
  const [erroAvatar, setErroAvatar] = useState('')
  const [trocandoNick, setTrocandoNick] = useState(false)
  const [assinando, setAssinando] = useState(false)
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
      <button type="button" className="nx-btn nx-steam" aria-label={t('Entrar com Steam')} title={t('Entrar com Steam')} onClick={entrar}>
        <IconeSteam />
      </button>
    )

  const nome = seg?.nick || conta.nome || t('Minha conta')
  const avatar = fotoAtual || conta.avatar
  return (
    <div className="nx-conta" ref={caixa}>
      <button type="button" className="nx-conta-btn" aria-label={t('Minha conta')} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span className="nx-conta-avatar">
        <ComMoldura steamId={conta.id} emblema>
          {avatar && erroAvatar !== avatar ? (
            <img src={avatar} alt="" width="28" height="28" onError={() => setErroAvatar(avatar)} />
          ) : (
            <span className="nx-conta-ini">{nome.slice(0, 2).toUpperCase()}</span>
          )}
        </ComMoldura>
        </span>
        <span className="nx-conta-nome nx-dica">{nome}</span>
        <NivelDaConta id={conta.id} />
        <IconeUI tipo="baixo" tamanho={18} className="nx-conta-seta" />
      </button>
      {aberto && naTela(
        <div ref={painel} className={`nx-conta-menu nc-card${celular ? ' nx-painel-mobile' : ''}`} role="dialog" aria-modal={celular || undefined} aria-label={t('Minha conta')}>
          <ResumoMenuConta conta={conta} nome={nome} avatar={avatar} conectado={conectado} seg={seg} aoFechar={() => setAberto(false)} aoTrocarNick={() => { setAberto(false); setTrocandoNick(true) }} aoAssinar={() => { setAberto(false); setAssinando(true) }} />
        </div>
      )}
      {trocandoNick && <Suspense fallback={null}><TrocarNick atual={seg?.nick} aoFechar={() => setTrocandoNick(false)} /></Suspense>}
      {assinando && <Suspense fallback={null}><Deposito modo="sub" aoFechar={() => setAssinando(false)} /></Suspense>}

    </div>
  )
}

// Logo do time do jogador (null se ele não tem time, o time não tem logo ou a imagem falhou)
function useLogoDoTime(ativo = true) {
  const conta = useConta()
  const time = useTimeDe(ativo ? conta?.id : null)
  const [erro, setErro] = useState('')
  const src = time?.logo
  if (!ativo || !/^https?:\/\//.test(src || '') || erro === src) return null
  return { src, aoErro: () => setErro(src) }
}

// Celular (barra de baixo): o logo fica por trás do ícone "Times", ocupando a aba
function LogoDoTime() {
  const logo = useLogoDoTime()
  return logo && <img className="nx-time-logo" src={logo.src} alt="" aria-hidden="true" loading="lazy" onError={logo.aoErro} />
}

// Páginas que aparecem no menu sem login
const SEM_LOGIN = ['inicio', 'lobby', 'ranking', 'inventario', 'loja'] // o ▶ Jogar aparece sempre (sem login a página pede para entrar)

// Páginas fora do MENU: só para o título da barra de cima no celular
const OUTRAS = {
  perfil: { rotulo: 'Perfil', icone: 'perfil', trilha: 'Perfil do jogador' },
  times: { rotulo: 'Times', icone: 'mapa', trilha: 'Times registrados' },
  naoencontrada: { rotulo: 'Página não encontrada', icone: 'casa' },
}

// Menu da esquerda recolhido (só os ícones) ou aberto (ícone + nome): escolha guardada no navegador. Sem escolha, só o
// Lobby começa recolhido (a tela dele precisa da largura toda para os 5 jogadores e os controles da partida).
const CHAVE_RECOLHIDO = 'np_menu_recolhido'
function lerRecolhido(pagina) {
  try {
    const v = localStorage.getItem(CHAVE_RECOLHIDO)
    if (v === '1' || v === '0') return v === '1'
  } catch {
    // sem armazenamento: usa o padrão
  }
  // Lobby e telas de 1025 a 1279 px (onde o menu aberto roubaria espaço demais do conteúdo) começam recolhidos
  return pagina === 'lobby' || window.innerWidth < 1280
}

// Caminho da página atual na barra de cima (Início › Ranking). `trilha` vem da página quando ela tem um nível a mais
// (ex.: a partida: Partidas › Cache).
function Trilha({ pagina, atual, trilha }) {
  const t = useT()
  const passos = trilha || (pagina === 'inicio' ? [] : [{ rotulo: atual.trilha || atual.rotulo }])
  return (
    <nav className="np-trilha" aria-label={t('Você está em')}>
      <ol>
        <li>
          <a href="/" {...(passos.length ? {} : { 'aria-current': 'page' })}>
            <IconeUI tipo="casa" tamanho={17} />
            <span>{t('Início')}</span>
          </a>
        </li>
        {passos.map((p, i) => {
          const ultimo = i === passos.length - 1
          return (
            <li key={i}>
              <IconeUI tipo="direita" tamanho={14} className="np-trilha-sep" />
              {p.href && !ultimo ? <a href={p.href}>{t(p.rotulo)}</a> : <span {...(ultimo ? { 'aria-current': 'page' } : {})}>{t(p.rotulo)}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
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
// Computador (> 1024px): barra na lateral esquerda com ícone + nome (recolhível até só os ícones; o nome aparece ao
// passar o mouse: .nx-dica) e barra de cima com o caminho da página, os painéis (partidas, notificações, amigos), som,
// ⚙ e a conta. Celular e tablet: barra de cima com o nome da página atual, ⚙ e a conta, e barra de abas fixa embaixo
// (páginas, Perfil e "Mais" com o resto).
export default function Nav({ pagina, trilha }) {
  const t = useT()
  const [rolou, setRolou] = useState(false)
  const [mais, setMais] = useState(false)
  const [busca, setBusca] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  // Antes de montar no navegador vale o padrão da página (o HTML gerado no deploy é igual para todo mundo)
  const [recolhido, setRecolhido] = useState(pagina === 'lobby')
  useEffect(() => setRecolhido(lerRecolhido(pagina)), [pagina])
  const alternarRecolhido = () => {
    const novo = !recolhido
    setRecolhido(novo)
    try { localStorage.setItem(CHAVE_RECOLHIDO, novo ? '1' : '0') } catch { /* vale só nesta página */ }
  }
  const campoBusca = useRef(null)
  const caixaBusca = useRef(null)
  const botaoBusca = useRef(null)
  useEffect(() => {
    if (menuAberto) campoBusca.current?.focus()
  }, [menuAberto])
  const abrirBusca = (e) => {
    botaoBusca.current = e.currentTarget
    setMenuAberto(true)
  }
  const recolherMenu = () => {
    setMenuAberto(false)
    setBusca('')
    requestAnimationFrame(() => botaoBusca.current?.focus())
  }
  useEffect(() => {
    if (!menuAberto) return
    const fora = e => { if (!caixaBusca.current?.contains(e.target)) recolherMenu() }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [menuAberto])
  const fecharMais = useCallback(() => setMais(false), [])

  // Rolou a página: o menu fica com o vidro mais forte e a linha luminosa
  useEffect(() => {
    const ver = () => setRolou(window.scrollY > 12)
    ver()
    window.addEventListener('scroll', ver, { passive: true })
    return () => window.removeEventListener('scroll', ver)
  }, [])

  const conta = useConta()
  useEffect(() => iniciarAvisoEquipe(), [])
  const { pendente: avisoTime } = useAvisoEquipe()
  const { painel: admin } = useAdmin(conta) // o botão Admin aparece para quem tem acesso a alguma aba (admin ou cargo com acesso)
  // Sem login, o menu mostra só Início e Ranking (as outras páginas continuam abrindo pelo link; só não aparecem no menu).
  // Site sem login configurado: mostra tudo.
  const verPick = useAcessoPick()
  const menuBase = (conta || !loginAtivo() ? MENU : MENU.filter((m) => SEM_LOGIN.includes(m.id))).filter((m) => m.id !== 'pick' || verPick)
  const menu = menuBase.flatMap(m => m.id === 'equipes' ? [m, ITEM_TIMES_REGISTRADOS] : [m])
  if (!menuBase.some(m => m.id === 'equipes')) menu.push(ITEM_TIMES_REGISTRADOS)
  // Páginas do site de um lado; Admin (só para admin) separado delas
  const termo = busca.trim().toLocaleLowerCase()
  const paginas = menu.map((m) => <LinkMenu key={m.id} item={m} atual={pagina} />)
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
  const aberta = !recolhido

  return (
    <>
      <header data-site-nav="" className={`nx-nav${aberta ? ' nx-aberta' : ''}${rolou ? ' is-scrolled' : ''}`}>
        <div className="nx-nav-inner">
          <a className="nx-brand" href="/" aria-label="Neura Project">
            <img src="/icones/android-chrome-192x192.png" alt="" width="64" height="64" />
            <span>
              NEURA <span className="nx-outline">PROJECT</span>
              <span className="nx-sub">COUNTER-STRIKE 2</span>
            </span>
          </a>
          {/* Pesquisa no menu: aberta pela 🔍 da barra de cima (ou desta barra, recolhida) */}
          <div className="np-sidebar-reduzida">
            <button type="button" aria-label={t('Pesquisar no menu')} aria-expanded={menuAberto} aria-controls="np-busca-resultados" onClick={abrirBusca}>
              <IconeUI tipo="busca" tamanho={18}/>
            </button>
          </div>
          {/* Celular: no lugar da marca, o ícone e o nome da página atual */}
          <a className="nx-titulo" href="/" aria-label="Neura Project">
            {IconeAtual && <IconeAtual />}
            <span>{t(atual.rotulo)}</span>
          </a>
          <nav className="nx-links" id="np-menu-principal" aria-label={t('Menu principal')}>
            {paginas}
            {linkAdmin && (
              <>
                <span className="nx-links-sep" aria-hidden="true" />
                {linkAdmin}
              </>
            )}
          </nav>
          <div className="np-sidebar-fim">
            <span className="np-sidebar-titulo" aria-hidden="true">{t('Comunidade')}</span>
            {CONFIG.comunidade && (
              <a href={CONFIG.comunidade} target="_blank" rel="noopener" title={t('Comunidade na {nome}', { nome: CONFIG.comunidadeNome })}>
                <IconeDiscord tamanho={19} />
                <span className="nx-dica">{t('Comunidade')}</span>
              </a>
            )}
          </div>
          {/* Controle de largura da navegação; som e configurações ficam na barra superior. */}
          <div className="np-sidebar-rodape">

            <button type="button" className="np-menu-alternar" onClick={alternarRecolhido} aria-expanded={!recolhido} aria-controls="np-menu-principal" aria-label={recolhido ? t('Expandir menu') : t('Recolher menu')} title={recolhido ? t('Expandir menu') : t('Recolher menu')}>
              <IconeUI tipo={recolhido ? 'expandir' : 'recolher'} tamanho={20} />
            </button>
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
            <BotaoSom />
            <Configuracoes />
            <Conta />
          </div>
        </div>
      </header>

      <BarraRolagem />

      {/* Computador: barra de cima com o caminho da página, a pesquisa do menu, os painéis, som, ⚙ e a conta
          (a conta vem primeiro no HTML e vai para a ponta direita pelo CSS) */}
      <aside className="nx-direita" aria-label={t('Conta e configurações')}>
        <Trilha pagina={pagina} atual={atual} trilha={trilha} />
        <div className="np-topo-pesquisa" ref={caixaBusca}>
          <button type="button" className="nx-btn nx-btn-ghost np-topo-busca" aria-label={t('Pesquisar no menu')} aria-expanded={menuAberto} aria-controls="np-busca-resultados" onClick={menuAberto ? recolherMenu : abrirBusca}>
            <IconeUI tipo="busca" tamanho={19} />
          </button>
          {menuAberto && <div className="np-busca-painel" role="dialog" aria-label={t('Pesquisar no menu')} onKeyDown={e => { if (e.key === 'Escape') recolherMenu() }}>
            <header><b>{t('Pesquisar')}</b><button type="button" onClick={recolherMenu} aria-label={t('Fechar pesquisa')}><IconeUI tipo="fechar" tamanho={18}/></button></header>
            <label className="np-busca-campo"><IconeUI tipo="busca" tamanho={18}/><input ref={campoBusca} type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder={t('Pesquisar páginas')} aria-label={t('Pesquisar páginas')} aria-controls="np-busca-resultados"/></label>
            <nav id="np-busca-resultados" aria-label={t('Resultados da pesquisa')}>
              {menu.filter(m => !termo || t(m.rotulo).toLocaleLowerCase().includes(termo)).map(m => <a key={m.id} href={m.href}>{t(m.rotulo)}<IconeUI tipo="direita" tamanho={16}/></a>)}
              {menu.every(m => termo && !t(m.rotulo).toLocaleLowerCase().includes(termo)) && <p role="status">{t('Nenhum resultado')}</p>}
            </nav>
          </div>}
        </div>
        <BotaoSom />
        <Configuracoes />        <Conta />
        <PainelPartidas />
        <span className="nx-direita-sep" aria-hidden="true" />
        <PainelNotificacoes />
        <PainelAmigos />
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
            <button type="button" className="nx-aba nx-steam" aria-label={t('Entrar com Steam')} onClick={entrar}>
              <i><IconeSteam /></i>
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
