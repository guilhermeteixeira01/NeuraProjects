import { useCallback, useEffect, useState } from 'react'
import { CamadaMoldura, cargoDaMoldura, useCargosIdsDe, nivelDaMoldura, salvarPerfil, useConfigSite, useListaTimes, usePerfis } from '../../comum/Moldura.jsx'
import { COLECOES, MOLDURAS, classeForma, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { urlOk } from '../../comum/dados.js'
import { useT } from '../../comum/i18n.js'
import { IconeCargo } from '../../comum/cargos.jsx'
import { IconeNenhum } from '../../comum/Icones.jsx'
import { SeloNivel } from '../../comum/Nivel.jsx'

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
export default function SeletorMoldura({ steamId, avatar, nome, nivel = 1, admin = false, fechar }) {
  const tr = useT()
  const perfil = usePerfis()[steamId] || {}
  const config = useConfigSite()
  // Trava: nível abaixo do exigido ou moldura exclusiva de um cargo que a pessoa não tem (admin não tem trava)
  const meusCargos = useCargosIdsDe(steamId) // os dados pelo admin + os automáticos (top do ranking)
  const semCargo = (id) => {
    const cargo = cargoDaMoldura(config, id)
    return !!cargo && !meusCargos.includes(cargo.id)
  }
  const travada = (id) => !admin && (nivelDaMoldura(config, id) > nivel || semCargo(id))
  const [falta, setFalta] = useState(0) // nível exigido, quando o worker recusa
  const times = useListaTimes()
  const salvo = { moldura: perfil.moldura || null, time: perfil.time || null }
  const [escolha, setEscolha] = useState(salvo)
  const [mexeu, setMexeu] = useState(false)
  const [aba, setAba] = useState('moldura') // 'moldura' | 'time'
  const [colecao, setColecao] = useState('todas')
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
    if (!mexeu) setEscolha({ moldura: perfil.moldura || null, time: perfil.time || null })
  }, [perfil.moldura, perfil.time, mexeu])

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
        <img src={urlMiniatura(m.id)} alt="" loading="lazy" width="72" height="72" />
        <span className="sm-nome">{m.nome}</span>
        {/* Nível exigido no canto esquerdo; cargo e cadeado no direito */}
        {nv > 1 && aviso !== m.id && (
          <span className={`sm-nivel-canto${!admin && nv > nivel ? ' falta' : ''}`} title={tr('Nível {n}', { n: nv })}>
            <SeloNivel nivel={nv} tamanho={28} />
          </span>
        )}
        {cargo && aviso !== m.id && (
          <span className="sm-exige">
            <IconeCargo icone={cargo.icone} tamanho={12} />
          </span>
        )}
        {presa && aviso !== m.id && (
          <span className="sm-cadeado" aria-hidden="true">
            <CadeadoMini tamanho={20} />
          </span>
        )}
        {presa && aviso === m.id && (
          <span className="sm-requisitos" role="status">
            <b>
              <CadeadoMini /> {tr('Para usar')}
            </b>
            {nv > nivel && (
              <span>
                <SeloNivel nivel={nv} tamanho={18} />
                {tr('Nível {n}', { n: nv })}
                <small>{tr('você: {n}', { n: nivel })}</small>
              </span>
            )}
            {semCargo(m.id) && (
              <span>
                <IconeCargo icone={cargo.icone} tamanho={14} style={{ color: cargo.cor }} />
                {tr('Cargo {cargo}', { cargo: cargo.nome })}
              </span>
            )}
          </span>
        )}
      </button>
    )
  }
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
  const mudou = escolha.moldura !== salvo.moldura || escolha.time !== salvo.time

  const salvar = async () => {
    setEstado('salvando')
    try {
      await salvarPerfil(escolha)
      fechar()
    } catch (e) {
      setFalta(e.dados?.precisa || 0)
      setEstado(['login', 'nivel', 'bloqueado', 'cargo'].includes(e.message) ? e.message : 'erro')
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
            <span className={`moldura-box sm-av${classeForma(escolha.moldura)}`}>
              {urlOk(avatar) && !erroAvatar ? (
                <img src={avatar} alt="" onError={() => setErroAvatar(true)} />
              ) : (
                <span className="sm-ini">{String(nome || '?').slice(0, 2).toUpperCase()}</span>
              )}
              <CamadaMoldura id={escolha.moldura} />
            </span>
            <b>{nome}</b>
            <div className="sm-resumo">
              <button type="button" className={`sm-resumo-linha${aba === 'moldura' ? ' ativa' : ''}`} onClick={() => setAba('moldura')}>
                <span className="sm-resumo-rot">{tr('Moldura')}</span>
                <span className="sm-resumo-val">{moldura ? moldura.nome : tr('Sem moldura')}</span>
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
