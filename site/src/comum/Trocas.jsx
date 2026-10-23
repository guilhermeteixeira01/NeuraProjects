// Trocas entre jogadores, no estilo das propostas de troca da Steam (worker: src/trocas.js, rotas /trocas).
//  - JanelaTroca: monta uma proposta ("Seu inventário" / "Inventário dele(a)" à esquerda; "Seus itens" e "Itens de fulano" à direita).
//  - PainelTrocas: propostas recebidas, enviadas e o histórico, com Aceitar / Recusar / Cancelar.
//  - useTrocas + AvisoTroca: quantidade pendente, atualização ao vivo e a notificação no sino quando chega uma proposta.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CartaoSkin from './CartaoSkin.jsx'
import { BotaoInspecionar } from './InspecionarSkin.jsx'
import './trocas.css'
import { CONFIG } from './config.js'
import { tokenConta, useConta } from './conta.js'
import { useT } from './i18n.js'
import { lerCaixasPublicas } from './loja.js'
import { comSenha } from './seguranca.js'
import { registrarNotificacao } from './notificacoes.js'
import { indicar, lerInventario, urlImg, useCatalogo, corEnfeite } from './skins.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')
async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token) throw new Error('login')
  const r = await fetch(`${base()}${rota}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw Object.assign(new Error(d?.erro || 'falhou'), { dados: d || {} })
  return d
}
export const lerTrocas = () => chamar('/trocas')
const MENSAGENS = {
  jogador: 'Jogador não encontrado (ele precisa já ter entrado no site).',
  vazia: 'Escolha pelo menos um item.',
  'muitos-itens': 'No máximo 20 itens de cada lado.',
  'muitas-pendentes': 'Você já tem propostas demais esperando resposta.',
  'item-invalido': 'Algum item não pode ser trocado.',
  'item-em-outra-proposta': 'Um dos seus itens já está em outra proposta pendente.',
  encerrada: 'Essa proposta já foi respondida.',
  'item-de-quem-propos-mudou': 'Quem propôs não tem mais algum dos itens.',
  'seu-item-mudou': 'Você não tem mais algum dos itens pedidos.',
  cheio: 'O inventário de um dos dois está cheio.',
  login: 'Entre com a Steam.',
  'senha-errada': 'Senha incorreta.',
  bloqueado: 'Muitas tentativas erradas: aguarde 15 minutos e tente de novo.',
  'sem-senha': 'Crie a sua senha de segurança para continuar.',
  'senha-pedir': 'Digite a sua senha de segurança.',
}
const textoErro = (e) => MENSAGENS[e?.message] || 'Não deu para concluir agora. Tente de novo.'

// ── catálogos para desenhar os itens ──
function useCatalogosDeItens() {
  const armas = useCatalogo('armas')
  const adesivos = useCatalogo('adesivos')
  const chaveiros = useCatalogo('chaveiros')
  const [caixas, setCaixas] = useState([])
  useEffect(() => {
    lerCaixasPublicas().then(setCaixas)
  }, [])
  return useMemo(
    () => ({
      pronto: !!armas.dados,
      idx: indicar(armas.dados?.armas, []),
      adesivos: new Map((adesivos.dados || []).map((s) => [s[0], s])),
      chaveiros: new Map((chaveiros.dados || []).map((s) => [s[0], s])),
      caixas,
    }),
    [armas.dados, adesivos.dados, chaveiros.dados, caixas],
  )
}

// Um item (skin/faca/luva com adesivos, ou adesivo, chaveiro e caixa) como cartão pequeno; onClick escolhe/tira
function ItemTroca({ item, id, cat, aoClicar, marcado, pequeno = false }) {
  const t = useT()
  const classe = `tr-item${marcado ? ' sel' : ''}${pequeno ? ' pq' : ''}`
  let corpo
  if (item.t === 'adesivo' || item.t === 'chaveiro' || item.t === 'caixa') {
    const caixa = item.t === 'caixa' ? cat.caixas.find((c) => c.id === item.d) : null
    const linha = item.t === 'adesivo' ? cat.adesivos.get(item.d) : item.t === 'chaveiro' ? cat.chaveiros.get(item.d) : null
    corpo = (
      <div className="inv-cartao inv-cartao-fixo" style={{ '--cor': caixa?.cor || (linha ? corEnfeite(item.t, linha) : '#6b6f76') }}>
        <span className="inv-cartao-arte">
          <span className="inv-arma-box">
            <img className="inv-arma-img" src={caixa ? caixa.img : urlImg(linha?.[2], 256)} alt="" loading="lazy" />
          </span>
        </span>
        <span className="inv-cartao-nome">
          <b>{caixa?.nome || linha?.[1] || `#${item.d}`}</b>
          <small>{item.t === 'adesivo' ? t('Adesivo') : item.t === 'chaveiro' ? t('Chaveiro') : t('Caixa fechada')}</small>
        </span>
      </div>
    )
  } else {
    corpo = (
      <ul className="tr-skin">
        <CartaoSkin item={{ ...item, __id: id }} idx={cat.idx} adesivos={cat.adesivos} chaveiros={cat.chaveiros} equip={{ ct: {}, tr: {} }} />
      </ul>
    )
  }
  const principal = aoClicar ? (
    <button type="button" className={classe} onClick={aoClicar} aria-pressed={!!marcado}>
      {corpo}
    </button>
  ) : (
    <div className={classe}>{corpo}</div>
  )
  // a lupa "Inspecionar" fica por cima do cartão (fora do botão de escolher, que não pode conter outro botão)
  return (
    <div className="tr-item-wrap">
      {principal}
      <BotaoInspecionar item={{ ...item, __id: id }} classe="insp-canto" />
    </div>
  )
}

const FILTROS = [
  ['tudo', 'Tudo'],
  ['arma', 'Armas'],
  ['faca', 'Facas'],
  ['luva', 'Luvas'],
  ['adesivo', 'Adesivos'],
  ['chaveiro', 'Chaveiros'],
  ['caixa', 'Caixas'],
]

// ── Janela de proposta ──
export function JanelaTroca({ para, aoFechar, aoEnviada }) {
  const t = useT()
  const cat = useCatalogosDeItens()
  const [meu, setMeu] = useState(null)
  const [dele, setDele] = useState(null)
  const [aba, setAba] = useState('meu') // meu | dele
  const [filtro, setFiltro] = useState('tudo')
  const [dar, setDar] = useState([])
  const [pedir, setPedir] = useState([])
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [presente, setPresente] = useState(false) // pergunta "dar de presente?" quando só oferece itens

  useEffect(() => {
    lerInventario().then(setMeu, () => setErro('falhou'))
    fetch(`${base()}/skins/inventario?id=${encodeURIComponent(para.id)}`)
      .then((r) => r.json())
      .then(setDele, () => setErro('falhou'))
  }, [para.id])
  useEffect(() => {
    document.documentElement.classList.add('ins-estante-aberta')
    const tecla = (e) => e.key === 'Escape' && !enviando && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => {
      document.documentElement.classList.remove('ins-estante-aberta')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoFechar, enviando])

  const inv = aba === 'meu' ? meu : dele
  const escolhidos = aba === 'meu' ? dar : pedir
  const lista = useMemo(
    () =>
      Object.entries(inv?.itens || {})
        .filter(([id, it]) => it.t !== 'agente' && !escolhidos.includes(id) && (filtro === 'tudo' || it.t === filtro))
        .sort((a, b) => (inv?.criado?.[b[0]] || 0) - (inv?.criado?.[a[0]] || 0)),
    [inv, escolhidos, filtro],
  )
  const alternar = (id) => {
    const set = aba === 'meu' ? setDar : setPedir
    const atual = aba === 'meu' ? dar : pedir
    if (atual.includes(id)) set(atual.filter((x) => x !== id))
    else if (atual.length < 20) set([...atual, id])
  }
  const enviar = async () => {
    setPresente(false)
    setEnviando(true)
    setErro('')
    try {
      const r = await comSenha(t('Para propor a troca, digite a sua senha de segurança.'), (senha) => chamar('/trocas', { para: para.id, dar, pedir, msg, senha }))
      if (r.cancelado) return
      aoEnviada?.()
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }
  const slots = (ids, dono, remover) => {
    const total = Math.max(8, Math.ceil((ids.length + 1) / 4) * 4)
    return (
      <div className="tr-slots">
        {Array.from({ length: total }, (_, k) => {
          const id = ids[k]
          const item = id && dono?.itens?.[id]
          return (
            <div key={k} className={`tr-slot${item ? ' cheio' : ''}`}>
              {item && <ItemTroca item={item} id={id} cat={cat} pequeno aoClicar={() => remover(id)} />}
            </div>
          )
        })}
      </div>
    )
  }

  return createPortal(
    <div className="ins-est-fundo" onClick={() => !enviando && aoFechar()}>
      <div className="ins-est tr-janela" role="dialog" aria-modal="true" aria-label={t('Proposta de troca')} onClick={(e) => e.stopPropagation()}>
        <header className="ins-est-cab">
          <h2>
            {t('Você está trocando com')} <b>{para.nome}</b>
          </h2>
          <button type="button" className="ins-est-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <div className="tr-corpo">
          <section className="tr-esq">
            <nav className="tr-abas" role="tablist">
              <button type="button" role="tab" aria-selected={aba === 'meu'} className={aba === 'meu' ? 'is-ativo' : ''} onClick={() => setAba('meu')}>
                {t('Seu inventário')}
              </button>
              <button type="button" role="tab" aria-selected={aba === 'dele'} className={aba === 'dele' ? 'is-ativo' : ''} onClick={() => setAba('dele')}>
                {t('Inventário dele(a)')}
              </button>
            </nav>
            <div className="tr-filtros">
              {FILTROS.map(([id, rot]) => (
                <button key={id} type="button" className={filtro === id ? 'is-ativo' : ''} onClick={() => setFiltro(id)}>
                  {t(rot)}
                </button>
              ))}
            </div>
            <div className="tr-inv">
              {!inv || !cat.pronto ? (
                <p className="tr-vazio">{t('Carregando…')}</p>
              ) : !lista.length ? (
                <p className="tr-vazio">{t('Nenhum item aqui.')}</p>
              ) : (
                <ul className="tr-grade">
                  {lista.map(([id, it]) => (
                    <li key={id}>
                      <ItemTroca item={it} id={id} cat={cat} aoClicar={() => alternar(id)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="tr-dica">{t('Clique num item para colocar na troca (até 20 de cada lado). Clique de novo no quadro da direita para tirar.')}</p>
          </section>

          <section className="tr-dir">
            <h3>{t('Seus itens')}</h3>
            <small>{t('Estes são os itens que você perderá na troca.')}</small>
            {slots(dar, meu, (id) => setDar(dar.filter((x) => x !== id)))}
            <p className="tr-estado">{dar.length || pedir.length ? t('Você oferece {a} e pede {b}.', { a: dar.length, b: pedir.length }) : t('Esperando que você ofereça um ou mais itens.')}</p>
            <h3>
              {t('Itens de')} {para.nome}
            </h3>
            <small>{t('Estes são os itens que você receberá na troca.')}</small>
            {slots(pedir, dele, (id) => setPedir(pedir.filter((x) => x !== id)))}
            <label className="tr-msg">
              {t('Inclua uma mensagem com a sua proposta:')}
              <textarea value={msg} maxLength={200} onChange={(e) => setMsg(e.target.value)} rows={2} />
            </label>
            {erro && <p className="tr-erro">{t(textoErro({ message: erro }))}</p>}
            <button type="button" className="tr-realizar" disabled={enviando || (!dar.length && !pedir.length)} onClick={() => (dar.length && !pedir.length ? setPresente(true) : enviar())}>
              {enviando ? t('Enviando…') : t('Realizar proposta')}
            </button>
            <small>{t('{nome} receberá uma notificação desta proposta e tem 7 dias para responder.', { nome: para.nome })}</small>
          </section>
        </div>
      </div>
      {presente && (
        <div className="tr-presente-fundo" onClick={(e) => { e.stopPropagation(); setPresente(false) }}>
          <div className="tr-presente" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{t('Dar de presente?')}</h3>
            <p>
              {t('Você escolheu {n} item(ns) para dar, mas não pediu nada de {nome}. Se ele(a) aceitar, você perde os itens e não recebe nada em troca.', { n: dar.length, nome: para.nome })}
            </p>
            <p>{t('Quer mesmo dar de presente? Para trocar, volte e escolha o que você quer receber em "Inventário dele(a)".')}</p>
            <div className="tr-presente-botoes">
              <button type="button" className="inv-btn" onClick={() => setPresente(false)}>
                {t('Voltar e escolher')}
              </button>
              <button type="button" className="inv-btn inv-btn-p" onClick={enviar}>
                {t('Sim, dar de presente')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

// ── Escolher com quem trocar (busca por nome no site) ──
export function EscolherJogador({ aoEscolher, aoFechar }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [lista, setLista] = useState([])
  useEffect(() => {
    if (q.trim().length < 2) return setLista([])
    let vivo = true
    const id = setTimeout(() => {
      chamar(`/usuarios/buscar?q=${encodeURIComponent(q.trim())}`).then((d) => vivo && setLista(d.jogadores || []), () => {})
    }, 300)
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [q])
  return createPortal(
    <div className="ins-est-fundo" onClick={aoFechar}>
      <div className="ins-est tr-escolher" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ins-est-cab">
          <h2>{t('Com quem você quer trocar?')}</h2>
          <button type="button" className="ins-est-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <input autoFocus className="tr-busca" type="search" placeholder={t('Nome do jogador (precisa já ter entrado no site)')} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="tr-jogadores">
          {lista.map((j) => (
            <li key={j.id}>
              <button type="button" onClick={() => aoEscolher(j)}>
                {j.avatar ? <img src={j.avatar} alt="" width="36" height="36" /> : <span className="tr-av" />}
                <b>{j.nome}</b>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !lista.length && <li className="tr-vazio">{t('Ninguém encontrado.')}</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

// ── Lista de propostas ──
const ESTADOS = { aceita: 'Aceita', recusada: 'Recusada', cancelada: 'Cancelada', vencida: 'Vencida', falhou: 'Não concluída' }

function CartaoProposta({ p, eu, cat, aoMudar }) {
  const t = useT()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const euPropus = p.de === eu
  const outro = euPropus ? p.paraNome : p.deNome
  const dou = euPropus ? p.dar : p.pedir // o que eu perco
  const recebo = euPropus ? p.pedir : p.dar // o que eu ganho
  const agir = async (acao) => {
    setOcupado(true)
    setErro('')
    try {
      if (acao === 'aceitar') {
        const r = await comSenha(t('Para aceitar a troca, digite a sua senha de segurança.'), (senha) => chamar('/trocas/aceitar', { id: p.id, senha }))
        if (r.cancelado) return
      } else await chamar(`/trocas/${acao}`, { id: p.id })
      setConfirmando(false)
      aoMudar()
    } catch (e) {
      setErro(e.message)
      aoMudar()
    } finally {
      setOcupado(false)
    }
  }
  return (
    <li className={`tr-prop tr-${p.estado}`}>
      <header>
        <b>{euPropus ? t('Você propôs a {nome}', { nome: outro }) : t('{nome} propôs uma troca', { nome: outro })}</b>
        <small>{new Date(p.criada).toLocaleString()}</small>
        {p.estado !== 'pendente' && <em>{t(ESTADOS[p.estado] || p.estado)}</em>}
      </header>
      {p.msg && <p className="tr-prop-msg">“{p.msg}”</p>}
      <div className="tr-prop-lados">
        <div>
          <h5>{t('Você perde')} ({dou.length})</h5>
          <div className="tr-prop-itens">{dou.length ? dou.map((i) => <ItemTroca key={i.id} item={i.item} id={i.id} cat={cat} pequeno />) : <small>{t('Nada')}</small>}</div>
        </div>
        <div>
          <h5>{t('Você recebe')} ({recebo.length})</h5>
          <div className="tr-prop-itens">{recebo.length ? recebo.map((i) => <ItemTroca key={i.id} item={i.item} id={i.id} cat={cat} pequeno />) : <small>{t('Nada')}</small>}</div>
        </div>
      </div>
      {erro && <p className="tr-erro">{t(textoErro({ message: erro }))}</p>}
      {p.estado === 'pendente' && (
        <footer>
          {euPropus ? (
            <button type="button" className="inv-btn" disabled={ocupado} onClick={() => agir('cancelar')}>
              {t('Cancelar proposta')}
            </button>
          ) : (
            <>
              {confirmando ? (
                <>
                  <p className="tr-aviso" role="alert">
                    <b>{t('Confira com atenção antes de aceitar!')}</b> {t('Veja bem os itens que você perde e os que recebe (skin, desgaste, adesivos e chaveiro). Depois de aceita, a troca não pode ser desfeita.')}
                  </p>
                  <button type="button" className="inv-btn inv-btn-p" disabled={ocupado} onClick={() => agir('aceitar')}>
                    {ocupado ? t('Aceitando…') : t('Sim, aceitar troca')}
                  </button>
                  <button type="button" className="inv-btn" disabled={ocupado} onClick={() => setConfirmando(false)}>
                    {t('Voltar')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="inv-btn inv-btn-p" disabled={ocupado} onClick={() => setConfirmando(true)}>
                    {t('Aceitar')}
                  </button>
                  <button type="button" className="inv-btn" disabled={ocupado} onClick={() => agir('recusar')}>
                    {t('Recusar')}
                  </button>
                </>
              )}
            </>
          )}
        </footer>
      )}
    </li>
  )
}

export function PainelTrocas({ aoFechar, aoNova, aoMudouInventario }) {
  const t = useT()
  const conta = useConta()
  const cat = useCatalogosDeItens()
  const [dados, setDados] = useState(null)
  const [aba, setAba] = useState('recebidas')
  const carregar = useCallback(() => {
    lerTrocas().then(setDados, () => setDados({ recebidas: [], enviadas: [], historico: [] }))
  }, [])
  useEffect(() => {
    carregar()
    window.addEventListener('np-troca', carregar)
    return () => window.removeEventListener('np-troca', carregar)
  }, [carregar])
  useEffect(() => {
    document.documentElement.classList.add('ins-estante-aberta')
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => {
      document.documentElement.classList.remove('ins-estante-aberta')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])
  const lista = dados?.[aba] || []
  return createPortal(
    <div className="ins-est-fundo" onClick={aoFechar}>
      <div className="ins-est tr-painel" role="dialog" aria-modal="true" aria-label={t('Trocas')} onClick={(e) => e.stopPropagation()}>
        <header className="ins-est-cab">
          <h2>{t('Trocas')}</h2>
          <button type="button" className="inv-btn inv-btn-p tr-nova" onClick={aoNova}>
            {t('Nova proposta de troca')}
          </button>
          <button type="button" className="ins-est-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <nav className="ij-abas" role="tablist">
          {[
            ['recebidas', 'Recebidas'],
            ['enviadas', 'Enviadas'],
            ['historico', 'Histórico'],
          ].map(([id, rot]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
              {t(rot)} <small>{dados?.[id]?.length ?? 0}</small>
            </button>
          ))}
        </nav>
        <div className="ins-est-rolagem">
          {!dados || !cat.pronto ? (
            <p className="tr-vazio">{t('Carregando…')}</p>
          ) : !lista.length ? (
            <p className="tr-vazio">{aba === 'recebidas' ? t('Nenhuma proposta esperando você.') : aba === 'enviadas' ? t('Você não tem propostas esperando resposta.') : t('Ainda não há trocas no histórico.')}</p>
          ) : (
            <ul className="tr-props">
              {lista.map((p) => (
                <CartaoProposta
                  key={p.id}
                  p={p}
                  eu={conta?.id}
                  cat={cat}
                  aoMudar={() => {
                    carregar()
                    aoMudouInventario?.()
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Quantas propostas esperam a sua resposta (e atualiza sozinho)
export function useTrocas() {
  const conta = useConta()
  const [dados, setDados] = useState(null)
  const carregar = useCallback(() => {
    if (conta?.id && CONFIG.loginSteam) lerTrocas().then(setDados, () => {})
  }, [conta?.id])
  useEffect(() => {
    carregar()
    window.addEventListener('np-troca', carregar)
    const i = setInterval(() => document.visibilityState === 'visible' && carregar(), 60000)
    return () => {
      window.removeEventListener('np-troca', carregar)
      clearInterval(i)
    }
  }, [carregar])
  return { dados, recarregar: carregar, pendentes: dados?.recebidas?.length || 0 }
}

// No Layout (com login): proposta nova vira notificação no sino (uma vez por proposta)
export function AvisoTroca() {
  const conta = useConta()
  const { dados } = useTrocas()
  useEffect(() => {
    if (!conta?.id || !dados) return
    for (const p of dados.recebidas || []) {
      registrarNotificacao(conta.id, {
        id: `troca:${p.id}`,
        titulo: `${p.deNome || 'Alguém'} quer trocar com você`,
        texto: `${p.dar.length} item(ns) dele(a) por ${p.pedir.length} seu(s)`,
        imagem: p.deAvatar || '',
        link: '/inventario/?trocas=1',
      })
    }
  }, [dados, conta?.id])
  return null
}

// Botão + janelas. Sem "para": abre a lista de propostas (e dali "Nova proposta"). Com "para": abre direto a proposta para esse jogador.
export function BotaoTrocas({ para, classe = 'inv-btn', aoMudouInventario }) {
  const t = useT()
  const { pendentes, recarregar } = useTrocas()
  const [tela, setTela] = useState(() => (!para && new URLSearchParams(location.search).has('trocas') ? 'lista' : null)) // lista | escolher | janela
  const [alvo, setAlvo] = useState(para || null)
  return (
    <>
      <button type="button" className={`${classe} tr-botao`} onClick={() => setTela(para ? 'janela' : 'lista')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
        {para ? t('Propor troca') : t('Trocas')}
        {!para && pendentes > 0 && <b className="tr-contagem">{pendentes}</b>}
      </button>
      {tela === 'lista' && (
        <PainelTrocas
          aoFechar={() => setTela(null)}
          aoNova={() => setTela('escolher')}
          aoMudouInventario={() => {
            recarregar()
            aoMudouInventario?.()
          }}
        />
      )}
      {tela === 'escolher' && (
        <EscolherJogador
          aoFechar={() => setTela('lista')}
          aoEscolher={(j) => {
            setAlvo({ id: j.id, nome: j.nome })
            setTela('janela')
          }}
        />
      )}
      {tela === 'janela' && alvo && (
        <JanelaTroca
          para={alvo}
          aoFechar={() => setTela(para ? null : 'lista')}
          aoEnviada={recarregar}
        />
      )}
    </>
  )
}
