// Janelas das trocas (abertas pelo BotaoTrocas de Trocas.jsx, que só baixa este arquivo quando alguém clica):
//  - JanelaTroca: monta uma proposta ("Seu inventário" / "Inventário dele(a)" à esquerda; "Seus itens" e "Itens de fulano" à direita).
//  - EscolherJogador: busca o jogador para quem mandar a proposta.
//  - PainelTrocas: propostas recebidas, enviadas e o histórico, com Aceitar / Recusar / Cancelar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { chamarApi, lerApi, seForErroApi } from './api.js'
import { GemaNome, nomeDoDesgaste } from './CartaoSkin.jsx'
import { BotaoInspecionar } from './InspecionarSkin.jsx'
import { useConta } from './conta.js'
import { useT } from './i18n.js'
import { lerCaixasPublicas } from './loja.js'
import { comSenha } from './seguranca.js'
import { descrever, indicar, urlImg, useCatalogo, corEnfeite } from './skins.js'
import { lerTrocas } from './Trocas.jsx'

const MENSAGENS = {
  jogador: 'Jogador não encontrado (ele precisa já ter entrado no site).',
  vazia: 'Escolha pelo menos um item.',
  'muitos-itens': 'No máximo 20 itens de cada lado.',
  'muitas-pendentes': 'Você já tem propostas demais esperando resposta.',
  'item-invalido': 'Algum item não pode ser trocado.',
  'item-em-outra-proposta': 'Um dos itens já está reservado em outra proposta pendente.',
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

// Um item da troca (skin/faca/luva, adesivo, chaveiro ou caixa) num cartão único: todos com a mesma estrutura e proporção.
//   grade da esquerda: arte 4:3 + nome em 3 linhas fixas;  quadros da direita e propostas (pequeno): só a arte, quadrada.
function ItemTroca({ item, id, cat, aoClicar, marcado, pequeno = false }) {
  const t = useT()
  let img = ''
  let cor = '#6b6f76'
  let titulo = ''
  let sub = ''
  let extra = ''
  let enfeites = null
  if (item.t === 'caixa') {
    const caixa = cat.caixas.find((c) => c.id === item.d)
    img = caixa?.img || ''
    cor = caixa?.cor || cor
    titulo = caixa?.nome || `#${item.d}`
    sub = t('Caixa fechada')
  } else if (item.t === 'adesivo' || item.t === 'chaveiro') {
    const linha = (item.t === 'adesivo' ? cat.adesivos : cat.chaveiros).get(item.d)
    img = urlImg(linha?.[2], 256)
    cor = linha ? corEnfeite(item.t, linha) : cor
    titulo = linha?.[1] || `#${item.d}`
    sub = item.t === 'adesivo' ? t('Adesivo') : t('Chaveiro')
  } else {
    const d = descrever(item, cat.idx)
    img = d.img
    cor = d.cor || cor
    titulo = item.n ? `${d.titulo} «${item.n}»` : d.titulo
    sub = d.subtitulo
    if (d.skin && item.f != null) extra = `${t(nomeDoDesgaste(Number(item.f)))} · ${Number(item.f).toFixed(3)}`
    const ads = item.t === 'arma' ? (item.a || []).filter((s) => s?.i) : []
    const ch = item.t === 'arma' && item.k?.i > 0 ? cat.chaveiros.get(item.k.i) : null
    if (ads.length || ch)
      enfeites = (
        <span className="tri-enf">
          {ch && <img src={urlImg(ch[2], 64)} alt="" loading="lazy" />}
          {ads.map((s, k) => (
            <img key={k} src={urlImg(cat.adesivos.get(s.i)?.[2], 64)} alt="" loading="lazy" />
          ))}
        </span>
      )
  }
  const corpo = (
    <>
      <span className="tri-arte">
        {img ? <img src={img} alt="" loading="lazy" draggable="false" /> : null}
        {item.st ? <span className="tri-st">ST™</span> : null}
        {enfeites}
      </span>
      {!pequeno && (
        <span className="tri-nome">
          <b title={titulo}>
            <GemaNome item={item} />
            {titulo}
          </b>
          <small title={sub}>{sub}</small>
          <em>{extra || '\u00a0'}</em>
        </span>
      )}
    </>
  )
  const classe = `tri${pequeno ? ' tri-pq' : ''}${marcado ? ' sel' : ''}${aoClicar ? ' clicavel' : ''}`
  const principal = aoClicar ? (
    <button type="button" className={classe} style={{ '--cor': cor }} onClick={aoClicar} aria-pressed={!!marcado} title={titulo}>
      {corpo}
    </button>
  ) : (
    <div className={classe} style={{ '--cor': cor }} title={titulo}>
      {corpo}
    </div>
  )
  // a lupa "Inspecionar" fica por cima do cartão (fora do botão de escolher, que não pode conter outro botão)
  return (
    <div className={`tri-wrap${pequeno ? ' tri-wrap-pq' : ''}`}>
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
  const conta = useConta()
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
    let ativo = true, versao = 0
    const carregar = async () => {
      const atual = ++versao
      try {
        const [a,b] = await Promise.all([lerApi(`/skins/inventario?id=${encodeURIComponent(conta.id)}&troca=1`),lerApi(`/skins/inventario?id=${encodeURIComponent(para.id)}&troca=1`)])
        if (!ativo || atual !== versao) return
        setMeu(a); setDele(b)
        setDar(ids=>ids.filter(id=>a.itens?.[id])); setPedir(ids=>ids.filter(id=>b.itens?.[id]))
      } catch(e) { if(ativo) seForErroApi(()=>setErro('falhou'))(e) }
    }
    carregar()
    window.addEventListener('focus',carregar);window.addEventListener('np-trocas-estado',carregar)
    return()=>{ativo=false;window.removeEventListener('focus',carregar);window.removeEventListener('np-trocas-estado',carregar)}
  }, [para.id,conta?.id])
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
      const r = await comSenha(t('Para propor a troca, digite a sua senha de segurança.'), (senha) => chamarApi('/trocas', { para: para.id, dar, pedir, msg, senha }))
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
    // sempre uma fileira com espaço livre para o próximo item, menos quando já chegou no limite (20): aí não sobra quadro vazio
    const total = Math.min(20, Math.max(8, Math.ceil((ids.length + 1) / 4) * 4))
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
      chamarApi(`/usuarios/buscar?q=${encodeURIComponent(q.trim())}`).then((d) => vivo && setLista(d.jogadores || []), seForErroApi())
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
        const r = await comSenha(t('Para aceitar a troca, digite a sua senha de segurança.'), (senha) => chamarApi('/trocas/aceitar', { id: p.id, senha }))
        if (r.cancelado) return
      } else await chamarApi(`/trocas/${acao}`, { id: p.id })
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
