import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, linkPerfil, loginAtivo, useConta } from '../../comum/conta.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'
import { CamadaMoldura, ComMoldura, chamar, useAdmin, useListaTimes } from '../../comum/Moldura.jsx'
import { COLECOES, MOLDURAS, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { NIVEL_MAX, nivelDe } from '../../comum/niveis.js'

// Painel de administrador (/admin/). A aba só aparece para admin, mas quem decide é o worker:
// toda chamada /admin/... confere o login e se a pessoa é admin (o dono, ou quem o dono promoveu).

const NIVEIS_OPCOES = Array.from({ length: NIVEL_MAX }, (_, i) => i + 1)
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR')
const iniciais = (nome) => String(nome || '?').trim().slice(0, 2).toUpperCase()
const dataBr = (iso) => {
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '')
}
const mensagemErro = (e) =>
  ({ login: 'Seu login venceu. Entre de novo com a Steam.', admin: 'Você não é mais administrador.', dono: 'Só o dono pode mudar os administradores.', xp: 'Ajuste de XP fora do limite.' })[e.message] ||
  'Não deu para salvar. Tente de novo.'

function Avatar({ src, nome, classe = 'adm-av' }) {
  const [erro, setErro] = useState(false)
  return urlOk(src) && !erro ? <img className={classe} src={src} alt="" loading="lazy" onError={() => setErro(true)} /> : <span className={`${classe} ini`}>{iniciais(nome)}</span>
}

// Junta todo mundo que o site conhece: jogadores do ranking, quem já entrou pela Steam e quem tem perfil salvo
function montarUsuarios(painel, ranking) {
  const lista = new Map()
  const pegar = (id) => {
    if (!lista.has(id)) lista.set(id, { id, nome: '', avatar: '', xpBase: 0, mapas: 0, usuario: null, perfil: {} })
    return lista.get(id)
  }
  for (const j of ranking?.jogadores || []) Object.assign(pegar(j.steamId), { nome: j.nome, avatar: j.avatar, xpBase: Number(j.xp) || 0, mapas: j.mapas })
  for (const [id, u] of Object.entries(painel.usuarios || {})) {
    const x = pegar(id)
    x.usuario = u
    x.nome ||= u.nome
    x.avatar ||= u.avatar
  }
  for (const [id, p] of Object.entries(painel.perfis || {})) pegar(id).perfil = p
  return [...lista.values()].map((x) => {
    const ajuste = Number(x.perfil.xp) || 0
    return { ...x, ajuste, nivel: nivelDe(x.xpBase + ajuste) }
  })
}

// ── Aba Usuários ──
function Usuarios({ usuarios, painel, dono, editar }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const admins = new Set([dono, ...(painel.config.admins || [])])
  const FILTROS = [
    ['todos', 'Todos', () => true],
    ['logados', 'Entraram no site', (u) => u.usuario],
    ['personalizados', 'Com perfil', (u) => Object.keys(u.perfil).length > 0],
    ['bloqueados', 'Bloqueados', (u) => u.perfil.bloqueado],
    ['admins', 'Admins', (u) => admins.has(u.id)],
  ]
  const termo = busca.trim().toLowerCase()
  const visiveis = usuarios
    .filter(FILTROS.find((f) => f[0] === filtro)[2])
    .filter((u) => !termo || u.nome.toLowerCase().includes(termo) || u.id.includes(termo))
    .sort((a, b) => b.nivel.xp - a.nivel.xp || a.nome.localeCompare(b.nome))

  return (
    <div className="adm-bloco">
      <div className="adm-ferramentas">
        <input className="adm-busca" type="search" placeholder="Buscar por nome ou SteamID…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="adm-chips" role="tablist" aria-label="Filtrar usuários">
          {FILTROS.map(([id, rotulo, f]) => (
            <button key={id} type="button" role="tab" aria-selected={filtro === id} className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>
              {rotulo} <small>{usuarios.filter(f).length}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="tabela adm-tabela-box">
        <table className="adm-tabela">
          <thead>
            <tr>
              <th className="esq">JOGADOR</th>
              <th>NÍVEL</th>
              <th className="esq">MOLDURA</th>
              <th className="esq">TIME</th>
              <th className="esq">SITUAÇÃO</th>
              <th>ÚLTIMO ACESSO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((u) => {
              const m = molduraPorId(u.perfil.moldura)
              return (
                <tr key={u.id}>
                  <td className="esq">
                    <span className="adm-jog">
                      <ComMoldura steamId={u.id}>
                        <Avatar src={u.avatar} nome={u.nome} />
                      </ComMoldura>
                      <span>
                        <a href={linkPerfil(u.id)}>{u.nome || 'Sem nome'}</a>
                        <small className="mono">{u.id}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="adm-nivel">
                      <SeloNivel nivel={u.nivel.nivel} tamanho={28} />
                      <span>
                        <b>{fmt(u.nivel.xp)} XP</b>
                        {u.ajuste !== 0 && <small className={u.ajuste > 0 ? 'mais' : 'menos'}>{u.ajuste > 0 ? `+${fmt(u.ajuste)}` : fmt(u.ajuste)} ajuste</small>}
                      </span>
                    </span>
                  </td>
                  <td className="esq">{m ? <span className="adm-moldura"><img src={urlMiniatura(m.id)} alt="" loading="lazy" />{m.nome}</span> : <span className="adm-nada">—</span>}</td>
                  <td className="esq">{u.perfil.time || <span className="adm-nada">—</span>}</td>
                  <td className="esq">
                    <span className="adm-tags">
                      {u.id === dono && <i className="dono">DONO</i>}
                      {u.id !== dono && admins.has(u.id) && <i className="admin">ADMIN</i>}
                      {u.perfil.bloqueado && <i className="bloq">BLOQUEADO</i>}
                      {u.usuario ? <i>LOGIN</i> : <i className="apagado">SÓ PARTIDAS</i>}
                    </span>
                  </td>
                  <td className="mono">{u.usuario ? dataBr(u.usuario.visto) : '—'}</td>
                  <td>
                    <button type="button" className="btn btn-ghost adm-editar" onClick={() => editar(u)}>
                      Editar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visiveis.length === 0 && <p className="adm-vazio">Ninguém encontrado.</p>}
      </div>
    </div>
  )
}

// Janela de edição de um usuário
function EditarUsuario({ u, ehAdmin, fechar, aoSalvar }) {
  const times = useListaTimes()
  const [moldura, setMoldura] = useState(u.perfil.moldura || '')
  const [time, setTime] = useState(u.perfil.time || '')
  const [ajuste, setAjuste] = useState(u.ajuste)
  const [bloqueado, setBloqueado] = useState(!!u.perfil.bloqueado)
  const [estado, setEstado] = useState('')
  const previa = nivelDe(u.xpBase + (Number(ajuste) || 0))

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [fechar])

  const enviar = async (corpo) => {
    setEstado('salvando')
    try {
      const d = await chamar('/admin/perfil', { id: u.id, ...corpo })
      aoSalvar(d.perfis)
      fechar()
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }
  const salvar = () => enviar({ moldura: moldura || null, time: time || null, xp: Math.round(Number(ajuste) || 0), bloqueado })
  const limpar = () => window.confirm(`Apagar moldura, time, ajuste de XP e bloqueio de ${u.nome || u.id}?`) && enviar({ limpar: true })

  return (
    <div className="sm-fundo" onClick={fechar}>
      <div className="adm-janela" role="dialog" aria-modal="true" aria-labelledby="adm-ed-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="sm-cab">
          <h2 id="adm-ed-titulo">Editar usuário</h2>
          <button type="button" className="sm-fechar" aria-label="Fechar" onClick={fechar}>
            ×
          </button>
        </div>
        <div className="adm-ed-corpo">
          <div className="adm-ed-topo">
            <span className="moldura-box adm-ed-av">
              <Avatar src={u.avatar} nome={u.nome} classe="adm-ed-img" />
              <CamadaMoldura id={moldura} />
            </span>
            <div>
              <b>{u.nome || 'Sem nome'}</b>
              <a className="mono" href={`https://steamcommunity.com/profiles/${u.id}`} target="_blank" rel="noopener">
                {u.id}
              </a>
              <span className="adm-ed-nivel">
                <SeloNivel nivel={previa.nivel} tamanho={30} />
                Nível {previa.nivel} · {fmt(previa.xp)} XP
              </span>
            </div>
          </div>

          <label className="adm-campo">
            <span>Ajuste de XP</span>
            <div className="adm-xp">
              {[-500, -100, 100, 500].map((d) => (
                <button key={d} type="button" onClick={() => setAjuste((a) => (Number(a) || 0) + d)}>
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              <input type="number" step="50" value={ajuste} onChange={(e) => setAjuste(e.target.value)} />
            </div>
            <small>
              Partidas: {fmt(u.xpBase)} XP · ajuste: {Number(ajuste) > 0 ? '+' : ''}
              {fmt(ajuste)} · total: {fmt(previa.xp)} XP
            </small>
          </label>

          <label className="adm-campo">
            <span>Moldura</span>
            <select value={moldura} onChange={(e) => setMoldura(e.target.value)}>
              <option value="">Sem moldura</option>
              {COLECOES.map((c) => (
                <optgroup key={c} label={c}>
                  {MOLDURAS.filter((m) => m.colecao === c).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small>O admin pode dar qualquer moldura, mesmo acima do nível do jogador.</small>
          </label>

          <label className="adm-campo">
            <span>Time</span>
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">Sem time</option>
              {times.map((t) => (
                <option key={t.nome} value={t.nome}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="adm-check">
            <input type="checkbox" checked={bloqueado} onChange={(e) => setBloqueado(e.target.checked)} />
            <span>
              <b>Bloquear personalização</b>
              <small>
                {ehAdmin
                  ? 'Este usuário é admin: o bloqueio não vale para admins (eles continuam podendo personalizar).'
                  : 'O jogador não consegue mais trocar a moldura nem o time sozinho.'}
              </small>
            </span>
          </label>
        </div>
        <div className="sm-rodape">
          <button type="button" className="btn btn-ghost adm-perigo" onClick={limpar} disabled={estado === 'salvando'}>
            Limpar perfil
          </button>
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && estado}
          </span>
          <button type="button" className="btn btn-ghost" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={estado === 'salvando'}>
            {estado === 'salvando' ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Aba Molduras: liberar por nível ──
function Molduras({ config, aoSalvar }) {
  const [porNivel, setPorNivel] = useState(!!config.molduraPorNivel)
  const [niveis, setNiveis] = useState(() => ({ ...config.nivelMoldura }))
  const [estado, setEstado] = useState('')
  const nivelDe1 = (id) => Number(niveis[id]) || 1
  const mudou = porNivel !== !!config.molduraPorNivel || MOLDURAS.some((m) => nivelDe1(m.id) !== (Number(config.nivelMoldura?.[m.id]) || 1))

  const definir = (ids, n) => setNiveis((v) => ({ ...v, ...Object.fromEntries(ids.map((id) => [id, Number(n)])) }))
  const salvar = async () => {
    setEstado('salvando')
    try {
      const nivelMoldura = Object.fromEntries(MOLDURAS.filter((m) => nivelDe1(m.id) > 1).map((m) => [m.id, nivelDe1(m.id)]))
      const d = await chamar('/admin/config', { molduraPorNivel: porNivel, nivelMoldura })
      aoSalvar(d.config)
      setEstado('Salvo!')
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }

  return (
    <div className="adm-bloco">
      <div className="adm-config-topo">
        <label className="adm-check grande">
          <input type="checkbox" checked={porNivel} onChange={(e) => setPorNivel(e.target.checked)} />
          <span>
            <b>Liberar molduras por nível</b>
            <small>Ligado: cada moldura só pode ser usada a partir do nível escolhido abaixo. Desligado: todas ficam livres.</small>
          </span>
        </label>
        <div className="adm-salvar">
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && estado}
          </span>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={!mudou || estado === 'salvando'}>
            {estado === 'salvando' ? 'Salvando…' : 'Salvar regras'}
          </button>
        </div>
      </div>

      <div className={`adm-colecoes${porNivel ? '' : ' desligado'}`}>
        {COLECOES.map((c) => {
          const daColecao = MOLDURAS.filter((m) => m.colecao === c)
          return (
            <section key={c} className="adm-colecao">
              <div className="adm-colecao-cab">
                <h3>{c}</h3>
                <label>
                  Coleção inteira:
                  <select value="" onChange={(e) => e.target.value && definir(daColecao.map((m) => m.id), e.target.value)}>
                    <option value="">nível…</option>
                    {NIVEIS_OPCOES.map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? 'Livre (1)' : `Nível ${n}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="adm-molduras">
                {daColecao.map((m) => (
                  <div key={m.id} className="adm-mold">
                    <img src={urlMiniatura(m.id)} alt="" loading="lazy" />
                    <span>{m.nome}</span>
                    <span className="adm-mold-nivel">
                      <SeloNivel nivel={nivelDe1(m.id)} tamanho={24} />
                      <select value={nivelDe1(m.id)} onChange={(e) => definir([m.id], e.target.value)} aria-label={`Nível de ${m.nome}`}>
                        {NIVEIS_OPCOES.map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? 'Livre' : `Nível ${n}`}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ── Aba Admins ──
function Admins({ config, dono, souDono, usuarios, aoSalvar }) {
  const [novo, setNovo] = useState('')
  const [estado, setEstado] = useState('')
  const nomeDe = (id) => usuarios.find((u) => u.id === id)?.nome || 'Sem nome'
  const avatarDe = (id) => usuarios.find((u) => u.id === id)?.avatar
  const mudar = async (id, admin) => {
    setEstado('salvando')
    try {
      const d = await chamar('/admin/admins', { id, admin })
      aoSalvar(d.config)
      setNovo('')
      setEstado('')
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }
  const valido = /^\d{17}$/.test(novo.trim())

  return (
    <div className="adm-bloco adm-admins">
      <p className="adm-nota">
        Admins acessam este painel e editam os usuários e as regras das molduras. {souDono ? 'Só você (dono) muda esta lista.' : 'Só o dono muda esta lista.'}
      </p>
      <ul>
        {[dono, ...(config.admins || []).filter((id) => id !== dono)].filter(Boolean).map((id) => (
          <li key={id}>
            <Avatar src={avatarDe(id)} nome={nomeDe(id)} />
            <span>
              <b>{nomeDe(id)}</b>
              <small className="mono">{id}</small>
            </span>
            {id === dono ? (
              <i className="dono">DONO</i>
            ) : (
              souDono && (
                <button type="button" className="btn btn-ghost adm-perigo" onClick={() => mudar(id, false)} disabled={estado === 'salvando'}>
                  Remover
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {souDono && (
        <div className="adm-novo-admin">
          <input list="adm-lista-ids" placeholder="SteamID64 (17 números)" value={novo} onChange={(e) => setNovo(e.target.value)} />
          <datalist id="adm-lista-ids">
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </datalist>
          <button type="button" className="btn btn-primary" disabled={!valido || estado === 'salvando'} onClick={() => mudar(novo.trim(), true)}>
            Tornar admin
          </button>
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && estado}
          </span>
        </div>
      )}
    </div>
  )
}

// "há 5 s" (conta sozinho)
function Ha({ desde }) {
  const [, setTique] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTique((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!desde) return 'agora'
  const s = Math.max(0, Math.round((Date.now() - desde) / 1000))
  return s < 2 ? 'agora' : s < 60 ? `há ${s} s` : `há ${Math.floor(s / 60)} min`
}

function Aviso({ titulo, texto, children }) {
  return (
    <section className="hero adm-hero">
      <FundoHero quantidade={8} />
      <div className="wrap">
        <span className="kicker">ADMINISTRAÇÃO</span>
        <h1>{titulo}</h1>
        {texto && <p className="lead">{texto}</p>}
        {children && <div className="adm-acoes">{children}</div>}
      </div>
    </section>
  )
}

export default function Admin() {
  const conta = useConta()
  const eu = useAdmin(conta)
  const [montado, setMontado] = useState(false)
  const [painel, setPainel] = useState(null)
  const [ranking, setRanking] = useState(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('usuarios')
  const [editando, setEditando] = useState(null)

  useEffect(() => setMontado(true), [])

  // silencioso = atualização sozinha: não pisca a tela e ignora falha de rede (tenta de novo na próxima)
  const [atualizado, setAtualizado] = useState(null)
  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setErro('')
    Promise.all([chamar('/admin/dados'), lerJson(`/ranking/ranking.json?t=${Date.now()}`)])
      .then(([p, r]) => {
        setPainel(p)
        setRanking(r)
        setAtualizado(Date.now())
      })
      .catch((e) => (!silencioso || e.message !== 'falhou') && setErro(mensagemErro(e)))
  }, [])
  useEffect(() => {
    if (eu.admin) carregar()
  }, [eu.admin, carregar])
  // Atualiza sozinho a cada 15 s com a aba visível (e ao voltar para a aba); pausa enquanto edita alguém
  useEffect(() => {
    if (!eu.admin || editando) return
    const tique = () => document.visibilityState === 'visible' && carregar(true)
    const id = setInterval(tique, 15000)
    document.addEventListener('visibilitychange', tique)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tique)
    }
  }, [eu.admin, editando, carregar])

  const usuarios = useMemo(() => (painel ? montarUsuarios(painel, ranking) : []), [painel, ranking])
  const fecharEdicao = useCallback(() => setEditando(null), [])

  let conteudo
  if (!montado || (conta && eu.id !== conta.id)) conteudo = <Aviso titulo="Carregando…" />
  else if (!conta)
    conteudo = (
      <Aviso titulo="Painel de administrador" texto="Entre com a Steam para acessar.">
        {loginAtivo() && (
          <button type="button" className="btn btn-primary" onClick={entrar}>
            Entrar com Steam
          </button>
        )}
      </Aviso>
    )
  else if (!eu.admin) conteudo = <Aviso titulo="Acesso restrito" texto="Esta área é só para administradores do site." />
  else if (erro)
    conteudo = (
      <Aviso titulo="Não deu para carregar" texto={erro}>
        <button type="button" className="btn btn-primary" onClick={carregar}>
          Tentar de novo
        </button>
      </Aviso>
    )
  else if (!painel) conteudo = <Aviso titulo="Carregando painel…" />
  else {
    const n = {
      logados: Object.keys(painel.usuarios || {}).length,
      ranking: ranking?.jogadores?.length || 0,
      perfis: Object.keys(painel.perfis || {}).length,
      bloqueados: Object.values(painel.perfis || {}).filter((p) => p.bloqueado).length,
    }
    const ABAS = [
      ['usuarios', 'Usuários'],
      ['molduras', 'Molduras'],
      ['admins', 'Admins'],
    ]
    conteudo = (
      <>
        <section className="hero adm-hero">
          <FundoHero quantidade={8} />
          <div className="wrap">
            <span className="kicker">ADMINISTRAÇÃO</span>
            <h1>Painel do site</h1>
            <div className="adm-resumo">
              {[
                ['ENTRARAM NO SITE', n.logados],
                ['JOGADORES NO RANKING', n.ranking],
                ['PERFIS PERSONALIZADOS', n.perfis],
                ['BLOQUEADOS', n.bloqueados],
              ].map(([r, v]) => (
                <div key={r} className="caixa">
                  <span className="mono">{r}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="secao adm-secao">
          <div className="wrap">
            <div className="adm-abas" role="tablist" aria-label="Seções do painel">
              {ABAS.map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'active' : ''} onClick={() => setAba(id)}>
                  {rotulo}
                </button>
              ))}
              <span className="adm-vivo" title="O painel se atualiza sozinho a cada 15 segundos">
                <i /> {editando ? 'Pausado (editando)' : <>Atualiza sozinho · <Ha desde={atualizado} /></>}
              </span>
              <button type="button" className="adm-recarregar" onClick={() => carregar()} title="Recarregar agora">
                ↻
              </button>
            </div>
            {aba === 'usuarios' && <Usuarios usuarios={usuarios} painel={painel} dono={painel.dono} editar={setEditando} />}
            {aba === 'molduras' && <Molduras key={JSON.stringify(painel.config)} config={painel.config} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />}
            {aba === 'admins' && <Admins config={painel.config} dono={painel.dono} souDono={eu.dono} usuarios={usuarios} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />}
          </div>
        </section>
        {editando && <EditarUsuario u={editando} ehAdmin={editando.id === painel.dono || (painel.config.admins || []).includes(editando.id)} fechar={fecharEdicao} aoSalvar={(perfis) => setPainel((p) => ({ ...p, perfis }))} />}
      </>
    )
  }

  return (
    <Layout pagina="admin">
      <main>{conteudo}</main>
    </Layout>
  )
}
