import { useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
import { entrar, linkPerfil, loginAtivo } from '../../comum/conta.js'
import { lerJson } from '../../comum/dados.js'
import { IconeSteam } from '../../comum/Icones.jsx'
import { ComMoldura, IconeEquipe, useCardDe, usePerfis } from '../../comum/Moldura.jsx'
import { urlCard } from '../../comum/cardsPerfil.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { ALL_MAPS, mapImage } from '../../comum/mapas.js'
import { nivelDe } from '../../comum/niveis.js'
import { ordenarRanking } from '../../comum/ranking.js'
import { useAmigos } from '../../comum/amigos.js'
import { useAvatar } from '../../comum/avatares.js'
import { acaoLobby, useLobby } from '../../comum/lobby.js'
import { useT } from '../../comum/i18n.js'

// Lobby (estilo FACEIT): nível e temporada em cima, o grupo (5 lugares, você no meio) e o painel de partida embaixo.
// O líder convida, remove e deixa o grupo aberto ("Grupo público": amigos entram sozinhos).

const ERROS = {
  cheio: 'O lobby está cheio.',
  amigo: 'Só dá para convidar amigos.',
  lider: 'Só o líder do lobby pode fazer isso.',
  negado: 'Você não pode entrar nesse lobby.',
  'sem-lobby': 'Esse lobby não existe mais.',
  ocupado: 'Você é líder de um lobby com gente: saia dele antes.',
  login: 'Seu login venceu. Entre de novo com a Steam.',
}
const fmt = (v, t) => Number(v || 0).toLocaleString(t.local)

// ── ranking.json (nível e números de cada jogador), lido uma vez por página ──
let rankingLido = null
function useRanking() {
  const [r, setR] = useState(rankingLido)
  useEffect(() => {
    if (rankingLido) return
    let vivo = true
    lerJson('/ranking/ranking.json').then((d) => {
      rankingLido = d || { jogadores: [] }
      vivo && setR(rankingLido)
    })
    return () => {
      vivo = false
    }
  }, [])
  return r
}
// Nível de qualquer jogador (XP das partidas + ajuste do admin), como no resto do site
function useInfoNivel() {
  const ranking = useRanking()
  const perfis = usePerfis()
  return (id) => {
    const j = ranking?.jogadores?.find((x) => x.steamId === id)
    return { j, info: nivelDe((Number(j?.xp) || 0) + (Number(perfis[id]?.xp) || 0), Number(j?.mapas) || 0) }
  }
}

function Foto({ p }) {
  const src = useAvatar(p.id, p.avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" onError={() => setErro(src)} /> : <span className="lb-ini">{(p.nome || '?').slice(0, 2).toUpperCase()}</span>
}

const Coroa = () => (
  <svg className="lb-coroa" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z" />
  </svg>
)
const Marca = ({ d, tamanho = 16 }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)
const IC_PESSOAS = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </>
)
const IC_BUSCA = (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
)
const IC_SAIR = (
  <>
    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
    <path d="m16 8 4 4-4 4M20 12H9" />
  </>
)
const IC_CHECK = <path d="m4 12.5 5 5L20 6.5" />

// Um lugar do grupo com alguém (ou convite pendente): o fundo é o card que a pessoa escolheu no perfil
function Pessoa({ pessoa, lider, pendente, centro, souLider, eu, aoRemover, ocupado, nivelDe: nivelDoJogador }) {
  const t = useT()
  const card = useCardDe(pessoa.id)
  const { info } = nivelDoJogador(pessoa.id)
  return (
    <div className={`lb-lugar lb-pessoa${centro ? ' lb-centro' : ''}${pendente ? ' lb-pendente' : ''}${pessoa.id === eu ? ' lb-eu' : ''}${card ? ' com-card' : ''}`} style={card ? { '--card-fundo': `url("${urlCard(card)}")` } : undefined}>
      {lider && <Coroa />}
      <a className="lb-av" href={linkPerfil(pessoa.id)} title={pessoa.nome || pessoa.id}>
        <ComMoldura steamId={pessoa.id}>
          <Foto p={pessoa} />
        </ComMoldura>
        {!pendente && <i className={`lb-bolinha st-${pessoa.st || 'offline'}`} aria-hidden="true" />}
      </a>
      <b className="lb-nome">
        <span>{pessoa.nome || pessoa.id}</span>
        <IconeEquipe steamId={pessoa.id} />
      </b>
      {pendente ? (
        <span className="lb-pilula lb-pilula-espera">{t('Convite enviado…')}</span>
      ) : (
        <span className="lb-pilula">
          <SeloNivel nivel={info.nivel} tamanho={22} />
          {info.classificado ? t('Nível {n}', { n: info.nivel >= 11 ? 'Elite' : info.nivel }) : t('Sem classificação')}
        </span>
      )}
      {souLider && !lider && !centro && (
        <button type="button" className="lb-x" disabled={ocupado} onClick={() => aoRemover(pessoa.id)} aria-label={pendente ? t('Cancelar convite') : t('Remover do lobby')} title={pendente ? t('Cancelar convite') : t('Remover do lobby')}>
          ×
        </button>
      )}
    </div>
  )
}

// Lugar vazio com o "+" (só o líder convida)
function Vazio({ souLider, aoConvidar }) {
  const t = useT()
  return souLider ? (
    <button type="button" className="lb-lugar lb-vazio" onClick={aoConvidar} aria-label={t('Convidar amigo')}>
      <span className="lb-mais">+</span>
    </button>
  ) : (
    <div className="lb-lugar lb-vazio lb-inerte" aria-hidden="true">
      <span className="lb-mais">+</span>
    </div>
  )
}

// Janela: convidar um amigo (online primeiro)
function Convidar({ lobby, aoFechar, aoConvidar, ocupado }) {
  const t = useT()
  const { lista, status } = useAmigos()
  const [busca, setBusca] = useState('')
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  const dentro = new Set([...lobby.membros.map((m) => m.id), ...lobby.convites.map((c) => c.id)])
  const ordem = { online: 0, ausente: 1, offline: 2 }
  const st = (a) => status[a.id]?.st || 'offline'
  const amigos = useMemo(
    () =>
      (lista?.amigos || [])
        .filter((a) => !dentro.has(a.id) && (a.nome || a.id).toLowerCase().includes(busca.trim().toLowerCase()))
        .sort((x, y) => ordem[st(x)] - ordem[st(y)] || (x.nome || '').localeCompare(y.nome || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, status, busca, lobby],
  )
  return (
    <div className="lb-fundo" onClick={aoFechar}>
      <div className="lb-janela" role="dialog" aria-modal="true" aria-labelledby="lb-conv-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="lb-janela-cab">
          <h2 id="lb-conv-titulo">{t('Convidar para o lobby')}</h2>
          <button type="button" className="lb-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <input type="search" className="lb-busca" placeholder={t('Pesquisar amigo')} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
        <ul className="lb-amigos">
          {amigos.map((a) => (
            <li key={a.id}>
              <span className="lb-amigo-av">
                <Foto p={a} />
                <i className={`lb-bolinha st-${st(a)}`} aria-hidden="true" />
              </span>
              <span className="lb-amigo-nome">
                <b>{a.nome || a.id}</b>
                <small>{st(a) === 'online' ? t('Online') : st(a) === 'ausente' ? t('Ausente') : t('Offline')}</small>
              </span>
              <button type="button" className="lb-btn lb-btn-p" disabled={ocupado} onClick={() => aoConvidar(a.id)}>
                {t('Convidar')}
              </button>
            </li>
          ))}
          {lista && !amigos.length && <li className="lb-vazio-lista">{(lista.amigos || []).length ? t('Nenhum amigo para convidar.') : t('Você ainda não tem amigos. Adicione pelo painel de amigos.')}</li>}
          {!lista && <li className="lb-vazio-lista">{t('Carregando…')}</li>}
        </ul>
      </div>
    </div>
  )
}

// Janela: encontrar lobbies (convites recebidos e lobbies abertos de amigos)
function Encontrar({ dados, aoFechar, fazer, ocupado }) {
  const t = useT()
  const [aba, setAba] = useState(dados.convitesRecebidos.length ? 'convites' : 'abertos')
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  const linha = (lider, membros, recusar) => (
    <li key={lider.id}>
      <span className="lb-amigo-av">
        <Foto p={lider} />
        <i className={`lb-bolinha st-${lider.st || 'offline'}`} aria-hidden="true" />
      </span>
      <span className="lb-amigo-nome">
        <b>{lider.nome || lider.id}</b>
        <small>{t('{n}/{max} no lobby', { n: membros, max: dados.max })}</small>
      </span>
      <span className="lb-par">
        <button type="button" className="lb-btn lb-btn-p" disabled={ocupado} onClick={() => fazer('entrar', lider.id)}>
          {t('Entrar')}
        </button>
        {recusar && (
          <button type="button" className="lb-btn lb-btn-g" disabled={ocupado} onClick={() => fazer('recusar', lider.id)}>
            {t('Recusar')}
          </button>
        )}
      </span>
    </li>
  )
  return (
    <div className="lb-fundo" onClick={aoFechar}>
      <div className="lb-janela" role="dialog" aria-modal="true" aria-labelledby="lb-enc-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="lb-janela-cab">
          <h2 id="lb-enc-titulo">{t('Encontrar lobbies')}</h2>
          <button type="button" className="lb-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <div className="lb-abas" role="tablist">
          {[
            ['convites', t('Convites'), dados.convitesRecebidos.length],
            ['abertos', t('Lobbies de amigos'), dados.abertos.length],
          ].map(([id, rotulo, n]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>
              {rotulo} <small>{n}</small>
            </button>
          ))}
        </div>
        <ul className="lb-amigos">
          {aba === 'convites' && dados.convitesRecebidos.map(({ lider, membros }) => linha(lider, membros, true))}
          {aba === 'abertos' && dados.abertos.map(({ lider, membros }) => linha(lider, membros, false))}
          {aba === 'convites' && !dados.convitesRecebidos.length && <li className="lb-vazio-lista">{t('Ninguém te convidou ainda.')}</li>}
          {aba === 'abertos' && !dados.abertos.length && <li className="lb-vazio-lista">{t('Nenhum amigo com lobby aberto agora.')}</li>}
        </ul>
      </div>
    </div>
  )
}

const MODOS = [
  {
    id: 'padrao',
    nome: 'Partida padrão',
    itens: [
      ['Grupos de 1 a 5 jogadores', IC_PESSOAS],
      ['Demo gravada de todo mapa', IC_CHECK],
      ['Rating, ADR e KAST de cada partida', IC_CHECK],
      ['XP e nível a cada mapa', IC_CHECK],
    ],
  },
  {
    id: 'serie',
    nome: 'Série MD3',
    itens: [
      ['Veto de mapas pelo NeuraPick', IC_CHECK],
      ['Lados definidos pelo veto', IC_CHECK],
      ['Round faca e pausa com regra', IC_CHECK],
      ['Placar da série ao vivo', IC_CHECK],
    ],
  },
]

function Painel({ dados }) {
  const t = useT()
  const [aba, setAba] = useState('tipo')
  const [modo, setModo] = useState('padrao')
  return (
    <section className="lb-painel" aria-label={t('Partida')}>
      <div className="lb-buscar-faixa">
        <p className="lb-aviso">
          <Marca d={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />} tamanho={18} />
          <span>{t('A fila automática ainda não abriu')}</span>
          {CONFIG.comunidade && (
            <a href={CONFIG.comunidade} target="_blank" rel="noopener">
              {t('ENTRAR NA KIVO')}
            </a>
          )}
        </p>
        <button type="button" className="lb-buscar" disabled title={t('Em breve')}>
          {t('BUSCAR PARTIDA')}
          <small>{t('Em breve')}</small>
        </button>
      </div>

      <div className="lb-abas-painel" role="tablist">
        {[
          ['tipo', t('TIPO DE PARTIDA'), null],
          ['mapas', t('MAPAS'), `${ALL_MAPS.length}/${ALL_MAPS.length}`],
          ['servidor', t('SERVIDOR'), '1/1'],
        ].map(([id, rotulo, n]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>
            {rotulo} {n && <small>{n}</small>}
          </button>
        ))}
      </div>

      <div className="lb-painel-corpo">
        {aba === 'tipo' && (
          <div className="lb-modos">
            {MODOS.map((m) => (
              <button key={m.id} type="button" className={`lb-modo${modo === m.id ? ' sel' : ''}`} onClick={() => setModo(m.id)} aria-pressed={modo === m.id}>
                <span className="lb-modo-cab">
                  <b>{t(m.nome)}</b> <small>· 5v5</small>
                </span>
                <span className="lb-modo-itens">
                  {m.itens.map(([texto, icone]) => (
                    <span key={texto}>
                      <Marca d={icone} tamanho={16} />
                      {t(texto)}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )}
        {aba === 'mapas' && (
          <ul className="lb-mapas">
            {ALL_MAPS.map((m) => (
              <li key={m.id} style={{ '--img': `url('${mapImage(m.id)}')`, '--c1': m.colors[0], '--c2': m.colors[1] }}>
                <b>{m.name}</b>
              </li>
            ))}
          </ul>
        )}
        {aba === 'servidor' && (
          <div className="lb-servidor">
            <b>{t('Servidor competitivo')}</b>
            <p>{t('CS2 com espera 5x5, round faca, séries do NeuraPick, pausa com regra e demos gravadas automaticamente. Chat com cargos.')}</p>
            {CONFIG.comunidade && (
              <a className="lb-btn lb-btn-p" href={CONFIG.comunidade} target="_blank" rel="noopener">
                {t('Jogar com a gente')}
              </a>
            )}
            <small>{t('{n} no seu grupo agora', { n: dados.membros.length })}</small>
          </div>
        )}
      </div>
    </section>
  )
}

function Conteudo() {
  const t = useT()
  const { dados, erro, conta } = useLobby()
  const [convidando, setConvidando] = useState(false)
  const [encontrando, setEncontrando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const nivelDoJogador = useInfoNivel()
  const ranking = useRanking()
  const perfis = usePerfis()

  const fazer = async (acao, id, valor) => {
    setOcupado(true)
    setAviso('')
    try {
      await acaoLobby(acao, id, valor)
      if (acao === 'entrar') setEncontrando(false)
    } catch (e) {
      setAviso(ERROS[e.message] || 'Não deu certo. Tente de novo.')
    } finally {
      setOcupado(false)
    }
  }

  if (!conta)
    return (
      <div className="lb-aviso-login">
        <h2>{t('Entre para usar o lobby')}</h2>
        <p>{t('Monte um grupo com seus amigos, convide quem quiser e deixe o lobby aberto para eles entrarem.')}</p>
        {loginAtivo() && (
          <button type="button" className="lb-btn lb-btn-p" onClick={entrar}>
            <IconeSteam /> {t('Entrar com Steam')}
          </button>
        )}
      </div>
    )
  if (!dados) return <p className="lb-carregando">{erro ? t(ERROS[erro] || 'Não deu para carregar o lobby.') : t('Carregando lobby…')}</p>

  // Líder no meio, os outros ao redor: posições 1, 3, 0, 4; convites pendentes depois dos membros
  const eu = dados.eu
  // O dono do grupo (líder) fica sempre no meio, seja você ou outra pessoa
  const outros = [...dados.membros.filter((m) => m.id !== dados.lider).map((p) => ({ pessoa: p })), ...dados.convites.map((p) => ({ pessoa: p, pendente: true }))]
  const meu = dados.membros.find((m) => m.id === dados.lider) || dados.membros[0]
  // Sempre 5 cartões: o último (direita) é o "Encontrar lobbies" e só vira jogador quando o 5º entra (ou é convidado); se ele sai, volta
  const ORDEM = [1, 3, 0, 4]
  const lugares = [{ pessoa: null }, { pessoa: null }, { pessoa: meu, lider: true, centro: true }, { pessoa: null }, { encontrar: true }]
  outros.slice(0, 4).forEach((o, i) => (lugares[ORDEM[i]] = o))
  const livres = dados.max - dados.membros.length - dados.convites.length

  const { info: meuNivel, j: meuJogador } = nivelDoJogador(eu)
  const classificado = meuNivel.classificado
  const cheios = classificado ? Math.round(meuNivel.progresso * 10) : meuNivel.partidas
  const ordem = ordenarRanking(ranking?.jogadores || [], perfis)
  const posicao = meuJogador ? ordem.indexOf(meuJogador) + 1 : 0
  const sozinho = dados.membros.length === 1 && !dados.convites.length
  const lider = dados.membros.find((m) => m.id === dados.lider)

  return (
    <>
      <div className="lb-fila">
        <span>{t('Fila Brasil 5v5 · CS2')}</span>
      </div>

      <header className="lb-topo">
        <div className="lb-nivel">
          <span className="lb-nivel-gema">
            <SeloNivel nivel={meuNivel.nivel} tamanho={92} />
          </span>
          <div className="lb-nivel-info">
            <span className="lb-chip">{t('Temporada atual')}</span>
            <h1>{classificado ? (meuNivel.nivel >= 11 ? 'Elite' : t('Nível {n}', { n: meuNivel.nivel })) : t('Sem classificação')}</h1>
            <div className="lb-segmentos" role="progressbar" aria-valuemin={0} aria-valuemax={10} aria-valuenow={cheios}>
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={i < cheios ? 'cheio' : ''} />
              ))}
            </div>
            <small className="lb-nivel-texto">
              {classificado
                ? meuNivel.proximo === null
                  ? t('{xp} XP · nível máximo', { xp: fmt(meuNivel.xp, t) })
                  : t('{xp} XP · faltam {falta} para o nível {n}', { xp: fmt(meuNivel.xp, t), falta: fmt(meuNivel.falta, t), n: meuNivel.nivel + 1 >= 11 ? 'Elite' : meuNivel.nivel + 1 })
                : t('Faltam {n} partidas para obter seu nível', { n: meuNivel.faltamPartidas })}
            </small>
          </div>
        </div>

        <a className="lb-temporada" href={linkPerfil(eu)} style={{ '--img': `url('${mapImage('mirage')}')` }}>
          <span className="lb-temporada-txt">
            <b>{t('Sua temporada')}</b>
            {meuJogador ? (
              <>
                <dl className="lb-estats">
                  {[
                    [t('Posição'), perfis[eu]?.ocultoRanking ? t('Oculto') : posicao > 0 ? `#${posicao}` : '—'],
                    ['Rating', Number(meuJogador.rating || 0).toFixed(2)],
                    ['K/D', Number(meuJogador.kd || 0).toFixed(2)],
                    ['ADR', Number(meuJogador.adr || 0).toFixed(1)],
                    ['KAST', `${Number(meuJogador.kast || 0).toFixed(1)}%`],
                    ['HS%', `${Number(meuJogador.hsPct || 0).toFixed(1)}%`],
                  ].map(([r, v]) => (
                    <div key={r}>
                      <dt>{r}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <small>
                  {t('{n} mapas jogados', { n: meuJogador.mapas })} · {meuJogador.vitorias}V {meuJogador.mapas - meuJogador.vitorias}D ({Number(meuJogador.winRate || 0).toFixed(0)}%) · {meuJogador.kills}/{meuJogador.mortes}/{meuJogador.assist}
                </small>
              </>
            ) : (
              <small>{t('Jogue um mapa no servidor para aparecer aqui.')}</small>
            )}
          </span>
        </a>
      </header>

      <div className="lb-nome-linha">
        <p className="lb-nome-grupo">
          <b>time_{lider?.nome || dados.lider}</b>
          <span className="lb-chip lb-chip-claro">{dados.souLider ? t('Líder') : t('Membro')}</span>
        </p>
        <div className="lb-ferramentas">
          {dados.souLider && livres > 0 && (
            <button type="button" className="lb-btn lb-btn-g lb-convidar" onClick={() => setConvidando(true)}>
              + {t('Convidar amigo')}
            </button>
          )}
          {dados.souLider ? (
            <label className={`lb-toggle${dados.publico ? ' ligado' : ''}`}>
              <Marca d={IC_PESSOAS} tamanho={17} />
              <span className="lb-contagem">{dados.membros.length}</span>
              <b>{t('Grupo público')}</b>
              <input type="checkbox" role="switch" checked={dados.publico} disabled={ocupado} onChange={(e) => fazer('publico', undefined, e.target.checked)} />
              <i aria-hidden="true" />
            </label>
          ) : (
            <span className="lb-toggle lb-toggle-fixo">
              <Marca d={IC_PESSOAS} tamanho={17} />
              <span className="lb-contagem">{dados.membros.length}</span>
              <b>{dados.publico ? t('Grupo público') : t('Só por convite')}</b>
            </span>
          )}
          {!sozinho && (
            <button type="button" className="lb-sair" disabled={ocupado} onClick={() => fazer('sair')} aria-label={dados.souLider ? t('Desfazer lobby') : t('Sair do lobby')} title={dados.souLider ? t('Desfazer lobby') : t('Sair do lobby')}>
              <Marca d={IC_SAIR} tamanho={20} />
            </button>
          )}
        </div>
      </div>

      {(aviso || erro) && (
        <p className="lb-erro" role="alert">
          {t(aviso || ERROS[erro] || 'Não deu certo. Tente de novo.')}
        </p>
      )}

      <div className="lb-palco">
        {lugares.map((l, i) =>
          l.encontrar ? (
            <button key={i} type="button" className="lb-lugar lb-encontrar" onClick={() => setEncontrando(true)}>
              <Marca d={IC_BUSCA} tamanho={22} />
              <b>{t('Encontrar lobbies')}</b>
              {dados.convitesRecebidos.length > 0 && <span className="lb-badge">{dados.convitesRecebidos.length}</span>}
            </button>
          ) : l.pessoa ? (
            <Pessoa key={l.pessoa.id} {...l} eu={eu} souLider={dados.souLider} ocupado={ocupado} nivelDe={nivelDoJogador} aoRemover={(id) => fazer('remover', id)} />
          ) : (
            <Vazio key={i} souLider={dados.souLider} aoConvidar={() => setConvidando(true)} />
          ),
        )}
      </div>

      <Painel dados={dados} />

      {convidando && dados.souLider && (
        <Convidar
          lobby={dados}
          ocupado={ocupado}
          aoFechar={() => setConvidando(false)}
          aoConvidar={async (id) => {
            await fazer('convidar', id)
          }}
        />
      )}
      {encontrando && <Encontrar dados={dados} fazer={fazer} ocupado={ocupado} aoFechar={() => setEncontrando(false)} />}
    </>
  )
}

// A página só existe no computador (a barra da esquerda, onde fica o ▶ Jogar, só aparece acima de 1024px): no celular e no
// tablet mostra um aviso e nem carrega o lobby. O CSS esconde o conteúdo antes de o JavaScript chegar, para não piscar.
function useTelaPequena() {
  const [pequena, setPequena] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 1024px)')
    const ler = () => setPequena(q.matches)
    ler()
    q.addEventListener('change', ler)
    return () => q.removeEventListener('change', ler)
  }, [])
  return pequena
}

export default function Lobby() {
  const t = useT()
  const pequena = useTelaPequena()
  return (
    <Layout pagina="lobby">
      <main className="lb-pagina">
        <div className="wrap lb-wrap">
          <div className="lb-bloqueio" role="status">
            <h1>{t('O lobby é só no computador')}</h1>
            <p>{t('Para jogar em grupo, abra o site no computador. No celular dá para ver o ranking, as partidas e o seu perfil.')}</p>
            <a className="lb-btn lb-btn-p" href="/">
              {t('Voltar para o início')}
            </a>
          </div>
          {!pequena && (
            <div className="lb-conteudo">
              <Conteudo />
            </div>
          )}
        </div>
      </main>
    </Layout>
  )
}
