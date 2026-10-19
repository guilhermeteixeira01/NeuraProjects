import { useCallback, useEffect, useState } from 'react'
import { CamadaMoldura, SeloCargo, cargoDaMoldura, cargoDoCard, nivelDoCard, useCargosIdsDe, nivelDaMoldura, salvarPerfil, useConfigSite, useListaTimes, usePerfis } from '../../comum/Moldura.jsx'
import { COLECOES, MOLDURAS, classeForma, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { urlOk } from '../../comum/dados.js'
import { useT } from '../../comum/i18n.js'
import { IconeCargo } from '../../comum/cargos.jsx'
import { IconeNenhum } from '../../comum/Icones.jsx'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { corNivel, rotuloNivel } from '../../comum/niveis.js'
import { CARDS, TEMAS_CARD, ehAnimado, fundoCard, idCard, nomeCard, nomeTema, temaCard, urlMiniCard } from '../../comum/cardsPerfil.js'

function CadeadoMini({ tamanho = 12 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function Logo({ url, nome, classe }) {
  const [erro, setErro] = useState(false)
  return urlOk(url) && !erro ? (
    <img className={classe} src={url} alt="" loading="lazy" onError={() => setErro(true)} />
  ) : (
    <span className={`${classe} sm-logo-ini`}>{String(nome || '?').slice(0, 1).toUpperCase()}</span>
  )
}

// Janela "Personalizar perfil": aba Moldura (moldura do avatar) e aba Time (time que aparece no ranking e no
// perfil). A prévia mostra as duas escolhas; Salvar manda as duas juntas e todas as páginas passam a mostrar.
// nivel: nível de quem está personalizando; admin: sem trava de nível
// Editando outro jogador (painel admin): inicial = { moldura, time } de partida e aoSalvar(escolha) no lugar de salvar no perfil
export default function SeletorMoldura({ steamId, avatar, nome, nivel = 1, admin = false, inicial = null, aoSalvar = null, fechar }) {
  const tr = useT()
  const perfis = usePerfis()
  const perfil = inicial || perfis[steamId] || {}
  const config = useConfigSite()
  // Trava: nível abaixo do exigido ou moldura exclusiva de um cargo que a pessoa não tem (admin não tem trava)
  const meusCargos = useCargosIdsDe(steamId) // os dados pelo admin + os automáticos (top do ranking)
  // Admins ignoram a trava dos cargos comuns, mas não a dos da equipe (_dono / _admin): o worker confere igual
  const semCargo = (id) => {
    const cargo = cargoDaMoldura(config, id)
    return !!cargo && !meusCargos.includes(cargo.id) && !(admin && !cargo.id.startsWith('_'))
  }
  // Sem classificação (nível 0, menos de 10 partidas) vale como nível 1: só as livres
  const nivelEf = Math.max(1, Number(nivel) || 0)
  const travada = (id) => (!admin && nivelDaMoldura(config, id) > nivelEf) || semCargo(id)
  // Cards (banners): mesmas travas das molduras, configuradas na aba Cards do painel admin
  const semCargoCard = (c) => {
    const cg = cargoDoCard(config, c)
    return !!cg && !meusCargos.includes(cg.id) && !(admin && !cg.id.startsWith('_'))
  }
  const travadoCard = (c) => (!admin && nivelDoCard(config, c) > nivelEf) || semCargoCard(c)
  const [falta, setFalta] = useState(0) // nível exigido, quando o worker recusa
  const times = useListaTimes()
  const salvo = { moldura: perfil.moldura || null, time: perfil.time || null, card: perfil.card ? idCard(perfil.card) : null }
  const [escolha, setEscolha] = useState(salvo)
  const [mexeu, setMexeu] = useState(false)
  const [aba, setAba] = useState('moldura') // 'moldura' | 'time' | 'card'
  const [colecao, setColecao] = useState('todas')
  const [temaAberto, setTemaAberto] = useState('todas') // tema (pasta) dos cards
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState(null) // moldura bloqueada com o "o que falta" aberto
  // O aviso some sozinho depois de uns segundos
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4500)
    return () => clearTimeout(t)
  }, [aviso])
  const [estado, setEstado] = useState('') // '' | 'salvando' | 'erro' | 'login' | 'nivel' | 'bloqueado'
  const [erroAvatar, setErroAvatar] = useState(false)

  // O perfil salvo pode chegar depois de abrir: enquanto não mexeu em nada, acompanha ele
  useEffect(() => {
    if (!mexeu) setEscolha({ moldura: perfil.moldura || null, time: perfil.time || null, card: perfil.card ? idCard(perfil.card) : null })
  }, [perfil.moldura, perfil.time, perfil.card, mexeu])

  const cancelar = useCallback(() => fechar(), [fechar])

  // Esc fecha; a página por trás não rola
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && cancelar()
    document.addEventListener('keydown', tecla)
    document.documentElement.classList.add('sm-aberto')
    return () => {
      document.removeEventListener('keydown', tecla)
      document.documentElement.classList.remove('sm-aberto')
    }
  }, [cancelar])


  const escolher = (campo, valor) => {
    setEscolha((e) => ({ ...e, [campo]: valor }))
    setMexeu(true)
  }

  // O que trava cada moldura (selo no canto): cargo exclusivo e/ou nível.
  // Bloqueada: meio apagada, cadeado no meio; clicar mostra por cima do card o que falta para usar
  const itemMoldura = (m) => {
    const presa = travada(m.id)
    const cargo = cargoDaMoldura(config, m.id)
    const nv = nivelDaMoldura(config, m.id)
    const titulo = !presa
      ? `${m.nome} · ${m.colecao}`
      : semCargo(m.id)
        ? `${m.nome}: ${tr('exclusiva de {cargo}', { cargo: cargo.nome })}`
        : `${m.nome}: ${tr('libera no nível {n}', { n: nv })}`
    return (
      <button
        key={m.id}
        type="button"
        className={`sm-item${escolha.moldura === m.id ? ' sel' : ''}${presa ? ' presa' : ''}${cargo ? ' de-cargo' : ''}`}
        style={cargo ? { '--cg': cargo.cor } : undefined}
        onClick={() => (presa ? setAviso((a) => (a === m.id ? null : m.id)) : escolher('moldura', m.id))}
        aria-pressed={escolha.moldura === m.id}
        aria-expanded={presa ? aviso === m.id : undefined}
        title={presa ? undefined : titulo}
      >
        <span className="sm-arte">
          <img src={urlMiniatura(m.id)} alt="" loading="lazy" width="72" height="72" />
          {presa && (
            <span className="sm-vidro" aria-hidden="true">
              <CadeadoMini tamanho={16} />
            </span>
          )}
        </span>
        <span className="sm-nome">{m.nome}</span>
        {/* Bloqueada: chip com o que libera (cargo na cor dele, ou o nível na cor da faixa) */}
        {presa && (
          <span className="sm-req" style={{ '--rq': semCargo(m.id) ? cargo.cor : corNivel(nv) }}>
            {semCargo(m.id) ? <IconeCargo icone={cargo.icone} tamanho={11} /> : <SeloNivel nivel={nv} tamanho={14} />}
            {semCargo(m.id) ? cargo.nome : rotuloNivel(tr, nv)}
          </span>
        )}
        {/* Liberada: nível exigido no canto esquerdo e cargo no direito */}
        {!presa && nv > 1 && aviso !== m.id && (
          <span className={`sm-nivel-canto${!admin && nv > nivelEf ? ' falta' : ''}`} title={rotuloNivel(tr, nv)}>
            <SeloNivel nivel={nv} tamanho={28} />
          </span>
        )}
        {!presa && cargo && aviso !== m.id && (
          <span className="sm-exige">
            <IconeCargo icone={cargo.icone} tamanho={12} />
          </span>
        )}
        {presa && aviso === m.id && (
          <span className="sm-requisitos" role="status">
            <b>
              <CadeadoMini /> {tr('Para usar')}
            </b>
            {/* Nível: o necessário e o seu, cada um com a gema do nível */}
            {nv > nivelEf && (
              <>
                <span className="sm-req-linha">
                  <small>{tr('Necessário')}</small>
                  <SeloNivel nivel={nv} tamanho={20} />
                  <b>{rotuloNivel(tr, nv)}</b>
                </span>
                <span className="sm-req-linha">
                  <small>{tr('Seu nível')}</small>
                  <SeloNivel nivel={nivel} tamanho={20} />
                  <b className="sm-req-atual">{nivel > 0 ? rotuloNivel(tr, nivel) : tr('Sem classificação')}</b>
                </span>
              </>
            )}
            {/* Cargo: o mesmo selo de cargo do resto do site */}
            {semCargo(m.id) && (
              <span className="sm-req-linha">
                <small>{tr('Cargo')}</small>
                <SeloCargo cargo={cargo} />
              </span>
            )}
          </span>
        )}
      </button>
    )
  }
  // Card bloqueado (nível ou cargo): mesma cara das molduras — vidro com cadeado, chip do que libera e o "Para usar"
  const itemCard = (c) => {
    const presa = travadoCard(c)
    const cargo = cargoDoCard(config, c)
    const nv = nivelDoCard(config, c)
    const semC = semCargoCard(c)
    const chave = 'c:' + c
    return (
      <button
        key={c}
        type="button"
        className={`sm-item sm-item-card${escolha.card === c ? ' sel' : ''}${presa ? ' presa' : ''}${cargo ? ' de-cargo' : ''}`}
        style={cargo ? { '--cg': cargo.cor } : undefined}
        onClick={() => (presa ? setAviso((a) => (a === chave ? null : chave)) : escolher('card', c))}
        aria-pressed={escolha.card === c}
        aria-expanded={presa ? aviso === chave : undefined}
        title={presa ? undefined : nomeCard(c)}
      >
        <span className="sm-arte sm-arte-card">
          <img src={urlMiniCard(c)} alt="" loading="lazy" decoding="async" />
          {presa && (
            <span className="sm-vidro sm-vidro-card" aria-hidden="true">
              <CadeadoMini tamanho={18} />
            </span>
          )}
        </span>
        <span className="sm-nome">{nomeCard(c)}</span>
        {ehAnimado(c) && <i className="sm-anim">{tr('ANIMADO')}</i>}
        {presa && (
          <span className="sm-req" style={{ '--rq': semC ? cargo.cor : corNivel(nv) }}>
            {semC ? <IconeCargo icone={cargo.icone} tamanho={11} /> : <SeloNivel nivel={nv} tamanho={14} />}
            {semC ? cargo.nome : rotuloNivel(tr, nv)}
          </span>
        )}
        {!presa && nv > 1 && aviso !== chave && (
          <span className={`sm-nivel-canto${!admin && nv > nivelEf ? ' falta' : ''}`} title={rotuloNivel(tr, nv)}>
            <SeloNivel nivel={nv} tamanho={28} />
          </span>
        )}
        {!presa && cargo && aviso !== chave && (
          <span className="sm-exige">
            <IconeCargo icone={cargo.icone} tamanho={12} />
          </span>
        )}
        {presa && aviso === chave && (
          <span className="sm-requisitos" role="status">
            <b>
              <CadeadoMini /> {tr('Para usar')}
            </b>
            {nv > nivelEf && (
              <>
                <span className="sm-req-linha">
                  <small>{tr('Necessário')}</small>
                  <SeloNivel nivel={nv} tamanho={20} />
                  <b>{rotuloNivel(tr, nv)}</b>
                </span>
                <span className="sm-req-linha">
                  <small>{tr('Seu nível')}</small>
                  <SeloNivel nivel={nivel} tamanho={20} />
                  <b className="sm-req-atual">{nivel > 0 ? rotuloNivel(tr, nivel) : tr('Sem classificação')}</b>
                </span>
              </>
            )}
            {semC && (
              <span className="sm-req-linha">
                <small>{tr('Cargo')}</small>
                <SeloCargo cargo={cargo} />
              </span>
            )}
          </span>
        )}
      </button>
    )
  }
  // Cards separados por tema (pasta), como as molduras por coleção: liberados primeiro, travados depois dentro de cada grupo.
  // Em "Todas" cada tema vira uma seção com título; cards fora de qualquer tema ficam em "Outros".
  const temasDosCards = [...TEMAS_CARD, ...(CARDS.some((c) => !temaCard(c)) ? [''] : [])]
  const gruposCard = (temaAberto === 'todas' ? temasDosCards : [temaAberto])
    .map((t) => {
      const lista = CARDS.filter((c) => temaCard(c) === t)
      return [t, [...lista.filter((c) => !travadoCard(c)), ...lista.filter((c) => travadoCard(c))]]
    })
    .filter(([, l]) => l.length)
  const semMoldura = (
    <button key="sem" type="button" className={`sm-item sem${escolha.moldura === null ? ' sel' : ''}`} onClick={() => escolher('moldura', null)} aria-pressed={escolha.moldura === null}>
      <span className="sm-sem-icone">
        <IconeNenhum />
      </span>
      <span>{tr('Sem moldura')}</span>
    </button>
  )
  // Liberadas primeiro, travadas depois (na ordem da lista dentro de cada grupo)
  const ordenar = (itens) => [...itens.filter((m) => !travada(m.id)), ...itens.filter((m) => travada(m.id))]
  const termo = busca.trim().toLowerCase()
  const achadas = termo ? ordenar(MOLDURAS.filter((m) => m.nome.toLowerCase().includes(termo))) : null
  const grupos = (colecao === 'todas' ? COLECOES : [colecao]).map((c) => [c, ordenar(MOLDURAS.filter((m) => m.colecao === c))]).filter(([, l]) => l.length)
  const algumaPresa = MOLDURAS.some((m) => travada(m.id))
  const moldura = molduraPorId(escolha.moldura)
  const time = times.find((t) => t.nome === escolha.time) || null
  const mudou = escolha.moldura !== salvo.moldura || escolha.time !== salvo.time || escolha.card !== salvo.card

  const salvar = async () => {
    if (aoSalvar) {
      aoSalvar(escolha)
      fechar()
      return
    }
    setEstado('salvando')
    try {
      // só manda o que mudou (o worker confere as travas de cada item novo; o que já estava salvo não é reavaliado)
      const mudancas = {}
      for (const k of ['moldura', 'time', 'card']) if (escolha[k] !== salvo[k]) mudancas[k] = escolha[k]
      await salvarPerfil(mudancas)
      fechar()
    } catch (e) {
      setFalta(e.dados?.precisa || 0)
      setEstado(['login', 'nivel', 'bloqueado', 'cargo', 'cardNivel', 'cardCargo'].includes(e.message) ? e.message : 'erro')
    }
  }

  return (
    <div className="sm-fundo" onClick={cancelar}>
      <div className="sm-painel" role="dialog" aria-modal="true" aria-labelledby="sm-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="sm-cab">
          <h2 id="sm-titulo">{tr('Personalizar perfil')}</h2>
          <button type="button" className="sm-fechar" aria-label={tr('Fechar')} onClick={cancelar}>
            ×
          </button>
        </div>

        <div className="sm-corpo">
          <div className="sm-previa">
            {/* o card do perfil, na mesma proporção (282 × 395) */}
            <div className="sm-previa-card" style={escolha.card ? { backgroundImage: fundoCard(escolha.card) } : undefined}>
            <span className={`moldura-box sm-av${classeForma(escolha.moldura)}`}>
              {urlOk(avatar) && !erroAvatar ? (
                <img src={avatar} alt="" onError={() => setErroAvatar(true)} />
              ) : (
                <span className="sm-ini">{String(nome || '?').slice(0, 2).toUpperCase()}</span>
              )}
              <CamadaMoldura id={escolha.moldura} />
            </span>
            <b>{nome}</b>
            </div>
            <div className="sm-resumo">
              <button type="button" className={`sm-resumo-linha${aba === 'moldura' ? ' ativa' : ''}`} onClick={() => setAba('moldura')}>
                <span className="sm-resumo-rot">{tr('Moldura')}</span>
                <span className="sm-resumo-val">{moldura ? moldura.nome : tr('Sem moldura')}</span>
              </button>
              <button type="button" className={`sm-resumo-linha${aba === 'card' ? ' ativa' : ''}`} onClick={() => setAba('card')}>
                <span className="sm-resumo-rot">{tr('Card')}</span>
                <span className="sm-resumo-val">{escolha.card ? nomeCard(escolha.card) : tr('Sem card')}</span>
              </button>
              <button type="button" className={`sm-resumo-linha${aba === 'time' ? ' ativa' : ''}`} onClick={() => setAba('time')}>
                <span className="sm-resumo-rot">{tr('Time')}</span>
                <span className="sm-resumo-val">
                  {time && <Logo url={time.logo} nome={time.nome} classe="sm-logo" />}
                  {time ? time.nome : tr('Sem time')}
                </span>
              </button>
            </div>
          </div>

          <div className="sm-lista">
            <div className="sm-abas" role="tablist" aria-label={tr('O que personalizar')}>
              {[
                ['moldura', 'Moldura'],
                ['time', 'Time'],
                ['card', 'Card'],
              ].map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'active' : ''} onClick={() => setAba(id)}>
                  {tr(rotulo)}
                </button>
              ))}
            </div>

            {aba === 'moldura' ? (
              <>
                <div className="sm-ferramentas">
                  <input type="search" className="sm-busca" placeholder={tr('Buscar moldura…')} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label={tr('Buscar moldura…')} />
                  <div className="sm-colecoes" role="tablist" aria-label={tr('Coleções')}>
                    {['todas', ...COLECOES].map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={!termo && c === colecao}
                        className={!termo && c === colecao ? 'active' : ''}
                        onClick={() => {
                          setColecao(c)
                          setBusca('')
                        }}
                      >
                        {c === 'todas' ? tr('Todas') : c}
                        <small>{c === 'todas' ? MOLDURAS.length : MOLDURAS.filter((m) => m.colecao === c).length}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm-rolagem">
                  {!admin && algumaPresa && !termo && (
                    <p className="sm-aviso">
                      <CadeadoMini /> {tr('Molduras com cadeado liberam ao subir de nível ou com um cargo.')}
                    </p>
                  )}
                  {achadas ? (
                    <div className="sm-grade">
                      {achadas.map(itemMoldura)}
                      {!achadas.length && <p className="sm-vazio">{tr('Nenhuma moldura com esse nome.')}</p>}
                    </div>
                  ) : (
                    grupos.map(([c, itens], k) => (
                      <section key={c} className="sm-grupo">
                        {colecao === 'todas' && (
                          <h4 className="sm-grupo-cab">
                            {c} <small>{itens.length}</small>
                          </h4>
                        )}
                        <div className="sm-grade">
                          {k === 0 && semMoldura}
                          {itens.map(itemMoldura)}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </>
            ) : aba === 'card' ? (
              <>
                <div className="sm-ferramentas">
                  <div className="sm-colecoes" role="tablist" aria-label={tr('Temas')}>
                    {['todas', ...TEMAS_CARD].map((tema) => (
                      <button key={tema} type="button" role="tab" aria-selected={tema === temaAberto} className={tema === temaAberto ? 'active' : ''} onClick={() => setTemaAberto(tema)}>
                        {tema === 'todas' ? tr('Todas') : nomeTema(tema)}
                        <small>{tema === 'todas' ? CARDS.length : CARDS.filter((c) => temaCard(c) === tema).length}</small>
                      </button>
                    ))}
                  </div>
                </div>
              <div className="sm-rolagem">
                {CARDS.length === 0 && <p className="sm-vazio">{tr('Nenhum card ainda (coloque imagens em site/public/assets/cards/).')}</p>}
                {gruposCard.map(([t, itens], k) => (
                  <section key={t || 'outros'} className="sm-grupo">
                    {temaAberto === 'todas' && (
                      <h4 className="sm-grupo-cab">
                        {t ? nomeTema(t) : tr('Outros')} <small>{itens.length}</small>
                      </h4>
                    )}
                    <div className="sm-grade sm-grade-cards">
                      {k === 0 && (
                        <button type="button" className={`sm-item sm-item-card sem${escolha.card === null ? ' sel' : ''}`} onClick={() => escolher('card', null)} aria-pressed={escolha.card === null}>
                          <span className="sm-arte sm-arte-card sm-arte-sem">
                            <span className="sm-sem-icone">
                              <IconeNenhum />
                            </span>
                          </span>
                          <span className="sm-nome">{tr('Sem card')}</span>
                        </button>
                      )}
                      {itens.map(itemCard)}
                    </div>
                  </section>
                ))}
              </div>
              </>
            ) : (
              <div className="sm-rolagem">
              <div className="sm-grade sm-grade-times">
                <button type="button" className={`sm-item sem${escolha.time === null ? ' sel' : ''}`} onClick={() => escolher('time', null)} aria-pressed={escolha.time === null}>
                  <span className="sm-sem-icone">
                    <IconeNenhum />
                  </span>
                  <span>{tr('Sem time')}</span>
                </button>
                {times.map((t) => (
                  <button key={t.nome} type="button" className={`sm-item${escolha.time === t.nome ? ' sel' : ''}`} onClick={() => escolher('time', t.nome)} aria-pressed={escolha.time === t.nome}>
                    <Logo url={t.logo} nome={t.nome} classe="sm-time-logo" />
                    <span>{t.nome}</span>
                  </button>
                ))}
                {times.length === 0 && <p className="sm-vazio">{tr('Nenhum time cadastrado ainda (a lista é editada em /times/).')}</p>}
              </div>
              </div>
            )}
          </div>
        </div>

        <div className="sm-rodape">
          <span className="sm-msg" role="status">
            {estado === 'erro' && tr('Não deu para salvar. Tente de novo.')}
            {estado === 'login' && tr('Seu login venceu. Entre de novo com a Steam.')}
            {estado === 'nivel' && tr('Essa moldura libera no nível {n}.', { n: falta })}
            {estado === 'cardNivel' && tr('Esse card libera no nível {n}.', { n: falta })}
            {estado === 'cardCargo' && tr('Esse card é exclusivo de um cargo que você não tem.')}
            {estado === 'cargo' && tr('Essa moldura é exclusiva de um cargo que você não tem.')}
            {estado === 'bloqueado' && tr('A personalização do seu perfil foi bloqueada por um administrador.')}
          </span>
          <button type="button" className="btn btn-ghost" onClick={cancelar}>
            {tr('Cancelar')}
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={estado === 'salvando' || !mudou}>
            {estado === 'salvando' ? tr('Salvando…') : tr('Salvar')}
          </button>
        </div>
      </div>
    </div>
  )
}
