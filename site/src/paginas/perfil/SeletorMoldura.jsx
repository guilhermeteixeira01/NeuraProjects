import { useEffect, useState } from 'react'
import { CamadaMoldura, nivelDaMoldura, salvarPerfil, useConfigSite, useListaTimes, usePerfis } from '../../comum/Moldura.jsx'
import { SeloNivel } from '../../comum/Nivel.jsx'
import { COLECOES, MOLDURAS, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { urlOk } from '../../comum/dados.js'

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
  const perfil = usePerfis()[steamId] || {}
  const config = useConfigSite()
  const travada = (id) => !admin && nivelDaMoldura(config, id) > nivel
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

  // Esc fecha; a página por trás não rola
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('keydown', tecla)
    document.documentElement.classList.add('sm-aberto')
    return () => {
      document.removeEventListener('keydown', tecla)
      document.documentElement.classList.remove('sm-aberto')
    }
  }, [fechar])

  const escolher = (campo, valor) => {
    setEscolha((e) => ({ ...e, [campo]: valor }))
    setMexeu(true)
  }

  const lista = colecao === 'todas' ? MOLDURAS : MOLDURAS.filter((m) => m.colecao === colecao)
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
      setEstado(['login', 'nivel', 'bloqueado'].includes(e.message) ? e.message : 'erro')
    }
  }

  return (
    <div className="sm-fundo" onClick={fechar}>
      <div className="sm-painel" role="dialog" aria-modal="true" aria-labelledby="sm-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="sm-cab">
          <h2 id="sm-titulo">Personalizar perfil</h2>
          <button type="button" className="sm-fechar" aria-label="Fechar" onClick={fechar}>
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
              <small>Sem time</small>
            )}
            <span className="mono">{moldura ? moldura.nome.toUpperCase() : 'SEM MOLDURA'}</span>
          </div>

          <div className="sm-lista">
            <div className="sm-abas" role="tablist" aria-label="O que personalizar">
              {[
                ['moldura', 'Moldura'],
                ['time', 'Time'],
              ].map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'active' : ''} onClick={() => setAba(id)}>
                  {rotulo}
                </button>
              ))}
            </div>

            {aba === 'moldura' ? (
              <>
                <div className="sm-colecoes" role="tablist" aria-label="Coleções">
                  {['todas', ...COLECOES].map((c) => (
                    <button key={c} type="button" role="tab" aria-selected={c === colecao} className={c === colecao ? 'active' : ''} onClick={() => setColecao(c)}>
                      {c === 'todas' ? 'Todas' : c}
                    </button>
                  ))}
                </div>
                <div className="sm-grade">
                  {colecao === 'todas' && (
                    <button type="button" className={`sm-item sem${escolha.moldura === null ? ' sel' : ''}`} onClick={() => escolher('moldura', null)} aria-pressed={escolha.moldura === null}>
                      <span className="sm-sem-icone">∅</span>
                      <span>Sem moldura</span>
                    </button>
                  )}
                  {lista.map((m) => {
                    const exige = nivelDaMoldura(config, m.id)
                    const presa = travada(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`sm-item${escolha.moldura === m.id ? ' sel' : ''}${presa ? ' presa' : ''}`}
                        onClick={() => !presa && escolher('moldura', m.id)}
                        aria-pressed={escolha.moldura === m.id}
                        aria-disabled={presa}
                        title={presa ? `${m.nome}: libera no nível ${exige}` : `${m.nome} · ${m.colecao}`}
                      >
                        <img src={urlMiniatura(m.id)} alt="" loading="lazy" width="72" height="72" />
                        <span>{m.nome}</span>
                        {exige > 1 && (
                          <span className="sm-exige">
                            {presa && <CadeadoMini />}
                            <SeloNivel nivel={exige} tamanho={20} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="sm-grade sm-grade-times">
                <button type="button" className={`sm-item sem${escolha.time === null ? ' sel' : ''}`} onClick={() => escolher('time', null)} aria-pressed={escolha.time === null}>
                  <span className="sm-sem-icone">∅</span>
                  <span>Sem time</span>
                </button>
                {times.map((t) => (
                  <button key={t.nome} type="button" className={`sm-item${escolha.time === t.nome ? ' sel' : ''}`} onClick={() => escolher('time', t.nome)} aria-pressed={escolha.time === t.nome}>
                    <Logo url={t.logo} nome={t.nome} classe="sm-time-logo" />
                    <span>{t.nome}</span>
                  </button>
                ))}
                {times.length === 0 && <p className="sm-vazio">Nenhum time cadastrado ainda (a lista é editada em /times/).</p>}
              </div>
            )}
          </div>
        </div>

        <div className="sm-rodape">
          <span className="sm-msg" role="status">
            {estado === 'erro' && 'Não deu para salvar. Tente de novo.'}
            {estado === 'login' && 'Seu login venceu. Entre de novo com a Steam.'}
            {estado === 'nivel' && `Essa moldura libera no nível ${falta}.`}
            {estado === 'bloqueado' && 'A personalização do seu perfil foi bloqueada por um administrador.'}
          </span>
          <button type="button" className="btn btn-ghost" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={estado === 'salvando' || !mudou}>
            {estado === 'salvando' ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
