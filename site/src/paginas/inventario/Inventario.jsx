import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import {
  CATEGORIAS,
  LADOS_TIME,
  chaveEquip,
  descrever,
  indicar,
  inventarioNovo,
  lerInventario,
  novoIdItem,
  salvarInventario,
  urlImg,
  urlImgArma,
  useCatalogo,
} from '../../comum/skins.js'
import { useT } from '../../comum/i18n.js'
import { tocar } from '../../comum/somInventario.js'
import Cartao from '../../comum/CartaoSkin.jsx'

// Inventário de skins, no estilo do inventário do jogo: o jogador CRIA itens (arma/faca/luva/agente com a skin que quiser), ajusta
// cada um (desgaste, seed, StatTrak, nome, adesivos com posição) e EQUIPA no CT, no TR ou nos dois (botão direito no item).
// Tudo é salvo sozinho no worker (src/skins.js); o plugin BaseComp aplica o que está equipado quando o jogador entra no servidor.

const ABAS = [
  ['tudo', 'TUDO'],
  ['arma', 'ARMAS'],
  ['faca', 'FACAS'],
  ['luva', 'LUVAS'],
]
const ORDENS = [
  ['equipado', 'Equipado'],
  ['recente', 'Mais recentes'],
  ['nome', 'Nome'],
]

// ── peças pequenas ──
function Imagem({ src, alt = '', classe = '' }) {
  const [erro, setErro] = useState(false)
  return src && !erro ? <img className={classe} src={src} alt={alt} loading="lazy" onError={() => setErro(true)} /> : <span className={`inv-sem-img ${classe}`} aria-hidden="true" />
}

function Marca({ lado }) {
  return <i className={`inv-marca inv-marca-${lado}`} title={lado === 'ct' ? 'CT' : 'TR'} aria-label={lado === 'ct' ? 'CT' : 'TR'} />
}

function Janela({ titulo, aoFechar, largura = 'media', children, rodape }) {
  const t = useT()
  useEffect(() => {
    tocar('abrir')
    return () => tocar('fechar')
  }, [])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="inv-fundo" onClick={aoFechar}>
      <div className={`inv-janela inv-janela-${largura}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="inv-janela-cab">
          <h2>{titulo}</h2>
          <button type="button" className="inv-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <div className="inv-janela-corpo">{children}</div>
        {rodape && <div className="inv-janela-rodape">{rodape}</div>}
      </div>
    </div>
  )
}

// Grade de skins de uma arma (mais a opção "sem skin"/"padrão")
function GradeSkins({ skins, paint, aoEscolher, rotuloVazio }) {
  const t = useT()
  const [busca, setBusca] = useState('')
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? skins.filter((s) => s[1].toLowerCase().includes(q)) : skins
  }, [skins, busca])
  return (
    <div className="inv-grade-caixa">
      <input type="search" className="inv-busca" placeholder={t('Pesquisar skin')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <ul className="inv-grade">
        {rotuloVazio && (
          <li>
            <button type="button" className={`inv-skin inv-skin-vazio${!paint ? ' is-ativo' : ''}`} onClick={() => aoEscolher(null)}>
              <span className="inv-skin-img">
                <span className="inv-vazio-x">∅</span>
              </span>
              <b>{t(rotuloVazio)}</b>
            </button>
          </li>
        )}
        {lista.map((s) => (
          <li key={s[0]}>
            <button type="button" className={`inv-skin${paint === s[0] ? ' is-ativo' : ''}`} style={{ '--cor': s[2] || 'var(--border-2)' }} onClick={() => aoEscolher(s)} title={s[1]}>
              <span className="inv-skin-img">
                <Imagem src={urlImgArma(s[6], 256)} />
              </span>
              <b>{s[1]}</b>
            </button>
          </li>
        ))}
        {!lista.length && <li className="inv-nada">{t('Nenhuma skin encontrada.')}</li>}
      </ul>
    </div>
  )
}

// Escolher um adesivo (10 mil: filtra pelo nome e mostra os primeiros)
function SeletorAdesivo({ aoEscolher, aoFechar, catalogo = 'adesivos' }) {
  const t = useT()
  const { dados, erro } = useCatalogo(catalogo)
  const [busca, setBusca] = useState('')
  const lista = useMemo(() => {
    if (!dados) return []
    const q = busca.trim().toLowerCase()
    return (q ? dados.filter((s) => s[1].toLowerCase().includes(q)) : dados).slice(0, 90)
  }, [dados, busca])
  return (
    <Janela titulo={catalogo === 'chaveiros' ? t('Escolher chaveiro') : t('Escolher adesivo')} aoFechar={aoFechar} largura="media">
      <input type="search" className="inv-busca" placeholder={catalogo === 'chaveiros' ? t('Pesquisar chaveiro') : t('Pesquisar adesivo (ex.: Katowice, holo, Navi)')} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      <ul className="inv-adesivos">
        {lista.map((s) => (
          <li key={s[0]}>
            <button type="button" onClick={() => aoEscolher(s[0])} title={s[1]}>
              <Imagem src={urlImg(s[2], 128)} />
              <small>{s[1]}</small>
            </button>
          </li>
        ))}
        {erro && <li className="inv-nada">{t('Não consegui carregar os adesivos.')}</li>}
        {!dados && !erro && <li className="inv-nada">{t('Carregando…')}</li>}
        {dados && !lista.length && <li className="inv-nada">{t('Nenhum adesivo encontrado.')}</li>}
      </ul>
    </Janela>
  )
}

// ── Arma com adesivos e chaveiro (2D): usada nos cartões e quando o visualizador 3D não está disponível ──
// A posição é aproximada: cada espaço de adesivo tem um ponto de partida na arma e o deslocamento escolhido move o adesivo a partir dele.
const ANCORAS = [
  [0.34, 0.47],
  [0.46, 0.47],
  [0.58, 0.47],
  [0.7, 0.47],
  [0.8, 0.47],
]
const ANCORA_CHAVEIRO = [0.82, 0.66]

function ArmaComEnfeites({ item, d, adesivos, chaveiros, classe = '' }) {
  const arma = item.t === 'arma'
  return (
    <span className={`inv-arma-box ${classe}`}>
      <Imagem src={d.img} classe="inv-arma-img" />
      {arma &&
        (item.a || []).map((s, k) => {
          if (!s?.i) return null
          const [ax, ay] = ANCORAS[k] || ANCORAS[0]
          return (
            <img
              key={k}
              className="inv-previa-adesivo"
              src={urlImg(adesivos.get(s.i)?.[2], 128)}
              alt=""
              style={{ left: `${(ax + (s.x || 0) * 0.3) * 100}%`, top: `${(ay + (s.y || 0) * 0.5) * 100}%`, transform: `translate(-50%, -50%) rotate(${s.r || 0}deg)`, opacity: 1 - (s.w || 0) * 0.65 }}
            />
          )
        })}
      {arma && item.k?.i > 0 && (
        <img className="inv-previa-chaveiro" src={urlImg(chaveiros.get(item.k.i)?.[2], 128)} alt="" style={{ left: `${(ANCORA_CHAVEIRO[0] + ((item.k.x || 0) / 30) * 0.08) * 100}%`, top: `${(ANCORA_CHAVEIRO[1] - ((item.k.y || 0) / 30) * 0.1) * 100}%` }} />
      )}
    </span>
  )
}

const nomeDoDesgaste = (f) => (f < 0.07 ? 'Factory New' : f < 0.15 ? 'Minimal Wear' : f < 0.38 ? 'Field-Tested' : f < 0.45 ? 'Well-Worn' : 'Battle-Scarred')

// ── Visualizador 3D (3d.cstrike.app) ──
// Serviço público de visualização do Inventory Simulator (Ian Lucas), feito para ser embutido: a página conversa com ele por postMessage
// (protocolo v1). Dentro dele dá para girar a arma e arrastar adesivos e chaveiro; cada mudança volta para cá no evento "change".
// O visualizador identifica os itens pelo id da biblioteca cs2-lib; mapa3d.json (ferramentas/skins/gerar-catalogo.mjs) liga ao id do jogo.
const ORIGEM_3D = 'https://3d.cstrike.app'

function useMapas3d(mapa) {
  return useMemo(() => {
    if (!mapa) return null
    const par = (pares) => ({ paraLib: new Map(pares), paraJogo: new Map(pares.map(([d, id]) => [id, d])) })
    return { skins: mapa.skins, base: mapa.base, adesivos: par(mapa.adesivos), chaveiros: par(mapa.chaveiros), agentes: par(mapa.agentes) }
  }, [mapa])
}

// id do item no visualizador (undefined se não existir 3D para ele)
function idNo3d(item, m) {
  if (!m) return undefined
  if (item.t === 'agente') return m.agentes.paraLib.get(item.d)
  return item.p ? m.skins[`${item.d}:${item.p}`] : m.base[item.d]
}

function itemParaViewer(item, m) {
  const v = { id: idNo3d(item, m), seed: item.s ?? 0, wear: item.f ?? 0, stickers: {} }
  if (item.n) v.nameTag = item.n
  if (item.t === 'arma') {
    ;(item.a || []).forEach((s, k) => {
      const lib = s?.i ? m.adesivos.paraLib.get(s.i) : undefined
      if (!lib) return
      v.stickers[k] = { id: lib, schema: s.s ?? 0, ...(s.x != null && { x: s.x }), ...(s.y != null && { y: s.y }), ...(s.r ? { rotation: s.r } : {}), ...(s.w ? { wear: s.w } : {}) }
    })
    const lib = item.k?.i ? m.chaveiros.paraLib.get(item.k.i) : undefined
    if (lib) v.keychains = { 0: { id: lib, seed: item.k.s ?? 0, ...(item.k.x != null && { x: item.k.x, y: item.k.y, z: item.k.z }) } }
  }
  return v
}

// O que o visualizador mudou (arrastar adesivo, etc.) -> campos do nosso item
function viewerParaItem(v, m) {
  const a = [0, 1, 2, 3, 4].map((k) => {
    const s = v.stickers?.[k]
    const def = s ? m.adesivos.paraJogo.get(s.id) : undefined
    if (!def) return null
    return { i: def, s: s.schema ?? 0, ...(s.x != null && { x: s.x }), ...(s.y != null && { y: s.y }), r: s.rotation ?? 0, w: s.wear ?? 0 }
  })
  const kc = v.keychains?.[0]
  const kdef = kc ? m.chaveiros.paraJogo.get(kc.id) : undefined
  const k = kdef ? { i: kdef, s: kc.seed ?? 0, ...(kc.x != null && { x: kc.x, y: kc.y, z: kc.z }) } : null
  return { a, k, s: v.seed ?? 0, f: v.wear ?? 0 }
}

// controle: ref que recebe { enviar(tipo, dados) } para o pai mandar comandos ao visualizador
function Visualizador3D({ item, m, aoMudar, aoEstado, aoFalhar, controle, altura = 440 }) {
  const t = useT()
  const ref = useRef(null)
  const inicial = useRef(null)
  const [estado, setEstado] = useState('carregando') // 'carregando' | 'ok' | 'falhou'
  if (!inicial.current) inicial.current = `${ORIGEM_3D}/view?item=${encodeURIComponent(JSON.stringify(itemParaViewer(item, m)))}`
  const mudarRef = useRef(aoMudar)
  mudarRef.current = aoMudar
  const estadoRef = useRef(aoEstado)
  estadoRef.current = aoEstado

  useEffect(() => {
    let contador = 0
    if (controle)
      controle.current = {
        enviar: (tipo, dados = {}) => ref.current?.contentWindow?.postMessage({ source: '3d.cstrike.app', v: 1, type: tipo, data: dados, id: `np${++contador}` }, ORIGEM_3D),
      }
    const ouvir = (e) => {
      if (e.origin !== ORIGEM_3D || e.source !== ref.current?.contentWindow || e.data?.source !== '3d.cstrike.app') return
      const { type, data } = e.data
      if (type === 'ready' || type === 'rendered') setEstado('ok')
      if (type === 'unsupported' || type === 'error') setEstado('falhou')
      if ((type === 'change' || type === 'state') && data?.item) {
        mudarRef.current(viewerParaItem(data.item, m))
        estadoRef.current?.({ selection: data.selection, activeSticker: data.activeSticker, schemaCount: data.schemaCount, keychainDefault: data.keychainDefault })
      }
    }
    window.addEventListener('message', ouvir)
    // o visualizador não respondeu (sem internet, bloqueado): cai para a visão 2D
    const prazo = setTimeout(() => setEstado((e) => (e === 'carregando' ? 'falhou' : e)), 20000)
    return () => {
      window.removeEventListener('message', ouvir)
      clearTimeout(prazo)
      if (controle) controle.current = null
    }
  }, [m, controle])

  useEffect(() => {
    if (estado === 'falhou') aoFalhar?.()
  }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  if (estado === 'falhou') return null
  return (
    <div className="inv-3d" style={{ height: altura }}>
      <iframe ref={ref} title={t('Visualização 3D')} src={inicial.current} allow="fullscreen" />
      {estado === 'carregando' && <span className="inv-3d-carregando">{t('Carregando o 3D…')}</span>}
    </div>
  )
}

// ── Tela cheia (igual a "Colar adesivo" / "Prender chaveiro" do inventário do jogo): o 3D grande no meio ──
function TelaInteira({ titulo, subtitulo, aviso, aoFechar, confirmar, rotuloConfirmar, lateral, children }) {
  const t = useT()
  useEffect(() => {
    tocar('abrir')
    return () => tocar('fechar')
  }, [])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="inv-tela" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="inv-tela-cab">
        <h2>{titulo}</h2>
        <p>{subtitulo}</p>
        {aviso && (
          <p className="inv-tela-aviso">
            <i aria-hidden="true">i</i>
            {aviso}
          </p>
        )}
      </header>
      <div className="inv-tela-corpo">
        {lateral && <aside className="inv-tela-lateral">{lateral}</aside>}
        <div className="inv-tela-centro">
        <div className="inv-dicas" aria-hidden="true">
          <span><b>{t('Clique e arraste')}</b> {t('no adesivo ou chaveiro para mover')}</span>
          <span><b>{t('Botão direito')}</b> {t('gira a arma')}</span>
          <span><b>{t('Roda do mouse')}</b> {t('aproxima')}</span>
        </div>
        {children}
      </div>
      </div>
      <footer className="inv-tela-rodape">
        <button type="button" className="inv-btn-verde" onClick={confirmar}>
          {rotuloConfirmar}
        </button>
        <button type="button" className="inv-btn-fechar" onClick={aoFechar}>
          {t('FECHAR')}
        </button>
      </footer>
    </div>
  )
}

// ── Colar adesivo ──
function TelaAdesivos({ item, d, m, adesivos, aoColar, aoFechar }) {
  const t = useT()
  const controle = useRef(null)
  const [loc, setLoc] = useState({ a: item.a || [null, null, null, null, null], k: item.k || null })
  const [viewer, setViewer] = useState({ activeSticker: null, schemaCount: 4 })
  const [escolhendo, setEscolhendo] = useState(false)
  const [sem3d, setSem3d] = useState(false)
  const porId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const tem3d = !!m && idNo3d(item, m) !== undefined && !sem3d
  const enviar = (tipo, dados) => controle.current?.enviar(tipo, dados)
  const slotAtivo = viewer.activeSticker ?? [0, 1, 2, 3, 4].find((k) => loc.a[k]) ?? null
  const ad = slotAtivo != null ? loc.a[slotAtivo] : null
  const usados = loc.a.filter(Boolean).length
  const livres = Array.from({ length: viewer.schemaCount || 4 }, (_, k) => k).filter((k) => !loc.a.some((s) => s && s.s === k))
  const mudar2D = (k, parte) => setLoc((l) => ({ ...l, a: l.a.map((s, j) => (j === k ? { i: 0, s: 0, r: 0, w: 0, ...(s || {}), ...parte } : s)) }))

  const adicionar = (def) => {
    if (tem3d) enviar('addSticker', { id: m.adesivos.paraLib.get(def), schema: livres[0] ?? 0 })
    else {
      const k = loc.a.findIndex((s) => !s)
      if (k >= 0) mudar2D(k, { i: def, s: k })
    }
  }
  const remover = (k) => (tem3d ? enviar('removeSticker', { index: k }) : setLoc((l) => ({ ...l, a: l.a.map((s, j) => (j === k ? null : s)) })))
  const mexer = (k, campo, valor) => {
    if (!tem3d) return mudar2D(k, { [campo]: valor })
    if (campo === 'x' || campo === 'y') enviar('setStickerOffset', { index: k, x: campo === 'x' ? valor : loc.a[k].x ?? 0, y: campo === 'y' ? valor : loc.a[k].y ?? 0 })
    else if (campo === 'r') enviar('setStickerRotation', { index: k, rotation: valor })
    else enviar('setStickerWear', { index: k, wear: valor })
  }

  return (
    <TelaInteira
      titulo={t('Colar adesivo')}
      subtitulo={
        <>
          {t('Usar em')} <b>{d.titulo}</b>
          {d.subtitulo ? <b> | {d.subtitulo}</b> : null}
        </>
      }
      aviso={t('Arraste o adesivo na arma, gire com o botão direito do mouse e use a roda para aproximar.')}
      aoFechar={aoFechar}
      confirmar={() => aoColar({ a: loc.a, k: loc.k })}
      rotuloConfirmar={t('COLAR ADESIVO')}
      lateral={
        <div className="inv-painel">
          <b className="inv-painel-titulo">{t('Adesivos')}</b>
          <ul>
            {loc.a.map((s, k) => {
              const st = s?.i ? porId.get(s.i) : null
              if (!st) return null
              return (
                <li key={k} className={k === slotAtivo ? 'is-ativo' : ''}>
                  <button type="button" className="inv-painel-item" onClick={() => tem3d && enviar('setActiveSticker', { index: k })}>
                    <Imagem src={urlImg(st[2], 128)} />
                    <span>{st[1]}</span>
                  </button>
                  <button type="button" className="inv-lixo" onClick={() => remover(k)} aria-label={t('Tirar adesivo')} title={t('Tirar adesivo')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
          {usados < (viewer.schemaCount || 5) && (
            <button type="button" className="inv-btn" onClick={() => setEscolhendo(true)}>
              + {t('Adicionar adesivo')}
            </button>
          )}
          {ad?.i > 0 && (
            <div className="inv-posicao">
              <label className="inv-campo">
                <span>{t('Posição horizontal')}</span>
                <input type="range" min="-0.8" max="0.8" step="0.005" value={ad.x ?? 0} onChange={(e) => mexer(slotAtivo, 'x', Number(e.target.value))} />
              </label>
              <label className="inv-campo">
                <span>{t('Posição vertical')}</span>
                <input type="range" min="-0.4" max="0.4" step="0.005" value={ad.y ?? 0} onChange={(e) => mexer(slotAtivo, 'y', Number(e.target.value))} />
              </label>
              <label className="inv-campo">
                <span>{t('Rotação')}</span>
                <input type="range" min="0" max="360" step="1" value={ad.r ?? 0} onChange={(e) => mexer(slotAtivo, 'r', Number(e.target.value))} />
              </label>
              <label className="inv-campo">
                <span>{t('Desgaste do adesivo')}</span>
                <input type="range" min="0" max="1" step="0.01" value={ad.w ?? 0} onChange={(e) => mexer(slotAtivo, 'w', Number(e.target.value))} />
              </label>
            </div>
          )}
        </div>
      }
    >
      {tem3d ? (
        <Visualizador3D item={{ ...item, a: loc.a, k: loc.k }} m={m} aoMudar={(p) => setLoc((l) => ({ ...l, a: p.a, k: p.k }))} aoEstado={setViewer} aoFalhar={() => setSem3d(true)} controle={controle} altura="100%" />
      ) : (
        <div className="inv-previa-img inv-previa-grande">
          <ArmaComEnfeites item={{ ...item, a: loc.a, k: loc.k }} d={d} adesivos={porId} chaveiros={new Map()} />
        </div>
      )}
      {escolhendo && (
        <SeletorAdesivo
          aoFechar={() => setEscolhendo(false)}
          aoEscolher={(def) => {
            adicionar(def)
            setEscolhendo(false)
          }}
        />
      )}
    </TelaInteira>
  )
}

// ── Prender chaveiro ──
function TelaChaveiro({ item, d, m, chaveiros, aoPrender, aoFechar }) {
  const t = useT()
  const controle = useRef(null)
  const [loc, setLoc] = useState({ a: item.a || [null, null, null, null, null], k: item.k || null })
  const [viewer, setViewer] = useState({ keychainDefault: null })
  const [escolhendo, setEscolhendo] = useState(false)
  const [sem3d, setSem3d] = useState(false)
  const porId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])
  const tem3d = !!m && idNo3d(item, m) !== undefined && !sem3d
  const enviar = (tipo, dados) => controle.current?.enviar(tipo, dados)
  const ch = loc.k?.i ? porId.get(loc.k.i) : null
  const pos = (eixo) => loc.k?.[eixo] ?? viewer.keychainDefault?.[eixo] ?? 0
  const trocar = (def) => (tem3d ? enviar('setKeychain', { index: 0, id: m.chaveiros.paraLib.get(def) }) : setLoc((l) => ({ ...l, k: { i: def, s: 0 } })))
  const tirar = () => (tem3d ? enviar('removeKeychain', { index: 0 }) : setLoc((l) => ({ ...l, k: null })))
  const mover = (parte) => {
    const novo = { x: pos('x'), y: pos('y'), z: pos('z'), ...parte }
    if (tem3d) enviar('setKeychainPosition', { index: 0, ...novo })
    else setLoc((l) => ({ ...l, k: { ...(l.k || {}), ...parte } }))
  }
  return (
    <TelaInteira
      titulo={t('Prender chaveiro')}
      subtitulo={
        <>
          {t('Usar em')} <b>{d.titulo}</b>
          {d.subtitulo ? <b> | {d.subtitulo}</b> : null}
        </>
      }
      aviso={t('Arraste o chaveiro na arma para escolher onde ele fica.')}
      aoFechar={aoFechar}
      confirmar={() => aoPrender({ a: loc.a, k: loc.k })}
      rotuloConfirmar={t('PRENDER CHAVEIRO')}
      lateral={
        <div className="inv-painel">
          <b className="inv-painel-titulo">{t('Chaveiros')}</b>
          <ul>
            <li>
              <button type="button" className="inv-painel-item" onClick={() => setEscolhendo(true)}>
                {ch ? <Imagem src={urlImg(ch[2], 128)} /> : <span className="inv-nd">N/D</span>}
                <span>{ch ? ch[1] : t('Escolher chaveiro')}</span>
              </button>
              {ch && (
                <button type="button" className="inv-lixo" onClick={tirar} aria-label={t('Tirar chaveiro')} title={t('Tirar chaveiro')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
                  </svg>
                </button>
              )}
            </li>
          </ul>
          {ch && (
            <div className="inv-posicao">
              {[
                ['x', 'Posição horizontal', -2, 10],
                ['y', 'Posição vertical', -1, 21],
                ['z', 'Profundidade', -2, 5],
              ].map(([eixo, rotulo, mn, mx]) => (
                <label key={eixo} className="inv-campo">
                  <span>{t(rotulo)}</span>
                  <input type="range" min={mn} max={mx} step="0.05" value={pos(eixo)} onChange={(e) => mover({ [eixo]: Number(e.target.value) })} />
                </label>
              ))}
              <label className="inv-campo">
                <span>{t('Padrão do chaveiro (seed)')}</span>
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  value={loc.k?.s ?? 0}
                  onChange={(e) => {
                    const s = Math.min(100000, Math.max(0, Math.trunc(Number(e.target.value) || 0)))
                    if (tem3d) enviar('setKeychainSeed', { index: 0, seed: s })
                    else setLoc((l) => ({ ...l, k: { ...(l.k || {}), s } }))
                  }}
                />
              </label>
            </div>
          )}
        </div>
      }
    >
      {tem3d ? (
        <Visualizador3D item={{ ...item, a: loc.a, k: loc.k }} m={m} aoMudar={(p) => setLoc((l) => ({ ...l, a: p.a, k: p.k }))} aoEstado={setViewer} aoFalhar={() => setSem3d(true)} controle={controle} altura="100%" />
      ) : (
        <div className="inv-previa-img inv-previa-grande">
          <ArmaComEnfeites item={{ ...item, a: loc.a, k: loc.k }} d={d} adesivos={new Map()} chaveiros={porId} />
        </div>
      )}
      {escolhendo && (
        <SeletorAdesivo
          catalogo="chaveiros"
          aoFechar={() => setEscolhendo(false)}
          aoEscolher={(def) => {
            trocar(def)
            setEscolhendo(false)
          }}
        />
      )}
    </TelaInteira>
  )
}

// ── Confirmar criação / Editar item (compacto, igual ao do inventário do jogo): o 3D à esquerda e os ajustes à direita ──
// Trabalha numa cópia: CANCELAR descarta e CRIAR/SALVAR grava no inventário.
function DialogoItem({ inicial, modo, idx, adesivos, chaveiros, mapa, aoConfirmar, aoFechar }) {
  const t = useT()
  const [rasc, setRasc] = useState(inicial)
  const [tela, setTela] = useState('') // '' | 'adesivos' | 'chaveiro'
  const [versao, setVersao] = useState(0) // muda quando volta de uma tela cheia: o 3D recarrega com o que foi colado
  const controle = useRef(null)
  const m = useMapas3d(mapa)
  const d = descrever(rasc, idx)
  const skin = d.skin
  const porId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])
  const tem3d = !!m && idNo3d(rasc, m) !== undefined
  const [sem3d, setSem3d] = useState(false)
  const temSkin = rasc.t !== 'agente' && skin
  const [min, max] = skin ? [skin[3], skin[4]] : [0, 1]
  const f = Math.min(max, Math.max(min, rasc.f ?? min))
  const mudar = (p) => setRasc((r) => ({ ...r, ...p }))
  const enviar = (tipo, dados) => controle.current?.enviar(tipo, dados)
  const comEnfeites = rasc.t === 'arma'
  const mudarSeed = (s) => {
    mudar({ s })
    enviar('setSeed', { seed: s })
  }
  const mudarDesgaste = (w) => {
    mudar({ f: w })
    enviar('setWear', { wear: w })
  }
  const aleatorio = (a, b) => a + Math.random() * (b - a)
  const slider = (valor, mn, mx, passo) => ({ min: mn, max: mx, step: passo, value: valor })

  return (
    <Janela titulo={modo === 'criar' ? t('Confirmar criação') : t('Editar item')} aoFechar={aoFechar} largura="media">
      <div className="inv-dialogo">
        <div className="inv-dialogo-previa">
          {tem3d && !sem3d ? (
            <Visualizador3D key={versao} item={rasc} m={m} aoMudar={() => {}} aoFalhar={() => setSem3d(true)} controle={controle} altura={230} />
          ) : (
            <div className="inv-previa-img" style={{ '--cor': d.cor || 'var(--border-2)' }}>
              <ArmaComEnfeites item={rasc} d={d} adesivos={porId} chaveiros={chaveirosPorId} />
            </div>
          )}
          <div className="inv-dialogo-nome">
            <small>{d.titulo}</small>
            <b style={{ color: d.cor || 'inherit' }}>{d.subtitulo}</b>
          </div>
        </div>

        <div className="inv-dialogo-form">
          {comEnfeites && (
            <>
              <div className="inv-bloco">
                <b>{t('Adesivos')}</b>
                <div className="inv-slots inv-slots-5">
                  {[0, 1, 2, 3, 4].map((k) => {
                    const s = rasc.a?.[k]
                    const st = s?.i ? porId.get(s.i) : null
                    return (
                      <button key={k} type="button" className="inv-slot" onClick={() => setTela('adesivos')} title={st ? st[1] : t('Colar adesivo')}>
                        {st ? <Imagem src={urlImg(st[2], 128)} /> : <span className="inv-nd">N/D</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="inv-bloco">
                <b>{t('Chaveiros')}</b>
                <div className="inv-slots">
                  <button type="button" className="inv-slot inv-slot-chaveiro" onClick={() => setTela('chaveiro')} title={t('Prender chaveiro')}>
                    {rasc.k?.i ? <Imagem src={urlImg(chaveirosPorId.get(rasc.k.i)?.[2], 128)} /> : <span className="inv-nd">N/D</span>}
                  </button>
                </div>
              </div>
            </>
          )}
          {(rasc.t === 'arma' || rasc.t === 'faca') && (
            <label className="inv-linha">
              <b>{t('Etiqueta de Nome')}</b>
              <input type="text" maxLength={20} placeholder={t('Digite um nome...')} value={rasc.n || ''} onChange={(e) => mudar({ n: e.target.value })} />
            </label>
          )}
          {temSkin && (
            <>
              <div className="inv-linha">
                <b>{t('Padrão')}</b>
                <input type="number" min="0" max="1000" step="1" value={rasc.s ?? 0} onChange={(e) => mudarSeed(Math.min(1000, Math.max(0, Math.trunc(Number(e.target.value) || 0))))} />
                <input type="range" {...slider(rasc.s ?? 0, 0, 1000, 1)} onChange={(e) => mudarSeed(Number(e.target.value))} aria-label={t('Padrão')} />
                <button type="button" className="inv-dado" onClick={() => mudarSeed(Math.floor(aleatorio(0, 1000)))} title={t('Aleatório')} aria-label={t('Aleatório')}>
                  ⤮
                </button>
              </div>
              <div className="inv-linha">
                <b>{t('Desgaste')}</b>
                <input type="number" min={min} max={max} step="0.0001" value={Number(f.toFixed(6))} onChange={(e) => mudarDesgaste(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
                <input type="range" {...slider(f, min, max, 0.0001)} onChange={(e) => mudarDesgaste(Number(e.target.value))} aria-label={t('Desgaste')} />
                <button type="button" className="inv-dado" onClick={() => mudarDesgaste(Number(aleatorio(min, max).toFixed(6)))} title={t('Aleatório')} aria-label={t('Aleatório')}>
                  ⤮
                </button>
              </div>
              {skin[5] === 1 && (
                <label className="inv-linha inv-linha-st">
                  <b>StatTrak™</b>
                  <span className="inv-st-txt">{rasc.st ? t('Sim') : t('Não')}</span>
                  <button type="button" role="switch" aria-checked={!!rasc.st} className={`inv-chave${rasc.st ? ' is-on' : ''}`} onClick={() => mudar({ st: rasc.st ? 0 : 1 })} />
                </label>
              )}
            </>
          )}
          <button type="button" className="inv-reset" onClick={() => { setRasc(inicial); setVersao((v) => v + 1) }} title={t('Voltar ao original')} aria-label={t('Voltar ao original')}>
            ↺
          </button>
        </div>
      </div>
      <div className="inv-dialogo-rodape">
        <button type="button" className="inv-btn-fechar" onClick={aoFechar}>
          {t('CANCELAR')}
        </button>
        <button type="button" className="inv-btn-verde" onClick={() => aoConfirmar(rasc)}>
          {modo === 'criar' ? t('CRIAR') : t('SALVAR')}
        </button>
      </div>

      {tela === 'adesivos' && (
        <TelaAdesivos
          item={rasc}
          d={d}
          m={m}
          adesivos={adesivos}
          aoFechar={() => setTela('')}
          aoColar={(p) => {
            tocar('criado')
            mudar(p)
            setTela('')
            setVersao((v) => v + 1)
          }}
        />
      )}
      {tela === 'chaveiro' && (
        <TelaChaveiro
          item={rasc}
          d={d}
          m={m}
          chaveiros={chaveiros}
          aoFechar={() => setTela('')}
          aoPrender={(p) => {
            tocar('criado')
            mudar(p)
            setTela('')
            setVersao((v) => v + 1)
          }}
        />
      )}
    </Janela>
  )
}

// ── Inspecionar: o 3D do visualizador (gira com o mouse); sem ele, a imagem 2D que acompanha o mouse ──
function Inspecionar({ item, idx, adesivos, chaveiros, mapa, aoFechar }) {
  const t = useT()
  const d = descrever(item, idx)
  const m = useMapas3d(mapa)
  const tem3d = !!m && idNo3d(item, m) !== undefined
  const [giro, setGiro] = useState({ x: 0, y: 0 })
  const porId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setGiro({ x: ((e.clientY - r.top) / r.height - 0.5) * -14, y: ((e.clientX - r.left) / r.width - 0.5) * 22 })
  }
  const [falhou3d, setFalhou3d] = useState(false)
  return (
    <Janela titulo={t('Inspecionar')} aoFechar={aoFechar} largura="grande">
      <div className="inv-inspecao" onPointerMove={tem3d && !falhou3d ? undefined : mover} onPointerLeave={() => setGiro({ x: 0, y: 0 })}>
        {tem3d && !falhou3d ? (
          <div className="inv-inspecao-3d">
            <Visualizador3D item={item} m={m} aoMudar={() => {}} aoFalhar={() => setFalhou3d(true)} altura={520} />
          </div>
        ) : (
          <div className="inv-inspecao-arma" style={{ '--cor': d.cor || 'var(--border-2)', transform: `perspective(900px) rotateX(${giro.x}deg) rotateY(${giro.y}deg)` }}>
            <ArmaComEnfeites item={item} d={d} adesivos={porId} chaveiros={chaveirosPorId} />
          </div>
        )}
        <div className="inv-inspecao-info">
          <b>{d.titulo}</b>
          <span>{d.subtitulo}</span>
          {d.skin && (
            <small>
              {t(nomeDoDesgaste(Number(item.f)))} · {t('Desgaste')}: {Number(item.f).toFixed(4)} · Seed {item.s}
              {item.st ? ' · StatTrak™' : ''}
            </small>
          )}
          {item.n && <small>«{item.n}»</small>}
        </div>
      </div>
    </Janela>
  )
}

// ── Menu do botão direito ──
// Só aparece o time em que o item existe no jogo (AK-47 e Glock só no TR; M4 e USP-S só no CT; agente do CT só no CT...)
function MenuContexto({ x, y, item, times, equip, aoEquipar, aoEquiparAmbos, aoDesequipar, aoEditar, aoInspecionar, podeEditar, aoFechar }) {
  const t = useT()
  const ref = useRef(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const fora = (e) => !ref.current?.contains(e.target) && aoFechar()
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', aoFechar, true)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', aoFechar, true)
    }
  }, [aoFechar])
  useEffect(() => {
    // não deixa o menu sair da tela
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) })
  }, [x, y])
  const chave = chaveEquip(item)
  return (
    <ul className="inv-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {times.length === 2 && !(equip.ct?.[chave] === item.__id && equip.tr?.[chave] === item.__id) && (
        <li>
          <button type="button" role="menuitem" onClick={aoEquiparAmbos}>
            <span className="inv-marcas-duas">
              <Marca lado="ct" />
              <Marca lado="tr" />
            </span>
            {t('Equipar nos dois times')}
          </button>
        </li>
      )}
      {LADOS_TIME.filter(([lado]) => times.includes(lado)).map(([lado, nome]) => {
        const equipado = equip[lado]?.[chave] === item.__id
        return (
          <li key={lado}>
            <button type="button" role="menuitem" onClick={() => (equipado ? aoDesequipar(lado) : aoEquipar(lado))}>
              <Marca lado={lado} />
              {equipado ? t('Tirar do {time}', { time: nome }) : t('Equipar no {time}', { time: nome })}
            </button>
          </li>
        )
      })}
      <li className="inv-menu-sep" />
      {item.t !== 'agente' && !podeEditar && (
        <li>
          <span className="inv-menu-aviso">{t('Editar (desgaste, adesivos, chaveiro) só no computador')}</span>
        </li>
      )}
      {item.t !== 'agente' && podeEditar && (
        <li>
          <button type="button" role="menuitem" onClick={aoEditar}>
            {item.t === 'arma' ? t('Editar (desgaste, adesivos, chaveiro…)') : t('Editar (desgaste, seed…)')}
          </button>
        </li>
      )}
      <li>
        <button type="button" role="menuitem" onClick={aoInspecionar}>
          {t('Inspecionar')}
        </button>
      </li>
    </ul>
  )
}

// Celular e tablet (até 1024 px): a edição (3D, adesivos, chaveiro) só funciona bem no computador
function useTelaPequena() {
  const [pequena, setPequena] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 1024px)')
    const ler = () => setPequena(q.matches)
    ler()
    q.addEventListener('change', ler)
    return () => q.removeEventListener('change', ler)
  }, [])
  return pequena
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const [inv, setInv] = useState(null)
  const salvo = useRef('')
  const [aba, setAba] = useState('tudo')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('equipado')
  const [estado, setEstado] = useState('') // '' | 'salvando' | 'salvo' | 'erro'
  const [erroCarga, setErroCarga] = useState(false)
  const [menu, setMenu] = useState(null) // { x, y, id }
  const [janela, setJanela] = useState(null) // { tipo: 'criar'|'editar'|'inspecionar', id? }
  const catalogo = useCatalogo('armas')
  const agentes = useCatalogo('agentes')
  const pequena = useTelaPequena() // celular/tablet: dá para equipar e inspecionar, mas não editar
  useEffect(() => {
    const clique = (e) => {
      const alvo = e.target.closest?.('button, select')
      if (!alvo || alvo.closest('.inv-3d')) return
      if (alvo.closest('.inv-abas')) tocar('aba')
      else if (alvo.closest('.inv-cartao')) tocar('item')
      else if (alvo.tagName === 'SELECT') tocar('selecionar')
      else if (!alvo.closest('.inv-menu') && !alvo.closest('.inv-fechar')) tocar('botao')
    }
    const sobre = (e) => {
      const c = e.target.closest?.('.inv-cartao')
      if (c && !c.contains(e.relatedTarget)) tocar('hover')
    }
    document.addEventListener('pointerdown', clique)
    document.addEventListener('pointerover', sobre)
    return () => {
      document.removeEventListener('pointerdown', clique)
      document.removeEventListener('pointerover', sobre)
    }
  }, [])
  const precisaAdesivos = janela?.tipo === 'editar' || janela?.tipo === 'confirmar' || janela?.tipo === 'inspecionar' || (!!inv && Object.values(inv.itens).some((it) => it.a?.some(Boolean) || it.k?.i))
  const adesivos = useCatalogo('adesivos', precisaAdesivos)
  const chaveiros = useCatalogo('chaveiros', precisaAdesivos)
  const mapa3d = useCatalogo('mapa3d', janela?.tipo === 'editar' || janela?.tipo === 'inspecionar' || janela?.tipo === 'confirmar')

  useEffect(() => {
    if (!conta?.id) return
    let vivo = true
    lerInventario().then(
      (d) => {
        if (!vivo) return
        const base = { ...inventarioNovo(), ...d }
        salvo.current = JSON.stringify(base)
        setInv(base)
      },
      () => vivo && setErroCarga(true),
    )
    return () => {
      vivo = false
    }
  }, [conta?.id])

  // Salva sozinho (um instante depois da última mudança)
  useEffect(() => {
    if (!inv) return
    const atual = JSON.stringify(inv)
    if (atual === salvo.current) return
    setEstado('salvando')
    const id = setTimeout(async () => {
      try {
        const d = await salvarInventario(inv)
        salvo.current = JSON.stringify({ ...inventarioNovo(), ...d })
        setEstado(JSON.stringify(inv) === salvo.current ? 'salvo' : 'salvando')
      } catch {
        setEstado('erro')
      }
    }, 800)
    return () => clearTimeout(id)
  }, [inv])

  const idx = useMemo(() => indicar(catalogo.dados?.armas, agentes.dados), [catalogo.dados, agentes.dados])
  const adesivosPorId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])

  const itens = useMemo(() => {
    if (!inv) return []
    const q = busca.trim().toLowerCase()
    const lista = Object.entries(inv.itens)
      .map(([id, it]) => ({ ...it, __id: id }))
      .filter((it) => it.t !== 'agente') // agentes: bloqueados no servidor
      .filter((it) => aba === 'tudo' || it.t === aba)
      .filter((it) => {
        if (!q) return true
        const d = descrever(it, idx)
        return `${d.titulo} ${d.subtitulo} ${it.n || ''}`.toLowerCase().includes(q)
      })
    const equipado = (it) => (inv.equip.ct[chaveEquip(it)] === it.__id ? 1 : 0) + (inv.equip.tr[chaveEquip(it)] === it.__id ? 1 : 0)
    const nome = (it) => descrever(it, idx).titulo
    lista.sort((a, b) => {
      if (ordem === 'equipado') return equipado(b) - equipado(a) || nome(a).localeCompare(nome(b))
      if (ordem === 'recente') return (inv.criado[b.__id] || 0) - (inv.criado[a.__id] || 0)
      return nome(a).localeCompare(nome(b))
    })
    return lista
  }, [inv, aba, busca, ordem, idx])

  const mudar = useCallback((f) => setInv((i) => f(i)), [])
  const mudarItem = (id, parte) => mudar((i) => ({ ...i, itens: { ...i.itens, [id]: { ...i.itens[id], ...parte } } }))
  const equipar = (id, lado) => {
    tocar('equipar')
    mudar((i) => {
      const chave = chaveEquip(i.itens[id])
      return { ...i, equip: { ...i.equip, [lado]: { ...i.equip[lado], [chave]: id } } }
    })
  }
  const desequipar = (id, lado) => {
    tocar('equipar')
    mudar((i) => {
      const chave = chaveEquip(i.itens[id])
      const novo = { ...i.equip[lado] }
      if (novo[chave] === id) delete novo[chave]
      return { ...i, equip: { ...i.equip, [lado]: novo } }
    })
  }
  const abrirMenu = (e, item) => {
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, id: item.__id })
  }
  const fecharMenu = useCallback(() => setMenu(null), [])

  if (!loginAtivo() || !conta)
    return (
      <div className="inv-bloqueio" role="status">
        <h1>{t('Inventário de skins')}</h1>
        <p>{t('Entre com a Steam para escolher as skins que vão aparecer para você no servidor.')}</p>
        {loginAtivo() && (
          <button type="button" className="inv-btn inv-btn-p" onClick={entrar}>
            {t('Entrar com a Steam')}
          </button>
        )}
      </div>
    )
  if (erroCarga) return <p className="inv-dica">{t('Não consegui carregar o seu inventário. Tente de novo mais tarde.')}</p>
  if (!inv || !catalogo.dados) return <p className="inv-dica">{catalogo.erro ? t('Não consegui carregar o catálogo de skins.') : t('Carregando…')}</p>

  const itemMenu = menu ? { ...inv.itens[menu.id], __id: menu.id } : null
  const itemJanela = janela?.id && inv.itens[janela.id] ? { ...inv.itens[janela.id], __id: janela.id } : null
  const total = Object.values(inv.itens).filter((it) => it.t !== 'agente').length
  return (
    <>
      <div className="inv-topo">
        <nav className="inv-abas" role="tablist">
          {ABAS.map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
              {t(nome)}
            </button>
          ))}
        </nav>
      </div>

      {pequena && <p className="inv-aviso-mobile">{t('No celular dá para equipar e inspecionar. Para editar (desgaste, adesivos e chaveiro), abra o site no computador.')}</p>}

      <div className="inv-barra">
        <label className="inv-pesquisa">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" placeholder={t('Pesquisar no inventário')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <span className="inv-estado" aria-live="polite">
          {estado === 'salvando' && t('Salvando…')}
          {estado === 'salvo' && <b className="inv-ok">{t('Salvo!')}</b>}
          {estado === 'erro' && <b className="inv-erro">{t('Não deu para salvar. Tentando de novo ao mudar algo.')}</b>}
        </span>
        <span className="inv-total">{t('{n} itens', { n: total })}</span>
        <select className="inv-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label={t('Ordenar')}>
          {ORDENS.map(([id, nome]) => (
            <option key={id} value={id}>
              {t(nome)}
            </option>
          ))}
        </select>
      </div>

      {total === 0 ? (
        <div className="inv-vazio">
          <p>{t('Seu inventário está vazio. As skins são entregues pelo dono do servidor: quando você receber uma, ela aparece aqui e um aviso no meio da tela.')}</p>
        </div>
      ) : (
        <ul className="inv-itens">
          {itens.map((it) => (
            <Cartao key={it.__id} item={it} idx={idx} adesivos={adesivosPorId} chaveiros={chaveirosPorId} equip={inv.equip} aoAbrirMenu={abrirMenu} />
          ))}
          {!itens.length && <li className="inv-nada">{t('Nenhum item encontrado.')}</li>}
        </ul>
      )}

      {menu && itemMenu && (
        <MenuContexto
          x={menu.x}
          y={menu.y}
          item={itemMenu}
          times={descrever(itemMenu, idx).times}
          equip={inv.equip}
          aoFechar={fecharMenu}
          aoEquipar={(l) => { equipar(menu.id, l); fecharMenu() }}
          aoEquiparAmbos={() => { equipar(menu.id, 'ct'); equipar(menu.id, 'tr'); fecharMenu() }}
          aoDesequipar={(l) => { desequipar(menu.id, l); fecharMenu() }}
          podeEditar={!pequena}
          aoEditar={() => { setJanela({ tipo: 'editar', id: menu.id }); fecharMenu() }}
          aoInspecionar={() => { setJanela({ tipo: 'inspecionar', id: menu.id }); fecharMenu() }}
        />
      )}
      {janela?.tipo === 'editar' && itemJanela && !pequena && (
        <DialogoItem
          inicial={itemJanela}
          modo="editar"
          idx={idx}
          adesivos={adesivos}
          chaveiros={chaveiros}
          mapa={mapa3d.dados}
          aoConfirmar={(r) => {
            tocar('criado')
            const { __id, ...limpo } = r
            mudar((i) => ({ ...i, itens: { ...i.itens, [janela.id]: limpo } }))
            setJanela(null)
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'inspecionar' && itemJanela && <Inspecionar item={itemJanela} idx={idx} adesivos={adesivos} chaveiros={chaveiros} mapa={mapa3d.dados} aoFechar={() => setJanela(null)} />}
    </>
  )
}

export default function Inventario() {
  return (
    <Layout pagina="inventario">
      <main className="inv-pagina">
        <div className="wrap inv-wrap">
          <Conteudo />
        </div>
      </main>
    </Layout>
  )
}
