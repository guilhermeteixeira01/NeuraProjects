import { useCallback, useEffect, useRef, useState } from 'react'

// Painel de anúncios do Neura Launcher: anúncios, imagens da Hero e servidores.
// Tudo fica salvo no navegador (localStorage) e vai para o repositório do launcher pela API do GitHub.

const HERO_PADRAO = {
  enabled: true,
  interval: 7500,
  images: [
    'https://4kwallpapers.com/images/wallpapers/counter-strike--9192.png',
    'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/273110/5517e9ce03717bff29b8d5da5bbc6484fc9c8904.jpg',
    'https://wallpaperaccess.com/full/2086790.jpg',
    'https://sm.ign.com/t/ign_ap/articlepage/c/counter-strike-nexon-zombies-free-to-play-hits-ste/counter-strike-nexon-zombies-free-to-play-hits-ste_pamy.1280.jpg',
  ],
}

const TIPOS = { news: '📰 NOTÍCIA', update: '🔄 ATUALIZAÇÃO', event: '🎯 EVENTO', promo: '🎁 PROMOÇÃO' }
const PRIORIDADES = { 1: '⭐ ALTA', 2: '🔥 URGENTE' }

// ── localStorage (protegido: navegador sem acesso não quebra a página) ──
const ler = (chave, padrao) => {
  try {
    const v = localStorage.getItem(chave)
    return v === null ? padrao : v
  } catch {
    return padrao
  }
}
const lerJsonLocal = (chave, padrao) => {
  try {
    return JSON.parse(ler(chave, '')) ?? padrao
  } catch {
    return padrao
  }
}
const gravar = (chave, valor) => {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* sem localStorage */
  }
}

const configGh = () => ({
  owner: ler('gh_owner', '') || 'guilhermeteixeira01',
  repo: ler('gh_repo', '') || 'NeuraCSlauncher',
  path: ler('gh_path', '') || 'src/announcements.json',
  serversPath: ler('gh_servers_path', '') || 'src/server-list.json',
  branch: ler('gh_branch', '') || 'main',
  token: ler('gh_token', ''),
})

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const fmtData = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const hoje = () => new Date().toISOString().slice(0, 10)
const codificar = (texto) => btoa(unescape(encodeURIComponent(texto)))
const decodificar = (base64) => decodeURIComponent(escape(atob(base64.replace(/\n/g, ''))))
const servidorVazio = () => ({ name: '', host: '', port: 27015, label: '', private: false, password: '' })
const anuncioVazio = () => ({ title: '', description: '', image: '', type: 'news', date: hoje(), link: '', status: 'active', priority: '0' })

function IconeGithub() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  )
}

function Toasts({ lista }) {
  const icones = { success: '✓', error: '✕', info: '•' }
  return (
    <div id="toast-wrap">
      {lista.map((t) => (
        <div key={t.id} className={`toast ${t.tipo}${t.visivel ? ' show' : ''}`}>
          <span>{icones[t.tipo]}</span> {t.msg}
        </div>
      ))}
    </div>
  )
}

const rotuloCampo = { fontSize: 10, color: 'var(--dim)', marginBottom: 5, fontWeight: 700 }

export default function Admin() {
  const [anuncios, setAnuncios] = useState([])
  const [hero, setHero] = useState(HERO_PADRAO)
  const [servidores, setServidores] = useState([])
  const [ultimaEdicao, setUltimaEdicao] = useState('—')
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [modal, setModal] = useState(null) // { id | null, campos }
  const [config, setConfig] = useState(null) // campos do modal de configuração
  const [cfg, setCfg] = useState(configGh)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [toasts, setToasts] = useState([])
  const shaAnuncios = useRef(null)
  const shaServidores = useRef(null)
  const campoTitulo = useRef(null)

  const toast = useCallback((msg, tipo = 'info') => {
    const id = uid()
    setToasts((l) => [...l, { id, msg, tipo, visivel: false }])
    requestAnimationFrame(() => requestAnimationFrame(() => setToasts((l) => l.map((t) => (t.id === id ? { ...t, visivel: true } : t)))))
    setTimeout(() => {
      setToasts((l) => l.map((t) => (t.id === id ? { ...t, visivel: false } : t)))
      setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), 300)
    }, 3000)
  }, [])

  // Anúncios: guarda no navegador a cada mudança
  const mudarAnuncios = (lista) => {
    setAnuncios(lista)
    gravar('ncs_announcements', JSON.stringify(lista))
    const data = new Date().toLocaleDateString('pt-BR')
    gravar('ncs_last_edit', data)
    setUltimaEdicao(data)
  }

  // ── GitHub ──
  const carregarAnuncios = useCallback(
    async ({ silencioso = false } = {}) => {
      const c = configGh()
      if (!c.owner || !c.repo) {
        if (!silencioso) toast('Configure o GitHub primeiro.', 'error')
        return
      }
      const headers = { Accept: 'application/vnd.github.v3+json' }
      if (c.token) headers.Authorization = `token ${c.token}`
      try {
        const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${c.path}?ref=${c.branch}`, { headers })
        if (res.status === 404) {
          // Arquivo ainda não existe no repo — não é erro, é primeira vez
          shaAnuncios.current = null
          if (!silencioso) toast('Nenhum announcements.json encontrado ainda no repositório.', 'info')
          return
        }
        if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`)
        const data = await res.json()
        shaAnuncios.current = data.sha || null
        const json = JSON.parse(decodificar(data.content || ''))
        const lista = Array.isArray(json.announcements) ? json.announcements : []
        if (json.hero) {
          const h = {
            enabled: json.hero.enabled !== false,
            interval: Number(json.hero.interval) || 7500,
            images: Array.isArray(json.hero.images) ? json.hero.images : [],
          }
          setHero(h)
          gravar('ncs_hero', JSON.stringify(h))
        }
        setAnuncios(lista)
        gravar('ncs_announcements', JSON.stringify(lista))
        if (!silencioso) toast(`✓ ${lista.length} anúncio(s) carregado(s) do GitHub.`, 'success')
      } catch (err) {
        console.error(err)
        if (!silencioso) toast(`Erro ao carregar: ${err.message}`, 'error')
      }
    },
    [toast],
  )

  const carregarServidores = useCallback(
    async ({ silencioso = false } = {}) => {
      const c = configGh()
      if (!c.owner || !c.repo) {
        if (!silencioso) toast('Configure o GitHub primeiro.', 'error')
        return
      }
      const headers = { Accept: 'application/vnd.github.v3+json' }
      if (c.token) headers.Authorization = `token ${c.token}`
      try {
        const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${c.serversPath}?ref=${c.branch}`, { headers })
        if (res.status === 404) {
          shaServidores.current = null
          if (!silencioso) toast('Nenhum server-list.json encontrado ainda no repositório.', 'info')
          return
        }
        if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`)
        const data = await res.json()
        shaServidores.current = data.sha || null
        const json = JSON.parse(decodificar(data.content || ''))
        const lista = Array.isArray(json.servers) ? json.servers : []
        setServidores(lista)
        gravar('ncs_servers', JSON.stringify(lista))
        if (!silencioso) toast(`✓ ${lista.length} servidor(es) carregado(s) do GitHub.`, 'success')
      } catch (err) {
        console.error(err)
        if (!silencioso) toast(`Erro ao carregar servidores: ${err.message}`, 'error')
      }
    },
    [toast],
  )

  // Grava um arquivo no repositório do launcher (pega o sha atual se ainda não tiver)
  async function gravarNoGithub(caminho, conteudo, mensagem, shaRef) {
    const c = configGh()
    const url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${caminho}`
    const headers = { Authorization: `token ${c.token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' }
    let sha = shaRef.current
    if (!sha) {
      const r = await fetch(`${url}?ref=${c.branch}`, { headers })
      if (r.ok) sha = (await r.json()).sha
    }
    const body = { message: mensagem, content: codificar(conteudo), branch: c.branch }
    if (sha) body.sha = sha
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`)
    shaRef.current = (await res.json()).content?.sha || null
  }

  async function salvarTudo() {
    const c = configGh()
    if (!c.owner || !c.repo || !c.token) {
      abrirConfig()
      toast('Configure o GitHub primeiro.', 'error')
      return
    }
    const agora = new Date().toISOString().slice(0, 19).replace('T', ' ')
    setSalvando(true)
    try {
      // Envia TODOS os anúncios (ativos e inativos): o launcher já filtra por "active" sozinho
      await gravarNoGithub(c.path, JSON.stringify({ hero, announcements: anuncios }, null, 2), `chore: update announcements [dashboard] — ${agora}`, shaAnuncios)
      toast('Salvo no GitHub com sucesso!', 'success')
    } catch (err) {
      console.error(err)
      toast(`Erro: ${err.message}`, 'error')
    }
    try {
      // Servidor sem host (linha em branco esquecida) não vai para o launcher
      const limpos = servidores.filter((s) => s.host && s.host.trim())
      await gravarNoGithub(c.serversPath, JSON.stringify({ servers: limpos }, null, 2), `chore: update server-list [dashboard] — ${agora}`, shaServidores)
      toast('Servidores salvos no GitHub com sucesso!', 'success')
    } catch (err) {
      console.error(err)
      toast(`Erro ao salvar servidores: ${err.message}`, 'error')
    }
    setSalvando(false)
  }

  async function recarregarTudo() {
    setCarregando(true)
    await carregarAnuncios()
    await carregarServidores()
    setCarregando(false)
  }

  // Começo: o que está no navegador e, por cima, o que está no GitHub
  useEffect(() => {
    setAnuncios(lerJsonLocal('ncs_announcements', []))
    setHero(lerJsonLocal('ncs_hero', HERO_PADRAO))
    setServidores(lerJsonLocal('ncs_servers', []))
    setUltimaEdicao(ler('ncs_last_edit', '—'))
    carregarAnuncios({ silencioso: true })
    carregarServidores({ silencioso: true })
  }, [carregarAnuncios, carregarServidores])

  // ── Modais ──
  function abrirNovo() {
    setModal({ id: null, campos: anuncioVazio() })
  }
  function abrirEdicao(a) {
    setModal({
      id: a.id,
      campos: {
        title: a.title,
        description: a.description,
        image: a.image || '',
        type: a.type,
        date: a.date,
        link: a.link || '',
        status: a.status,
        priority: String(a.priority || 0),
      },
    })
  }
  function abrirConfig() {
    setConfig({ ...configGh() })
  }

  function salvarAnuncio() {
    const { campos, id } = modal
    const titulo = campos.title.trim()
    const desc = campos.description.trim()
    if (!titulo) return toast('O título é obrigatório.', 'error')
    if (!desc) return toast('A descrição é obrigatória.', 'error')
    const obj = {
      id: id || uid(),
      title: titulo,
      description: desc,
      image: campos.image.trim() || null,
      type: campos.type,
      date: campos.date || hoje(),
      link: campos.link.trim() || null,
      status: campos.status,
      priority: parseInt(campos.priority, 10) || 0,
    }
    if (id) {
      mudarAnuncios(anuncios.map((x) => (x.id === id ? obj : x)))
      toast('Anúncio atualizado!', 'success')
    } else {
      mudarAnuncios([obj, ...anuncios])
      toast('Anúncio criado!', 'success')
    }
    setModal(null)
  }

  function salvarConfig() {
    gravar('gh_owner', config.owner.trim())
    gravar('gh_repo', config.repo.trim())
    gravar('gh_path', config.path.trim())
    gravar('gh_servers_path', config.serversPath.trim())
    gravar('gh_branch', config.branch.trim())
    gravar('gh_token', config.token.trim())
    setCfg(configGh())
    toast('Configuração salva!', 'success')
    setConfig(null)
  }

  // Esc fecha os modais; Ctrl+Enter salva o anúncio
  const salvarRef = useRef(salvarAnuncio)
  salvarRef.current = salvarAnuncio
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') {
        setModal(null)
        setConfig(null)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && modal) salvarRef.current()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [modal])

  useEffect(() => {
    if (modal) campoTitulo.current?.focus()
  }, [modal?.id, modal === null])

  // ── Lista filtrada: prioridade maior primeiro; no empate, mais recente (mesma regra do launcher) ──
  const termo = busca.toLowerCase()
  const lista = anuncios
    .filter(
      (a) =>
        (!termo || a.title.toLowerCase().includes(termo) || a.description.toLowerCase().includes(termo)) &&
        (!filtroTipo || a.type === filtroTipo) &&
        (!filtroStatus || a.status === filtroStatus),
    )
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.date || '').localeCompare(a.date || ''))

  const ghOk = cfg.owner && cfg.repo && cfg.token
  const campo = (nome) => ({
    value: modal.campos[nome],
    onChange: (e) => setModal((m) => ({ ...m, campos: { ...m.campos, [nome]: e.target.value } })),
  })
  const contador = (n, aviso, max) => `char-count${n > aviso ? (n >= max ? ' over' : ' warn') : ''}`
  const mudarServidor = (i, mudanca) => setServidores((l) => l.map((s, j) => (j === i ? { ...s, ...mudanca } : s)))

  return (
    <>
      {/* HEADER */}
      <header>
        <div className="header-brand">
          <svg width="20" height="20" viewBox="-50 -55 100 110" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M0,-44 L38,-22 L38,14 Q38,38 0,52 Q-38,38 -38,14 L-38,-22 Z" strokeLinejoin="round" />
            <polygon points="0,-22 5,-8 20,-8 8,1 13,15 0,6 -13,15 -8,1 -20,-8 -5,-8" fill="currentColor" stroke="none" />
          </svg>
          Neura Project &nbsp;<span>/ ADMIN</span>
        </div>
        <div className="header-right">
          <span className="badge-env">PAINEL ADMIN</span>
          <button id="btn-config" onClick={abrirConfig}>
            ⚙ Configurar GitHub
          </button>
        </div>
      </header>

      {/* MAIN */}
      <div className="container">
        <div className="page-title">
          <div>
            <h1>
              Gerenciar <span>Anúncios</span>
            </h1>
            <p>Os anúncios são salvos em JSON e carregados pelo launcher automaticamente.</p>
          </div>
          <button className="btn-primary" onClick={abrirNovo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo Anúncio
          </button>
        </div>

        {/* STATS */}
        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">TOTAL</div>
            <div className="stat-value orange">{anuncios.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ATIVOS</div>
            <div className="stat-value green">{anuncios.filter((a) => a.status === 'active').length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">INATIVOS</div>
            <div className="stat-value" style={{ color: 'var(--dim)' }}>
              {anuncios.filter((a) => a.status === 'inactive').length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ÚLTIMA EDIÇÃO</div>
            <div className="stat-value yellow" style={{ fontSize: 13, marginTop: 8 }}>
              {ultimaEdicao}
            </div>
          </div>
        </div>

        {/* HERO */}
        <div className="json-section" style={{ marginBottom: 28 }}>
          <div className="json-header">
            <span>🖼️ HERO — IMAGENS DO BANNER</span>
            <button className="btn-copy" onClick={() => setHero((h) => ({ ...h, images: [...h.images, ''] }))}>
              + Adicionar imagem
            </button>
          </div>
          <div style={{ padding: 16 }}>
            {hero.images.length === 0 ? (
              <div className="empty-state" style={{ padding: 30 }}>
                <p>Nenhuma imagem configurada para a Hero.</p>
              </div>
            ) : (
              hero.images.map((url, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 10,
                    background: 'var(--panel2)',
                    border: '1px solid var(--border)',
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ width: 80, height: 45, borderRadius: 6, overflow: 'hidden', background: '#0b0c0f' }}>
                    {url && (
                      <img
                        src={url}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        onLoad={(e) => (e.currentTarget.style.display = '')}
                        alt=""
                      />
                    )}
                  </div>
                  <div>
                    <div style={rotuloCampo}>IMAGEM {i + 1}</div>
                    <input
                      type="text"
                      value={url}
                      placeholder="https://.../imagem.jpg"
                      onChange={(e) => setHero((h) => ({ ...h, images: h.images.map((u, j) => (j === i ? e.target.value : u)) }))}
                    />
                  </div>
                  <button className="btn-icon del" title="Remover" onClick={() => setHero((h) => ({ ...h, images: h.images.filter((_, j) => j !== i) }))}>
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <button
              className="btn-primary"
              onClick={() => {
                const h = { ...hero, images: hero.images.map((u) => u.trim()).filter(Boolean) }
                setHero(h)
                gravar('ncs_hero', JSON.stringify(h))
                toast('Configuração da Hero salva!', 'success')
              }}
            >
              💾 Salvar configuração da Hero
            </button>
          </div>
        </div>

        {/* SERVIDORES */}
        <div className="json-section" style={{ marginBottom: 28 }}>
          <div className="json-header">
            <span>🖥️ SERVIDORES — ABA &quot;SERVIDORES&quot; DO LAUNCHER</span>
            <button className="btn-copy" onClick={() => setServidores((l) => [...l, servidorVazio()])}>
              + Adicionar servidor
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--dim)', padding: '12px 16px 0' }}>
            O launcher consulta cada servidor ao vivo (mapa, jogadores, status) direto por UDP — aqui você só cadastra QUAIS
            servidores mostrar (nome, endereço e uma legenda opcional), não os dados de jogo em si. Usa os mesmos botões
            &quot;Recarregar do GitHub&quot; / &quot;Salvar no GitHub&quot; lá embaixo (salva anúncios + servidores juntos).
          </p>
          <div style={{ padding: 16 }}>
            {servidores.length === 0 ? (
              <div className="empty-state" style={{ padding: 30 }}>
                <p>Nenhum servidor cadastrado ainda.</p>
              </div>
            ) : (
              servidores.map((srv, i) => (
                <div key={i} style={{ marginBottom: 10, background: 'var(--panel2)', border: '1px solid var(--border)', padding: 10, borderRadius: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 90px 1fr auto', gap: 10, alignItems: 'center' }}>
                    {[
                      ['NOME', 'name', 'Servidor Principal'],
                      ['HOST / IP', 'host', '185.219.189.44'],
                      ['PORTA', 'port', '27015'],
                      ['LEGENDA', 'label', 'Brasil'],
                    ].map(([rotulo, nome, exemplo]) => (
                      <div key={nome}>
                        <div style={rotuloCampo}>{rotulo}</div>
                        <input
                          type="text"
                          value={srv[nome] ?? ''}
                          placeholder={exemplo}
                          onChange={(e) => mudarServidor(i, { [nome]: nome === 'port' ? Number(e.target.value) || 0 : e.target.value })}
                        />
                      </div>
                    ))}
                    <button className="btn-icon del" title="Remover" style={{ marginTop: 16 }} onClick={() => setServidores((l) => l.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dim)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!!srv.private} onChange={(e) => mudarServidor(i, { private: e.target.checked })} />
                      🔒 Servidor privado
                    </label>
                    <input
                      type="text"
                      value={srv.password ?? ''}
                      placeholder="Senha pra destravar"
                      onChange={(e) => mudarServidor(i, { password: e.target.value })}
                      style={{ flex: 1, ...(srv.private ? {} : { opacity: 0.4, pointerEvents: 'none' }) }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="toolbar">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Buscar anúncios..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select className="filter-select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="news">Notícia</option>
            <option value="update">Atualização</option>
            <option value="event">Evento</option>
            <option value="promo">Promoção</option>
          </select>
          <select className="filter-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        {/* LISTA */}
        <div className="ann-list">
          {lista.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p>
                {busca || filtroTipo || filtroStatus
                  ? 'Nenhum anúncio encontrado com esses filtros.'
                  : 'Nenhum anúncio ainda. Clique em "Novo Anúncio" para começar.'}
              </p>
            </div>
          ) : (
            lista.map((a) => (
              <div key={a.id} className={`ann-card type-${a.type}${a.status === 'inactive' ? ' inactive' : ''}`} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                {a.image ? (
                  <img
                    src={a.image}
                    alt=""
                    style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--panel2)', flexShrink: 0 }} />
                )}
                <div>
                  <div className="ann-meta">
                    <span className={`ann-type ${a.type}`}>{TIPOS[a.type] || a.type}</span>
                    <span className="ann-date">{fmtData(a.date)}</span>
                    <span className={`ann-status ${a.status}`}>{a.status === 'active' ? 'ATIVO' : 'INATIVO'}</span>
                    {a.priority ? (
                      <span className="ann-status" style={{ color: 'var(--orange)', borderColor: 'rgba(255,122,26,.3)', background: 'rgba(255,122,26,.1)' }}>
                        {PRIORIDADES[a.priority] || ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="ann-title">{a.title}</div>
                  <div className="ann-body">{a.description}</div>
                  {a.link && <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 6 }}>🔗 {a.link}</div>}
                </div>
                <div className="ann-actions">
                  <div className="ann-row-actions">
                    <button className="btn-icon edit" title="Editar" onClick={() => abrirEdicao(a)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="btn-icon toggle"
                      title={a.status === 'active' ? 'Desativar' : 'Ativar'}
                      onClick={() => {
                        const ativo = a.status !== 'active'
                        mudarAnuncios(anuncios.map((x) => (x.id === a.id ? { ...x, status: ativo ? 'active' : 'inactive' } : x)))
                        toast(ativo ? 'Anúncio ativado.' : 'Anúncio desativado.', 'info')
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        {a.status === 'active' ? (
                          <>
                            <rect x="2" y="7" width="20" height="14" rx="2" />
                            <path d="M16 3 8 3 12 7" />
                          </>
                        ) : (
                          <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="16" />
                            <line x1="8" y1="12" x2="16" y2="12" />
                          </>
                        )}
                      </svg>
                    </button>
                    <button
                      className="btn-icon del"
                      title="Excluir"
                      onClick={() => {
                        if (!confirm('Excluir este anúncio permanentemente?')) return
                        mudarAnuncios(anuncios.filter((x) => x.id !== a.id))
                        toast('Anúncio excluído.', 'info')
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* BARRA DE SALVAR */}
      <div className="save-bar">
        <div className="save-info">
          <span className={`status-dot ${ghOk ? 'ok' : 'err'}`} />
          <span title={ghOk ? `${cfg.owner}/${cfg.repo} — ${cfg.path} + ${cfg.serversPath}` : undefined}>
            {ghOk ? `${cfg.owner}/${cfg.repo}` : 'Configure o GitHub para salvar automaticamente'}
          </span>
        </div>
        <div className="save-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={recarregarTudo}
            disabled={carregando}
            style={{
              background: 'transparent',
              border: '1px solid var(--border2)',
              color: 'var(--dim)',
              padding: '9px 14px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: carregando ? 0.6 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Recarregar do GitHub
          </button>
          <button id="btn-save-gh" onClick={salvarTudo} disabled={salvando}>
            {salvando ? (
              '⏳ Salvando...'
            ) : (
              <>
                <IconeGithub /> Salvar no GitHub
              </>
            )}
          </button>
        </div>
      </div>

      {/* MODAL: ANÚNCIO */}
      {modal && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2>
                {modal.id ? 'Editar' : 'Novo'} <span>Anúncio</span>
              </h2>
              <button className="btn-close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="form-grid">
              <div className="form-group full">
                <label>Título</label>
                <input ref={campoTitulo} type="text" placeholder="Ex: Atualização de Mapas" maxLength={60} {...campo('title')} />
                <div className={contador(modal.campos.title.length, 50, 60)}>{modal.campos.title.length} / 60</div>
              </div>
              <div className="form-group full">
                <label>Descrição</label>
                <textarea placeholder="Descreva o anúncio em até 160 caracteres..." maxLength={160} {...campo('description')} />
                <div className={contador(modal.campos.description.length, 130, 160)}>{modal.campos.description.length} / 160</div>
              </div>
              <div className="form-group full">
                <label>Imagem (URL)</label>
                <input type="text" placeholder="https://.../imagem.png" {...campo('image')} />
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select {...campo('type')}>
                  <option value="news">📰 Notícia</option>
                  <option value="update">🔄 Atualização</option>
                  <option value="event">🎯 Evento</option>
                  <option value="promo">🎁 Promoção</option>
                </select>
              </div>
              <div className="form-group">
                <label>Data</label>
                <input type="date" {...campo('date')} />
              </div>
              <div className="form-group">
                <label>Link (opcional)</label>
                <input type="text" placeholder="https://..." {...campo('link')} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select {...campo('status')}>
                  <option value="active">✅ Ativo</option>
                  <option value="inactive">⏸ Inativo</option>
                </select>
              </div>
              <div className="form-group full">
                <label>Prioridade</label>
                <select {...campo('priority')}>
                  <option value="0">Normal</option>
                  <option value="1">Alta</option>
                  <option value="2">Urgente</option>
                </select>
                <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                  Anúncios com prioridade maior aparecem primeiro (na página inicial do launcher e na aba de notícias). Em caso
                  de empate, o mais recente vem na frente.
                </p>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={salvarAnuncio}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAR GITHUB */}
      {config && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setConfig(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2>
                Configurar <span>GitHub</span>
              </h2>
              <button className="btn-close" onClick={() => setConfig(null)}>
                ✕
              </button>
            </div>
            <div className="config-section">
              <h3>Repositório</h3>
              {[
                ['Usuário/Org', 'owner', 'guilhermeteixeira01'],
                ['Repositório', 'repo', 'NeuraCSlauncher'],
                ['Caminho do arquivo (anúncios)', 'path', 'src/announcements.json'],
                ['Caminho do arquivo (servidores)', 'serversPath', 'src/server-list.json'],
                ['Branch', 'branch', 'main'],
              ].map(([rotulo, nome, exemplo]) => (
                <div key={nome} className="config-row">
                  <label>{rotulo}</label>
                  <input type="text" placeholder={exemplo} value={config[nome]} onChange={(e) => setConfig((c) => ({ ...c, [nome]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="config-section">
              <h3>Autenticação</h3>
              <div className="config-row">
                <label>Personal Access Token</label>
                <input type="text" placeholder="ghp_xxxxxxxxxxxx" value={config.token} onChange={(e) => setConfig((c) => ({ ...c, token: e.target.value }))} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                O token é salvo apenas no seu navegador (localStorage). Gere um em GitHub → Settings → Developer settings → Tokens
                (classic) com permissão <strong>repo</strong>.
              </p>
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setConfig(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={salvarConfig}>
                Salvar Configuração
              </button>
            </div>
          </div>
        </div>
      )}

      <Toasts lista={toasts} />
    </>
  )
}
