import { useCallback, useEffect, useState } from 'react'
import { CamadaMoldura, SeloCargo, cargoDaMoldura, useCargosIdsDe, nivelDaMoldura, salvarPerfil, useConfigSite, useListaTimes, usePerfis } from '../../comum/Moldura.jsx'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { COLECOES, MOLDURAS, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { urlOk } from '../../comum/dados.js'
import { useT } from '../../comum/i18n.js'

function CadeadoMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

  const lista = colecao === 'todas' ? MOLDURAS : MOLDURAS.filter((m) => m.colecao === colecao)
  // Dentro de cada nível, separadas por coleção (na ordem de COLECOES)
  const porColecao = (itens) => COLECOES.map((c) => [c, itens.filter((m) => m.colecao === c)]).filter(([, l]) => l.length)
  const itemMoldura = (m, exige) => {
    const presa = travada(m.id)
    return (
      <button
        key={m.id}
        type="button"
        className={`sm-item${escolha.moldura === m.id ? ' sel' : ''}${presa ? ' presa' : ''}`}
        onClick={() => !presa && escolher('moldura', m.id)}
        aria-pressed={escolha.moldura === m.id}
        aria-disabled={presa}
        title={
          !presa
            ? `${m.nome} · ${m.colecao}`
            : semCargo(m.id)
              ? `${m.nome}: ${tr('exclusiva de {cargo}', { cargo: cargoDaMoldura(config, m.id).nome })}`
              : `${m.nome}: ${tr('libera no nível {n}', { n: exige })}`
        }
      >
        <img src={urlMiniatura(m.id)} alt="" loading="lazy" width="72" height="72" />
        <span>{m.nome}</span>
        {(presa || cargoDaMoldura(config, m.id)) && (
          <span className="sm-exige">
            {cargoDaMoldura(config, m.id) && (
              <svg className="sm-coroa" style={{ color: cargoDaMoldura(config, m.id).cor }} width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z" />
              </svg>
            )}
            {presa && <CadeadoMini />}
          </span>
        )}
      </button>
    )
  }

  // Molduras agrupadas pelo nível exigido (em ordem); com a regra desligada fica tudo num grupo só
  const gruposPorNivel = (itens) => {
    const grupos = new Map()
    for (const m of itens) {
      const n = nivelDaMoldura(config, m.id)
      if (!grupos.has(n)) grupos.set(n, [])
      grupos.get(n).push(m)
    }
    return [...grupos.entries()].sort((x, y) => x[0] - y[0])
  }
  // Exclusivas de cargo têm seção própria (uma por cargo, no topo); o resto vai para as seções de nível
  const exclusivas = (config.cargos || []).map((c) => [c, lista.filter((m) => config.molduraCargo?.[m.id] === c.id)]).filter(([, l]) => l.length)
  const comuns = lista.filter((m) => !cargoDaMoldura(config, m.id))
  const subgrupos = (itens, exige) =>
    porColecao(itens).map(([c, daColecao]) =>
      colecao === 'todas' ? (
        <div key={c} className="sm-sub">
          <h5 className="sm-sub-cab">
            {c} <small>{daColecao.length}</small>
          </h5>
          <div className="sm-grade">{daColecao.map((m) => itemMoldura(m, exige(m)))}</div>
        </div>
      ) : (
        <div key={c} className="sm-grade">
          {daColecao.map((m) => itemMoldura(m, exige(m)))}
        </div>
      ),
    )
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
            <span className="moldura-box sm-av">
              {urlOk(avatar) && !erroAvatar ? (
                <img src={avatar} alt="" onError={() => setErroAvatar(true)} />
              ) : (
                <span className="sm-ini">{String(nome || '?').slice(0, 2).toUpperCase()}</span>
              )}
              <CamadaMoldura id={escolha.moldura} />
            </span>
            <b>{nome}</b>
            {time ? (
              <span className="sm-time-previa">
                <Logo url={time.logo} nome={time.nome} classe="sm-logo" />
                {time.nome}
              </span>
            ) : (
              <small>{tr('Sem time')}</small>
            )}
            <span className="mono">{moldura ? moldura.nome.toUpperCase() : tr('SEM MOLDURA')}</span>
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
                <div className="sm-colecoes" role="tablist" aria-label={tr('Coleções')}>
                  {['todas', ...COLECOES].map((c) => (
                    <button key={c} type="button" role="tab" aria-selected={c === colecao} className={c === colecao ? 'active' : ''} onClick={() => setColecao(c)}>
                      {c === 'todas' ? tr('Todas') : c}
                    </button>
                  ))}
                </div>
                {/* Com "molduras por nível" ligado: uma seção por nível (Livres, Nível 2...); desligado: uma grade só */}
                <div className="sm-rolagem">
                  {colecao === 'todas' && (
                    <div className="sm-grade">
                      <button type="button" className={`sm-item sem${escolha.moldura === null ? ' sel' : ''}`} onClick={() => escolher('moldura', null)} aria-pressed={escolha.moldura === null}>
                        <span className="sm-sem-icone">∅</span>
                        <span>{tr('Sem moldura')}</span>
                      </button>
                    </div>
                  )}
                  {exclusivas.map(([cargo, itens]) => (
                    <section key={cargo.id} className="sm-secao sm-secao-cargo" style={{ '--cg': cargo.cor }}>
                      <h4 className={`sm-secao-cab${!admin && !meusCargos.includes(cargo.id) ? ' presa' : ''}`}>
                        <SeloCargo cargo={cargo} />
                        {tr('Exclusivas')}
                        <small>{admin || meusCargos.includes(cargo.id) ? tr('liberado') : tr('só para {cargo}', { cargo: cargo.nome })}</small>
                        <span className="mono">{itens.length}</span>
                      </h4>
                      {subgrupos(itens, (m) => nivelDaMoldura(config, m.id))}
                    </section>
                  ))}
                  {gruposPorNivel(comuns).map(([exige, itens]) => (
                    <section key={exige} className="sm-secao">
                      {config.molduraPorNivel && (
                        <h4 className={`sm-secao-cab${!admin && exige > nivel ? ' presa' : ''}`}>
                          <SeloNivel nivel={exige} tamanho={24} />
                          {exige === 1 ? tr('Livres') : tr('Nível {n}', { n: exige })}
                          <small>
                            {exige === 1 || admin || exige <= nivel
                              ? tr('liberado')
                              : exige - nivel === 1 ? tr('falta 1 nível') : tr('faltam {n} níveis', { n: exige - nivel })}
                          </small>
                          <span className="mono">{itens.length}</span>
                        </h4>
                      )}
                      {subgrupos(itens, () => exige)}
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="sm-grade sm-grade-times">
                <button type="button" className={`sm-item sem${escolha.time === null ? ' sel' : ''}`} onClick={() => escolher('time', null)} aria-pressed={escolha.time === null}>
                  <span className="sm-sem-icone">∅</span>
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
