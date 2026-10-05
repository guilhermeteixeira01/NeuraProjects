import { useEffect, useState } from 'react'
import { CamadaMoldura, salvarMoldura, useMolduras } from '../../comum/Moldura.jsx'
import { COLECOES, MOLDURAS, molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { urlOk } from '../../comum/dados.js'

// Janela "Personalizar perfil": escolhe a moldura do avatar. A prévia mostra a moldura animada no seu avatar;
// a lista usa miniaturas paradas (leves). Salvar manda para o worker e todas as páginas passam a mostrar.
export default function SeletorMoldura({ steamId, avatar, nome, fechar }) {
  const molduras = useMolduras()
  const atual = molduras[steamId] || null
  const [escolha, setEscolha] = useState(atual)
  const [colecao, setColecao] = useState('todas')
  const [estado, setEstado] = useState('') // '' | 'salvando' | 'erro' | 'login'
  const [erroAvatar, setErroAvatar] = useState(false)
  const [mexeu, setMexeu] = useState(false)

  // A lista de molduras pode chegar depois de abrir: enquanto não escolheu nada, acompanha a salva
  useEffect(() => {
    if (!mexeu) setEscolha(atual)
  }, [atual, mexeu])

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

  const escolher = (id) => {
    setEscolha(id)
    setMexeu(true)
  }

  const lista = colecao === 'todas' ? MOLDURAS : MOLDURAS.filter((m) => m.colecao === colecao)
  const escolhida = molduraPorId(escolha)

  const salvar = async () => {
    setEstado('salvando')
    try {
      await salvarMoldura(escolha)
      fechar()
    } catch (e) {
      setEstado(e.message === 'login' ? 'login' : 'erro')
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
              <CamadaMoldura id={escolha} />
            </span>
            <b>{nome}</b>
            <span className="mono">{escolhida ? escolhida.nome.toUpperCase() : 'SEM MOLDURA'}</span>
            {escolhida && <small>{escolhida.colecao}</small>}
          </div>

          <div className="sm-lista">
            <div className="sm-colecoes" role="tablist" aria-label="Coleções">
              {['todas', ...COLECOES].map((c) => (
                <button key={c} type="button" role="tab" aria-selected={c === colecao} className={c === colecao ? 'active' : ''} onClick={() => setColecao(c)}>
                  {c === 'todas' ? 'Todas' : c}
                </button>
              ))}
            </div>
            <div className="sm-grade">
              {colecao === 'todas' && (
                <button type="button" className={`sm-item sem${escolha === null ? ' sel' : ''}`} onClick={() => escolher(null)} aria-pressed={escolha === null}>
                  <span className="sm-sem-icone">∅</span>
                  <span>Sem moldura</span>
                </button>
              )}
              {lista.map((m) => (
                <button key={m.id} type="button" className={`sm-item${escolha === m.id ? ' sel' : ''}`} onClick={() => escolher(m.id)} aria-pressed={escolha === m.id} title={`${m.nome} · ${m.colecao}`}>
                  <img src={urlMiniatura(m.id)} alt="" loading="lazy" width="72" height="72" />
                  <span>{m.nome}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sm-rodape">
          <span className="sm-msg" role="status">
            {estado === 'erro' && 'Não deu para salvar. Tente de novo.'}
            {estado === 'login' && 'Seu login venceu. Entre de novo com a Steam.'}
          </span>
          <button type="button" className="btn btn-ghost" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={estado === 'salvando' || escolha === atual}>
            {estado === 'salvando' ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
