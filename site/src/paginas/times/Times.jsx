import { useEffect, useRef, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
import { Icone } from '../../comum/Icones.jsx'
import { carregarTimes } from '../../comum/times.js'
import { Contador } from '../../comum/efeitos.jsx'
import { FundoHero, Palavras } from '../../comum/HeroFundo.jsx'

const CHAVE_TOKEN = 'neura_gh_token'
const API = `https://api.github.com/repos/${CONFIG.repositorio}/contents/${CONFIG.arquivoTimes}`
const DICA_NOME = 'Até 24 caracteres. É o nome que aparece no veto e no servidor.'

const lerToken = () => {
  try {
    return localStorage.getItem(CHAVE_TOKEN) || ''
  } catch {
    return ''
  }
}
const chave = (nome) => nome.trim().toLowerCase()
const logoValido = (u) => {
  u = (u || '').trim()
  return u === '' || (u.length <= 300 && /^https?:\/\/\S+$/i.test(u) && !/[;"\\<>]/.test(u))
}
const iniciais = (n) =>
  (n || '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'
const ordenar = (l) => [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const b64 = (texto) => {
  let bin = ''
  new TextEncoder().encode(texto).forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}
const deB64 = (b) => {
  const bin = atob(b.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
const cabecalhos = () => ({
  Authorization: `Bearer ${lerToken()}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

// Logo do time (ou as iniciais, se não tiver logo ou a imagem não abrir)
function Logo({ time, className = 'logo' }) {
  const [erro, setErro] = useState(false)
  useEffect(() => setErro(false), [time.logo])
  return (
    <span className={className}>
      {time.logo && !erro ? <img src={time.logo} alt="" onError={() => setErro(true)} /> : iniciais(time.nome)}
    </span>
  )
}

export default function Times() {
  const [original, setOriginal] = useState([]) // como está no site
  const [times, setTimes] = useState([]) // como está na tela
  const [marcados, setMarcados] = useState({}) // nome (minúsculo) -> 'novo' | 'editado'
  const [carregou, setCarregou] = useState(false)
  const [erroLista, setErroLista] = useState('')
  const [editando, setEditando] = useState(null) // índice em edição
  const [nome, setNome] = useState('')
  const [logo, setLogo] = useState('')
  const [erroNome, setErroNome] = useState('')
  const [busca, setBusca] = useState('')
  const [token, setToken] = useState('')
  const [campoToken, setCampoToken] = useState('')
  const [tokenAberto, setTokenAberto] = useState(false)
  const [msg, setMsg] = useState({ texto: '', tipo: '' })
  const [salvando, setSalvando] = useState(false)
  const [mostrarSalvo, setMostrarSalvo] = useState(false)
  const campoNome = useRef(null)
  const campoTokenRef = useRef(null)
  const form = useRef(null)

  const mudou = !igual(times, original)

  async function carregar() {
    try {
      let dados
      if (lerToken()) {
        // Com token: lê pela API (versão mais nova)
        const r = await fetch(`${API}?ref=${CONFIG.branch}&t=${Date.now()}`, { headers: cabecalhos(), cache: 'no-store' })
        if (r.status === 404) dados = { times: [] }
        else if (!r.ok) throw new Error(`GitHub ${r.status}`)
        else dados = JSON.parse(deB64((await r.json()).content))
      } else {
        dados = { times: await carregarTimes() }
      }
      const lista = ordenar(
        (dados.times || []).map((t) => ({ nome: String(t.nome || ''), logo: String(t.logo || '') })).filter((t) => t.nome),
      )
      setOriginal(lista)
      setTimes(lista)
      setMarcados({})
      setErroLista('')
    } catch (e) {
      setErroLista(`Não consegui carregar a lista (${e.message}). Confira o token.`)
    } finally {
      setCarregou(true)
    }
  }

  useEffect(() => {
    setToken(lerToken())
    carregar()
  }, [])

  // Mexeu na lista: a mensagem volta a ser "alterações não salvas"
  useEffect(() => {
    if (mudou) setMsg({ texto: '', tipo: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times])

  // Não perde alteração por engano
  useEffect(() => {
    if (!mudou) return
    const sair = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', sair)
    return () => window.removeEventListener('beforeunload', sair)
  }, [mudou])

  function limparForm() {
    setEditando(null)
    setNome('')
    setLogo('')
    setErroNome('')
  }

  function enviar(e) {
    e.preventDefault()
    const limpo = nome.replace(/[;"\\]/g, '').trim()
    const url = logo.trim()
    if (!limpo || !logoValido(url)) return
    if (times.some((t, i) => i !== editando && chave(t.nome) === chave(limpo))) {
      setErroNome('Já existe um time com esse nome na lista.')
      return
    }
    const novos = { ...marcados }
    let lista
    if (editando === null) {
      lista = [...times, { nome: limpo, logo: url }]
      novos[chave(limpo)] = 'novo'
    } else {
      delete novos[chave(times[editando].nome)]
      lista = times.map((t, i) => (i === editando ? { nome: limpo, logo: url } : t))
      novos[chave(limpo)] = 'editado'
    }
    setTimes(ordenar(lista))
    setMarcados(novos)
    setMostrarSalvo(false)
    limparForm()
  }

  function editar(i) {
    setEditando(i)
    setNome(times[i].nome)
    setLogo(times[i].logo || '')
    setErroNome('')
    campoNome.current?.focus()
    window.scrollTo({ top: form.current.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' })
  }

  function remover(i) {
    if (!confirm(`Remover "${times[i].nome}" da lista?`)) return
    const novos = { ...marcados }
    delete novos[chave(times[i].nome)]
    setMarcados(novos)
    setTimes(times.filter((_, j) => j !== i))
    if (editando === i) limparForm()
  }

  function desfazer() {
    setTimes(original)
    setMarcados({})
    limparForm()
  }

  function salvarToken() {
    const v = campoToken.trim()
    if (!v) return
    try {
      localStorage.setItem(CHAVE_TOKEN, v)
    } catch {
      /* navegador sem localStorage */
    }
    setToken(v)
    setCampoToken('')
    carregar()
  }

  function removerToken() {
    try {
      localStorage.removeItem(CHAVE_TOKEN)
    } catch {
      /* navegador sem localStorage */
    }
    setToken('')
  }

  async function salvar() {
    if (!lerToken()) {
      setTokenAberto(true)
      campoTokenRef.current?.focus()
      setMsg({ texto: 'Coloque o token do GitHub para salvar no site.', tipo: 'erro' })
      return
    }
    setSalvando(true)
    setMsg({ texto: 'Salvando no site...', tipo: '' })
    try {
      // Pega o sha mais novo (alguém pode ter salvo antes) e grava
      const r = await fetch(`${API}?ref=${CONFIG.branch}&t=${Date.now()}`, { headers: cabecalhos(), cache: 'no-store' })
      if (r.status !== 404 && !r.ok) throw new Error(`GitHub ${r.status}`)
      const atual = r.status === 404 ? null : await r.json()
      const corpo = {
        message: `times: lista atualizada (${times.length} times)`,
        content: b64(JSON.stringify({ atualizado: new Date().toISOString(), times }, null, 2) + '\n'),
        branch: CONFIG.branch,
      }
      if (atual) corpo.sha = atual.sha
      const resp = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...cabecalhos() },
        body: JSON.stringify(corpo),
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j.message || `GitHub ${resp.status}`)
      }
      setOriginal(times)
      setMarcados({})
      setMostrarSalvo(true)
      setMsg({ texto: 'Salvo! O Pick & Ban já usa a lista nova em alguns minutos.', tipo: 'ok' })
      setTimeout(() => setMostrarSalvo(false), 5000)
    } catch (e) {
      const permissao = /401|403|Bad credentials|not accessible/i.test(e.message)
      setMsg({
        texto: `Não salvou: ${e.message}${permissao ? ' — confira o token e a permissão Contents: Read and write.' : ''}`,
        tipo: 'erro',
      })
    } finally {
      setSalvando(false)
    }
  }

  const filtro = chave(busca)
  const visiveis = times.map((t, i) => ({ t, i })).filter((x) => !filtro || chave(x.t.nome).includes(filtro))
  const logoOk = logoValido(logo)
  const barraVisivel = mudou || mostrarSalvo || (msg.tipo === 'erro' && msg.texto)
  const textoMsg =
    mudou && !msg.texto
      ? token
        ? 'Você tem alterações não salvas.'
        : 'Alterações não salvas. Coloque o token do GitHub (ao lado) para salvar no site.'
      : msg.texto

  return (
    <Layout pagina="times">
      <main>
        <section className="hero">
          <FundoHero />
          <div className="wrap hero-inner">
            <div>
              <span className="chip fx-entra" style={{ '--e': 0 }}>
                <span className="ponto" />
                CONFIGURAÇÃO · PICK &amp; BAN
              </span>
              <h1>
                <Palavras texto="Lista de" />
                <span className="fx-gradiente">
                  <Palavras texto="times" inicio={2} />
                </span>
              </h1>
              <p className="lead fx-entra" style={{ '--e': 3 }}>
                Cadastre o nome e o logo de cada time uma vez. No Pick &amp; Ban, é só digitar o nome que o logo já entra
                sozinho — e vai junto para o servidor e para a página das partidas.
              </p>
            </div>
            <div className="resumo fx-entra" style={{ '--e': 4 }}>
              <div className="caixa">
                <span className="mono">TIMES</span>
                <b>
                  <Contador valor={carregou ? times.length : null} />
                </b>
              </div>
              <div className="caixa">
                <span className="mono">COM LOGO</span>
                <b>
                  <Contador valor={carregou ? times.filter((t) => t.logo).length : null} />
                </b>
              </div>
            </div>
          </div>
        </section>

        <section className="secao" style={{ paddingTop: 44 }}>
          <div className="wrap layout">
            {/* Adicionar / editar */}
            <div className="card hud-frame spot" style={{ padding: 0 }}>
              <div className="card-head">
                <h2>{editando === null ? 'Adicionar time' : 'Editar time'}</h2>
                <span className="mono">{editando === null ? 'NOVO' : 'EDITANDO'}</span>
              </div>
              <form className="card-body" ref={form} autoComplete="off" onSubmit={enviar}>
                <label className="campo">
                  <span className="mono">NOME DO TIME</span>
                  <input
                    ref={campoNome}
                    maxLength={24}
                    placeholder="Ex.: Pain"
                    required
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value)
                      setErroNome('')
                    }}
                  />
                  <span className={`dica${erroNome ? ' erro' : ''}`}>{erroNome || DICA_NOME}</span>
                </label>
                <label className="campo">
                  <span className="mono">LOGO (URL DA IMAGEM)</span>
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={300}
                    placeholder="https://i.imgur.com/xxxx.png"
                    className={logoOk ? '' : 'invalido'}
                    value={logo}
                    onChange={(e) => setLogo(e.target.value)}
                  />
                  <span className={`dica${logoOk ? '' : ' erro'}`}>
                    {logoOk
                      ? 'Link que abre direto a imagem (.png, .jpg…). Opcional.'
                      : 'Precisa ser um link https:// de imagem (até 300 caracteres).'}
                  </span>
                </label>
                <div className="previa">
                  <Logo time={{ nome: nome || '?', logo: logoOk ? logo.trim() : '' }} />
                  <div>
                    <span className="mono">PRÉVIA</span>
                    <b>{nome.trim() || 'Nome do time'}</b>
                  </div>
                </div>
                <div className="ferramentas">
                  <button className="btn btn-primary" type="submit">
                    {editando === null ? 'Adicionar à lista' : 'Salvar alteração'}
                  </button>
                  {editando !== null && (
                    <button className="btn btn-ghost" type="button" onClick={limparForm}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>

              <details className="token" open={tokenAberto} onToggle={(e) => setTokenAberto(e.currentTarget.open)}>
                <summary>
                  <span>Acesso para salvar no site</span>
                  <span className={`estado-token ${token ? 'on' : 'off'}`}>{token ? 'TOKEN SALVO' : 'SEM TOKEN'}</span>
                </summary>
                <div className="card-body">
                  <ol className="passos">
                    <li>
                      Abra{' '}
                      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">
                        github.com → novo token (Fine-grained)
                      </a>
                    </li>
                    <li>
                      <b>Repository access:</b> só o <b>NeuraProjects</b>
                    </li>
                    <li>
                      <b>Permissions → Contents:</b> Read and write
                    </li>
                    <li>
                      Cole abaixo. Ele fica salvo <b>só neste navegador</b>.
                    </li>
                  </ol>
                  <label className="campo">
                    <span className="mono">TOKEN DO GITHUB</span>
                    <input
                      ref={campoTokenRef}
                      type="password"
                      placeholder={token ? '•••••••• (salvo neste navegador)' : 'github_pat_...'}
                      value={campoToken}
                      onChange={(e) => setCampoToken(e.target.value)}
                    />
                  </label>
                  <div className="ferramentas">
                    <button className="btn btn-ghost" type="button" onClick={salvarToken}>
                      Salvar token
                    </button>
                    {token && (
                      <button className="btn btn-ghost" type="button" onClick={removerToken}>
                        Remover token
                      </button>
                    )}
                  </div>
                </div>
              </details>
            </div>

            {/* Lista */}
            <div>
              <div className="card">
                <div className="card-head">
                  <h2>Times cadastrados</h2>
                  <input
                    className="busca"
                    type="search"
                    placeholder="Buscar time..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    style={{
                      background: 'var(--bg-soft)',
                      border: '1px solid var(--border-2)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: 'var(--text)',
                      font: 'inherit',
                      fontSize: 13,
                      maxWidth: 240,
                    }}
                  />
                </div>
                <div className="lista">
                  {!carregou ? (
                    <div className="vazio">Carregando lista...</div>
                  ) : erroLista ? (
                    <div className="vazio">{erroLista}</div>
                  ) : visiveis.length === 0 ? (
                    <div className="vazio">
                      {times.length ? 'Nenhum time encontrado.' : 'Nenhum time cadastrado ainda. Adicione o primeiro ao lado.'}
                    </div>
                  ) : (
                    visiveis.map(({ t, i }, n) => (
                      <div
                        key={t.nome}
                        className={`time ${marcados[chave(t.nome)] || ''}`}
                        style={{ animationDelay: `${Math.min(n, 12) * 30}ms` }}
                      >
                        <Logo time={t} />
                        <div>
                          <b>{t.nome}</b>
                          <small>{t.logo || 'sem logo'}</small>
                        </div>
                        <div className="acoes-time">
                          <button className="icone-btn" type="button" title="Editar" aria-label={`Editar ${t.nome}`} onClick={() => editar(i)}>
                            <Icone tamanho={15}>
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </Icone>
                          </button>
                          <button
                            className="icone-btn perigo"
                            type="button"
                            title="Remover"
                            aria-label={`Remover ${t.nome}`}
                            onClick={() => remover(i)}
                          >
                            <Icone tamanho={15}>
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                            </Icone>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {barraVisivel && (
                <div className="barra-salvar">
                  <span className={`msg${msg.tipo ? ` ${msg.tipo}` : ''}`}>{textoMsg}</span>
                  <div className="ferramentas">
                    <button className="btn btn-ghost" type="button" onClick={desfazer}>
                      Desfazer
                    </button>
                    <button className="btn btn-primary" type="button" onClick={salvar} disabled={salvando}>
                      Salvar no site
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
