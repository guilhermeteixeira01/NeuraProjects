import { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
import { entrar, linkPerfil, loginAtivo } from '../../comum/conta.js'
import { lerJson } from '../../comum/dados.js'
import { IconeSteam } from '../../comum/Icones.jsx'
import { ComMoldura, IconeEquipe, useCardDe, useNivelSub, usePerfis } from '../../comum/Moldura.jsx'
import { urlCard } from '../../comum/cardsPerfil.js'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { ALL_MAPS, idMapa, mapImage, nomeMapa } from '../../comum/mapas.js'
import { nivelDe } from '../../comum/niveis.js'
import { ordenarRanking } from '../../comum/ranking.js'
import { useAmigos } from '../../comum/amigos.js'
import { useAvatar } from '../../comum/avatares.js'
import { acaoLobby, useLobby, useRelogio } from '../../comum/lobby.js'
import SalaVeto from './SalaVeto.jsx'
import { playSound } from '../neurapick/data/sounds.js'
import { useT } from '../../comum/i18n.js'
import ParticulasPremium from '../../comum/ParticulasPremium.jsx'

// Lobby (estilo FACEIT): nível e temporada em cima, o grupo (5 lugares, você no meio) e o painel de partida embaixo.
// O líder convida, remove e deixa o grupo aberto ("Grupo público": amigos entram sozinhos).

const ERROS = {
  cheio: 'O lobby está cheio.',
  amigo: 'Só dá para convidar amigos.',
  offline: 'Só dá para convidar quem está online ou ausente.',
  'em-lobby': 'Essa pessoa já está em outro lobby.',
  'convidado-em-partida': 'Essa pessoa está numa partida.',
  lider: 'Só o líder do lobby pode fazer isso.',
  negado: 'Você não pode entrar nesse lobby.',
  'sem-lobby': 'Esse lobby não existe mais.',
  ocupado: 'Você é líder de um lobby com gente: saia dele antes.',
  buscando: 'Cancele a busca de partida antes de mexer no grupo.',
  'em-partida': 'Você está numa partida: o grupo fica travado até ela acabar.',
  incompleto: 'O grupo precisa de 5 jogadores para buscar partida.',
  'sem-sub': 'A busca de MD3 é só para o líder com assinatura Premium.',
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

// Mapa que a pessoa mais jogou (empate: o jogado por último), lido do histórico do perfil; null enquanto não chega
function useMapaMaisJogado(id) {
  const [mapa, setMapa] = useState(null)
  useEffect(() => {
    if (!id) return
    let vivo = true
    lerJson(`/perfil/historico/${id}.json`).then((h) => {
      if (!vivo || !Array.isArray(h) || !h.length) return
      const n = {}
      for (const m of h) n[idMapa(m.mapa)] = (n[idMapa(m.mapa)] || 0) + 1 // histórico: mais recente primeiro
      const [id1, vezes] = Object.entries(n).sort((a, b) => b[1] - a[1])[0]
      setMapa({ id: id1, vezes })
    })
    return () => {
      vivo = false
    }
  }, [id])
  return mapa
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
        <ComMoldura steamId={pessoa.id} emblema>
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
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Lugar vazio com o "+" (líder e membros convidam)
function Vazio({ podeConvidar, aoConvidar }) {
  const t = useT()
  return podeConvidar ? (
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
  const ordem = { online: 0, jogando: 1, ausente: 2, offline: 3 }
  const st = (a) => status[a.id]?.st || 'offline'
  const emLobby = new Set(lobby.emLobby || [])
  const emPartida = new Set(lobby.emPartida || [])
  const amigos = useMemo(
    () =>
      (lista?.amigos || [])
        .filter((a) => !dentro.has(a.id) && st(a) !== 'offline' && (a.nome || a.id).toLowerCase().includes(busca.trim().toLowerCase()))
        .sort((x, y) => Number(emLobby.has(x.id) || emPartida.has(x.id)) - Number(emLobby.has(y.id) || emPartida.has(y.id)) || ordem[st(x)] - ordem[st(y)] || (x.nome || '').localeCompare(y.nome || '')),
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
                <ComMoldura steamId={a.id} soEmblema>
                  <Foto p={a} />
                </ComMoldura>
                <i className={`lb-bolinha st-${st(a)}`} aria-hidden="true" />
              </span>
              <span className="lb-amigo-nome">
                <b>{a.nome || a.id}</b>
                <small className={emLobby.has(a.id) || emPartida.has(a.id) ? 'lb-em-lobby' : undefined}>{emPartida.has(a.id) ? t('Em partida') : emLobby.has(a.id) ? t('Em outro lobby') : st(a) === 'online' ? t('Online') : st(a) === 'jogando' ? t('Jogando') : st(a) === 'ausente' ? t('Ausente') : t('Offline')}</small>
              </span>
              <button type="button" className="lb-btn lb-btn-p" disabled={ocupado || emLobby.has(a.id) || emPartida.has(a.id)} title={emLobby.has(a.id) ? t('Essa pessoa já está em outro lobby') : emPartida.has(a.id) ? t('Essa pessoa está numa partida') : undefined} onClick={() => aoConvidar(a.id)}>
                {emLobby.has(a.id) ? t('Em lobby') : emPartida.has(a.id) ? t('Em partida') : t('Convidar')}
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
  const linha = (lider, membros, recusar, vaga) => (
    <li key={lider.id}>
      <span className="lb-amigo-av">
        <ComMoldura steamId={lider.id} soEmblema>
          <Foto p={lider} />
        </ComMoldura>
        <i className={`lb-bolinha st-${lider.st || 'offline'}`} aria-hidden="true" />
      </span>
      <span className="lb-amigo-nome">
        <b>{lider.nome || lider.id}</b>
        <small>{vaga ? t('Chamou você para uma partida em andamento') : t('{n}/{max} no lobby', { n: membros, max: dados.max })}</small>
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
          {aba === 'convites' && dados.convitesRecebidos.map(({ lider, membros, vaga }) => linha(lider, membros, true, vaga))}
          {aba === 'abertos' && dados.abertos.map(({ lider, membros }) => linha(lider, membros, false))}
          {aba === 'convites' && !dados.convitesRecebidos.length && <li className="lb-vazio-lista">{t('Ninguém te convidou ainda.')}</li>}
          {aba === 'abertos' && !dados.abertos.length && <li className="lb-vazio-lista">{t('Nenhum amigo com lobby aberto agora.')}</li>}
        </ul>
      </div>
    </div>
  )
}

// O formato escolhido pelo líder é o que vai para a fila (só enfrenta lobby do mesmo formato) e define o veto da sala
const MODOS = [
  {
    id: 'bo1',
    nome: 'Partida MD1',
    rotulo: 'MD1',
    itens: [
      ['1 mapa: 6 bans e sobra o decider', IC_CHECK],
      ['Veto de mapas pelo NeuraPick', IC_CHECK],
      ['Demo gravada, rating, ADR e KAST', IC_CHECK],
      ['XP e nível ao fim do mapa', IC_CHECK],
    ],
  },
  {
    id: 'bo3',
    nome: 'Série MD3',
    rotulo: 'MD3',
    premium: true, // só o líder com assinatura Premium busca (o worker confere também)
    itens: [
      ['Ban, ban, pick, pick, ban, ban e decider', IC_CHECK],
      ['Lados definidos pelo veto', IC_CHECK],
      ['Round faca e pausa com regra', IC_CHECK],
      ['Placar da série ao vivo', IC_CHECK],
    ],
  },
]

// Cronômetro "00:12" de quem está buscando partida
function TempoBusca({ desde }) {
  useRelogio(true, 500)
  const s = Math.max(0, Math.floor((Date.now() - desde) / 1000))
  return <>{`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`}</>
}

function Painel({ dados, fazer, ocupado }) {
  const t = useT()
  const [aba, setAba] = useState('tipo')
  const nivelSub = useNivelSub(dados.eu) // a assinatura é do líder, que é quem busca
  const [escolhido, setEscolhido] = useState('bo1') // o MD1 vem sempre marcado, mesmo para quem tem Premium
  const [dica, setDica] = useState('')
  const efetivo = escolhido === 'bo3' && !nivelSub ? 'bo1' : escolhido // sem assinatura o MD3 não vale: fica no MD1
  const modo = dados.busca && dados.formato ? dados.formato : efetivo // buscando: vale o que o líder mandou para a fila
  const trocavel = dados.souLider && !dados.busca
  const travado = (m) => m.premium && !nivelSub && dados.souLider // MD3 trancado para o líder sem assinatura

  // Som de busca: o líder ouve na hora do clique; o resto do grupo ouve quando a busca começa e quando para
  const buscando = !!dados.busca
  const antes = useRef(buscando)
  useEffect(() => {
    if (buscando !== antes.current && !dados.souLider) playSound(buscando ? 'pick' : 'lado')
    antes.current = buscando
  }, [buscando, dados.souLider])
  const buscar = () => {
    playSound('pick')
    fazer('buscar', undefined, { formato: modo })
  }
  const cancelar = () => {
    playSound('lado')
    fazer('cancelar-busca')
  }
  const completo = dados.membros.length >= dados.max
  return (
    <section className="lb-painel" aria-label={t('Partida')}>
      <div className="lb-buscar-faixa">
        <p className="lb-aviso">
          <Marca d={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />} tamanho={18} />
          <span>
            {dados.busca
              ? t('Procurando outro time que também esteja buscando partida…')
              : completo
                ? dados.souLider
                  ? t('Grupo completo: é só buscar partida')
                  : t('Grupo completo: o líder busca a partida')
                : t('Complete o grupo com {n} jogadores para buscar partida', { n: dados.max })}
          </span>
          {CONFIG.comunidade && (
            <a href={CONFIG.comunidade} target="_blank" rel="noopener">
              {t('ENTRAR NO DISCORD')}
            </a>
          )}
        </p>
        {dados.busca ? (
          <button type="button" className="lb-buscar buscando" disabled={!dados.souLider || ocupado} onClick={cancelar} title={dados.souLider ? t('Cancelar busca') : undefined}>
            <TempoBusca desde={dados.busca} />
            <small>{MODOS.find((m) => m.id === modo)?.rotulo} · {dados.souLider ? t('clique para cancelar') : t('Buscando partida')}</small>
          </button>
        ) : (
          <button type="button" className={`lb-buscar${completo && dados.souLider ? ' pronto' : ''}`} disabled={!completo || !dados.souLider || ocupado} onClick={buscar}>
            {t('BUSCAR PARTIDA')}
            <small>{!completo ? `${dados.membros.length}/${dados.max}` : dados.souLider ? MODOS.find((m) => m.id === modo).rotulo : t('Só o líder busca')}</small>
          </button>
        )}
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
          <div className="lb-modos-caixa">
          <div className="lb-modos">
            {MODOS.map((m) => (
              <button key={m.id} type="button" className={`lb-modo${m.premium ? ' lb-modo-premium' : ''}${modo === m.id ? ' sel' : ''}`} disabled={!trocavel && modo !== m.id} onClick={() => {
                  if (!trocavel) return
                  if (travado(m)) return setDica(t('A busca de MD3 é só para o líder com assinatura Premium.'))
                  setDica('')
                  setEscolhido(m.id)
                }}
                aria-pressed={modo === m.id}
              >
                {m.premium && <ParticulasPremium quantidade={22} />}
                <span className="lb-modo-cab">
                  {m.premium && (
                    <svg className="lb-coroa" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
                      <circle cx="3" cy="8" r="1.4" />
                      <circle cx="12" cy="5" r="1.4" />
                      <circle cx="21" cy="8" r="1.4" />
                    </svg>
                  )}
                  <b>{t(m.nome)}</b> <small>· 5v5</small>
                  {m.premium && <em className={`lb-premium${travado(m) ? '' : ' livre'}`}>PREMIUM</em>}
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
          {dica && (
            <p className="lb-dica-premium" role="status">
              {dica}
            </p>
          )}
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
  const maisJogado = useMapaMaisJogado(conta?.id)

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
  // Os 10 aceitaram: a sala de Pick & Ban toma o lugar do lobby (o aceite em si é o botão no centro da tela, em AceitarPartida.jsx)
  if (dados.partida && dados.partida.fase !== 'aceitar') return <SalaVeto dados={dados} />

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
  const posicao = meuJogador ? ordem.findIndex((j) => j.steamId === meuJogador.steamId) + 1 : 0 // pelo SteamID: o ranking pode ter sido lido duas vezes (objetos diferentes)
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

        <a className="lb-temporada" href={linkPerfil(eu)} style={{ '--img': `url('${mapImage(maisJogado?.id || 'mirage')}')` }}>
          <span className="lb-temporada-txt">
            <b>{t('Sua temporada')}</b>
            {meuJogador ? (
              <>
                <span className="lb-temporada-linha">
                  <em>{perfis[eu]?.ocultoRanking ? t('Oculto') : posicao > 0 ? `#${posicao}` : '—'}</em> {t('no ranking')} · {t('rating')} <em>{Number(meuJogador.rating || 0).toFixed(2)}</em>
                </span>
                <small>
                  {t('{n} mapas jogados', { n: meuJogador.mapas })} · K/D {Number(meuJogador.kd || 0).toFixed(2)}
                  {maisJogado && ` · ${t('mais jogado')}: ${nomeMapa(maisJogado.id)} (${maisJogado.vezes}×)`}
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
          {livres > 0 && !dados.busca && (
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
            <Pessoa key={l.pessoa.id} {...l} eu={eu} souLider={dados.souLider} ocupado={ocupado || !!dados.busca} nivelDe={nivelDoJogador} aoRemover={(id) => fazer('remover', id)} />
          ) : (
            <Vazio key={i} podeConvidar={!dados.busca} aoConvidar={() => setConvidando(true)} />
          ),
        )}
      </div>

      <Painel dados={dados} fazer={fazer} ocupado={ocupado} />

      {convidando && (
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
    <Layout pagina="lobby" semRodape>
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
