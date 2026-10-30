import AdminMissoes from './AdminMissoes.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Layout from '../../comum/Layout.jsx'
import { entrar, linkPerfil, loginAtivo, useConta } from '../../comum/conta.js'
import { lerJson, urlOk } from '../../comum/dados.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'
import { CamadaMoldura, CargosDe, ComMoldura, IconeEquipe, SELOS_PADRAO, SeloCargo, SeloEquipe, cargosComEquipe, chamar, nomeDoCargo, useAdmin } from '../../comum/Moldura.jsx'
import { COLECOES, MOLDURAS, classeForma, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { NIVEL_MAX, nivelDe, rotuloNivel, textoNivel } from '../../comum/niveis.js'
import { ordenarRanking } from '../../comum/ranking.js'
import { localeAtual, useT } from '../../comum/i18n.js'
import { ICONES_CARGO, IconeCargo } from '../../comum/cargos.jsx'
import { NIVEIS_SUB, SUB_MESES_PADRAO, maisUmMes, nivelDaSub, tituloNivel, urlEmblema } from '../../comum/assinatura.js'
import { INSIGNIAS, imagemInsignia, insigniaPorId } from '../../comum/insignias.js'
import { CATEGORIAS, indicar, urlImg, urlImgArma, useCatalogo } from '../../comum/skins.js'
import CartaoSkin from '../../comum/CartaoSkin.jsx'
import { confirmar } from '../../comum/Dialogos.jsx'
import AdminCaixas from './AdminCaixas.jsx'
import AdminPontos, { ConfigDepositos } from './AdminPontos.jsx'
import AdminLogs from './AdminLogs.jsx'
import AdminServidor from './AdminServidor.jsx'
import AdminPlanos from './AdminPlanos.jsx'
import { lerCaixasPublicas } from '../../comum/loja.js'
import { useAvatar } from '../../comum/avatares.js'
import SeletorMoldura from '../perfil/SeletorMoldura.jsx'
import { IMAGENS_SELO, urlSelo } from '../../comum/selosEquipe.js'
import { CARDS, TEMAS_CARD, ehAnimado, nomeCard, nomeTema, temaCard, urlMiniCard } from '../../comum/cardsPerfil.js'

// Painel de administrador (/admin/). A aba só aparece para admin, mas quem decide é o worker:
// toda chamada /admin/... confere o login e se a pessoa é admin (o dono, ou quem o dono promoveu).

const NIVEIS_OPCOES = Array.from({ length: NIVEL_MAX }, (_, i) => i + 1) // molduras e cards liberam do nível 1 até o Elite (11)
const fmt = (v) => Number(v || 0).toLocaleString(localeAtual())
const iniciais = (nome) => String(nome || '?').trim().slice(0, 2).toUpperCase()
const dataBr = (iso) => {
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleString(localeAtual(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '')
}
const mensagemErro = (e) =>
  ({ login: 'Seu login venceu. Entre de novo com a Steam.', admin: 'Você não é mais administrador.', dono: 'Só o dono pode mudar os administradores.', xp: 'Ajuste de XP fora do limite.', exclusiva: 'Essa moldura é exclusiva de um cargo que o jogador não tem: dê o cargo primeiro.' })[e.message] ||
  'Não deu para salvar. Tente de novo.'

function Avatar({ id, src: padrao, nome, classe = 'adm-av' }) {
  const src = useAvatar(id, padrao) // foto atual da Steam
  const [erro, setErro] = useState('')
  return urlOk(src) && erro !== src ? <img className={classe} src={src} alt="" loading="lazy" onError={() => setErro(src)} /> : <span className={`${classe} ini`}>{iniciais(nome)}</span>
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
  const ordem = ordenarRanking(ranking?.jogadores || [], painel.perfis || {}).map((j) => j.steamId)
  const automaticos = (painel.config.cargos || []).filter((c) => c.top > 0)
  return [...lista.values()].map((x) => {
    const ajuste = Number(x.perfil.xp) || 0
    const pos = ordem.indexOf(x.id)
    // auto: cargos que o jogador tem agora por estar no top N do ranking (saem sozinhos se ele cair)
    const auto = automaticos.filter((c) => pos >= 0 && pos < c.top).map((c) => c.id)
    return { ...x, ajuste, nivel: nivelDe(x.xpBase + ajuste, x.mapas), pos, auto }
  })
}

// ── Aba Usuários ──
function Usuarios({ usuarios, painel, dono, editar }) {
  const tr = useT()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const admins = new Set([dono, ...(painel.config.admins || [])])
  const FILTROS = [
    ['todos', 'Todos', () => true],
    ['logados', 'Entraram no site', (u) => u.usuario],
    ['personalizados', 'Com perfil', (u) => Object.keys(u.perfil).length > 0],
    ['bloqueados', 'Bloqueados', (u) => u.perfil.bloqueado],
    ['cargos', 'Com cargo', (u) => (u.perfil.cargos || []).length > 0 || u.auto.length > 0],
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
        <input className="adm-busca" type="search" placeholder={tr('Buscar por nome ou SteamID…')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="adm-chips" role="tablist" aria-label={tr('Filtrar usuários')}>
          {FILTROS.map(([id, rotulo, f]) => (
            <button key={id} type="button" role="tab" aria-selected={filtro === id} className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>
              {tr(rotulo)} <small>{usuarios.filter(f).length}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="adm-usuarios-grade">
            {visiveis.map((u) => {
              return (
                <article key={u.id} className="adm-usuario-card" aria-label={u.nome || u.id}>
                  <div className="adm-usuario-acao">
                    <button type="button" className="btn btn-ghost adm-editar" onClick={() => editar(u)}>
                      {tr('Editar')}
                    </button>
                  </div>
                  <div className="adm-usuario-identidade">
                    <span className="adm-jog">
                      <span className="adm-usuario-avatar"><ComMoldura steamId={u.id}>
                        <Avatar id={u.id} src={u.avatar} nome={u.nome} />
                      </ComMoldura></span>
                      <span>
                        <span className="adm-nome-linha">
                          <a href={linkPerfil(u.id)}>{u.nome || tr('Sem nome')}</a>
                          {/* Dono e admin: só o ícone de verificado, do lado direito do nome (como no resto do site) */}
                          {admins.has(u.id) && <IconeEquipe steamId={u.id} />}
                        </span>
                        <small className="mono">{u.id}</small>
                      </span>
                    </span>
                  </div>
                  <div className="adm-usuario-nivel"><small>{tr('Nível e XP')}</small>
                    <span className="adm-nivel">
                      <SeloNivel nivel={u.nivel.nivel} tamanho={28} />
                      <span>
                        <b>{fmt(u.nivel.xp)} XP</b>
                        {u.ajuste !== 0 && <small className={u.ajuste > 0 ? 'mais' : 'menos'}>{u.ajuste > 0 ? `+${fmt(u.ajuste)}` : fmt(u.ajuste)} {tr('ajuste')}</small>}
                      </span>
                    </span>
                  </div>
                  <div className="adm-usuario-situacao"><small>{tr('Situação')}</small>
                    {/* No máximo 1 selo e o "+N" com o resto. Dono/Admin não entram aqui: viram o ícone ao lado do nome */}
                    <span className="adm-tags">
                      {!u.perfil.bloqueado && !(u.perfil.cargos || []).length && !u.auto.length && <span className="adm-usuario-regular">{tr('Regular')}</span>}
                      {u.perfil.bloqueado && <i className="bloq">{tr('BLOQUEADO')}</i>}
                      <CargosDe
                        max={1}
                        classe="adm-cargos-lista"
                        lista={[
                          ...(painel.config.cargos || [])
                            .filter((c) => (u.perfil.cargos || []).includes(c.id) || u.auto.includes(c.id))
                            .map((c) => ({ ...c, nome: nomeDoCargo(c, u.auto.includes(c.id) ? u.pos : -1) })),
                        ]}
                      />
                    </span>
                  </div>
                  <div className="adm-usuario-acesso"><small>{tr('Último acesso')}</small>{u.usuario ? dataBr(u.usuario.visto) : <span className="adm-nunca">{tr('nunca entrou')}</span>}</div>
                </article>
              )
            })}
        {visiveis.length === 0 && <p className="adm-vazio">{tr('Ninguém encontrado.')}</p>}
      </div>
    </div>
  )
}

// Janela de edição de um usuário
// Janela do jogador: Perfil (moldura, XP, cargos, insígnias, bloqueio), Pontos (saldo e ajuste) e Itens (dar e tirar skins), conforme as abas que o admin tem
function EditarUsuario({ u, ehAdmin, cargos = [], fechar, aoSalvar, abas = [], usuarios = [], souDono = false }) {
  const tr = useT()
  const secoes = [['perfil', 'Perfil', 'usuarios'], ['pontos', 'Pontos', 'pontos'], ['itens', 'Itens', 'skins']].filter(([, , p]) => abas.includes(p))
  const [secao, setSecao] = useState(secoes[0]?.[0] || 'perfil')
  const [personalizando, setPersonalizando] = useState(false)
  const [moldura, setMoldura] = useState(u.perfil.moldura || '')
  const [card, setCard] = useState(u.perfil.card || '')
  const [ajuste, setAjuste] = useState(u.ajuste)
  const [bloqueado, setBloqueado] = useState(!!u.perfil.bloqueado)
  const [meus, setMeus] = useState(() => (u.perfil.cargos || []).filter((id) => cargos.some((c) => c.id === id)))
  const trocarCargo = (id, ligado) => setMeus((l) => (ligado ? [...new Set([...l, id])] : l.filter((x) => x !== id)))
  const [insignias, setInsignias] = useState(() => Object.keys(u.perfil.insignias || {}).filter((id) => !!insigniaPorId(id)))
  const trocarInsignia = (id) => setInsignias((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  const [estado, setEstado] = useState('')
  const previa = nivelDe(u.xpBase + (Number(ajuste) || 0), u.mapas)

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [])

  useEffect(() => {
    // com o seletor de moldura/time aberto, o Esc fecha só ele
    const tecla = (e) => e.key === 'Escape' && !personalizando && fechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [fechar, personalizando])

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
  const salvar = () => {
    const campos = { xp: Math.round(Number(ajuste) || 0), bloqueado, cargos: meus }
    if (moldura !== (u.perfil.moldura || '')) campos.moldura = moldura || null
    if (card !== (u.perfil.card || '')) campos.card = card || null
    const originais = Object.keys(u.perfil.insignias || {}).filter(id => !!insigniaPorId(id))
    if (insignias.length !== originais.length || insignias.some(id => !originais.includes(id))) campos.insignias = insignias
    enviar(campos)
  }
  const limpar = async () => (await confirmar(tr('Apagar moldura, ajuste de XP, cargos e bloqueio de {nome}? (as insígnias ficam)', { nome: u.nome || u.id }), { perigo: true, ok: tr('Apagar') })) && enviar({ limpar: true })
  // Apaga a senha de segurança (hash + sal): o jogador perde o acesso com a senha antiga e consegue criar uma nova da próxima vez que precisar.
  const resetarSenha = async () => {
    if (!(await confirmar(tr('Remover a senha de segurança de {nome}? Ele(a) vai poder criar uma nova senha na próxima vez que precisar.', { nome: u.nome || u.id }), { perigo: true, ok: tr('Remover senha') }))) return
    setEstado('salvando')
    try {
      await chamar('/admin/senha-reset', { id: u.id })
      setEstado(tr('Senha removida: o jogador já pode criar outra.'))
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }

  const limparNick = async () => {
    if (!(await confirmar(tr('Limpar o nick de {nome}? O jogador poderá escolher outro gratuitamente, sem esperar e sem precisar de Premium.', { nome: u.nome || u.id }), { perigo: true, ok: tr('Limpar nick') }))) return
    setEstado('salvando')
    try {
      await chamar('/admin/nick-reset', { id: u.id })
      setEstado(tr('Nick limpo. O jogador já pode escolher outro.'))
    } catch (e) { setEstado(mensagemErro(e)) }
  }

  return createPortal(
    <div className="sm-fundo adm-ed-fundo" onClick={fechar}>
      <div className={`adm-janela${secao === 'itens' ? ' adm-janela-larga' : ''}`} role="dialog" aria-modal="true" aria-labelledby="adm-ed-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="sm-cab">
          <h2 id="adm-ed-titulo">{u.nome || u.id}</h2>
          <button type="button" className="sm-fechar" aria-label={tr('Fechar')} onClick={fechar}>
            ×
          </button>
        </div>
        {secoes.length > 1 && (
          <div className="adm-ed-abas" role="tablist">
            {secoes.map(([id, rotulo]) => (
              <button key={id} type="button" role="tab" aria-selected={secao === id} className={secao === id ? 'active' : ''} onClick={() => setSecao(id)}>
                {tr(rotulo)}
              </button>
            ))}
          </div>
        )}
        {secao === 'pontos' && (
          <div className="adm-ed-corpo adm-ed-sec">
            <AdminPontos usuarios={usuarios} fixo={u.id} modo="jogador" />
          </div>
        )}
        {secao === 'itens' && (
          <div className="adm-ed-corpo adm-ed-sec">
            <DarSkin usuarios={usuarios} fixo={u.id} />
          </div>
        )}
        {secao === 'perfil' && (
        <>
        <div className="adm-ed-corpo">
          <div className="adm-ed-topo">
            <span className={`moldura-box adm-ed-av${classeForma(moldura)}`}>
              <Avatar id={u.id} src={u.avatar} nome={u.nome} classe="adm-ed-img" />
              <CamadaMoldura id={moldura} />
            </span>
            <div>
              <b>{u.nome || tr('Sem nome')}</b>
              <a className="mono" href={linkPerfil(u.id)} title={tr('Abrir o perfil no site')}>
                {u.id}
              </a>
              <span className="adm-ed-nivel">
                <SeloNivel nivel={previa.nivel} tamanho={30} />
                {previa.nivel >= 11 ? 'Elite (10+)' : tr('Nível {n}', { n: textoNivel(previa.nivel) })} · {fmt(previa.xp)} XP
              </span>
            </div>
          </div>

          <label className="adm-campo">
            <span>{tr('Ajuste de XP')}</span>
            <div className="adm-xp">
              {[-500, -100, 100, 500].map((d) => (
                <button key={d} type="button" onClick={() => setAjuste((a) => (Number(a) || 0) + d)}>
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              <input type="number" step="50" value={ajuste} onChange={(e) => setAjuste(e.target.value)} />
            </div>
            <small>
              {tr('Partidas')}: {fmt(u.xpBase)} XP · {tr('ajuste')}: {Number(ajuste) > 0 ? '+' : ''}
              {fmt(ajuste)} · {tr('total')}: {fmt(previa.xp)} XP
            </small>
          </label>

          <div className="adm-campo">
            <span>{tr('Moldura e card')}</span>
            <button type="button" className="adm-personalizar" onClick={() => setPersonalizando(true)}>
              <span>
                {tr('Moldura')}: <b className="adm-mold-atual">{molduraPorId(moldura)?.nome || tr('Sem moldura')}</b>
              </span>
              <span>
                {tr('Card')}: <b className="adm-mold-atual">{card ? nomeCard(card) : tr('Sem card')}</b>
              </span>
              <span className="adm-personalizar-ir">{tr('Personalizar')} ›</span>
            </button>
            <small>{tr('O admin pode dar qualquer moldura, mesmo acima do nível do jogador.')}</small>
          </div>
          {personalizando &&
            createPortal(
              <SeletorMoldura
                steamId={u.id}
                avatar={u.avatar}
                nome={u.nome || u.id}
                nivel={previa.nivel}
                admin
                inicial={{ moldura: moldura || null, card: card || null }}
                aoSalvar={(e) => {
                  setMoldura(e.moldura || '')
                  setCard(e.card || '')
                }}
                fechar={() => setPersonalizando(false)}
              />,
              document.body,
            )}

          <div className="adm-campo">
            <span>{tr('Cargos')}</span>
            {cargos.length ? (
              <div className="adm-cargos-check">
                {cargos.map((c) => (
                  <label
                    key={c.id}
                    className={meus.includes(c.id) || u.auto.includes(c.id) ? 'ligado' : ''}
                    style={{ '--cg': c.cor }}
                    title={u.auto.includes(c.id) ? tr('Automático: o jogador está no top {n} do ranking', { n: c.top }) : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={meus.includes(c.id) || u.auto.includes(c.id)}
                      disabled={u.auto.includes(c.id) && !meus.includes(c.id)}
                      onChange={(e) => trocarCargo(c.id, e.target.checked)}
                    />
                    <SeloCargo cargo={c} />
                    {u.auto.includes(c.id) && <small className="adm-auto">{tr('auto · top {n}', { n: c.top })}</small>}
                  </label>
                ))}
              </div>
            ) : (
              <small>{tr('Nenhum cargo criado ainda (aba Cargos).')}</small>
            )}
            <small>{tr('Cargos liberam as molduras exclusivas deles e aparecem como selo no perfil e no ranking.')}</small>
          </div>

          <div className="adm-campo">
            <span>{tr('Insígnias')}</span>
            <div className="adm-insignias">
              {INSIGNIAS.map((i) => (
                <button key={i.id} type="button" className={`adm-insignia${insignias.includes(i.id) ? ' ligado' : ''}`} aria-pressed={insignias.includes(i.id)} onClick={() => trocarInsignia(i.id)} title={tr(i.descricao)}>
                  <img src={imagemInsignia(i.id)} alt="" loading="lazy" />
                  <b>{tr(i.nome)}</b>
                  {i.missao && <small className="adm-auto">{tr(i.categoria === 'eventos' ? 'Evento' : 'Missão')}</small>}
                  <i aria-hidden="true">{insignias.includes(i.id) ? '✓' : '+'}</i>
                </button>
              ))}
            </div>
            <small>{tr('Selecione as insígnias e salve para entregar ao jogador. Eventos futuros permanecem bloqueados. O ranking não concede insígnias.')}</small>
          </div>

          <label className="adm-check">
            <input type="checkbox" checked={bloqueado} onChange={(e) => setBloqueado(e.target.checked)} />
            <span>
              <b>{tr('Bloquear personalização')}</b>
              <small>
                {ehAdmin
                  ? tr('Este usuário é admin: o bloqueio não vale para admins (eles continuam podendo personalizar).')
                  : tr('O jogador não consegue mais trocar a moldura sozinho.')}
              </small>
            </span>
          </label>
        </div>
        <div className="sm-rodape">
          <button type="button" className="btn btn-ghost adm-perigo" onClick={limpar} disabled={estado === 'salvando'}>
            {tr('Limpar perfil')}
          </button>
          {souDono && (
            <button type="button" className="btn btn-ghost adm-perigo" onClick={limparNick} disabled={estado === 'salvando'}>{tr('Limpar nick')}</button>
          )}
          {souDono && (
            <button type="button" className="btn btn-ghost adm-perigo" onClick={resetarSenha} disabled={estado === 'salvando'} title={tr('Remove a senha de segurança: o jogador consegue criar outra')}>
              {tr('Remover senha')}
            </button>
          )}
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
          <button type="button" className="btn btn-ghost" onClick={fechar}>
            {tr('Cancelar')}
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={estado === 'salvando'}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar')}
          </button>
        </div>
        </>
        )}
      </div>
    </div>, document.body
  )
}

// ── Aba Cards: liberar por nível e exclusivos de cargo (as mesmas regras das molduras) ──
// Escolha do nível mínimo de assinatura (moldura/card só para assinantes). '' = sem trava de assinatura.
function SelecionarSub({ valor, aoMudar, aria, vazio, limpar = '', classe = 'adm-mold-cargo adm-mold-sub' }) {
  const tr = useT()
  return (
    <select className={classe} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={aria}>
      <option value="">{vazio}</option>
      {limpar && <option value="-">{limpar}</option>}
      {NIVEIS_SUB.map((n) => (
        <option key={n.id} value={n.id}>
          {n.id === 'subscriber' ? tr('Qualquer assinante') : tr('{nome} ou mais', { nome: n.nome })}
        </option>
      ))}
    </select>
  )
}

function CardsRegras({ config, aoSalvar }) {
  const tr = useT()
  const [porNivel, setPorNivel] = useState(!!config.cardPorNivel)
  const [niveis, setNiveis] = useState(() => ({ ...config.nivelCard }))
  const [exclusivo, setExclusivo] = useState(() => ({ ...config.cardCargo }))
  const [subs, setSubs] = useState(() => ({ ...config.cardSub })) // { idCard: nível mínimo de assinatura }
  const [estado, setEstado] = useState('')
  const cargos = cargosComEquipe(config) // cargos do painel + Dono e Admin (equipe)
  const nivelDe1 = (nome) => Number(niveis[nome]) || 1
  const cargoDe = (nome) => cargos.find((c) => c.id === exclusivo[nome]) || null
  const mudou = porNivel !== !!config.cardPorNivel || CARDS.some((c) => nivelDe1(c) !== (Number(config.nivelCard?.[c]) || 1) || (exclusivo[c] || '') !== (config.cardCargo?.[c] || '') || (subs[c] || '') !== (config.cardSub?.[c] || ''))
  const definir = (nomes, n) => setNiveis((v) => ({ ...v, ...Object.fromEntries(nomes.map((c) => [c, Number(n)])) }))
  const tornarExclusivo = (nomes, cargo) => setExclusivo((v) => ({ ...v, ...Object.fromEntries(nomes.map((c) => [c, cargo])) }))
  const exigirSub = (nomes, nivel) => setSubs((v) => ({ ...v, ...Object.fromEntries(nomes.map((c) => [c, nivel])) }))
  const salvar = async () => {
    setEstado('salvando')
    try {
      const nivelCard = Object.fromEntries(CARDS.filter((c) => nivelDe1(c) > 1).map((c) => [c, nivelDe1(c)]))
      const cardCargo = Object.fromEntries(CARDS.filter((c) => cargoDe(c)).map((c) => [c, exclusivo[c]]))
      const cardSub = Object.fromEntries(CARDS.filter((c) => subs[c]).map((c) => [c, subs[c]]))
      const d = await chamar('/admin/config', { cardPorNivel: porNivel, nivelCard, cardCargo, cardSub })
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
            <b>{tr('Liberar cards por nível')}</b>
            <small>{tr('Ligado: cada card só pode ser usado a partir do nível escolhido abaixo. Desligado: todos ficam livres.')}</small>
          </span>
        </label>
        <div className="adm-salvar">
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={!mudou || estado === 'salvando'}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar regras')}
          </button>
        </div>
      </div>
      <p className="adm-nota">
        {tr('Exclusivo de: o card só pode ser usado por quem tem o cargo (crie os cargos na aba Cargos). Vale mesmo com a regra de nível desligada; com as duas, o jogador precisa do cargo e do nível. Para ter mais cards, coloque imagens em site/public/assets/cards/.')}
      </p>
      <p className="adm-nota">
        {tr('Assinatura: o card só pode ser usado por assinantes Premium a partir do nível escolhido (Subscriber = qualquer assinante). Quem perde a assinatura, ou cai de nível, perde o card. Dono e admins não têm trava.')}
      </p>
      <div className="adm-colecoes">
        {TEMAS_CARD.map((tema) => {
          const doTema = CARDS.filter((c) => temaCard(c) === tema)
          return (
            <section key={tema} className="adm-colecao">
              <div className="adm-colecao-cab">
                <h3>{nomeTema(tema)}</h3>
                {cargos.length > 0 && (
                  <label>
                    {tr('Exclusivo:')}
                    <select value="" onChange={(e) => e.target.value && tornarExclusivo(doTema, e.target.value === '-' ? '' : e.target.value)}>
                      <option value="">{tr('tema inteiro…')}</option>
                      <option value="-">{tr('Todos (sem cargo)')}</option>
                      {cargos.map((cg) => (
                        <option key={cg.id} value={cg.id}>
                          {cg.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {tr('Assinatura:')}
                  <SelecionarSub valor="" classe="" aoMudar={(v) => v && exigirSub(doTema, v === '-' ? '' : v)} aria={tr('Assinatura do tema inteiro')} vazio={tr('tema inteiro…')} limpar={tr('Sem assinatura')} />
                </label>
                <label className={porNivel ? '' : 'desligado'}>
                  {tr('Tema inteiro:')}
                  <select value="" onChange={(e) => e.target.value && definir(doTema, e.target.value)}>
                    <option value="">{tr('nível…')}</option>
                    {NIVEIS_OPCOES.map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? tr('Livre (1)') : rotuloNivel(tr, n)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="adm-cards-grade">
                {doTema.map((c) => (
                  <div key={c} className={`adm-mold adm-card-regra${cargoDe(c) ? ' exclusiva' : ''}`} style={cargoDe(c) ? { '--cg': cargoDe(c).cor } : undefined}>
                    <img src={urlMiniCard(c)} alt="" loading="lazy" decoding="async" />
                    <span>
                      {nomeCard(c)} {ehAnimado(c) && <small className="adm-anim-tag">{tr('ANIMADO')}</small>}
                    </span>
                    {cargos.length > 0 && (
                      <select className="adm-mold-cargo" value={exclusivo[c] || ''} onChange={(e) => tornarExclusivo([c], e.target.value)} aria-label={`${tr('Exclusivo de')} (${nomeCard(c)})`}>
                        <option value="">{tr('Todos')}</option>
                        {cargos.map((cg) => (
                          <option key={cg.id} value={cg.id}>
                            {tr('Só {cargo}', { cargo: cg.nome })}
                          </option>
                        ))}
                      </select>
                    )}
                    <SelecionarSub valor={subs[c] || ''} aoMudar={(v) => exigirSub([c], v)} aria={`${tr('Assinatura')} (${nomeCard(c)})`} vazio={tr('Sem assinatura')} />
                    <span className={`adm-mold-nivel${porNivel ? '' : ' desligado'}`}>
                      <SeloNivel nivel={nivelDe1(c)} tamanho={24} />
                      <select value={nivelDe1(c)} onChange={(e) => definir([c], e.target.value)} aria-label={tr('Nível de {nome}', { nome: nomeCard(c) })}>
                        {NIVEIS_OPCOES.map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? tr('Livre') : rotuloNivel(tr, n)}
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
        {CARDS.length === 0 && <p className="sm-vazio">{tr('Nenhum card ainda (coloque imagens em site/public/assets/cards/).')}</p>}
      </div>
    </div>
  )
}

// ── Aba Molduras: liberar por nível ──
function Molduras({ config, aoSalvar }) {
  const tr = useT()
  const [abertas, setAbertas] = useState(() => new Set()) // coleções abertas (as molduras só são montadas com a coleção aberta: a aba não trava)
  const [porNivel, setPorNivel] = useState(!!config.molduraPorNivel)
  const [niveis, setNiveis] = useState(() => ({ ...config.nivelMoldura }))
  const [exclusiva, setExclusiva] = useState(() => ({ ...config.molduraCargo }))
  const [subs, setSubs] = useState(() => ({ ...config.molduraSub })) // { idMoldura: nível mínimo de assinatura }
  const [estado, setEstado] = useState('')
  const cargos = cargosComEquipe(config) // cargos do painel + Dono e Admin (equipe)
  const nivelDe1 = (id) => Number(niveis[id]) || 1
  const cargoDe = (id) => cargos.find((c) => c.id === exclusiva[id]) || null
  const mudou =
    porNivel !== !!config.molduraPorNivel ||
    MOLDURAS.some((m) => nivelDe1(m.id) !== (Number(config.nivelMoldura?.[m.id]) || 1) || (exclusiva[m.id] || '') !== (config.molduraCargo?.[m.id] || '') || (subs[m.id] || '') !== (config.molduraSub?.[m.id] || ''))
  const tornarExclusiva = (ids, cargo) => setExclusiva((v) => ({ ...v, ...Object.fromEntries(ids.map((id) => [id, cargo])) }))
  const exigirSub = (ids, nivel) => setSubs((v) => ({ ...v, ...Object.fromEntries(ids.map((id) => [id, nivel])) }))

  const definir = (ids, n) => setNiveis((v) => ({ ...v, ...Object.fromEntries(ids.map((id) => [id, Number(n)])) }))
  const salvar = async () => {
    setEstado('salvando')
    try {
      const nivelMoldura = Object.fromEntries(MOLDURAS.filter((m) => nivelDe1(m.id) > 1).map((m) => [m.id, nivelDe1(m.id)]))
      const molduraCargo = Object.fromEntries(MOLDURAS.filter((m) => cargoDe(m.id)).map((m) => [m.id, exclusiva[m.id]]))
      const molduraSub = Object.fromEntries(MOLDURAS.filter((m) => subs[m.id]).map((m) => [m.id, subs[m.id]]))
      const d = await chamar('/admin/config', { molduraPorNivel: porNivel, nivelMoldura, molduraCargo, molduraSub })
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
            <b>{tr('Liberar molduras por nível')}</b>
            <small>{tr('Ligado: cada moldura só pode ser usada a partir do nível escolhido abaixo. Desligado: todas ficam livres.')}</small>
          </span>
        </label>
        <div className="adm-salvar">
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={!mudou || estado === 'salvando'}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar regras')}
          </button>
        </div>
      </div>

      <p className="adm-nota">
        {tr('Exclusiva de: a moldura só pode ser usada por quem tem o cargo (crie os cargos na aba Cargos). Vale mesmo com a regra de nível desligada; com as duas, o jogador precisa do cargo e do nível.')}
      </p>
      <p className="adm-nota">
        {tr('Assinatura: a moldura só pode ser usada por assinantes Premium a partir do nível escolhido (Subscriber = qualquer assinante). Quem perde a assinatura, ou cai de nível, perde a moldura. Dono e admins não têm trava.')}
      </p>
      <div className="adm-colecoes">
        {COLECOES.map((c, ic) => {
          const daColecao = MOLDURAS.filter((m) => m.colecao === c)
          const aberta = abertas.has(c)
          return (
            <section key={c} className={`adm-colecao${aberta ? '' : ' fechada'}`}>
              <div className="adm-colecao-cab">
                <button type="button" className="adm-colecao-abrir" aria-expanded={aberta} onClick={() => setAbertas((s) => { const n = new Set(s); aberta ? n.delete(c) : n.add(c); return n })}>
                  <i aria-hidden="true">▸</i>
                  <h3>{c}</h3>
                  <small>{daColecao.length}</small>
                </button>
                {cargos.length > 0 && (
                  <label>
                    {tr('Exclusiva:')}
                    <select value="" onChange={(e) => e.target.value && tornarExclusiva(daColecao.map((m) => m.id), e.target.value === '-' ? '' : e.target.value)}>
                      <option value="">{tr('coleção inteira…')}</option>
                      <option value="-">{tr('Todos (sem cargo)')}</option>
                      {cargos.map((cg) => (
                        <option key={cg.id} value={cg.id}>
                          {cg.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {tr('Assinatura:')}
                  <SelecionarSub valor="" classe="" aoMudar={(v) => v && exigirSub(daColecao.map((m) => m.id), v === '-' ? '' : v)} aria={tr('Assinatura da coleção inteira')} vazio={tr('coleção inteira…')} limpar={tr('Sem assinatura')} />
                </label>
                <label className={porNivel ? '' : 'desligado'}>
                  {tr('Coleção inteira:')}
                  <select value="" onChange={(e) => e.target.value && definir(daColecao.map((m) => m.id), e.target.value)}>
                    <option value="">{tr('nível…')}</option>
                    {NIVEIS_OPCOES.map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? tr('Livre (1)') : rotuloNivel(tr, n)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {aberta && (
              <div className="adm-molduras">
                {daColecao.map((m) => (
                  <div key={m.id} className={`adm-mold${cargoDe(m.id) ? ' exclusiva' : ''}`} style={cargoDe(m.id) ? { '--cg': cargoDe(m.id).cor } : undefined}>
                    <img src={urlMiniatura(m.id)} alt="" loading="lazy" />
                    <span>{m.nome}</span>
                    {cargos.length > 0 && (
                      <select className="adm-mold-cargo" value={exclusiva[m.id] || ''} onChange={(e) => tornarExclusiva([m.id], e.target.value)} aria-label={`${tr('Exclusiva de')} (${m.nome})`}>
                        <option value="">{tr('Todos')}</option>
                        {cargos.map((cg) => (
                          <option key={cg.id} value={cg.id}>
                            {tr('Só {cargo}', { cargo: cg.nome })}
                          </option>
                        ))}
                      </select>
                    )}
                    <SelecionarSub valor={subs[m.id] || ''} aoMudar={(v) => exigirSub([m.id], v)} aria={`${tr('Assinatura')} (${m.nome})`} vazio={tr('Sem assinatura')} />
                    <span className={`adm-mold-nivel${porNivel ? '' : ' desligado'}`}>
                      <SeloNivel nivel={nivelDe1(m.id)} tamanho={24} />
                      <select value={nivelDe1(m.id)} onChange={(e) => definir([m.id], e.target.value)} aria-label={tr('Nível de {nome}', { nome: m.nome })}>
                        {NIVEIS_OPCOES.map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? tr('Livre') : rotuloNivel(tr, n)}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ── Aba Cargos: criar/editar/apagar (Premium, VIP...) ──
const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)

// Botão com o ícone do cargo; clicando abre a grade com todos os ícones para escolher
function EscolherIcone({ valor, cor, aoEscolher }) {
  const tr = useT()
  const [aberto, setAberto] = useState(false)
  return (
    <span className="adm-icone">
      <button type="button" className="adm-icone-btn" style={{ color: cor }} onClick={() => setAberto((a) => !a)} aria-expanded={aberto} title={tr('Ícone do cargo')}>
        <IconeCargo icone={valor} tamanho={16} />
      </button>
      {aberto && (
        <span className="adm-icone-grade" role="listbox" aria-label={tr('Ícone do cargo')}>
          {Object.entries(ICONES_CARGO).map(([id, i]) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={(valor || 'coroa') === id}
              className={(valor || 'coroa') === id ? 'sel' : ''}
              style={{ color: cor }}
              title={tr(i.nome)}
              onClick={() => {
                aoEscolher(id)
                setAberto(false)
              }}
            >
              <IconeCargo icone={id} tamanho={18} />
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// Botão com a imagem do selo; clicando abre a grade com as imagens da pasta public/assets/selos-equipe/
// opcional: dá para ficar sem imagem (o selo usa o ícone), como nos cargos comuns; sem "opcional" sempre tem imagem (dono e admins)
function EscolherImagemSelo({ valor, aoEscolher, opcional = false }) {
  const tr = useT()
  const [aberto, setAberto] = useState(false)
  const atual = opcional ? valor || '' : valor || 'verified.png'
  const titulo = opcional ? tr('Imagem do cargo (no lugar do ícone)') : tr('Imagem do selo')
  return (
    <span className="adm-icone">
      <button type="button" className="adm-icone-btn" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} title={titulo}>
        {atual ? <img src={urlSelo(atual)} alt="" /> : <span className="adm-icone-vazio">IMG</span>}
      </button>
      {aberto && (
        <span className="adm-icone-grade adm-imagens-grade" role="listbox" aria-label={titulo}>
          {opcional && (
            <button
              type="button"
              role="option"
              aria-selected={!atual}
              className={!atual ? 'sel' : ''}
              title={tr('Sem imagem (usa o ícone)')}
              onClick={() => {
                aoEscolher('')
                setAberto(false)
              }}
            >
              <span className="adm-icone-vazio">{tr('Sem')}</span>
            </button>
          )}
          {IMAGENS_SELO.map((nome) => (
            <button
              key={nome}
              type="button"
              role="option"
              aria-selected={atual === nome}
              className={atual === nome ? 'sel' : ''}
              title={nome}
              onClick={() => {
                aoEscolher(nome)
                setAberto(false)
              }}
            >
              <img src={urlSelo(nome)} alt="" />
            </button>
          ))}
          <small className="adm-imagens-dica">{tr('Para ter mais opções, coloque a imagem em site/public/assets/selos-equipe/ e recarregue.')}</small>
        </span>
      )}
    </span>
  )
}

// Selos da equipe (dono e admins): nome, cor, imagem e se aparecem no perfil/ranking. Só o dono edita.
function SelosEquipe({ config, aoSalvar }) {
  const tr = useT()
  const inicial = { dono: { ...SELOS_PADRAO.dono, ...config.selos?.dono }, admin: { ...SELOS_PADRAO.admin, ...config.selos?.admin } }
  const [selos, setSelos] = useState(inicial)
  const [estado, setEstado] = useState('')
  const [editando, setEditando] = useState(null) // 'dono' | 'admin'
  const mudou = JSON.stringify(selos) !== JSON.stringify(inicial)
  const mudar = (qual, campo, valor) => setSelos((s) => ({ ...s, [qual]: { ...s[qual], [campo]: valor } }))
  const valido = ['dono', 'admin'].every((q) => selos[q].nome.trim().length > 0 && selos[q].nome.trim().length <= 24)
  const salvar = async () => {
    setEstado('salvando')
    try {
      const d = await chamar('/admin/selos', { dono: { ...selos.dono, nome: selos.dono.nome.trim() }, admin: { ...selos.admin, nome: selos.admin.nome.trim(), acessos: selos.admin.acessos ?? ABAS_PADRAO_ADMIN } })
      aoSalvar(d.config)
      setEstado('Salvo!')
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }
  return (
    <div className="adm-bloco adm-cargos adm-selos">
      <div className="adm-config-topo">
        <p className="adm-nota">
          <b>{tr('Selos da equipe')}</b> · {tr('Aparecem no perfil e no ranking do dono e dos admins, antes dos cargos. Só o dono edita.')}
        </p>
        <div className="adm-salvar">
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={!mudou || !valido || estado === 'salvando'}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar selos')}
          </button>
        </div>
      </div>
      <ul className="adm-cargos-lista">
        {[
          ['dono', tr('Dono')],
          ['admin', tr('Admins')],
        ].map(([qual, rotulo]) => (
          <li key={qual} className="adm-cargo-linha">
            <span className="adm-cargo-cor" style={{ background: selos[qual].cor }} aria-hidden="true" />
            <b className="adm-selo-quem">{rotulo}</b>
            <SeloEquipe selo={{ ...selos[qual], nome: selos[qual].nome || '…' }} />
            <small className="adm-nota">
              {selos[qual].mostrar ? tr('Aparece no site') : tr('Oculto no site')}
              {selos[qual].pick ? ` · ${tr('Ver Pick & Ban')}` : ''}
            </small>
            <button type="button" className="btn btn-ghost adm-editar" onClick={() => setEditando(qual)}>
              {tr('Editar')}
            </button>
          </li>
        ))}
      </ul>
      {editando && (
        <EditarSelo
          selo={selos[editando]}
          titulo={editando === 'dono' ? tr('Dono') : tr('Admins')}
          qual={editando}
          mudar={(campo, valor) => mudar(editando, campo, valor)}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function EditarSelo({ selo, titulo, qual, mudar, aoFechar }) {
  const tr = useT()
  const acessos = selo.acessos ?? ABAS_PADRAO_ADMIN
  const alternar = (aba) => mudar('acessos', acessos.includes(aba) ? acessos.filter((a) => a !== aba) : [...acessos, aba])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return createPortal(
    <div className="adm-modal-fundo" onClick={aoFechar}>
      <div className="adm-modal adm-cargo-modal" role="dialog" aria-modal="true" aria-label={tr('Editar selo')} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>
            {tr('Editar selo')}: {titulo} <SeloEquipe selo={{ ...selo, nome: selo.nome || '…' }} />
          </h3>
          <button type="button" className="adm-modal-x" onClick={aoFechar} aria-label={tr('Fechar')}>
            ×
          </button>
        </header>
        <div className="adm-modal-corpo">
          <section>
            <h4>{tr('Aparência')}</h4>
            <div className="adm-cargo-campos">
              <label>
                {tr('Nome')}
                <input value={selo.nome} maxLength={24} onChange={(e) => mudar('nome', e.target.value)} />
              </label>
              <label>
                {tr('Cor')}
                <input type="color" value={selo.cor} onChange={(e) => mudar('cor', e.target.value)} />
              </label>
              <label>
                {tr('Imagem do selo')}
                <EscolherImagemSelo valor={selo.imagem} aoEscolher={(nome) => mudar('imagem', nome)} />
              </label>
            </div>
          </section>
          <section>
            <h4>{tr('Visibilidade')}</h4>
            <label className="adm-numerar">
              <input type="checkbox" checked={selo.mostrar} onChange={(e) => mudar('mostrar', e.target.checked)} />
              {tr('Mostrar no site')}
            </label>
          </section>
          <section>
            <h4>{tr('Acessos')}</h4>
            <label className="adm-numerar adm-acesso" title={tr('Ligado: o dono/os admins veem a página Pick & Ban (ela fica escondida de todos, inclusive da equipe, até ligar aqui).')}>
              <input type="checkbox" checked={!!selo.pick} onChange={(e) => mudar('pick', e.target.checked)} />
              <span>
                <b>{tr('Ver Pick & Ban')}</b>
                <small>{tr('A página fica escondida de todos os outros.')}</small>
              </span>
            </label>
            <h5>{tr('Abas do painel admin')}</h5>
            {qual === 'dono' ? (
              <p className="adm-nota">{tr('O dono tem acesso a todas as abas.')}</p>
            ) : (
              <>
                <div className="adm-acessos">
                  {Object.keys(NOMES_ABAS).map((aba) => (
                    <label key={aba} className="adm-numerar adm-acesso">
                      <input type="checkbox" checked={acessos.includes(aba)} onChange={() => alternar(aba)} />
                      <span>
                        <b>{tr(NOMES_ABAS[aba])}</b>
                        <small>{tr(DESCRICAO_ABAS[aba])}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="adm-nota">{tr('Vale para todos os admins. Por padrão: Usuários, Molduras, Cards e Cargos.')}</p>
              </>
            )}
          </section>
        </div>
        <footer>
          <span className="adm-nota">{tr('As mudanças só valem depois de "Salvar selos".')}</span>
          <button type="button" className="btn btn-primary" onClick={aoFechar}>
            {tr('Concluir')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

const ABAS_PADRAO_ADMIN = ['usuarios', 'molduras', 'cards', 'cargos']
// Abas do painel que um cargo pode liberar (o dono marca; o worker confere a aba em cada rota)
const NOMES_ABAS = { usuarios: 'Usuários', molduras: 'Molduras', cards: 'Cards', cargos: 'Cargos', assinaturas: 'Assinaturas', skins: 'Skins', caixas: 'Caixas', pontos: 'Pontos', logs: 'Logs', admins: 'Admins' }
const DESCRICAO_ABAS = {
  usuarios: 'Ver e editar os jogadores (moldura, time, XP, cargos, insígnias, bloqueio).',
  molduras: 'Regras das molduras (nível, cargo, assinatura).',
  cards: 'Regras dos cards do perfil.',
  cargos: 'Criar e editar os cargos (não muda os acessos dos cargos: isso é só do dono).',
  assinaturas: 'Assinaturas Premium: dar, renovar e tirar.',
  skins: 'Dar e tirar skins, adesivos, chaveiros e caixas dos jogadores.',
  caixas: 'Caixas da loja: taxas, preços e itens.',
  pontos: 'Neura Pontos: adicionar, remover e definir o saldo, e os depósitos com dinheiro.',
  logs: 'Ver o registro de tudo que acontece (ações de admin, pagamentos, trocas, mercado, erros).',
  admins: 'Promover e remover administradores.',
}

function EditarCargo({ cargo, indice, mudar, membros, souDono, aoFechar }) {
  const tr = useT()
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  const c = cargo
  const acessos = c.acessos || []
  const alternar = (aba) => mudar(indice, 'acessos', acessos.includes(aba) ? acessos.filter((a) => a !== aba) : [...acessos, aba])
  return createPortal(
    <div className="adm-modal-fundo" onClick={aoFechar}>
      <div className="adm-modal adm-cargo-modal" role="dialog" aria-modal="true" aria-label={tr('Editar cargo')} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>
            {tr('Editar cargo')}: <SeloCargo cargo={{ ...c, nome: c.top > 0 && c.numerar ? `${c.nome || '…'} 1` : c.nome || '…' }} />
          </h3>
          <button type="button" className="adm-modal-x" onClick={aoFechar} aria-label={tr('Fechar')}>
            ×
          </button>
        </header>
        <div className="adm-modal-corpo">
          <section>
            <h4>{tr('Aparência')}</h4>
            <div className="adm-cargo-campos">
              <label>
                {tr('Nome')}
                <input value={c.nome} maxLength={24} onChange={(e) => mudar(indice, 'nome', e.target.value)} />
              </label>
              <label>
                {tr('Cor')}
                <input type="color" value={c.cor} onChange={(e) => mudar(indice, 'cor', e.target.value)} />
              </label>
              <label>
                {tr('Ícone')}
                <EscolherIcone valor={c.icone} cor={c.cor} aoEscolher={(id) => mudar(indice, 'icone', id)} />
              </label>
              <label>
                {tr('Imagem do selo (opcional)')}
                <EscolherImagemSelo opcional valor={c.imagem} aoEscolher={(nome) => mudar(indice, 'imagem', nome || undefined)} />
              </label>
            </div>
          </section>
          <section>
            <h4>{tr('Como a pessoa ganha o cargo')}</h4>
            <label className="adm-top" title={tr('0 = só manual. Ex.: 3 = os 3 primeiros do ranking ganham o cargo e perdem ao sair do top 3')}>
              {tr('Automático: top')}
              <input type="number" min="0" max="15" value={c.top || 0} onChange={(e) => mudar(indice, 'top', Math.min(15, Math.max(0, Math.round(Number(e.target.value) || 0))))} />
              <small>{tr('0 = só manual (você dá em Usuários → Editar)')}</small>
            </label>
            <label className={`adm-numerar${c.top > 0 ? '' : ' desligado'}`}>
              <input type="checkbox" checked={c.top > 0 && !!c.numerar} disabled={!(c.top > 0)} onChange={(e) => mudar(indice, 'numerar', e.target.checked)} />
              {tr('Numerar posição')} <small>({c.nome || '…'} 1, {c.nome || '…'} 2…)</small>
            </label>
          </section>
          <section>
            <h4>{tr('Visibilidade')}</h4>
            <label className="adm-numerar">
              <input type="checkbox" checked={!c.oculto} onChange={(e) => mudar(indice, 'oculto', !e.target.checked)} />
              {tr('Mostrar o selo no site')} <small>({tr('perfil, ranking e amigos; desligado, o cargo continua liberando o que ele libera')})</small>
            </label>
          </section>
          <section>
            <h4>{tr('Acessos')}</h4>
            <p className="adm-nota">{tr('O que quem tem este cargo pode ver e usar. Marque só o que for preciso: cada aba liberada dá acesso completo a ela.')}</p>
            <label className="adm-numerar adm-acesso">
              <input type="checkbox" checked={!!c.pick} onChange={(e) => mudar(indice, 'pick', e.target.checked)} />
              <span>
                <b>{tr('Página Pick & Ban')}</b>
                <small>{tr('A página fica escondida de todos os outros.')}</small>
              </span>
            </label>
            <h5>{tr('Abas do painel admin')}</h5>
            {souDono ? (
              <div className="adm-acessos">
                {Object.keys(NOMES_ABAS).map((aba) => (
                  <label key={aba} className="adm-numerar adm-acesso">
                    <input type="checkbox" checked={acessos.includes(aba)} onChange={() => alternar(aba)} />
                    <span>
                      <b>{tr(NOMES_ABAS[aba])}</b>
                      <small>{tr(DESCRICAO_ABAS[aba])}</small>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="adm-nota">{tr('Só o dono muda os acessos ao painel.')}{acessos.length ? ` ${tr('Atuais')}: ${acessos.map((a) => tr(NOMES_ABAS[a] || a)).join(', ')}` : ''}</p>
            )}
            <p className="adm-nota">{tr('Admins já têm Usuários, Molduras, Cards e Cargos. Assinaturas, Admins, Skins, Caixas e Pontos são só do dono, a não ser que um cargo libere.')}</p>
          </section>
          <section>
            <h4>
              {tr('Quem tem')} ({membros.length})
            </h4>
            <span className="adm-cargo-membros">
              {membros.slice(0, 24).map((u) => (
                <a key={u.id} href={linkPerfil(u.id)} title={u.nome}>
                  <Avatar id={u.id} src={u.avatar} nome={u.nome} classe="adm-av mini" />
                </a>
              ))}
              {!membros.length && <small>{tr('Ninguém ainda.')}</small>}
            </span>
          </section>
        </div>
        <footer>
          <span className="adm-nota">{tr('As mudanças só valem depois de "Salvar cargos" na lista.')}</span>
          <button type="button" className="btn btn-primary" onClick={aoFechar}>
            {tr('Concluir')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Cargos({ config, usuarios, aoSalvar, souDono }) {
  const tr = useT()
  const [lista, setLista] = useState(() => (config.cargos || []).map((c) => ({ ...c })))
  const [novoNome, setNovoNome] = useState('')
  const [novaCor, setNovaCor] = useState('#f5c542')
  const [novoIcone, setNovoIcone] = useState('coroa')
  const [estado, setEstado] = useState('')
  const [editandoCargo, setEditandoCargo] = useState(null) // id do cargo aberto no editor
  const mudou = JSON.stringify(lista) !== JSON.stringify(config.cargos || [])
  const membros = (id) => usuarios.filter((u) => (u.perfil.cargos || []).includes(id) || u.auto.includes(id))
  const exclusivas = (id) => Object.values(config.molduraCargo || {}).filter((c) => c === id).length

  const mudar = (i, campo, valor) => setLista((l) => l.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)))
  const adicionar = () => {
    const nome = novoNome.trim()
    const base = slug(nome) || 'cargo'
    let id = base
    for (let n = 2; lista.some((c) => c.id === id); n++) id = `${base}-${n}`
    setLista((l) => [...l, { id, nome, cor: novaCor, icone: novoIcone }])
    setNovoNome('')
  }
  const apagar = async (i) => {
    const c = lista[i]
    const n = membros(c.id).length
    if (await confirmar(tr('Apagar o cargo {nome}? {n} jogador(es) perdem o cargo e as molduras exclusivas dele ficam livres.', { nome: c.nome, n }), { perigo: true, ok: tr('Apagar') })) setLista((l) => l.filter((_, k) => k !== i))
  }
  const salvar = async () => {
    setEstado('salvando')
    try {
      const d = await chamar('/admin/config', { cargos: lista.map((c) => ({ id: c.id, acessos: c.acessos || [], nome: c.nome.trim(), cor: c.cor, icone: c.icone || 'coroa', imagem: c.imagem || '', top: Number(c.top) || 0, numerar: Number(c.top) > 0 && !!c.numerar, oculto: !!c.oculto, pick: !!c.pick })) })
      aoSalvar(d.config)
      setEstado('Salvo!')
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }
  const valido = lista.every((c) => c.nome.trim().length > 0 && c.nome.trim().length <= 24)

  return (
    <div className="adm-bloco adm-cargos">
      <div className="adm-config-topo">
        <p className="adm-nota">
          {tr('Cargos (Premium, VIP...) dão um selo no perfil e no ranking e liberam molduras exclusivas. Dê o cargo a alguém em Usuários → Editar; escolha as molduras de cada cargo na aba Molduras.')}
        </p>
        <div className="adm-salvar">
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={!mudou || !valido || estado === 'salvando'}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar cargos')}
          </button>
        </div>
      </div>
      <ul className="adm-cargos-lista">
        {lista.map((c, i) => (
          <li key={c.id} className="adm-cargo-linha">
            <span className="adm-cargo-cor" style={{ background: c.cor }} aria-hidden="true" />
            <SeloCargo cargo={{ ...c, nome: c.top > 0 && c.numerar ? `${c.nome || '…'} 1` : c.nome || '…' }} />
            <span className="adm-cargo-resumo">
              <b>{c.nome}</b>
              <small>
                {c.oculto && <em className="adm-oculto">{tr('Oculto no site')} · </em>}
                {tr('{n} jogador(es) · {m} moldura(s) exclusiva(s)', { n: membros(c.id).length, m: exclusivas(c.id) })}
                {c.top > 0 ? ` · ${tr('automático: top {n} do ranking', { n: c.top })}` : ` · ${tr('só manual')}`}
                {(c.acessos?.length || c.pick) ? ` · ${tr('acessos')}: ${[...(c.acessos || []).map((a) => tr(NOMES_ABAS[a] || a)), ...(c.pick ? ['Pick & Ban'] : [])].join(', ')}` : ''}
              </small>
            </span>
            <span className="adm-cargo-membros">
              {membros(c.id)
                .slice(0, 6)
                .map((u) => (
                  <a key={u.id} href={linkPerfil(u.id)} title={u.nome}>
                    <Avatar id={u.id} src={u.avatar} nome={u.nome} classe="adm-av mini" />
                  </a>
                ))}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => setEditandoCargo(c.id)}>
              {tr('Editar')}
            </button>
            <button type="button" className="btn btn-ghost adm-perigo" onClick={() => apagar(i)}>
              {tr('Apagar')}
            </button>
          </li>
        ))}
        {lista.length === 0 && <li className="adm-vazio">{tr('Nenhum cargo ainda.')}</li>}
      </ul>
      <div className="adm-novo-admin">
        <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} aria-label={tr('Cor do novo cargo')} />
        <EscolherIcone valor={novoIcone} cor={novaCor} aoEscolher={setNovoIcone} />
        <input placeholder={tr('Nome do cargo (ex.: Premium)')} value={novoNome} maxLength={24} onChange={(e) => setNovoNome(e.target.value)} />
        <button type="button" className="btn btn-ghost" disabled={!novoNome.trim() || lista.length >= 20} onClick={adicionar}>
          {tr('Adicionar cargo')}
        </button>
      </div>
      {editandoCargo && lista.some((c) => c.id === editandoCargo) && (
        <EditarCargo cargo={lista.find((c) => c.id === editandoCargo)} indice={lista.findIndex((c) => c.id === editandoCargo)} mudar={mudar} membros={membros(editandoCargo)} souDono={souDono} aoFechar={() => setEditandoCargo(null)} />
      )}
    </div>
  )
}

// ── Aba Assinaturas: emblema Premium (Subscriber → Legend) ──
// O jogador evolui com o tempo de assinatura (cada período é de 1 mês, com data de vencimento). Sem data = infinita: não vence e o
// emblema evolui sozinho com o tempo desde o início. Vencida = sem emblema. Depois a API de pagamentos escreve estes mesmos dados.
const paraInputData = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '')
const deInputData = (v) => (v ? new Date(`${v}T23:59:59`).getTime() : null) // vence no fim do dia escolhido

function Assinaturas({ config, usuarios, aoSalvarConfig, aoSalvarPerfis }) {
  const tr = useT()
  const [meses, setMeses] = useState(() => ({ ...SUB_MESES_PADRAO, ...config.subMeses }))
  const [estado, setEstado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null) // { id, meses, expira (yyyy-mm-dd), infinita }
  const [busca, setBusca] = useState('')
  const [novaInfinita, setNovaInfinita] = useState(false)
  const ordemOk = NIVEIS_SUB.slice(1).every((n, i, l) => Number(meses[n.id]) >= 1 && (i === 0 || Number(meses[n.id]) > Number(meses[l[i - 1].id])))
  const mudouMeses = NIVEIS_SUB.slice(1).some((n) => Number(meses[n.id]) !== Number(config.subMeses?.[n.id] ?? SUB_MESES_PADRAO[n.id]))
  const assinantes = usuarios.filter((u) => u.perfil.sub).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
  const data = (ms) => new Date(ms).toLocaleDateString(tr.local)

  const salvarMeses = async () => {
    setEstado('salvando')
    try {
      const d = await chamar('/admin/config', { subMeses: Object.fromEntries(NIVEIS_SUB.slice(1).map((n) => [n.id, Math.round(Number(meses[n.id]))])) })
      aoSalvarConfig(d.config)
      setEstado('Salvo!')
    } catch (e) {
      setEstado(mensagemErro(e))
    }
  }
  // sub = { meses, expira } (ou null para remover); o início fica o mesmo (ou é o de hoje, em assinatura nova)
  const gravar = async (id, sub) => {
    setOcupado(true)
    setEstado('')
    try {
      const d = await chamar('/admin/perfil', { id, sub })
      aoSalvarPerfis(d.perfis)
      setEditando(null)
      return true
    } catch (e) {
      setEstado(mensagemErro(e))
      return false
    } finally {
      setOcupado(false)
    }
  }
  const renovar = (u) => {
    const s = u.perfil.sub
    gravar(u.id, { inicio: s.inicio, meses: (Number(s.meses) || 0) + 1, expira: maisUmMes(Math.max(Date.now(), Number(s.expira) || 0)) })
  }
  const remover = async (u) => (await confirmar(tr('Tirar a assinatura de {nome}?', { nome: u.nome || u.id }), { perigo: true, ok: tr('Tirar') })) && gravar(u.id, null)
  const salvarEdicao = () =>
    gravar(editando.id, {
      inicio: usuarios.find((u) => u.id === editando.id)?.perfil.sub?.inicio,
      meses: Math.max(0, Math.round(Number(editando.meses) || 0)),
      expira: editando.infinita ? null : deInputData(editando.expira),
    })
  const adicionar = async () => {
    const termo = busca.trim().toLowerCase()
    const achado = usuarios.find((u) => u.id === termo || (u.nome || '').toLowerCase() === termo) || (/^\d{17}$/.test(termo) ? { id: termo } : null)
    if (!achado) return setEstado('Não achei esse jogador: digite o nome exato (escolha na lista) ou o SteamID64.')
    if (await gravar(achado.id, { meses: 1, expira: novaInfinita ? null : maisUmMes(Date.now()) })) setBusca('')
  }
  const estadoSub = (u) => {
    const s = u.perfil.sub
    const n = nivelDaSub(s, config.subMeses)
    if (n) return { ativa: true, n, texto: `${tituloNivel(n)} · ${n.meses} ${tr(n.meses === 1 ? 'mês' : 'meses')} · ${n.infinita ? tr('sem data (infinita)') : tr('vence em {data}', { data: data(n.expira) })}` }
    return { ativa: false, n: null, texto: `${tr('Vencida em {data}', { data: data(Number(s.expira)) })} · ${s.meses} ${tr(s.meses === 1 ? 'mês' : 'meses')}` }
  }

  return (
    <div className="adm-bloco adm-cargos adm-subs">
      <div className="adm-config-topo">
        <p className="adm-nota">
          <b>{tr('Assinatura Premium')}</b> · {tr('O emblema aparece no canto do avatar e evolui com o tempo de assinatura. Cada período é de 1 mês, com data de vencimento; sem data a assinatura é infinita.')}
        </p>
        <div className="adm-salvar">
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
          <button type="button" className="btn btn-primary" onClick={salvarMeses} disabled={!mudouMeses || !ordemOk || estado === 'salvando'}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar tempos')}
          </button>
        </div>
      </div>

      <ul className="adm-sub-niveis">
        {NIVEIS_SUB.map((n, i) => (
          <li key={n.id}>
            <img src={urlEmblema(n.id, true)} alt="" />
            <b>{tr(tituloNivel(n))}</b>
            {i === 0 ? (
              <span className="adm-sub-desde">{tr('1º mês (qualquer assinatura ativa)')}</span>
            ) : (
              <label className="adm-sub-desde">
                {tr('a partir de')}
                <input type="number" min="1" max="600" value={meses[n.id]} onChange={(e) => setMeses((m) => ({ ...m, [n.id]: e.target.value }))} aria-label={tr('Meses para o nível {nivel}', { nivel: n.nome })} />
                {tr('meses')}
              </label>
            )}
            {n.animado && <i className="adm-anim-tag">{tr('ANIMADO')}</i>}
          </li>
        ))}
      </ul>
      {!ordemOk && <p className="lb-erro adm-sub-erro">{tr('Cada nível precisa de mais meses que o anterior.')}</p>}

      <h3 className="adm-sub-titulo">
        {tr('Assinantes')} <small>{assinantes.length}</small>
      </h3>
      <ul>
        {assinantes.map((u) => {
          const e = estadoSub(u)
          const aberto = editando?.id === u.id
          return (
            <li key={u.id} className={e.ativa ? '' : 'adm-sub-vencida'}>
              <Avatar id={u.id} src={u.avatar} nome={u.nome} />
              <a className="adm-admin-nome" href={linkPerfil(u.id)}>
                <b>{u.nome || tr('Sem nome')}</b>
              </a>
              {e.n ? <img className="adm-sub-emblema" src={urlEmblema(e.n.id, true)} alt="" /> : null}
              <span className="adm-cargo-info">{e.texto}</span>
              <button type="button" className="btn btn-ghost" disabled={ocupado || u.perfil.sub.expira == null} title={u.perfil.sub.expira == null ? tr('Sem data: não precisa renovar') : tr('Soma 1 mês no vencimento')} onClick={() => renovar(u)}>
                {tr('Renovar +1 mês')}
              </button>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setEditando(aberto ? null : { id: u.id, meses: u.perfil.sub.meses, expira: paraInputData(u.perfil.sub.expira), infinita: u.perfil.sub.expira == null })}>
                {tr(aberto ? 'Fechar' : 'Editar')}
              </button>
              <button type="button" className="btn btn-ghost adm-perigo" disabled={ocupado} onClick={() => remover(u)}>
                {tr('Remover')}
              </button>
              {aberto && (
                <div className="adm-sub-edicao">
                  <label>
                    {tr('Meses acumulados')}
                    <input type="number" min="0" max="1200" value={editando.meses} onChange={(ev) => setEditando((x) => ({ ...x, meses: ev.target.value }))} />
                  </label>
                  <label>
                    {tr('Vence em')}
                    <input type="date" value={editando.expira} disabled={editando.infinita} onChange={(ev) => setEditando((x) => ({ ...x, expira: ev.target.value }))} />
                  </label>
                  <label className="adm-numerar">
                    <input type="checkbox" checked={editando.infinita} onChange={(ev) => setEditando((x) => ({ ...x, infinita: ev.target.checked }))} />
                    {tr('Sem data (infinita)')}
                  </label>
                  <button type="button" className="btn btn-primary" disabled={ocupado || (!editando.infinita && !editando.expira)} onClick={salvarEdicao}>
                    {tr('Salvar')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {assinantes.length === 0 && <li className="adm-vazio">{tr('Nenhum assinante ainda.')}</li>}
      </ul>

      <div className="adm-novo-admin">
        <input list="adm-sub-usuarios" placeholder={tr('Nome do jogador ou SteamID64')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <datalist id="adm-sub-usuarios">
          {usuarios
            .filter((u) => u.nome && !u.perfil.sub)
            .slice(0, 300)
            .map((u) => (
              <option key={u.id} value={u.nome} />
            ))}
        </datalist>
        <label className="adm-numerar">
          <input type="checkbox" checked={novaInfinita} onChange={(e) => setNovaInfinita(e.target.checked)} />
          {tr('Sem data (infinita)')}
        </label>
        <button type="button" className="btn btn-ghost" disabled={!busca.trim() || ocupado} onClick={adicionar}>
          {tr('Dar assinatura de 1 mês')}
        </button>
      </div>
    </div>
  )
}

// Mostra os itens aos poucos: começa com um bloco e vai soltando mais conforme a rolagem chega perto do fim (catálogo de ~10 mil adesivos)
function GradeLenta({ total, passo = 80, children }) {
  const [n, setN] = useState(passo)
  const fim = useRef(null)
  useEffect(() => {
    const el = fim.current
    if (!el || n >= total) return
    const obs = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setN((v) => v + passo), { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [n, total, passo])
  return (
    <>
      {children(n, n < total ? <li ref={fim} className="adm-dar-fim" aria-hidden="true" /> : null)}
      <p className="adm-dar-dica">{Math.min(n, total)} / {total}</p>
    </>
  )
}

// ── Aba Skins (só o dono): dá uma skin para qualquer jogador ──
// O jogador não cria itens no inventário: quem entrega é o dono, por aqui. A skin cai no inventário dele (/inventario/) e ele recebe o
// aviso no meio da tela e no sino. Depois ele mesmo personaliza (desgaste, adesivos...) e equipa no CT/TR.
function DarSkin({ usuarios, fixo = null }) {
  const tr = useT()
  const catalogo = useCatalogo('armas')
  const [busca, setBusca] = useState(fixo || '')
  const [tipo, setTipo] = useState('arma')
  const [categoria, setCategoria] = useState('rifles')
  const [def, setDef] = useState(7)
  const [filtro, setFiltro] = useState('')
  const [sel, setSel] = useState([]) // skins marcadas para entregar de uma vez (de qualquer arma)
  const [st, setSt] = useState(false)
  const [estado, setEstado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [itens, setItens] = useState(null)
  const [equipJog, setEquipJog] = useState({ ct: {}, tr: {} }) // o que o jogador tem equipado (bolinhas CT/TR nos cartões)

  const termo = busca.trim().toLowerCase()
  const alvo = !termo ? null : usuarios.find((u) => u.id === termo || (u.nome || '').toLowerCase() === termo) || (/^\d{17}$/.test(termo) ? { id: termo, nome: '' } : null)

  // itens que o jogador já tem (para tirar um, se precisar)
  const carregarItens = useCallback(async (id) => {
    try {
      const r = await chamar(`/admin/skins?id=${id}`)
      setItens(r.itens || {})
      setEquipJog(r.equip || { ct: {}, tr: {} })
    } catch {
      setItens(null)
    }
  }, [])
  useEffect(() => {
    if (alvo?.id) carregarItens(alvo.id)
    else setItens(null)
  }, [alvo?.id, carregarItens])

  const armas = catalogo.dados?.armas || []
  // catálogos para desenhar os cartões (adesivos e chaveiros só carregam se alguma skin tiver)
  const [caixasLoja, setCaixasLoja] = useState([])
  useEffect(() => {
    lerCaixasPublicas().then(setCaixasLoja)
  }, [])
  const emb = tipo === 'adesivo' || tipo === 'chaveiro' || tipo === 'caixa' // abas de adesivos e chaveiros (itens que o jogador guarda e cola nas armas)
  const temEnfeite = !!itens && Object.values(itens).some((it) => it.a?.some(Boolean) || it.k?.i || it.t === 'adesivo' || it.t === 'chaveiro')
  const guardado = (t) => t === 'adesivo' || t === 'chaveiro' || t === 'caixa' // fora dos cartões de skin
  const adesivosCat = useCatalogo('adesivos', temEnfeite || tipo === 'adesivo')
  const chaveirosCat = useCatalogo('chaveiros', temEnfeite || tipo === 'chaveiro')
  const idxCartao = useMemo(() => indicar(armas, []), [armas])
  const adesivosMap = useMemo(() => new Map((adesivosCat.dados || []).map((s) => [s[0], s])), [adesivosCat.dados])
  const chaveirosMap = useMemo(() => new Map((chaveirosCat.dados || []).map((s) => [s[0], s])), [chaveirosCat.dados])
  const caixasCat = useMemo(() => ({ dados: caixasLoja.map((c) => [c.id, c.nome, c.img, c.cor]), erro: false }), [caixasLoja]) // caixas da loja: mesmo formato das linhas de adesivo/chaveiro
  const catEmb = tipo === 'adesivo' ? adesivosCat : tipo === 'chaveiro' ? chaveirosCat : caixasCat
  const srcEmb = (t, img, tam) => (t === 'caixa' ? img : urlImg(img, tam)) // a imagem da caixa é do próprio site, as outras são da Steam
  const grupo = emb ? [] : tipo === 'arma' ? armas.filter((a) => CATEGORIAS.some(([c]) => c === a.c)) : armas.filter((a) => a.c === (tipo === 'faca' ? 'facas' : 'luvas'))
  const lista = tipo === 'arma' ? grupo.filter((a) => a.c === categoria) : grupo
  const peca = lista.find((a) => a.d === def) || lista[0]
  const skins = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return (peca?.s || []).filter((s) => !q || s[1].toLowerCase().includes(q))
  }, [peca, filtro])
  // adesivos/chaveiros guardados no inventário dele, agrupados por tipo de item
  const embGuardados = useMemo(() => {
    const g = {}
    for (const [id, it] of Object.entries(itens || {})) {
      if (!guardado(it.t)) continue
      const chave = it.t + it.d
      const caixa = it.t === 'caixa' ? caixasLoja.find((c) => c.id === it.d) : null
      const linha = it.t === 'caixa' ? null : (it.t === 'adesivo' ? adesivosMap : chaveirosMap).get(it.d)
      ;(g[chave] ??= { chave, caixa: it.t === 'caixa', src: caixa?.img, img: linha?.[2], nome: caixa ? `${caixa.nome} (caixa fechada)` : linha?.[1] || `${it.t} #${it.d}`, ids: [] }).ids.push(id)
    }
    return Object.values(g)
  }, [itens, adesivosMap, chaveirosMap, caixasLoja])
  const chaveDe = (t, d, p) => `${t}:${d}:${p}`
  const marcada = (p) => sel.some((x) => x.chave === chaveDe(tipo, peca?.d, p))
  // adesivo/chaveiro: marca com quantidade (cada unidade vira um item no inventário dele)
  const marcadaEmb = (def) => sel.find((x) => x.chave === chaveDe(tipo, def, 0))
  const alternarEmb = (linha) => {
    const chave = chaveDe(tipo, linha[0], 0)
    setSel((l) => (l.some((x) => x.chave === chave) ? l.filter((x) => x.chave !== chave) : [...l, { chave, t: tipo, d: linha[0], nome: linha[1], img: linha[2], q: 1 }]))
  }
  const mudarQtd = (chave, q) => setSel((l) => l.map((x) => (x.chave === chave ? { ...x, q: Math.max(1, Math.min(50, Math.round(Number(q)) || 1)) } : x)))
  const filtroEmb = filtro.trim().toLowerCase()
  const listaEmb = useMemo(() => (emb ? (catEmb.dados || []).filter((s) => !filtroEmb || s[1].toLowerCase().includes(filtroEmb)) : []), [emb, catEmb.dados, filtroEmb])
  const alternar = (s) => {
    const chave = chaveDe(tipo, peca.d, s[0])
    // f = float (desgaste) e seed = pattern (0 a 1000) que a skin vai ter; o admin muda antes de enviar (começa no float mínimo e pattern 0)
    setSel((l) => (l.some((x) => x.chave === chave) ? l.filter((x) => x.chave !== chave) : [...l, { chave, t: tipo, d: peca.d, arma: peca.n, skin: s, f: Math.max(s[3], 0.0001), seed: 0 }]))
  }
  const limitesFloat = (skin) => [Math.max(skin[3] ?? 0, 0), Math.min(skin[4] ?? 1, 1)]
  const mudarFloat = (chave, v) => setSel((l) => l.map((x) => (x.chave === chave ? { ...x, f: v } : x)))
  const mudarSeed = (chave, v) => setSel((l) => l.map((x) => (x.chave === chave ? { ...x, seed: v } : x)))
  const fixarFloat = (x) => {
    const [min, max] = limitesFloat(x.skin)
    mudarFloat(x.chave, String(Math.min(max, Math.max(min, Number(x.f) || min, 0.0001))))
  }
  const dar = async () => {
    if (!alvo || !sel.length) return
    setOcupado(true)
    setEstado('')
    try {
      const itensDar = sel.map(({ t, d, q, skin: s, f, seed }) => {
        if (t === 'adesivo' || t === 'chaveiro' || t === 'caixa') return { t, d, q }
        const [min, max] = limitesFloat(s)
        const fl = Math.min(max, Math.max(min, Number(f) || min, 0.0001))
        const sd = Math.min(1000, Math.max(0, Math.round(Number(seed)) || 0))
        return { t, d, p: s[0], f: fl, s: sd, st: st && s[5] === 1 ? 1 : 0, l: s[7] ? 1 : 0, n: '', a: [null, null, null, null, null], k: null }
      })
      const r = await chamar('/admin/skin', { id: alvo.id, itens: itensDar })
      setItens(r.itens)
      setEstado(tr('{n} skin(s) entregue(s)! O jogador recebe o aviso na hora (ou na próxima vez que abrir o site).', { n: itensDar.length }))
      setSel([])
    } catch (e) {
      setEstado(e.message === 'cheio' ? tr('O inventário dele não comporta tantas skins.') : mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }
  const tirar = async (id) => {
    if (!(await confirmar(tr('Tirar esta skin do jogador?'), { perigo: true, ok: tr('Tirar') }))) return
    setOcupado(true)
    try {
      setItens((await chamar('/admin/skin', { id: alvo.id, remover: id })).itens)
    } catch (e) {
      setEstado(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="caixa adm-dar">
      {!fixo && <p className="adm-dar-dica">{tr('O jogador não cria skins sozinho: só você (dono) entrega. Escolha o jogador, a arma e a skin.')}</p>}

      {!fixo && (
      <div className="adm-sub-add">
        <input list="adm-skin-usuarios" type="text" placeholder={tr('Jogador: nome exato ou SteamID64')} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label={tr('Jogador')} />
        <datalist id="adm-skin-usuarios">
          {usuarios
            .filter((u) => u.nome)
            .slice(0, 400)
            .map((u) => (
              <option key={u.id} value={u.nome} />
            ))}
        </datalist>
        <span className="adm-cargo-info">{alvo ? `${alvo.nome || alvo.id}` : tr('Escolha um jogador da lista')}</span>
      </div>
      )}

      <div className="adm-dar-tipos" role="tablist">
        {[
          ['arma', 'Armas'],
          ['faca', 'Facas'],
          ['luva', 'Luvas'],
          ['adesivo', 'Adesivos'],
          ['chaveiro', 'Chaveiros'],
          ['caixa', 'Caixas'],
        ].map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={tipo === id} className={tipo === id ? 'active' : ''} onClick={() => { setTipo(id); setDef(null); setFiltro('') }}>
            {tr(nome)}
          </button>
        ))}
      </div>

      {emb ? (
        catEmb.erro ? (
          <p className="lb-erro">{tr('Não consegui carregar o catálogo de skins.')}</p>
        ) : !catEmb.dados ? (
          <p>{tr('Carregando…')}</p>
        ) : (
          <section className="adm-dar-emb">
            <input type="search" className="adm-dar-busca" placeholder={tr(tipo === 'adesivo' ? 'Pesquisar adesivo' : tipo === 'caixa' ? 'Pesquisar caixa' : 'Pesquisar chaveiro')} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <GradeLenta key={tipo + filtroEmb} total={listaEmb.length}>
              {(n, fimLi) => (
                <ul className="adm-dar-grade adm-dar-grade-emb">
                  {listaEmb.slice(0, n).map((s) => (
                    <li key={s[0]}>
                      <button type="button" className={marcadaEmb(s[0]) ? 'active' : ''} aria-pressed={!!marcadaEmb(s[0])} style={{ '--cor': s[3] || 'var(--border-2)' }} onClick={() => alternarEmb(s)} title={s[1]}>
                        <img src={srcEmb(tipo, s[2], 128)} alt="" loading="lazy" />
                        <b>{s[1]}</b>
                      </button>
                    </li>
                  ))}
                  {fimLi}
                </ul>
              )}
            </GradeLenta>
          </section>
        )
      ) : catalogo.erro ? (
        <p className="lb-erro">{tr('Não consegui carregar o catálogo de skins.')}</p>
      ) : !catalogo.dados ? (
        <p>{tr('Carregando…')}</p>
      ) : (
        <div className="adm-dar-corpo">
          <aside>
            {tipo === 'arma' && (
              <div className="adm-dar-cats">
                {CATEGORIAS.map(([id, nome]) => (
                  <button key={id} type="button" className={categoria === id ? 'active' : ''} onClick={() => { setCategoria(id); setDef(null) }}>
                    {tr(nome)}
                  </button>
                ))}
              </div>
            )}
            <ul>
              {lista.map((a) => (
                <li key={a.d}>
                  <button type="button" className={a.d === peca?.d ? 'active' : ''} onClick={() => { setDef(a.d) }}>
                    {a.n}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section>
            <input type="search" className="adm-dar-busca" placeholder={tr('Pesquisar skin')} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <ul className="adm-dar-grade">
              {skins.map((s) => (
                <li key={s[0]}>
                  <button type="button" className={marcada(s[0]) ? 'active' : ''} aria-pressed={marcada(s[0])} style={{ '--cor': s[2] || 'var(--border-2)' }} onClick={() => alternar(s)} title={s[1]}>
                    <img src={urlImgArma(s[6], 256)} alt="" loading="lazy" />
                    <b>{s[1]}</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {sel.length > 0 && (
        <div className="adm-dar-sel">
          <div className="adm-dar-sel-cab">
            <b>{tr('Selecionadas')} ({sel.length})</b>
            <button type="button" className="btn btn-ghost" onClick={() => setSel([])}>
              {tr('Limpar seleção')}
            </button>
          </div>
          <ul>
            {sel.map((x) => (
              <li key={x.chave} style={{ '--cor': x.skin?.[2] || 'var(--border-2)' }}>
                {x.skin ? <img src={urlImgArma(x.skin[6], 128)} alt="" /> : <img src={srcEmb(x.t, x.img, 64)} alt="" />}
                <span>{x.skin ? `${x.arma} | ${x.skin[1]}` : x.nome}</span>
                {!x.skin && <input type="number" min="1" max="50" className="adm-dar-qtd" value={x.q} aria-label={tr('Quantidade')} onChange={(e) => mudarQtd(x.chave, e.target.value)} />}
                {x.skin && x.t !== 'agente' && (
                  <span className="adm-dar-fs">
                    <label title={tr('Float (desgaste) da skin: entre {min} e {max}', { min: limitesFloat(x.skin)[0], max: limitesFloat(x.skin)[1] })}>
                      Float
                      <input type="number" step="0.0001" min={limitesFloat(x.skin)[0]} max={limitesFloat(x.skin)[1]} value={x.f} onChange={(e) => mudarFloat(x.chave, e.target.value)} onBlur={() => fixarFloat(x)} />
                    </label>
                    <label title={tr('Pattern (paint seed) de 0 a 1000')}>
                      Pattern
                      <input type="number" step="1" min="0" max="1000" value={x.seed} onChange={(e) => mudarSeed(x.chave, e.target.value)} />
                    </label>
                    <button type="button" className="adm-dar-sorte" title={tr('Pattern aleatório')} aria-label={tr('Pattern aleatório')} onClick={() => mudarSeed(x.chave, Math.floor(Math.random() * 1001))}>
                      🎲
                    </button>
                  </span>
                )}
                <button type="button" aria-label={tr('Tirar da seleção')} onClick={() => setSel((l) => l.filter((y) => y.chave !== x.chave))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="adm-dar-extra">
            {sel.some((x) => x.skin?.[5] === 1) && (
              <label className="adm-numerar">
                <input type="checkbox" checked={st} onChange={(e) => setSt(e.target.checked)} />
                {tr('StatTrak™ nas que aceitam')}
              </label>
            )}
            <span className="adm-dar-dica">{tr('Cada skin chega com o float e o pattern que você definir acima (começa no desgaste mínimo e pattern 0). Adesivos e chaveiros ficam no inventário dele e são gastos ao colar numa arma.')}</span>
            <button type="button" className="btn btn-primary" disabled={!alvo || ocupado} onClick={dar}>
              {alvo ? tr('Dar {n} skin(s) para {nome}', { n: sel.length, nome: alvo.nome || alvo.id }) : tr('Escolha o jogador')}
            </button>
          </div>
        </div>
      )}
      {estado && <p className="adm-dar-estado">{estado}</p>}

      {alvo && itens && Object.keys(itens).length > 0 && (
        <div className="adm-dar-itens">
          <h3>{tr('Skins que ele tem')}</h3>
          <ul className="inv-itens adm-dar-cartoes">
            {Object.entries(itens).filter(([, it]) => !guardado(it.t)).map(([id, it]) => (
              <CartaoSkin
                key={id}
                item={{ ...it, __id: id }}
                idx={idxCartao}
                adesivos={adesivosMap}
                chaveiros={chaveirosMap}
                equip={equipJog}
                extra={
                  <button type="button" className="btn btn-ghost adm-perigo adm-tirar" disabled={ocupado} onClick={() => tirar(id)}>
                    {tr('Tirar')}
                  </button>
                }
              />
            ))}
          </ul>
          {embGuardados.length > 0 && (
            <>
              <h3>{tr('Adesivos, chaveiros e caixas guardados')}</h3>
              <ul className="adm-dar-guardados">
                {embGuardados.map((g) => (
                  <li key={g.chave}>
                    <img src={g.caixa ? g.src : urlImg(g.img, 64)} alt="" loading="lazy" />
                    <span>{g.nome}</span>
                    <b>×{g.ids.length}</b>
                    <button type="button" className="btn btn-ghost adm-perigo adm-tirar" disabled={ocupado} onClick={() => tirar(g.ids[0])}>
                      {tr('Tirar 1')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Aba Admins ──
function Admins({ config, dono, souDono, usuarios, aoSalvar }) {
  const tr = useT()
  const [novo, setNovo] = useState('')
  const [estado, setEstado] = useState('')
  const nomeDe = (id) => usuarios.find((u) => u.id === id)?.nome || tr('Sem nome')
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
        {tr('Admins acessam este painel e editam os usuários e as regras das molduras.')} {souDono ? tr('Só você (dono) muda esta lista.') : tr('Só o dono muda esta lista.')}
      </p>
      <ul>
        {[dono, ...(config.admins || []).filter((id) => id !== dono)].filter(Boolean).map((id) => (
          <li key={id}>
            <ComMoldura steamId={id} soEmblema>
              <Avatar id={id} src={avatarDe(id)} nome={nomeDe(id)} />
            </ComMoldura>
            {/* Nome, selo (Dono/Admin) e SteamID empilhados; à direita só o botão Remover */}
            <span className="adm-admin-info">
              <a className="adm-admin-nome" href={linkPerfil(id)}>
                <b>{nomeDe(id)}</b>
              </a>
              <SeloEquipe selo={id === dono ? { ...SELOS_PADRAO.dono, ...config.selos?.dono } : { ...SELOS_PADRAO.admin, ...config.selos?.admin }} />
              <small className="mono">{id}</small>
            </span>
            {id === dono ? null : (
              <>
                {souDono && (
                  <button type="button" className="btn btn-ghost adm-perigo" onClick={() => mudar(id, false)} disabled={estado === 'salvando'}>
                    {tr('Remover')}
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {souDono && (
        <div className="adm-novo-admin">
          <input list="adm-lista-ids" placeholder={tr('SteamID64 (17 números)')} value={novo} onChange={(e) => setNovo(e.target.value)} />
          <datalist id="adm-lista-ids">
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </datalist>
          <button type="button" className="btn btn-primary" disabled={!valido || estado === 'salvando'} onClick={() => mudar(novo.trim(), true)}>
            {tr('Tornar admin')}
          </button>
          <span className="sm-msg" role="status">
            {estado !== 'salvando' && tr(estado)}
          </span>
        </div>
      )}
    </div>
  )
}

// "há 5 s" (conta sozinho)
// Seletor de partes dentro de uma aba (ex.: Visual → Molduras | Cards). Só mostra as partes liberadas; com uma só, nem mostra o seletor.
function SubAbas({ opcoes, children }) {
  const tr = useT()
  const livres = opcoes.filter(([, , ok]) => ok)
  const [sub, setSub] = useState(livres[0]?.[0])
  const atual = livres.some(([id]) => id === sub) ? sub : livres[0]?.[0]
  if (!atual) return null
  return (
    <>
      {livres.length > 1 && (
        <div className="adm-sub-abas" role="tablist">
          {livres.map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={atual === id} className={atual === id ? 'active' : ''} onClick={() => setSub(id)}>
              {tr(rotulo)}
            </button>
          ))}
        </div>
      )}
      {children(atual)}
    </>
  )
}

function Ha({ desde }) {
  const tr = useT()
  const [, setTique] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTique((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!desde) return tr('agora')
  const s = Math.max(0, Math.round((Date.now() - desde) / 1000))
  return s < 2 ? tr('agora') : s < 60 ? tr('há {n} s', { n: s }) : tr('há {n} min', { n: Math.floor(s / 60) })
}

function Aviso({ titulo, texto, children }) {
  const tr = useT()
  return (
    <section className="hero adm-hero">
      <FundoHero quantidade={8} />
      <div className="wrap">
        <span className="kicker">{tr('ADMINISTRAÇÃO')}</span>
        <h1>{tr(titulo)}</h1>
        {texto && <p className="lead">{tr(texto)}</p>}
        {children && <div className="adm-acoes">{children}</div>}
      </div>
    </section>
  )
}

export default function Admin() {
  const tr = useT()
  const conta = useConta()
  const eu = useAdmin(conta)
  const [montado, setMontado] = useState(false)
  const [painel, setPainel] = useState(null)
  const [ranking, setRanking] = useState(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('jogadores')
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
    if (eu.painel) carregar()
  }, [eu.painel, carregar])
  // Atualiza sozinho a cada 15 s com a aba visível (e ao voltar para a aba); pausa enquanto edita alguém
  useEffect(() => {
    if (!eu.painel || editando) return
    const tique = () => document.visibilityState === 'visible' && carregar(true)
    const id = setInterval(tique, 15000)
    document.addEventListener('visibilitychange', tique)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tique)
    }
  }, [eu.painel, editando, carregar])

  const usuarios = useMemo(() => (painel ? montarUsuarios(painel, ranking) : []), [painel, ranking])
  const fecharEdicao = useCallback(() => setEditando(null), [])

  let conteudo
  if (!montado || (conta && eu.id !== conta.id)) conteudo = <Aviso titulo="Carregando…" />
  else if (!conta)
    conteudo = (
      <Aviso titulo="Painel de administrador" texto="Entre com a Steam para acessar.">
        {loginAtivo() && (
          <button type="button" className="btn btn-primary" onClick={entrar}>
            {tr('Entrar com Steam')}
          </button>
        )}
      </Aviso>
    )
  else if (!eu.painel) conteudo = <Aviso titulo="Acesso restrito" texto="Esta área é só para quem tem acesso ao painel." />
  else if (erro)
    conteudo = (
      <Aviso titulo="Não deu para carregar" texto={erro}>
        <button type="button" className="btn btn-primary" onClick={carregar}>
          {tr('Tentar de novo')}
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
    // Cada pessoa vê só as abas que o worker liberou (/eu → abas): o dono vê todas; admin vê Usuários, Molduras, Cards e Cargos; um cargo pode liberar mais
    // 6 abas, cada uma juntando as funções parecidas. As permissões continuam por função (o worker confere cada rota):
    // a aba aparece se a pessoa tem pelo menos uma das funções dela, e dentro dela só aparecem as partes liberadas.
    const tem = (id) => eu.abas.includes(id)
    const ABAS = [
      ['jogadores', 'Jogadores', ['usuarios', 'pontos', 'skins']],
      ['visual', 'Visual', ['molduras', 'cards']],
      ['equipe', 'Equipe', ['cargos', 'admins']],
      ['loja', 'Loja', ['caixas', 'assinaturas', 'pontos']],
      ['logs', 'Logs', ['logs']],
      ['servidor', 'Servidor', ['servidor']],
    ].filter(([, , precisa]) => precisa.some(tem))
    const abaAtual = ABAS.some(([id]) => id === aba) ? aba : ABAS[0]?.[0]
    conteudo = (
      <>
        <section className="hero adm-hero">
          <FundoHero quantidade={8} />
          <div className="wrap">
            <span className="kicker">{tr('ADMINISTRAÇÃO')}</span>
            <h1>{tr('Painel do site')}</h1>
            <div className="adm-resumo">
              {[
                ['ENTRARAM NO SITE', n.logados],
                ['JOGADORES NO RANKING', n.ranking],
                ['PERFIS PERSONALIZADOS', n.perfis],
                ['BLOQUEADOS', n.bloqueados],
              ].map(([r, v]) => (
                <div key={r} className="caixa">
                  <span className="mono">{tr(r)}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="secao adm-secao">
          <div className="wrap">
            <div className="adm-abas" role="tablist" aria-label={tr('Seções do painel')}>
              {ABAS.map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={abaAtual === id} className={abaAtual === id ? 'active' : ''} onClick={() => setAba(id)}>
                  {tr(rotulo)}
                </button>
              ))}
              <span className="adm-vivo" title={tr('O painel se atualiza sozinho a cada 15 segundos')}>
                <i /> {editando ? tr('Pausado (editando)') : <>{tr('Atualiza sozinho')} · <Ha desde={atualizado} /></>}
              </span>
              <button type="button" className="adm-recarregar" onClick={() => carregar()} title={tr('Recarregar agora')}>
                ↻
              </button>
            </div>
            {abaAtual === 'jogadores' && (
              <>
                {tem('usuarios') && <AdminMissoes />}
                <Usuarios usuarios={usuarios} painel={painel} dono={painel.dono} editar={setEditando} />
                {tem('pontos') && (
                  <details className="adm-dobra">
                    <summary>{tr('Bônus para todos os jogadores (NP ou caixa)')}</summary>
                    <AdminPontos usuarios={usuarios} modo="todos" />
                  </details>
                )}
              </>
            )}
            {abaAtual === 'visual' && (
              <SubAbas
                opcoes={[
                  ['molduras', 'Molduras', tem('molduras')],
                  ['cards', 'Cards do perfil', tem('cards')],
                ]}
              >
                {(sub) =>
                  sub === 'molduras' ? (
                    <Molduras key={JSON.stringify(painel.config)} config={painel.config} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />
                  ) : (
                    <CardsRegras key={JSON.stringify(painel.config)} config={painel.config} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />
                  )
                }
              </SubAbas>
            )}
            {abaAtual === 'equipe' && (
              <>
                {tem('admins') && <Admins config={painel.config} dono={painel.dono} souDono={eu.dono} usuarios={usuarios} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />}
                {tem('cargos') && eu.dono && <SelosEquipe key={JSON.stringify(painel.config.selos || {})} config={painel.config} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />}
                {tem('cargos') && <Cargos key={JSON.stringify(painel.config.cargos || [])} souDono={eu.dono} config={painel.config} usuarios={usuarios} aoSalvar={(config) => setPainel((p) => ({ ...p, config }))} />}
              </>
            )}
            {abaAtual === 'loja' && (
              <SubAbas
                opcoes={[
                  ['caixas', 'Caixas', tem('caixas')],
                  ['assinatura', 'Assinatura Premium', tem('assinaturas')],
                  ['depositos', 'Depósitos', tem('pontos')],
                ]}
              >
                {(sub) =>
                  sub === 'caixas' ? (
                    <AdminCaixas />
                  ) : sub === 'assinatura' ? (
                    <>
                      <AdminPlanos />
                      <Assinaturas key={JSON.stringify(painel.config.subMeses || {})} config={painel.config} usuarios={usuarios} aoSalvarConfig={(config) => setPainel((p) => ({ ...p, config }))} aoSalvarPerfis={(perfis) => setPainel((p) => ({ ...p, perfis }))} />
                    </>
                  ) : (
                    <ConfigDepositos />
                  )
                }
              </SubAbas>
            )}
            {abaAtual === 'logs' && <AdminLogs usuarios={usuarios} />}
            {abaAtual === 'servidor' && eu.dono && <AdminServidor />}
          </div>
        </section>
        {editando && <EditarUsuario abas={eu.abas} usuarios={usuarios} u={editando} cargos={painel.config.cargos || []} ehAdmin={editando.id === painel.dono || (painel.config.admins || []).includes(editando.id)} souDono={eu.dono} fechar={fecharEdicao} aoSalvar={(perfis) => setPainel((p) => ({ ...p, perfis }))} />}
      </>
    )
  }

  return (
    <Layout pagina="admin">
      <main>{conteudo}</main>
    </Layout>
  )
}
