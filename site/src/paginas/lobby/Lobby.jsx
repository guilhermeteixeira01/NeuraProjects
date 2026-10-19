import { useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, linkPerfil, loginAtivo } from '../../comum/conta.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'
import { IconeSteam } from '../../comum/Icones.jsx'
import { ComMoldura, IconeEquipe } from '../../comum/Moldura.jsx'
import { useAmigos } from '../../comum/amigos.js'
import { useAvatar } from '../../comum/avatares.js'
import { acaoLobby, useLobby } from '../../comum/lobby.js'
import { useT } from '../../comum/i18n.js'

// Lobby: o líder e até 4 amigos. O líder convida, remove e deixa o lobby aberto ("Grupo público": amigos entram sozinhos).

const ERROS = {
  cheio: 'O lobby está cheio.',
  amigo: 'Só dá para convidar amigos.',
  lider: 'Só o líder do lobby pode fazer isso.',
  negado: 'Você não pode entrar nesse lobby.',
  'sem-lobby': 'Esse lobby não existe mais.',
  ocupado: 'Você é líder de um lobby com gente: saia dele antes.',
  login: 'Seu login venceu. Entre de novo com a Steam.',
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

// Um lugar do lobby: membro, convite pendente ou vazio (com o "+" para o líder convidar)
function Lugar({ pessoa, lider, pendente, souLider, eu, aoRemover, aoConvidar, ocupado }) {
  const t = useT()
  if (!pessoa)
    return souLider ? (
      <button type="button" className="lb-lugar lb-vazio" onClick={aoConvidar} aria-label={t('Convidar amigo')}>
        <span className="lb-mais">+</span>
        <small>{t('Convidar amigo')}</small>
      </button>
    ) : (
      <div className="lb-lugar lb-vazio lb-inerte" aria-hidden="true">
        <span className="lb-mais">+</span>
      </div>
    )
  return (
    <div className={`lb-lugar${lider ? ' lb-lider' : ''}${pendente ? ' lb-pendente' : ''}${pessoa.id === eu ? ' lb-eu' : ''}`}>
      {lider && <Coroa />}
      <a className="lb-av" href={linkPerfil(pessoa.id)} title={pessoa.nome || pessoa.id}>
        <ComMoldura steamId={pessoa.id}>
          <Foto p={pessoa} />
        </ComMoldura>
        <i className={`lb-bolinha st-${pessoa.st || 'offline'}`} aria-hidden="true" />
      </a>
      <b className="lb-nome">
        <span>{pessoa.nome || pessoa.id}</span>
        <IconeEquipe steamId={pessoa.id} />
      </b>
      <small className="lb-info">
        {pendente ? t('Convite enviado…') : lider ? t('Líder') : pessoa.st === 'online' ? t('Online') : pessoa.st === 'ausente' ? t('Ausente') : t('Offline')}
      </small>
      {souLider && !lider && (
        <button type="button" className="lb-x" disabled={ocupado} onClick={() => aoRemover(pessoa.id)} aria-label={pendente ? t('Cancelar convite') : t('Remover do lobby')} title={pendente ? t('Cancelar convite') : t('Remover do lobby')}>
          ×
        </button>
      )}
    </div>
  )
}

// Janela com os amigos que ainda dá para convidar (online primeiro)
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
              <button type="button" className="btn btn-primary lb-btn-p" disabled={ocupado} onClick={() => aoConvidar(a.id)}>
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

function Conteudo() {
  const t = useT()
  const { dados, erro, conta } = useLobby()
  const [convidando, setConvidando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  const fazer = async (acao, id, valor) => {
    setOcupado(true)
    setAviso('')
    try {
      await acaoLobby(acao, id, valor)
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
          <button type="button" className="btn btn-primary" onClick={entrar}>
            <IconeSteam /> {t('Entrar com Steam')}
          </button>
        )}
      </div>
    )
  if (!dados) return <p className="lb-carregando">{erro ? t(ERROS[erro] || 'Não deu para carregar o lobby.') : t('Carregando lobby…')}</p>

  const lugares = Array.from({ length: dados.max }, (_, i) => {
    const membros = dados.membros
    if (i < membros.length) return { pessoa: membros[i], lider: i === 0 }
    const c = dados.convites[i - membros.length]
    return c ? { pessoa: c, pendente: true } : { pessoa: null }
  })
  const sozinho = dados.membros.length === 1 && !dados.convites.length

  return (
    <>
      <div className="lb-barra">
        {dados.souLider ? (
          <label className={`lb-toggle${dados.publico ? ' ligado' : ''}`}>
            <input type="checkbox" role="switch" checked={dados.publico} disabled={ocupado} onChange={(e) => fazer('publico', undefined, e.target.checked)} />
            <i aria-hidden="true" />
            <span>
              <b>{t('Grupo público')}</b>
              <small>{dados.publico ? t('Seus amigos podem entrar sem convite.') : t('Só entra quem você convidar.')}</small>
            </span>
          </label>
        ) : (
          <p className="lb-quem">
            {t('Lobby de {nome}', { nome: dados.membros[0]?.nome || dados.lider })}
            <small>{dados.publico ? t('Grupo público') : t('Só por convite')}</small>
          </p>
        )}
        <div className="lb-acoes">
          <span className="lb-contagem">
            {dados.membros.length}/{dados.max}
          </span>
          {!sozinho && (
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => fazer('sair')}>
              {dados.souLider ? t('Desfazer lobby') : t('Sair do lobby')}
            </button>
          )}
        </div>
      </div>

      {(aviso || erro) && (
        <p className="lb-erro" role="alert">
          {t(aviso || ERROS[erro] || 'Não deu certo. Tente de novo.')}
        </p>
      )}

      <div className="lb-lugares">
        {lugares.map((l, i) => (
          <Lugar key={i} {...l} eu={dados.eu} souLider={dados.souLider} ocupado={ocupado} aoRemover={(id) => fazer('remover', id)} aoConvidar={() => setConvidando(true)} />
        ))}
      </div>

      <div className="lb-colunas">
        <section className="lb-caixa">
          <h3>
            {t('Convites recebidos')} <small>{dados.convitesRecebidos.length}</small>
          </h3>
          {dados.convitesRecebidos.length ? (
            <ul className="lb-lista">
              {dados.convitesRecebidos.map(({ lider, membros }) => (
                <li key={lider.id}>
                  <span className="lb-amigo-av">
                    <Foto p={lider} />
                  </span>
                  <span className="lb-amigo-nome">
                    <b>{lider.nome || lider.id}</b>
                    <small>{t('{n}/{max} no lobby', { n: membros, max: dados.max })}</small>
                  </span>
                  <span className="lb-par">
                    <button type="button" className="btn btn-primary lb-btn-p" disabled={ocupado} onClick={() => fazer('entrar', lider.id)}>
                      {t('Entrar')}
                    </button>
                    <button type="button" className="btn btn-ghost lb-btn-p" disabled={ocupado} onClick={() => fazer('recusar', lider.id)}>
                      {t('Recusar')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lb-nada">{t('Ninguém te convidou ainda.')}</p>
          )}
        </section>

        <section className="lb-caixa">
          <h3>
            {t('Lobbies abertos de amigos')} <small>{dados.abertos.length}</small>
          </h3>
          {dados.abertos.length ? (
            <ul className="lb-lista">
              {dados.abertos.map(({ lider, membros }) => (
                <li key={lider.id}>
                  <span className="lb-amigo-av">
                    <Foto p={lider} />
                    <i className={`lb-bolinha st-${lider.st || 'offline'}`} aria-hidden="true" />
                  </span>
                  <span className="lb-amigo-nome">
                    <b>{lider.nome || lider.id}</b>
                    <small>{t('{n}/{max} no lobby', { n: membros, max: dados.max })}</small>
                  </span>
                  <button type="button" className="btn btn-primary lb-btn-p" disabled={ocupado} onClick={() => fazer('entrar', lider.id)}>
                    {t('Entrar')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lb-nada">{t('Nenhum amigo com lobby aberto agora.')}</p>
          )}
        </section>
      </div>

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
    </>
  )
}

export default function Lobby() {
  const t = useT()
  return (
    <Layout pagina="lobby">
      <main className="lb-pagina">
        <FundoHero quantidade={8} rastros={false} />
        <div className="wrap lb-wrap">
          <header className="lb-cab">
            <span className="kicker">
              <b>●</b> {t('JOGAR EM GRUPO')}
            </span>
            <h1>{t('Lobby')}</h1>
            <p>{t('Chame amigos para o seu grupo, tire quem quiser e deixe o lobby aberto para eles entrarem sozinhos.')}</p>
          </header>
          <Conteudo />
        </div>
      </main>
    </Layout>
  )
}
