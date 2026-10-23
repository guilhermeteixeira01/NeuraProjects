import { useEffect, useMemo, useRef, useState } from 'react'
import { useAmigos } from '../../comum/amigos.js'
import { linkPerfil } from '../../comum/conta.js'
import { ComMoldura, IconeEquipe, apelidoDe, useCardDe, usePerfis } from '../../comum/Moldura.jsx'
import { urlCard } from '../../comum/cardsPerfil.js'
import { useAvatar } from '../../comum/avatares.js'
import { acaoLobby, msAte, useRelogio } from '../../comum/lobby.js'
import { getMap, mapImage } from '../../comum/mapas.js'
import { useT } from '../../comum/i18n.js'
import ChatSala from './ChatSala.jsx'
import { playSound } from '../neurapick/data/sounds.js'
import { FORMATS, SIDE_LABEL, buildSteps, deriveState } from '../neurapick/data/veto.js'

// Sala de Pick & Ban da partida (aparece no lugar do lobby quando os 10 aceitaram): um time de cada lado (foto, moldura e card de
// cada jogador) e o veto no centro. O estado do veto mora no worker (src/amigos.js): só o líder do time da vez pode banir/escolher/
// definir o lado; todos veem ao vivo. Tempo esgotado joga sozinho. Acabou o veto, o centro vira o botão "Entrar na partida".
// O que o botão faz ainda vai ser definido.

const ERROS = {
  vez: 'Não é a sua vez.',
  mapa: 'Esse mapa não está mais disponível.',
  fase: 'O veto já mudou de etapa.',
  lider: 'Só o líder do time pode fazer isso.',
  login: 'Seu login venceu. Entre de novo com a Steam.',
  amigo: 'Só dá para chamar amigos.',
  offline: 'Só dá para chamar quem está online ou ausente.',
  'em-partida': 'Esse jogador já está em uma partida.',
  ocupado: 'Esse jogador está liderando um grupo com gente.',
  'sem-vaga': 'Ninguém do seu time caiu (ou a vaga já foi preenchida).',
}
const VERBO = { ban: 'banir', pick: 'escolher' }
const ROTULO = { ban: 'BAN', pick: 'PICK', side: 'LADO' }
const BIPE_ATE = 5 // segundos finais da vez em que o bipe toca
const pad = (n) => String(n).padStart(2, '0')

// Emblema do lado (CT / TR). Usa /neurapick/lados/ct_logo.webp e tr_logo.webp (arte do jogo, em public/neurapick/lados/); sem o arquivo,
// desenha um emblema simples nas cores de cada lado.
const COR_LADO = { ct: '#5aa0ff', t: '#f0a030' }
function IconeLado({ lado, tamanho = 22 }) {
  const [erro, setErro] = useState(false)
  const nome = SIDE_LABEL[lado]
  if (!erro)
    return <img className="sala-lado-img" src={`/neurapick/lados/${lado === 'ct' ? 'ct' : 'tr'}_logo.webp`} alt={nome} title={nome} width={tamanho} height={tamanho} onError={() => setErro(true)} />
  return (
    <svg className="sala-lado-img" viewBox="0 0 48 48" width={tamanho} height={tamanho} role="img" aria-label={nome}>
      <title>{nome}</title>
      <path d="M24 3l17 6v13c0 11-7 19-17 23C14 41 7 33 7 22V9z" fill={COR_LADO[lado]} />
      {lado === 'ct' ? (
        <path d="M24 12l3.2 6.6 7.2 1-5.2 5.1 1.2 7.2L24 28.5l-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1z" fill="#0b1b3a" />
      ) : (
        <path d="M14.5 14h19v5.5H27V35h-6V19.5h-6.5z" fill="#3a2203" />
      )}
    </svg>
  )
}

function Foto({ p }) {
  const src = useAvatar(p.id, p.avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" onError={() => setErro(src)} /> : <span className="lb-ini">{(p.nome || '?').slice(0, 2).toUpperCase()}</span>
}

// Um jogador do time: card do perfil como fundo, foto com moldura e nome
function Jogador({ pessoa: bruta, lider }) {
  const t = useT()
  const perfis = usePerfis()
  const pessoa = { ...bruta, nome: apelidoDe(perfis, bruta.id, bruta.nome) } // apelido do site
  const card = useCardDe(pessoa.id)
  return (
    <div className={`sala-jog${lider ? ' lider' : ''}${card ? ' com-card' : ''}`} style={card ? { '--card-fundo': `url("${urlCard(card)}")` } : undefined}>
      {lider && <small className="sala-jog-lider">{t('Líder')}</small>}
      <a className="sala-av" href={linkPerfil(pessoa.id)} title={pessoa.nome || pessoa.id}>
        <ComMoldura steamId={pessoa.id} emblema>
          <Foto p={pessoa} />
        </ComMoldura>
      </a>
      <b className="sala-jog-nome">
        <span>{pessoa.nome || pessoa.id}</span>
        <IconeEquipe steamId={pessoa.id} />
      </b>
    </div>
  )
}

function Equipe({ lado, time, nome, naVez }) {
  const t = useT()
  // líder primeiro
  const membros = [...time.membros].sort((a, b) => (b.id === time.lider) - (a.id === time.lider))
  return (
    <aside className={`sala-equipe sala-${lado}${naVez ? ' na-vez' : ''}`} aria-label={nome}>
      <header>
        <span className="sala-rotulo">{t('TIME {t}', { t: lado })}</span>
        <b className="sala-nome">{nome}</b>
        {naVez && <span className="sala-vez">{t('NA VEZ')}</span>}
      </header>
      <div className="sala-cards">
        {membros.map((m) => (
          <Jogador key={m.id} pessoa={m} lider={m.id === time.lider} />
        ))}
      </div>
    </aside>
  )
}

// O que o botão do fim do veto mostra, conforme a fase do servidor de CS2 (o plugin avisa o worker; ver src/amigos.js):
// fila/entregue = esperando o servidor, carregada/jogando = pode entrar (steam://connect), encerrada/erro = acabou.
// fechaEm/desvio: a sala não tem botão de cancelar nem de encerrar; quando a série acaba (ou dá erro) ela fecha sozinha e mostra o tempo que falta
// Janela: chamar um amigo para o lugar de quem caiu da partida
function ChamarSubstituto({ vagas, aoFechar, aoChamar, ocupado }) {
  const t = useT()
  const { lista, status } = useAmigos()
  const [busca, setBusca] = useState('')
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  const st = (a) => status[a.id]?.st || 'offline'
  const ordem = { online: 0, ausente: 1 }
  const amigos = useMemo(
    () =>
      (lista?.amigos || [])
        .filter((a) => st(a) !== 'offline' && (a.nome || a.id).toLowerCase().includes(busca.trim().toLowerCase()))
        .sort((x, y) => ordem[st(x)] - ordem[st(y)] || (x.nome || '').localeCompare(y.nome || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, status, busca],
  )
  return (
    <div className="lb-fundo" onClick={aoFechar}>
      <div className="lb-janela" role="dialog" aria-modal="true" aria-labelledby="sala-sub-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="lb-janela-cab">
          <h2 id="sala-sub-titulo">{t('Chamar substituto')}</h2>
          <button type="button" className="lb-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <p className="sala-sub-vaga">{t('Vaga de {nome}', { nome: vagas.map((v) => v.nome || v.id).join(', ') })}</p>
        <input type="search" className="lb-busca" placeholder={t('Pesquisar amigo')} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
        <ul className="lb-amigos">
          {amigos.map((a) => (
            <li key={a.id}>
              <span className="lb-amigo-av">
                <ComMoldura steamId={a.id} soEmblema>
                  <FotoJogador p={a} />
                </ComMoldura>
                <i className={`lb-bolinha st-${st(a)}`} aria-hidden="true" />
              </span>
              <span className="lb-amigo-nome">
                <b>{a.nome || a.id}</b>
                <small>{st(a) === 'online' ? t('Online') : t('Ausente')}</small>
              </span>
              <button type="button" className="lb-btn lb-btn-p" disabled={ocupado} onClick={() => aoChamar(a.id)}>
                {t('Chamar')}
              </button>
            </li>
          ))}
          {lista && !amigos.length && <li className="lb-vazio-lista">{t('Nenhum amigo online para chamar.')}</li>}
          {!lista && <li className="lb-vazio-lista">{t('Carregando…')}</li>}
        </ul>
      </div>
    </div>
  )
}

function FotoJogador({ p }) {
  const src = useAvatar(p.id, p.avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img src={src} alt="" onError={() => setErro(src)} /> : <span className="lb-ini">{(p.nome || '?').slice(0, 2).toUpperCase()}</span>
}

function Conectar({ servidor, fechaEm, desvio, aoChamarSubstituto }) {
  const t = useT()
  const [copiado, setCopiado] = useState(false)
  const estado = servidor?.estado || 'fila'
  useRelogio(estado === 'encerrada' || estado === 'erro', 1000)
  const restante = Math.ceil(msAte(fechaEm, desvio) / 1000)
  const fecha = <small>{t('Voltando ao lobby em {tempo}', { tempo: `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}` })}</small>
  const { conectar = '', senha = '' } = servidor || {}
  const comando = `connect ${conectar}${senha ? `; password ${senha}` : ''}`
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comando)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // sem acesso à área de transferência: o comando continua na tela para copiar na mão
    }
  }

  if (estado === 'fila' || estado === 'entregue')
    return (
      <div className="sala-servidor">
        <button type="button" className="sala-entrar espera" disabled>
          <i className="sala-giro" aria-hidden="true" />
          {estado === 'fila' ? t('AGUARDANDO O SERVIDOR') : t('PREPARANDO O SERVIDOR')}
        </button>
        <small>{estado === 'fila' ? t('Sua partida está na fila do servidor. Se ele estiver livre, começa em instantes.') : t('O servidor está carregando os mapas e os times.')}</small>
      </div>
    )

  if (estado === 'erro')
    return (
      <div className="sala-servidor">
        <p className="lb-erro" role="alert">
          {t('O servidor não conseguiu carregar a partida.')} {servidor?.detalhe}
        </p>
        {fecha}
      </div>
    )

  if (estado === 'encerrada')
    return (
      <div className="sala-servidor">
        <b className="sala-fim">{t('PARTIDA ENCERRADA')}</b>
        {servidor?.placar && <small>{t('Placar da série: {p}', { p: servidor.placar })}</small>}
        {fecha}
      </div>
    )

  // carregada ou jogando
  const vagas = servidor?.vagas || []
  return (
    <div className="sala-servidor">
      {conectar ? (
        <a className="sala-entrar" href={`steam://connect/${conectar}${senha ? `/${encodeURIComponent(senha)}` : ''}`}>
          {t('ENTRAR NA PARTIDA')}
        </a>
      ) : (
        <p className="lb-erro" role="alert">
          {t('O endereço do servidor ainda não foi configurado.')}
        </p>
      )}
      {estado === 'jogando' && servidor?.placar && <small>{t('Série em andamento · {p}', { p: servidor.placar })}</small>}
      {vagas.length > 0 && (
        <span className="sala-vaga">
          <small>{t('Caiu do seu time: {nome}', { nome: vagas.map((v) => v.nome || v.id).join(', ') })}</small>
          <button type="button" className="lb-btn lb-btn-g" onClick={aoChamarSubstituto}>
            + {t('Chamar substituto')}
          </button>
        </span>
      )}
      {conectar && (
        <span className="sala-comando">
          <code>{comando}</code>
          <button type="button" onClick={copiar}>
            {copiado ? t('Copiado') : t('Copiar')}
          </button>
        </span>
      )}
    </div>
  )
}

export default function SalaVeto({ dados }) {
  const t = useT()
  const { partida, eu } = dados
  const { fase, times, pool, historico, meuTime } = partida
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [chamando, setChamando] = useState(false)
  const [painel, setPainel] = useState('veto') // aba do centro: o veto ou o chat da sala
  const [chatNovas, setChatNovas] = useState(0)
  const painelRef = useRef(painel)
  painelRef.current = painel
  useEffect(() => {
    const ouvir = (e) => {
      const { partida: id, msg } = e.detail || {}
      if (id === partida.id && msg && msg.de !== eu && painelRef.current !== 'chat') setChatNovas((n) => n + 1)
    }
    window.addEventListener('np-chat', ouvir)
    return () => window.removeEventListener('np-chat', ouvir)
  }, [partida.id, eu])
  useRelogio(fase === 'veto')

  const passos = buildSteps(partida.formato, partida.primeiro)
  const passo = passos[historico.length]
  const pronto = !passo
  const { status, picks, remaining } = deriveState(pool, historico)
  const decider = pronto ? remaining[0] : null
  const nome = (tm) => `time_${times[tm].membros.find((m) => m.id === times[tm].lider)?.nome || times[tm].lider}`
  const lider = (tm) => times[tm].membros.find((m) => m.id === times[tm].lider)
  const minhaVez = !pronto && times[passo.team].lider === eu
  const formato = FORMATS[partida.formato]?.label || partida.formato
  const segundos = Math.ceil(msAte(partida.prazo, partida.desvio) / 1000)

  // Som a cada ação nova (a de quem jogou e a automática); no fim toca o "concluído"
  const antes = useRef(historico.length)
  useEffect(() => {
    if (historico.length <= antes.current) {
      antes.current = historico.length
      return
    }
    antes.current = historico.length
    const ultimo = historico[historico.length - 1]
    playSound(ultimo.type === 'side' ? 'lado' : ultimo.type)
    if (!passos[historico.length]) {
      const id = setTimeout(() => playSound('concluido'), 1000)
      return () => clearTimeout(id)
    }
  }, [historico.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bipe a cada segundo nos últimos BIPE_ATE segundos da vez
  useEffect(() => {
    if (fase === 'veto' && segundos > 0 && segundos <= BIPE_ATE) playSound('timer')
  }, [segundos, fase])

  const agir = async (acao, valor, alvo) => {
    setOcupado(true)
    setAviso('')
    try {
      await acaoLobby(acao, alvo, valor)
      if (acao === 'substituir') setChamando(false)
    } catch (e) {
      setAviso(ERROS[e.message] || 'Não deu certo. Tente de novo.')
    } finally {
      setOcupado(false)
    }
  }

  const escolhidos = picks.map((p) => ({ id: p.map, lado: p.side, quem: p.sideBy, por: p.pickedBy })).concat(decider ? [{ id: decider }] : [])

  return (
    <section className="lb-sala" aria-label={t('Pick & Ban')}>
      <div className="lb-fila">
        <span>{t('Sala de Pick & Ban · {f}', { f: formato })}</span>
      </div>

      <div className="sala-grade">
        <Equipe lado="A" time={times.A} nome={nome('A')} naVez={!pronto && passo.team === 'A'} />

        <div className="sala-meio">
          <div className="sala-painel-abas" role="tablist">
            <button type="button" role="tab" aria-selected={painel === 'veto'} className={painel === 'veto' ? 'is-ativo' : ''} onClick={() => setPainel('veto')}>
              {pronto ? t('Partida') : 'Pick & Ban'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={painel === 'chat'}
              className={painel === 'chat' ? 'is-ativo' : ''}
              onClick={() => {
                setPainel('chat')
                setChatNovas(0)
              }}
            >
              Chat
              {chatNovas > 0 && <b className="chat-novas">{chatNovas}</b>}
            </button>
          </div>

          <div hidden={painel !== 'chat'} className="sala-painel">
            <ChatSala partidaId={partida.id} eu={eu} nomeDoTime={nome} />
          </div>

          <div hidden={painel !== 'veto'} className="sala-painel">
          {pronto ? (
            <div className="sala-final">
              <span className="sala-etapa">{t('VETO FINALIZADO')}</span>
              <ul className="sala-escolhidos" style={{ gridTemplateColumns: `repeat(${escolhidos.length}, minmax(0, 1fr))` }}>
                {escolhidos.map((e, i) => (
                  <li key={e.id} style={{ '--img': `url('${mapImage(e.id)}')` }}>
                    <small>{i === escolhidos.length - 1 ? 'DECIDER' : `MAPA ${i + 1}`}</small>
                    {e.por && lider(e.por) && (
                      <span className="sala-pickador" title={nome(e.por)}>
                        <FotoJogador p={lider(e.por)} />
                      </span>
                    )}
                    <b>{getMap(e.id)?.name}</b>
                    {e.lado && (
                      <span className="sala-escolhido-lado">
                        {nome(e.quem)} <IconeLado lado={e.lado} tamanho={20} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Conectar servidor={partida.servidor} fechaEm={partida.prazo} desvio={partida.desvio} aoChamarSubstituto={() => setChamando(true)} />
              {aviso && (
                <p className="lb-erro" role="alert">
                  {t(aviso)}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="sala-topo">
                <div>
                  <b className="sala-fmt">{formato}</b>
                  <span className="sala-etapa">{t('ETAPA {n} / {total}', { n: pad(historico.length + 1), total: pad(passos.length) })}</span>
                </div>
                <span className={`sala-relogio${segundos <= BIPE_ATE ? ' baixo' : ''}`}>00:{pad(Math.min(segundos, 99))}</span>
              </div>

              <ol className="sala-passos" style={{ gridTemplateColumns: `repeat(${passos.length + 1}, minmax(0, 1fr))` }}>
                {passos.map((p, i) => (
                  <li key={i} className={`${p.type} t-${p.team}${i < historico.length ? ' feito' : ''}${i === historico.length ? ' atual' : ''}`} title={nome(p.team)}>
                    <b>{t(ROTULO[p.type])}</b>
                    <span>{t('TIME {t}', { t: p.team })}</span>
                  </li>
                ))}
                <li className="decider">
                  <b>DECIDER</b>
                  <span>Auto</span>
                </li>
              </ol>

              <p className={`sala-vez-msg t-${passo.team}${minhaVez ? ' minha' : ''}`}>
                {minhaVez
                  ? passo.type === 'side'
                    ? t('Sua vez: escolha o lado inicial em {mapa}', { mapa: getMap(picks[picks.length - 1].map)?.name })
                    : t('Sua vez: {acao} um mapa', { acao: t(VERBO[passo.type]) })
                  : t('Aguardando o líder do {time}…', { time: nome(passo.team) })}
              </p>
              {aviso && (
                <p className="lb-erro" role="alert">
                  {t(aviso)}
                </p>
              )}

              {minhaVez && passo.type === 'side' ? (
                <div className="sala-lados">
                  {['ct', 't'].map((l) => (
                    <button key={l} type="button" className={`sala-lado ${l}`} disabled={ocupado} onClick={() => agir('veto', { lado: l })}>
                      <IconeLado lado={l} tamanho={72} />
                      <small>{l === 'ct' ? t('CONTRA-TERRORISTA') : t('TERRORISTA')}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <ul className="sala-mapas">
                  {pool.map((id) => {
                    const m = getMap(id)
                    const s = status[id]
                    const clicavel = minhaVez && s.state === 'available' && !ocupado
                    return (
                      <li key={id} className={`${s.state}${clicavel ? ' clicavel' : ''}`} style={{ '--img': `url('${mapImage(id)}')`, '--c1': m.colors[0], '--c2': m.colors[1] }}>
                        <button type="button" disabled={!clicavel} onClick={() => agir('veto', { mapa: id })} aria-label={m.name}>
                          {s.state !== 'available' && (
                            <em className={`tag ${s.state === 'banned' ? 'ban' : 'pick'}`}>
                              {s.state === 'banned' ? t('BANIDO') : `${t('PICK')} ${s.order}`}
                            </em>
                          )}
                          <b>{m.name}</b>
                          {s.state !== 'available' && <small>{nome(s.team)}</small>}
                          {s.side && (
                            <small className="lado">
                              {nome(s.side.team)}: <IconeLado lado={s.side.side} tamanho={16} />
                            </small>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!!historico.length && (
                <ol className="sala-historico">
                  {[...historico].reverse().map((h, i) => (
                    <li key={historico.length - i}>
                      <span className={`sala-tag ${h.type}`}>{t(ROTULO[h.type])}</span>
                      <span className="sala-hist-txt">
                        <b className={`t-${h.team}`}>{nome(h.team)}</b>{' '}
                        {h.type === 'ban' ? t('baniu') : h.type === 'pick' ? t('escolheu') : t('começa de')}{' '}
                        {h.type === 'side' ? <IconeLado lado={h.side} tamanho={18} /> : <b>{getMap(h.map)?.name}</b>}
                        {h.auto && <em> · {t('tempo esgotado')}</em>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          </div>
        </div>

        <Equipe lado="B" time={times.B} nome={nome('B')} naVez={!pronto && passo.team === 'B'} />
      </div>

      {chamando && <ChamarSubstituto vagas={partida.servidor?.vagas || []} ocupado={ocupado} aoFechar={() => setChamando(false)} aoChamar={(id) => agir('substituir', undefined, id)} />}
    </section>
  )
}
