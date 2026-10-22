// Times de jogadores: qualquer jogador cria um time (custa NP), vira o dono, escolhe imagem e se é público ou privado, convida gente, cria cargos com permissões
// e tem um chat só do time. Dados e regras: worker/steam-login/src/equipes.js (aqui só aparece e chama).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { confirmar } from '../../comum/Dialogos.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { CONFIG } from '../../comum/config.js'
import { entrar, linkPerfil, loginAtivo, tokenConta, useConta } from '../../comum/conta.js'
import { useAvatar } from '../../comum/avatares.js'
import { definirMudoEquipe, definirVendoChatEquipe, useAvisoEquipe } from '../../comum/avisoEquipe.js'
import { useT } from '../../comum/i18n.js'
import { PERMISSOES, acaoEquipe, lerChatDoTime, lerEquipes, lerMeuTime, reduzirImagem, textoErro, urlImagemEquipe } from '../../comum/equipes.js'

const iniciais = (n) => (n || '?').replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?'

function Escudo({ equipe, tamanho = 64, classe = '' }) {
  const [erro, setErro] = useState(false)
  const src = equipe?.imagem && !erro ? urlImagemEquipe(equipe.imagem) : ''
  return (
    <span className={`eq-escudo ${classe}`} style={{ width: tamanho, height: tamanho, fontSize: tamanho / 2.6 }}>
      {src ? <img src={src} alt="" width={tamanho} height={tamanho} loading="lazy" onError={() => setErro(true)} /> : iniciais(equipe?.nome)}
    </span>
  )
}

function Foto({ id, nome, avatar, tamanho = 36 }) {
  const src = useAvatar(id, avatar)
  const [erro, setErro] = useState('')
  return src && erro !== src ? <img className="eq-foto" src={src} alt="" width={tamanho} height={tamanho} loading="lazy" onError={() => setErro(src)} /> : <span className="eq-foto eq-foto-ini" style={{ width: tamanho, height: tamanho }}>{iniciais(nome)}</span>
}

const numero = (n) => Number(n).toLocaleString('pt-BR')

// ── janela de criar time ──
function CriarTime({ custo, aoFechar, aoCriar }) {
  const t = useT()
  const [nome, setNome] = useState('')
  const [tag, setTag] = useState('')
  const [descricao, setDescricao] = useState('')
  const [publico, setPublico] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    setOcupado(true)
    setErro('')
    try {
      await acaoEquipe('criar', { nome, tag, descricao, publico })
      aoCriar()
    } catch (x) {
      setErro(textoErro(x))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="eq-fundo" onClick={aoFechar}>
      <form className="eq-janela" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <header>
          <h2>{t('Criar um time')}</h2>
          <button type="button" className="eq-x" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <p className="eq-dica">{t('Criar um time custa {n} NP. Você vira o dono e pode mudar tudo depois.', { n: numero(custo) })}</p>
        <label>
          {t('Nome do time')}
          <input value={nome} maxLength={24} autoFocus onChange={(e) => setNome(e.target.value)} placeholder={t('Ex.: Neura Squad')} />
        </label>
        <label>
          {t('Tag (opcional, 2 a 5 letras)')}
          <input value={tag} maxLength={5} onChange={(e) => setTag(e.target.value.replace(/[^\p{L}\p{N}]/gu, ''))} placeholder="NSQ" />
        </label>
        <label>
          {t('Descrição (opcional)')}
          <textarea value={descricao} maxLength={280} rows={3} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <div className="eq-seg" role="group" aria-label={t('Quem pode entrar')}>
          <button type="button" className={publico ? 'is-ativo' : ''} onClick={() => setPublico(true)}>
            {t('Público')} <small>{t('qualquer um entra')}</small>
          </button>
          <button type="button" className={!publico ? 'is-ativo' : ''} onClick={() => setPublico(false)}>
            {t('Privado')} <small>{t('só com convite')}</small>
          </button>
        </div>
        {erro && <p className="eq-erro" role="alert">{t(erro)}</p>}
        <button type="submit" className="eq-btn eq-btn-p" disabled={ocupado || nome.trim().length < 3}>
          {ocupado ? t('Criando…') : t('Criar por {n} NP', { n: numero(custo) })}
        </button>
      </form>
    </div>
  )
}

// ── quem ainda não tem time ──
function SemTime({ dados, recarregar }) {
  const t = useT()
  const [lista, setLista] = useState(null)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')

  useEffect(() => {
    const i = setTimeout(() => lerEquipes(busca.trim()).then((d) => setLista(d.equipes), () => setLista([])), busca ? 300 : 0)
    return () => clearTimeout(i)
  }, [busca, dados])

  const fazer = async (acao, corpo, chave) => {
    setOcupado(chave)
    setErro('')
    try {
      await acaoEquipe(acao, corpo)
      await recarregar()
    } catch (x) {
      setErro(textoErro(x))
    } finally {
      setOcupado('')
    }
  }

  return (
    <>
      <header className="eq-topo">
        <div>
          <h1>{t('Times')}</h1>
          <p>{t('Junte uma galera, escolha uma imagem, crie cargos e converse no chat só do time.')}</p>
        </div>
        <button type="button" className="eq-btn eq-btn-p" onClick={() => setCriando(true)}>
          + {t('Criar time')} <small>{numero(dados.custo)} NP</small>
        </button>
      </header>

      {dados.convites.length > 0 && (
        <section className="eq-bloco">
          <h2>{t('Convites para você')}</h2>
          <ul className="eq-convites">
            {dados.convites.map((c) => (
              <li key={c.equipe}>
                <Escudo equipe={{ nome: c.nome, imagem: c.imagem }} tamanho={44} />
                <span>
                  <b>{c.nome}</b>
                  <small>{t('convidado por {nome}', { nome: c.porNome })}</small>
                </span>
                <button type="button" className="eq-btn eq-btn-p" disabled={ocupado === `a${c.equipe}`} onClick={() => fazer('convite-aceitar', { id: c.equipe }, `a${c.equipe}`)}>
                  {t('Aceitar')}
                </button>
                <button type="button" className="eq-btn" disabled={ocupado === `r${c.equipe}`} onClick={() => fazer('convite-recusar', { id: c.equipe }, `r${c.equipe}`)}>
                  {t('Recusar')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="eq-bloco">
        <div className="eq-bloco-cab">
          <h2>{t('Todos os times')}</h2>
          <input type="search" className="eq-busca" placeholder={t('Buscar time…')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {erro && <p className="eq-erro" role="alert">{t(erro)}</p>}
        {lista === null ? (
          <p className="eq-vazio">{t('Carregando…')}</p>
        ) : !lista.length ? (
          <p className="eq-vazio">{busca ? t('Nenhum time com esse nome.') : t('Ainda não existe nenhum time. Crie o primeiro!')}</p>
        ) : (
          <ul className="eq-grade">
            {lista.map((e) => (
              <li key={e.id} className="eq-cartao">
                <Escudo equipe={e} tamanho={56} />
                <div>
                  <b>
                    {e.nome} {e.tag && <em>[{e.tag}]</em>}
                  </b>
                  <small>
                    {t('{n} membro(s)', { n: e.membros })} · {t('dono')}: {e.donoNome || '…'}
                  </small>
                </div>
                {e.publico ? (
                  <button type="button" className="eq-btn eq-btn-p" disabled={ocupado === `e${e.id}`} onClick={() => fazer('entrar', { id: e.id }, `e${e.id}`)}>
                    {t('Entrar')}
                  </button>
                ) : (
                  <span className="eq-etiqueta">{t('Privado')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {criando && (
        <CriarTime
          custo={dados.custo}
          aoFechar={() => setCriando(false)}
          aoCriar={() => {
            setCriando(false)
            recarregar()
            window.dispatchEvent(new Event('np-bonus')) // o saldo do menu atualiza
          }}
        />
      )}
    </>
  )
}

// ── chat do time ──
function ChatDoTime({ time, eu, pode }) {
  const t = useT()
  const { mudo } = useAvisoEquipe()
  // com o chat na tela não toca som nem acende a bolinha do menu
  useEffect(() => {
    definirVendoChatEquipe(true)
    return () => definirVendoChatEquipe(false)
  }, [])
  const [msgs, setMsgs] = useState([])
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const lista = useRef(null)
  const colado = useRef(true)

  const carregar = useCallback(async () => {
    try {
      const d = await lerChatDoTime()
      if (d.equipe === time.id) setMsgs(d.mensagens || [])
    } catch {
      // tenta de novo no próximo ciclo
    }
  }, [time.id])
  useEffect(() => {
    carregar()
    const ouvir = (e) => {
      const m = e.detail
      if (m.equipe !== time.id) return
      if (m.apagou) setMsgs((l) => l.filter((x) => x.id !== m.apagou))
      else if (m.msg) setMsgs((l) => (l.some((x) => x.id === m.msg.id) ? l : [...l, m.msg].slice(-300)))
    }
    const voltou = () => document.visibilityState === 'visible' && carregar()
    window.addEventListener('np-equipe-chat', ouvir)
    document.addEventListener('visibilitychange', voltou)
    const i = setInterval(voltou, 20000)
    return () => {
      window.removeEventListener('np-equipe-chat', ouvir)
      document.removeEventListener('visibilitychange', voltou)
      clearInterval(i)
    }
  }, [carregar, time.id])
  useEffect(() => {
    const el = lista.current
    if (el && colado.current) el.scrollTop = el.scrollHeight
  }, [msgs.length])

  const membro = (id) => time.membros.find((m) => m.id === id)
  const cargoDe = (m) => (m.dono ? { nome: t('Dono'), cor: '#f5c518' } : time.cargos.find((c) => c.id === m.cargo) || { nome: t('Membro'), cor: '#9aa0a8' })
  const enviar = async (e) => {
    e.preventDefault()
    const limpo = texto.trim()
    if (!limpo) return
    setTexto('')
    setErro('')
    colado.current = true
    try {
      const d = await acaoEquipe('chat-enviar', { texto: limpo })
      setMsgs((l) => (l.some((x) => x.id === d.msg.id) ? l : [...l, d.msg]))
    } catch (x) {
      setTexto(limpo)
      setErro(textoErro(x))
    }
  }
  return (
    <div className="eq-chat">
      <div className="eq-chat-topo">
        <button type="button" className={`eq-sino${mudo ? ' mudo' : ''}`} onClick={() => definirMudoEquipe(!mudo)} aria-pressed={mudo} title={mudo ? t('Som das mensagens do time desligado') : t('Som das mensagens do time ligado')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
            {mudo && <path d="M3 3l18 18" />}
          </svg>
          {mudo ? t('Silenciado') : t('Som ligado')}
        </button>
      </div>
      <ul className="eq-chat-lista" ref={lista} onScroll={(e) => (colado.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 40)}>
        {!msgs.length && <li className="eq-vazio">{t('Ninguém falou ainda. Mande a primeira mensagem do time!')}</li>}
        {msgs.map((m) => {
          const quem = membro(m.de)
          return (
            <li key={m.id} className={m.de === eu ? 'minha' : ''}>
              <Foto id={m.de} nome={m.nome} avatar={quem?.avatar} tamanho={30} />
              <div>
                <span>
                  <a href={linkPerfil(m.de)}>{quem?.nome || m.nome}</a>
                  {quem && (
                    <span className="eq-cargo eq-cargo-chat" style={{ '--cor': cargoDe(quem).cor }}>
                      {cargoDe(quem).nome}
                    </span>
                  )}
                  <time dateTime={new Date(m.ts).toISOString()}>{new Date(m.ts).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                  {pode('moderar') && (
                    <button type="button" className="eq-apagar-msg" title={t('Apagar mensagem')} onClick={() => acaoEquipe('chat-apagar', { id: m.id }).catch(() => {})}>
                      ×
                    </button>
                  )}
                </span>
                <p>{m.texto}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <form onSubmit={enviar}>
        <input value={texto} maxLength={240} onChange={(e) => setTexto(e.target.value)} placeholder={t('Mensagem para o time…')} aria-label={t('Mensagem')} />
        <button type="submit" className="eq-btn eq-btn-p" disabled={!texto.trim()}>
          {t('Enviar')}
        </button>
      </form>
      {erro && <p className="eq-erro">{t(erro)}</p>}
    </div>
  )
}

// ── membros ──
function Membros({ time, eu, pode, fazer, ocupado }) {
  const t = useT()
  const cargo = (id) => time.cargos.find((c) => c.id === id)
  return (
    <ul className="eq-membros">
      {time.membros.map((m) => {
        const c = m.dono ? { nome: t('Dono'), cor: '#f5c518' } : cargo(m.cargo) || { nome: t('Membro'), cor: '#9aa0a8' }
        const podeTirar = m.id !== eu && !m.dono && pode('expulsar') && (pode('dono') || !time.membros.find((x) => x.id === m.id && x.cargo !== 'membro' && cargo(x.cargo)?.permissoes.length))
        return (
          <li key={m.id}>
            <Foto id={m.id} nome={m.nome} avatar={m.avatar} />
            <a href={linkPerfil(m.id)} className="eq-membro-nome">
              {m.nome || m.id}
              {m.id === eu && <em> ({t('você')})</em>}
            </a>
            <span className="eq-cargo" style={{ '--cor': c.cor }}>
              {c.nome}
            </span>
            {pode('dono') && !m.dono && (
              <select value={m.cargo} disabled={ocupado} onChange={(e) => fazer('cargo-dar', { alvo: m.id, cargo: e.target.value })} aria-label={t('Cargo')}>
                {time.cargos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </select>
            )}
            {podeTirar && (
              <button
                type="button"
                className="eq-btn eq-btn-perigo"
                disabled={ocupado}
                onClick={async () => (await confirmar(t('Tirar {nome} do time?', { nome: m.nome || m.id }), { perigo: true, ok: t('Tirar') })) && fazer('expulsar', { alvo: m.id })}
              >
                {t('Tirar')}
              </button>
            )}
            {pode('dono') && !m.dono && (
              <button
                type="button"
                className="eq-btn"
                disabled={ocupado}
                onClick={async () => (await confirmar(t('Passar a liderança do time para {nome}? Você deixa de ser o dono.', { nome: m.nome || m.id }), { perigo: true, ok: t('Passar a liderança') })) && fazer('transferir', { alvo: m.id })}
              >
                {t('Passar liderança')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ── convidar ──
function Convidar({ time, fazer, ocupado }) {
  const t = useT()
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState([])
  useEffect(() => {
    if (busca.trim().length < 2) return setAchados([])
    let vivo = true
    const i = setTimeout(async () => {
      try {
        const r = await fetch(`${CONFIG.loginSteam.replace(/\/$/, '')}/usuarios/buscar?q=${encodeURIComponent(busca.trim())}`, { headers: { Authorization: `Bearer ${tokenConta()}` } })
        const d = await r.json()
        if (vivo) setAchados(d.jogadores || [])
      } catch {
        // sem resultado agora
      }
    }, 300)
    return () => {
      vivo = false
      clearTimeout(i)
    }
  }, [busca])
  const dentro = new Set(time.membros.map((m) => m.id))
  const convidados = new Set((time.convitesEnviados || []).map((c) => c.id))
  return (
    <div className="eq-convidar">
      <input type="search" className="eq-busca" placeholder={t('Nome do jogador (precisa já ter entrado no site)')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <ul className="eq-membros">
        {achados.map((j) => (
          <li key={j.id}>
            <Foto id={j.id} nome={j.nome} avatar={j.avatar} />
            <b className="eq-membro-nome">{j.nome}</b>
            {dentro.has(j.id) ? <span className="eq-etiqueta">{t('já no time')}</span> : convidados.has(j.id) ? <span className="eq-etiqueta">{t('convidado')}</span> : (
              <button type="button" className="eq-btn eq-btn-p" disabled={ocupado} onClick={() => fazer('convidar', { alvo: j.id })}>
                {t('Convidar')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!!time.convitesEnviados?.length && (
        <>
          <h3>{t('Convites pendentes')}</h3>
          <ul className="eq-membros">
            {time.convitesEnviados.map((c) => (
              <li key={c.id}>
                <Foto id={c.id} nome={c.nome} avatar={c.avatar} />
                <span className="eq-membro-nome">{c.nome || c.id}</span>
                <button type="button" className="eq-btn" disabled={ocupado} onClick={() => fazer('convite-cancelar', { alvo: c.id })}>
                  {t('Cancelar')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ── cargos (só o dono) ──
function Cargos({ time, fazer, ocupado }) {
  const t = useT()
  const [editando, setEditando] = useState(null) // { id?, nome, cor, permissoes }
  const salvar = async () => {
    await fazer('cargo-salvar', editando)
    setEditando(null)
  }
  const alternar = (p) => setEditando((e) => ({ ...e, permissoes: e.permissoes.includes(p) ? e.permissoes.filter((x) => x !== p) : [...e.permissoes, p] }))
  return (
    <div className="eq-cargos">
      <ul className="eq-membros">
        {time.cargos.map((c) => (
          <li key={c.id}>
            <span className="eq-cargo" style={{ '--cor': c.cor }}>
              {c.nome}
            </span>
            <span className="eq-membro-nome">{c.padrao ? t('Cargo padrão: não tem permissões') : c.permissoes.map((p) => t(PERMISSOES.find((x) => x[0] === p)?.[1] || p)).join(', ') || t('sem permissões')}</span>
            <small>{t('{n} membro(s)', { n: time.membros.filter((m) => m.cargo === c.id && !m.dono).length })}</small>
            <button type="button" className="eq-btn" onClick={() => setEditando({ id: c.id, nome: c.nome, cor: c.cor, permissoes: c.permissoes, padrao: c.padrao })}>
              {t('Editar')}
            </button>
            {!c.padrao && (
              <button type="button" className="eq-btn eq-btn-perigo" disabled={ocupado} onClick={async () => (await confirmar(t('Apagar o cargo {nome}? Quem tem volta a ser Membro.', { nome: c.nome }), { perigo: true, ok: t('Apagar') })) && fazer('cargo-apagar', { id: c.id })}>
                {t('Apagar')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!editando && (
        <button type="button" className="eq-btn eq-btn-p" disabled={time.cargos.length >= 12} onClick={() => setEditando({ nome: '', cor: '#6ea8ff', permissoes: [] })}>
          + {t('Novo cargo')}
        </button>
      )}
      {editando && (
        <div className="eq-form-cargo">
          <h3>{editando.id ? t('Editar cargo') : t('Novo cargo')}</h3>
          <div className="eq-linha">
            <label>
              {t('Nome')}
              <input value={editando.nome} maxLength={20} onChange={(e) => setEditando((x) => ({ ...x, nome: e.target.value }))} />
            </label>
            <label>
              {t('Cor')}
              <input type="color" value={editando.cor} onChange={(e) => setEditando((x) => ({ ...x, cor: e.target.value }))} />
            </label>
          </div>
          {!editando.padrao && (
            <div className="eq-permissoes">
              {PERMISSOES.map(([id, nome, desc]) => (
                <label key={id} className="eq-perm">
                  <input type="checkbox" checked={editando.permissoes.includes(id)} onChange={() => alternar(id)} />
                  <span>
                    <b>{t(nome)}</b>
                    <small>{t(desc)}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="eq-acoes">
            <button type="button" className="eq-btn eq-btn-p" disabled={ocupado || editando.nome.trim().length < 2} onClick={salvar}>
              {t('Salvar cargo')}
            </button>
            <button type="button" className="eq-btn" onClick={() => setEditando(null)}>
              {t('Cancelar')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── configurações do time ──
function Config({ time, fazer, ocupado, aoApagar }) {
  const t = useT()
  const [nome, setNome] = useState(time.nome)
  const [tag, setTag] = useState(time.tag || '')
  const [descricao, setDescricao] = useState(time.descricao || '')
  const [erro, setErro] = useState('')
  const arquivo = useRef(null)
  const mudou = nome !== time.nome || tag !== (time.tag || '') || descricao !== (time.descricao || '')
  const trocarImagem = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErro('')
    try {
      await fazer('imagem-salvar', { dataUrl: await reduzirImagem(f) })
    } catch (x) {
      setErro(textoErro(x))
    }
  }
  return (
    <div className="eq-config">
      <div className="eq-config-img">
        <Escudo equipe={time} tamanho={96} />
        <div>
          <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={trocarImagem} />
          <button type="button" className="eq-btn eq-btn-p" disabled={ocupado} onClick={() => arquivo.current?.click()}>
            {t('Trocar imagem')}
          </button>
          {time.imagem && (
            <button type="button" className="eq-btn" disabled={ocupado} onClick={() => fazer('imagem-salvar', { dataUrl: '' })}>
              {t('Tirar imagem')}
            </button>
          )}
          <small>{t('A imagem vira um quadrado de 256 px.')}</small>
        </div>
      </div>
      <label>
        {t('Nome do time')}
        <input value={nome} maxLength={24} onChange={(e) => setNome(e.target.value)} />
      </label>
      <label>
        {t('Tag')}
        <input value={tag} maxLength={5} onChange={(e) => setTag(e.target.value.replace(/[^\p{L}\p{N}]/gu, ''))} />
      </label>
      <label>
        {t('Descrição')}
        <textarea value={descricao} maxLength={280} rows={3} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <button type="button" className="eq-btn eq-btn-p" disabled={ocupado || !mudou} onClick={() => fazer('editar', { nome, tag, descricao })}>
        {t('Salvar')}
      </button>
      <div className="eq-seg" role="group" aria-label={t('Quem pode entrar')}>
        <button type="button" className={time.publico ? 'is-ativo' : ''} disabled={ocupado} onClick={() => fazer('editar', { publico: true })}>
          {t('Público')} <small>{t('qualquer um entra')}</small>
        </button>
        <button type="button" className={!time.publico ? 'is-ativo' : ''} disabled={ocupado} onClick={() => fazer('editar', { publico: false })}>
          {t('Privado')} <small>{t('só com convite')}</small>
        </button>
      </div>
      {erro && <p className="eq-erro">{t(erro)}</p>}
      {time.minhas.includes('dono') && (
        <div className="eq-perigo">
          <h3>{t('Zona de perigo')}</h3>
          <p>{t('Apagar o time tira todo mundo dele e apaga o chat. Os {n} NP da criação não voltam.', { n: '10.000' })}</p>
          <button type="button" className="eq-btn eq-btn-perigo" disabled={ocupado} onClick={aoApagar}>
            {t('Apagar o time')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── quem tem time ──
function ComTime({ dados, recarregar, eu }) {
  const t = useT()
  const time = dados.time
  const pode = (p) => time.minhas.includes(p)
  const [aba, setAba] = useState('geral')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const fazer = async (acao, corpo) => {
    setOcupado(true)
    setErro('')
    try {
      await acaoEquipe(acao, corpo)
      await recarregar()
    } catch (x) {
      setErro(textoErro(x))
    } finally {
      setOcupado(false)
    }
  }
  const abas = useMemo(
    () => [
      ['geral', 'Visão geral'],
      ['membros', 'Membros'],
      ['chat', 'Chat'],
      ...(pode('convidar') || pode('dono') ? [['convidar', 'Convidar']] : []),
      ...(pode('dono') ? [['cargos', 'Cargos']] : []),
      ...(pode('editar') ? [['config', 'Configurações']] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [time.minhas.join()],
  )
  const aAba = abas.some(([id]) => id === aba) ? aba : 'geral'
  const sair = async () => (await confirmar(t('Sair do time {nome}?', { nome: time.nome }), { perigo: true, ok: t('Sair') })) && fazer('sair')
  const apagar = async () => {
    if (await confirmar(t('Apagar o time {nome} para sempre? Todo mundo sai dele e o chat é apagado.', { nome: time.nome }), { perigo: true, ok: t('Apagar o time') })) await fazer('apagar')
  }
  const dono = time.membros.find((m) => m.dono)

  return (
    <>
      <header className="eq-cabeca">
        <Escudo equipe={time} tamanho={88} />
        <div className="eq-cabeca-txt">
          <h1>
            {time.nome} {time.tag && <em>[{time.tag}]</em>}
          </h1>
          <p>
            <span className={`eq-etiqueta ${time.publico ? 'pub' : 'priv'}`}>{time.publico ? t('Público') : t('Privado')}</span> · {t('{n} membro(s)', { n: time.membros.length })} · {t('dono')}: <b>{dono?.nome || time.donoNome}</b>
          </p>
          {time.descricao && <p className="eq-desc">{time.descricao}</p>}
        </div>
        {!pode('dono') && (
          <button type="button" className="eq-btn eq-btn-perigo" onClick={sair} disabled={ocupado}>
            {t('Sair do time')}
          </button>
        )}
      </header>

      <nav className="eq-abas" role="tablist">
        {abas.map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aAba === id} className={aAba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
            {t(nome)}
          </button>
        ))}
      </nav>
      {erro && <p className="eq-erro" role="alert">{t(erro)}</p>}

      <section className="eq-painel">
        {aAba === 'geral' && (
          <div className="eq-geral">
            <div className="eq-stat">
              <b>{time.membros.length}</b>
              <small>{t('membros')}</small>
            </div>
            <div className="eq-stat">
              <b>{time.cargos.length}</b>
              <small>{t('cargos')}</small>
            </div>
            <div className="eq-stat">
              <b>{new Date(time.criada).toLocaleDateString()}</b>
              <small>{t('criado em')}</small>
            </div>
            <div className="eq-lado">
              <h3>{t('Seu cargo')}</h3>
              <p>
                {pode('dono') ? t('Dono do time: você pode tudo.') : time.minhas.length ? `${t('Você pode')}: ${time.minhas.map((p) => t(PERMISSOES.find((x) => x[0] === p)?.[1] || p)).join(', ')}.` : t('Membro: sem permissões especiais.')}
              </p>
            </div>
          </div>
        )}
        {aAba === 'membros' && <Membros time={time} eu={eu} pode={pode} fazer={fazer} ocupado={ocupado} />}
        {aAba === 'chat' && <ChatDoTime key={time.id} time={time} eu={eu} pode={pode} />}
        {aAba === 'convidar' && <Convidar time={time} fazer={fazer} ocupado={ocupado} />}
        {aAba === 'cargos' && <Cargos time={time} fazer={fazer} ocupado={ocupado} />}
        {aAba === 'config' && <Config key={time.id} time={time} fazer={fazer} ocupado={ocupado} aoApagar={apagar} />}
      </section>
    </>
  )
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      setDados(await lerMeuTime())
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [])
  useEffect(() => {
    if (!conta?.id) return
    recarregar()
    const ao = () => recarregar()
    const voltou = () => document.visibilityState === 'visible' && recarregar()
    window.addEventListener('np-equipe', ao)
    document.addEventListener('visibilitychange', voltou)
    const i = setInterval(voltou, 30000)
    return () => {
      window.removeEventListener('np-equipe', ao)
      document.removeEventListener('visibilitychange', voltou)
      clearInterval(i)
    }
  }, [conta?.id, recarregar])

  if (!loginAtivo() || !conta)
    return (
      <div className="eq-bloqueio">
        <h1>{t('Times')}</h1>
        <p>{t('Entre com a Steam para criar ou entrar em um time.')}</p>
        {loginAtivo() && (
          <button type="button" className="eq-btn eq-btn-p" onClick={entrar}>
            {t('Entrar com a Steam')}
          </button>
        )}
      </div>
    )
  if (erro && !dados) return <p className="eq-vazio">{t('Não consegui carregar os times agora. Tente de novo mais tarde.')}</p>
  if (!dados) return <CarregandoNP />
  return dados.time ? <ComTime dados={dados} recarregar={recarregar} eu={conta.id} /> : <SemTime dados={dados} recarregar={recarregar} />
}

export default function Equipes() {
  return (
    <Layout pagina="equipes">
      <main className="eq-pagina">
        <div className="wrap eq-wrap">
          <Conteudo />
        </div>
      </main>
    </Layout>
  )
}
