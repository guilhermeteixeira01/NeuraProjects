// Página do evento Natal na Neura 2026 — Operação Presente (/eventos/natal-2026/).
// Regras e números vêm do worker (worker/steam-login/src/natal-2026.js): o navegador só mostra e pede ações; saldo, elegibilidade e datas
// são conferidos lá. Sem login a página mostra o evento (período, mapa do dia, meta coletiva e recompensas) e o botão de entrar.
import { useCallback, useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import IconeUI from '../../comum/IconeUI.jsx'
import { chamarApi, ErroApi, lerApi } from '../../comum/api.js'
import { entrar, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { mapImage, nomeMapa } from '../../comum/mapas.js'
import { CamadaMoldura, folgaMoldura } from '../../comum/Moldura.jsx'
import { classeForma, estiloFotoMoldura, molduraPorId, urlMoldura } from '../../comum/molduras.js'
import { ARTES_NATAL, DIAS_NATAL, META_COLETIVA_NATAL, MISSOES_NATAL, MOLDURA_NATAL, RECOMPENSAS_NATAL, diaNatal } from '../../../worker/steam-login/src/natal-2026-core.js'

const FUSO = 'America/Sao_Paulo'
const fmtData = (t, local, extra = {}) => new Date(t).toLocaleString(local, { timeZone: FUSO, day: '2-digit', month: '2-digit', ...extra })
const fmtDataHora = (t, local) => fmtData(t, local, { hour: '2-digit', minute: '2-digit' })
const relogio = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
  return d > 0 ? `${d}d ${hms}` : hms
}
// Próxima meia-noite de Brasília (virada do dia do evento)
const proximaVirada = (agora) => Date.parse(`${diaNatal(agora)}T00:00:00-03:00`) + 86400000

const MENSAGENS = {
  'natal-saldo': 'Estrelas de Natal insuficientes.',
  'natal-nao-ativado': 'Ative o evento antes de resgatar.',
  'natal-resgate-fechado': 'O prazo de resgate terminou.',
  'natal-futuro': 'O evento ainda não começou.',
  'natal-fechado': 'A ativação está encerrada.',
  'caixa-pendente': 'A caixa ainda não foi liberada.',
  'moldura-pendente': 'A moldura ainda não foi liberada.',
  cheio: 'Seu inventário está cheio. Libere espaço para receber a caixa.',
  rede: 'Sem conexão com o servidor. Tente novamente.',
}
const mensagemDe = (e) => MENSAGENS[e?.dados?.motivo] || MENSAGENS[e?.codigo] || 'Não foi possível concluir agora. Tente novamente.'

const ESTADOS = {
  desativado: { chip: 'Em breve', texto: 'As datas da Operação Presente ainda não foram anunciadas. Volte em breve.' },
  futuro: { chip: 'Agendado', texto: 'O evento ainda não começou. Ative assim que abrir para ganhar suas primeiras estrelas.' },
  ativo: { chip: 'Acontecendo agora', texto: 'Jogue partidas válidas no servidor da Neura, complete missões e junte Estrelas de Natal.' },
  resgate: { chip: 'Período de resgate', texto: 'As partidas do evento terminaram. Você ainda pode trocar suas estrelas pelas recompensas.' },
  encerrado: { chip: 'Encerrado', texto: 'A Operação Presente terminou. Obrigado por jogar com a gente!' },
}

function Estrelas({ n, tamanho = 18, classe = '' }) {
  const t = useT()
  return (
    <span className={`nt-estrelas ${classe}`} aria-label={t('{n} Estrelas de Natal', { n })}>
      <img src={ARTES_NATAL.estrela} alt="" width={tamanho} height={tamanho} decoding="async" />
      <b className="v2-num" aria-hidden="true">{Number(n || 0).toLocaleString(t.local)}</b>
    </span>
  )
}

function Barra({ atual, meta, rotulo }) {
  const pct = Math.max(0, Math.min(100, (atual / meta) * 100))
  return (
    <div className="nt-barra" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={atual} aria-label={rotulo}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

// Avatar com a moldura natalina por cima (a arte é PNG com transparência; a mesma camada usada no perfil)
function PreviaMoldura({ conta }) {
  const t = useT()
  const pronta = !!molduraPorId(MOLDURA_NATAL)
  const [erro, setErro] = useState(false)
  const foto = conta?.avatar && !erro ? <img src={conta.avatar} alt="" onError={() => setErro(true)} /> : <span className="nt-avatar-ini">NP</span>
  if (!pronta) return (
    <div className="nt-moldura-previa pendente">
      <span className="nt-avatar">{foto}</span>
      <small>{t('Arte em produção')}</small>
    </div>
  )
  return (
    <div className="nt-moldura-previa">
      <span ref={folgaMoldura} className={`moldura-box nt-avatar-moldura${classeForma(MOLDURA_NATAL)}`} style={estiloFotoMoldura(MOLDURA_NATAL)}>
        {foto}
        <CamadaMoldura id={MOLDURA_NATAL} />
      </span>
    </div>
  )
}

export default function Natal2026() {
  const t = useT()
  const conta = useConta()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const [confirmar, setConfirmar] = useState(null)
  const [tique, setTique] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const d = conta?.id ? await chamarApi('/eventos/natal-2026/eu') : await lerApi('/eventos/natal-2026')
      setDados({ ...d, recebidoEm: Date.now() })
      setErro('')
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e
      setErro(t('Não foi possível carregar o evento.'))
    }
  }, [conta?.id])

  useEffect(() => {
    carregar()
    const focar = () => carregar()
    window.addEventListener('focus', focar)
    const intervalo = setInterval(carregar, 60000)
    return () => { window.removeEventListener('focus', focar); clearInterval(intervalo) }
  }, [carregar])
  useEffect(() => {
    const relogioTela = setInterval(() => setTique((n) => n + 1), 1000)
    return () => clearInterval(relogioTela)
  }, [])

  // Horário do servidor (o relógio do aparelho pode estar errado)
  const agora = dados ? dados.agora + (Date.now() - dados.recebidoEm) : null
  const estado = dados?.estado || null
  const cfg = dados?.config || {}
  const jogador = dados?.jogador || null
  const ativado = !!jogador?.ativadoEm
  const local = t.local

  // Virou o dia, começou ou terminou: busca de novo (o servidor decide o estado)
  useEffect(() => {
    if (!dados || !cfg.habilitado || agora == null) return
    const marcos = [cfg.inicio, cfg.fim, cfg.resgateAte].map(Date.parse).concat(estado === 'ativo' ? [proximaVirada(agora)] : [])
    if (marcos.some((m) => agora >= m && dados.agora < m)) carregar()
  }, [tique])

  const ativar = async () => {
    if (!conta) return entrar()
    setOcupado('ativar'); setAviso(null)
    try {
      const d = await chamarApi('/eventos/natal-2026/ativar', {})
      setDados({ ...d, recebidoEm: Date.now() })
      setAviso({ tipo: 'ok', texto: t('Evento ativado! +10 Estrelas de Natal.') })
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e
      setAviso({ tipo: 'erro', texto: t(mensagemDe(e)) })
    } finally { setOcupado('') }
  }

  const resgatar = async (id) => {
    setOcupado(id); setAviso(null); setConfirmar(null)
    try {
      const d = await chamarApi('/eventos/natal-2026/resgatar', { recompensa: id })
      setDados({ ...d, recebidoEm: Date.now() })
      const r = d.jogador?.resgatado
      setAviso({ tipo: 'ok', texto: t(id === 'caixa' ? 'Caixa “Presente da Neura” enviada ao seu inventário!' : id === 'moldura' ? 'Moldura natalina liberada! Escolha em Perfil → Personalizar.' : 'Insígnia resgatada! Ela já aparece no seu perfil.'), link: id === 'caixa' && r?.caixa ? { href: `/loja/?abrir=${r.caixa}`, texto: t('Abrir caixa') } : id === 'moldura' ? { href: '/perfil/', texto: t('Ir para o perfil') } : null })
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e
      setAviso({ tipo: 'erro', texto: t(mensagemDe(e)) })
      carregar()
    } finally { setOcupado('') }
  }

  const info = ESTADOS[estado] || null
  const inicio = Date.parse(cfg.inicio), fim = Date.parse(cfg.fim), resgateAte = Date.parse(cfg.resgateAte)
  const diaAtual = estado === 'ativo' && agora != null ? (cfg.calendario || []).findIndex((d) => d.dia === diaNatal(agora)) : -1
  const missoes = jogador?.missoes?.length ? jogador.missoes : MISSOES_NATAL.map((m) => ({ ...m, atual: 0, concluida: false }))
  const recompensas = dados?.recompensas || RECOMPENSAS_NATAL.map((r) => ({ ...r, disponivel: false }))
  const meta = dados?.meta || { atual: 0, alvo: META_COLETIVA_NATAL, atingidaEm: null }
  const saldo = jogador?.saldo ?? 0
  const podeResgatar = ativado && (estado === 'ativo' || estado === 'resgate')

  let contagem = null
  if (agora != null && estado === 'futuro') contagem = { rotulo: t('Começa em'), valor: relogio(inicio - agora) }
  else if (agora != null && estado === 'ativo') contagem = { rotulo: t('Novo dia em'), valor: relogio(proximaVirada(agora) - agora), extra: `${t('Termina em')} ${relogio(fim - agora)}` }
  else if (agora != null && estado === 'resgate') contagem = { rotulo: t('Resgate termina em'), valor: relogio(resgateAte - agora) }

  return (
    <Layout pagina="eventos">
      <main className="nt-pagina">
        <section className="nt-hero" aria-labelledby="nt-titulo">
          <picture>
            <source media="(max-width: 860px)" srcSet={ARTES_NATAL.bannerPequeno} />
            <img className="nt-hero-arte" src={ARTES_NATAL.banner} alt="" width="2290" height="260" fetchPriority="high" decoding="async" />
          </picture>
          <div className="nt-hero-texto">
          <div className="nt-hero-principal">
            <p className="nt-kicker">{t('Evento de fim de ano')}</p>
            <h1 id="nt-titulo">{t('Natal na Neura 2026')}<span>{t('Operação Presente')}</span></h1>
            {info ? <p className={`nt-chip nt-chip-${estado}`}>{t(info.chip)}{diaAtual >= 0 && ` · ${t('Dia {n} de {total}', { n: diaAtual + 1, total: DIAS_NATAL })}`}</p> : <p className="nt-chip">{t('Carregando…')}</p>}
            {cfg.habilitado && (
              <p className="nt-periodo">
                <IconeUI tipo="calendario" tamanho={16} />
                {t('{inicio} a {fim}', { inicio: fmtData(inicio, local), fim: fmtData(fim - 1, local) })} · {t('resgate até {data}', { data: fmtDataHora(resgateAte, local) })}
                <small>{t('Horário de Brasília. O dia vira à meia-noite.')}</small>
              </p>
            )}
            {info && <p className="nt-hero-lead">{t(info.texto)}</p>}
            <div className="nt-hero-acoes">
              {!conta ? (
                <button type="button" className="v2-btn v2-btn-primario" onClick={entrar}>{t('Entrar com a Steam para participar')}</button>
              ) : ativado ? (
                <p className="nt-ativado"><IconeUI tipo="check" tamanho={18} /> {t('Evento ativado em {data}', { data: fmtData(jogador.ativadoEm, local) })}</p>
              ) : estado === 'ativo' ? (
                <button type="button" className="v2-btn v2-btn-primario" disabled={!!ocupado || !jogador} onClick={ativar}>
                  {ocupado === 'ativar' ? '…' : <>{t('Ativar evento')} <Estrelas n={10} tamanho={16} classe="nt-estrelas-botao" /></>}
                </button>
              ) : (
                <button type="button" className="v2-btn" disabled>{estado === 'futuro' ? t('A ativação abre em {data}', { data: fmtData(inicio, local) }) : estado ? t('Ativação indisponível') : '…'}</button>
              )}
            </div>
          </div>
          {/* Lado direito do topo: o presente e a contagem (no celular fica embaixo do texto) */}
          <aside className="nt-hero-lado" aria-label={t('Contagem do evento')}>
            <img className="nt-hero-presente" src={ARTES_NATAL.caixa} alt="" width="512" height="512" decoding="async" />
            {contagem ? (
              <p className="nt-contagem" aria-live="off">
                <span>{contagem.rotulo}</span>
                <b className="v2-num">{contagem.valor}</b>
                {contagem.extra && <small>{contagem.extra}</small>}
              </p>
            ) : estado === 'encerrado' ? <p className="nt-contagem"><span>{t('Até o próximo Natal!')}</span></p> : null}
          </aside>
          </div>
        </section>

        {(aviso || erro) && (
          <p className={`nt-aviso ${aviso?.tipo === 'ok' && !erro ? 'ok' : 'erro'}`} role={erro || aviso?.tipo === 'erro' ? 'alert' : 'status'}>
            {erro || aviso.texto}
            {!erro && aviso?.link && <a href={aviso.link.href}>{aviso.link.texto}</a>}
            {erro && <button type="button" onClick={carregar}>{t('Tentar novamente')}</button>}
          </p>
        )}

        <div className="nt-grade">
          <section className="nt-card nt-saldo" aria-labelledby="nt-saldo-titulo">
            <h2 id="nt-saldo-titulo">{t('Seu saldo')}</h2>
            <div className="nt-saldo-valor">
              <img src={ARTES_NATAL.estrelaGrande} alt="" width="72" height="72" decoding="async" />
              <div>
                <b className="v2-num">{conta ? (jogador ? saldo.toLocaleString(local) : '…') : '—'}</b>
                <span>{t('Estrelas de Natal')}</span>
              </div>
            </div>
            <p className="nt-nota">
              {!conta ? t('Entre para ver suas estrelas.') : jogador && ativado ? t('Ganhas: {g} · Usadas: {u}', { g: jogador.ganho, u: jogador.gasto }) : t('Moeda exclusiva desta edição. Ative o evento para começar a juntar.')}
            </p>
            {jogador?.partidas > 0 && <p className="nt-nota">{t('{n} partida(s) válida(s) no evento', { n: jogador.partidas })}</p>}
            <h3 className="nt-rumo-titulo">{t('Rumo às recompensas')}</h3>
            <ul className="nt-rumo">
              {recompensas.map((r) => {
                const feito = jogador?.resgates?.[r.id]
                const arte = r.id === 'moldura' ? (molduraPorId(MOLDURA_NATAL) ? urlMoldura(MOLDURA_NATAL) : ARTES_NATAL.insignia) : r.arte
                const falta = Math.max(0, r.custo - saldo)
                return (
                  <li key={r.id} className={feito ? 'feito' : falta === 0 && r.disponivel ? 'pronto' : ''}>
                    <img src={arte} alt="" width="40" height="40" loading="lazy" decoding="async" />
                    <div>
                      <span className="nt-rumo-linha"><b>{t(r.nome)}</b><Estrelas n={r.custo} tamanho={14} /></span>
                      <Barra atual={feito ? r.custo : Math.min(saldo, r.custo)} meta={r.custo} rotulo={t(r.nome)} />
                      <small>{feito ? t('Resgatado') : !r.disponivel ? t('Em breve') : falta === 0 ? t('Pronto para resgatar') : t('Faltam {n}', { n: falta })}</small>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="nt-card nt-mapa" aria-labelledby="nt-mapa-titulo">
            <h2 id="nt-mapa-titulo">{t('Mapa do dia')}</h2>
            {dados?.mapaDoDia ? (
              <figure className="nt-mapa-hoje">
                <img src={mapImage(dados.mapaDoDia)} alt="" width="320" height="180" loading="lazy" decoding="async" />
                <figcaption><b>{nomeMapa(dados.mapaDoDia)}</b><small>{t('Complete 1 partida válida neste mapa hoje')} · <Estrelas n={15} tamanho={14} /></small></figcaption>
              </figure>
            ) : (
              <p className="nt-nota">{estado === 'futuro' ? t('O primeiro mapa do dia aparece quando o evento começar.') : estado === 'ativo' ? '…' : t('Sem mapa do dia fora do período de partidas.')}</p>
            )}
            {!!cfg.calendario?.length && (
              <ol className="nt-calendario" aria-label={t('Calendário de mapas')}>
                {cfg.calendario.map((d) => {
                  const passado = agora != null && d.dia < diaNatal(agora)
                  return (
                    <li key={d.indice} className={`${d.indice === diaAtual ? 'hoje' : ''}${passado ? ' passado' : ''}`} aria-current={d.indice === diaAtual ? 'date' : undefined}>
                      <small>{d.dia.split('-').reverse().slice(0, 2).join('/')}</small>
                      <span>{nomeMapa(d.mapa)}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>

        <section className="nt-secao" aria-labelledby="nt-missoes-titulo">
          <h2 id="nt-missoes-titulo">{t('Missões')}</h2>
          <p className="nt-nota">{t('Valem as partidas válidas do servidor da Neura, pelo horário de conclusão. A mesma partida avança todas as missões em que se encaixar.')}</p>
          <ul className="nt-missoes">
            {missoes.map((m) => (
              <li key={m.id} className={`nt-card nt-missao${m.concluida ? ' feita' : ''}`}>
                <div className="nt-missao-topo">
                  <div>
                    <h3>{t(m.titulo)}</h3>
                    <p>{t(m.descricao)}{m.id === 'mapa-do-dia' && m.mapa ? ` (${nomeMapa(m.mapa)})` : ''}</p>
                  </div>
                  <Estrelas n={m.estrelas} classe="nt-premio" />
                </div>
                <Barra atual={m.atual} meta={m.meta} rotulo={t(m.titulo)} />
                <p className="nt-missao-rodape">
                  <span>{m.concluida ? <><IconeUI tipo="check" tamanho={14} /> {t(m.frequencia === 'dia' ? 'Concluída hoje' : 'Concluída')}</> : `${m.atual}/${m.meta}`}</span>
                  <small>{t(m.frequencia === 'dia' ? 'Uma vez por dia' : 'Uma vez por conta')}{m.diasConcluidos ? ` · ${t('{n} dia(s) concluído(s)', { n: m.diasConcluidos })}` : ''}</small>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="nt-card nt-meta" aria-labelledby="nt-meta-titulo">
          <img className="nt-meta-arte" src={ARTES_NATAL.insigniaDourada} alt="" width="112" height="112" loading="lazy" decoding="async" />
          <div>
            <h2 id="nt-meta-titulo">{t('Meta coletiva')}</h2>
            <p>{t('Quando a comunidade completar {n} partidas válidas durante o evento, quem ativou o evento e concluiu ao menos uma partida válida ganha a insígnia dourada — inclusive quem se qualificar depois.', { n: meta.alvo })}</p>
            <Barra atual={Math.min(meta.atual, meta.alvo)} meta={meta.alvo} rotulo={t('Meta coletiva')} />
            <p className="nt-meta-numeros"><b className="v2-num">{Math.min(meta.atual, meta.alvo)}/{meta.alvo}</b> {t('partidas')}{meta.atingidaEm && <span className="nt-meta-ok"> · {t('Meta atingida em {data}!', { data: fmtData(meta.atingidaEm, local) })}</span>}</p>
            {conta && jogador && (
              <p className="nt-nota">
                {jogador.dourada ? t('Você recebeu a insígnia dourada.') : !ativado ? t('Ative o evento para concorrer à insígnia dourada.') : !jogador.partidas ? t('Complete uma partida válida para garantir a insígnia dourada.') : t('Você já está qualificado. A insígnia chega quando a meta for atingida.')}
              </p>
            )}
          </div>
        </section>

        <section className="nt-secao" aria-labelledby="nt-recompensas-titulo">
          <h2 id="nt-recompensas-titulo">{t('Recompensas')}</h2>
          <p className="nt-nota">{t('Cada recompensa pode ser resgatada uma vez por conta.')}{cfg.habilitado ? ` ${t('Resgates até {data}.', { data: fmtDataHora(resgateAte, local) })}` : ''}</p>
          <ul className="nt-recompensas">
            {recompensas.map((r) => {
              const feito = jogador?.resgates?.[r.id]
              const falta = Math.max(0, r.custo - saldo)
              let botao
              if (feito) botao = <button type="button" className="v2-btn" disabled>{feito.entregue ? <><IconeUI tipo="check" tamanho={16} /> {t('Resgatado')}</> : t('Entregando…')}</button>
              else if (!r.disponivel) botao = <button type="button" className="v2-btn" disabled>{t('Em breve')}</button>
              else if (!conta) botao = <button type="button" className="v2-btn" onClick={entrar}>{t('Entrar para resgatar')}</button>
              else if (!podeResgatar) botao = <button type="button" className="v2-btn" disabled>{!ativado && estado === 'ativo' ? t('Ative o evento') : t('Resgate indisponível')}</button>
              else if (falta > 0) botao = <button type="button" className="v2-btn" disabled>{t('Faltam {n}', { n: falta })}</button>
              else if (confirmar === r.id) botao = (
                <span className="nt-confirmar">
                  <button type="button" className="v2-btn v2-btn-primario" disabled={!!ocupado} onClick={() => resgatar(r.id)}>{ocupado === r.id ? '…' : t('Confirmar')}</button>
                  <button type="button" className="v2-btn" disabled={!!ocupado} onClick={() => setConfirmar(null)}>{t('Cancelar')}</button>
                </span>
              )
              else botao = <button type="button" className="v2-btn v2-btn-primario" disabled={!!ocupado} onClick={() => setConfirmar(r.id)}>{t('Resgatar')}</button>
              return (
                <li key={r.id} className={`nt-card nt-recompensa${feito ? ' feita' : ''}${!r.disponivel ? ' indisponivel' : ''}`}>
                  <div className="nt-recompensa-arte">
                    {r.id === 'moldura' ? <PreviaMoldura conta={conta} /> : <img src={r.arte} alt="" width="160" height="160" loading="lazy" decoding="async" />}
                  </div>
                  <h3>{t(r.nome)}</h3>
                  <p>{t(r.descricao)}</p>
                  {!r.disponivel && !feito && <p className="nt-nota">{t(MENSAGENS[r.motivo] || 'Disponível em breve.')}</p>}
                  {confirmar === r.id && <p className="nt-nota">{t('Trocar {n} Estrelas de Natal por esta recompensa?', { n: r.custo })}</p>}
                  <div className="nt-recompensa-rodape">
                    <Estrelas n={r.custo} classe="nt-custo" />
                    {botao}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {!!jogador?.creditos?.length && (
          <section className="nt-card nt-extrato" aria-labelledby="nt-extrato-titulo">
            <h2 id="nt-extrato-titulo">{t('Estrelas recebidas')}</h2>
            <ul>
              {jogador.creditos.map((c) => {
                const [tipo, dia] = c.chave.split(':')
                const m = MISSOES_NATAL.find((x) => x.id === tipo)
                return (
                  <li key={c.chave}>
                    <span>{t(m?.titulo || tipo)}{dia ? ` · ${dia.split('-').reverse().slice(0, 2).join('/')}` : ''}</span>
                    <Estrelas n={c.estrelas} tamanho={14} classe="nt-mais" />
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="nt-regras" aria-labelledby="nt-regras-titulo">
          <h2 id="nt-regras-titulo">{t('Como funciona')}</h2>
          <ul>
            <li>{t('As Estrelas de Natal são exclusivas desta edição e não viram NP.')}</li>
            <li>{t('Só contam partidas válidas registradas pelo servidor oficial (os mesmos critérios das missões), concluídas dentro do período do evento.')}</li>
            <li>{t('O dia de cada partida é o do horário de conclusão, no horário de Brasília.')}</li>
            <li>{t('A meta coletiva conta cada partida uma única vez, não importa quantos participantes ela tenha.')}</li>
            <li>{t('Depois do fim das partidas, o resgate continua aberto até o prazo informado.')}</li>
          </ul>
        </section>
      </main>
    </Layout>
  )
}
