// Janela "Inspecionar" de um item (arma, faca ou luva): o 3D do visualizador (gira com o mouse/dedo) ou, sem ele, a imagem 2D com adesivos e chaveiro,
// mais nome, desgaste (float), pattern (seed) e StatTrak. É a MESMA do inventário (/inventario/) e agora também do mercado, das trocas e do
// "Ver inventário" do perfil: quem não tem o inventário aberto usa <InspecionarSkin item={...} aoFechar={...} /> ou <BotaoInspecionar item={...} />,
// que carregam os catálogos sozinhos.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SeloPadrao, nomeDoDesgaste } from './CartaoSkin.jsx'
import { CONFIG } from './config.js'
import { useT } from './i18n.js'
import { acabamentoDoAdesivo, corEnfeite, descrever, indicar, urlImg, useCatalogo } from './skins.js'
import { raridadeCsDaCor } from '../../worker/steam-login/src/loja-core.js'
import { tocar } from './somInventario.js'
import './inspecionar.css'

function Imagem({ src, alt = '', classe = '' }) {
  const [erro, setErro] = useState(false)
  return src && !erro ? <img className={classe} src={src} alt={alt} loading="lazy" onError={() => setErro(true)} /> : <span className={`inv-sem-img ${classe}`} aria-hidden="true" />
}

// Janela (a mesma do inventário): fundo escuro, trava a rolagem da página de trás e fecha com Esc ou clicando fora
function JanelaInspecao({ titulo, aoFechar, largura = 'grande', classe = '', children }) {
  const t = useT()
  useEffect(() => {
    tocar('abrir')
    document.documentElement.classList.add('inv-travado')
    return () => {
      tocar('fechar')
      document.documentElement.classList.remove('inv-travado')
    }
  }, [])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="inv-fundo inv-fundo-insp" onClick={aoFechar}>
      <div className={`inv-janela inv-janela-${largura} ${classe}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="inv-janela-cab">
          <h2>{titulo}</h2>
          <button type="button" className="inv-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <div className="inv-janela-corpo">{children}</div>
      </div>
    </div>
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

export function ArmaComEnfeites({ item, d, adesivos, chaveiros, classe = '' }) {
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

// ── Visualizador 3D (3d.cstrike.app) ──
// Serviço público de visualização do Inventory Simulator (Ian Lucas), feito para ser embutido: a página conversa com ele por postMessage
// (protocolo v1). Dentro dele dá para girar a arma e arrastar adesivos e chaveiro; cada mudança volta para cá no evento "change".
// O visualizador identifica os itens pelo id da biblioteca cs2-lib; mapa3d.json (ferramentas/skins/gerar-catalogo.mjs) liga ao id do jogo.
const ORIGEM_3D = 'https://3d.cstrike.app'

export function useMapas3d(mapa) {
  return useMemo(() => {
    if (!mapa) return null
    const par = (pares) => ({ paraLib: new Map(pares), paraJogo: new Map(pares.map(([d, id]) => [id, d])) })
    return { skins: mapa.skins, base: mapa.base, adesivos: par(mapa.adesivos), chaveiros: par(mapa.chaveiros), agentes: par(mapa.agentes) }
  }, [mapa])
}

// id do item no visualizador (undefined se não existir 3D para ele)
export function idNo3d(item, m) {
  if (!m) return undefined
  if (item.t === 'agente') return m.agentes.paraLib.get(item.d)
  return item.p ? m.skins[`${item.d}:${item.p}`] : m.base[item.d]
}

export function itemParaViewer(item, m) {
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
export function viewerParaItem(v, m) {
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
export function Visualizador3D({ item, m, aoMudar, aoEstado, aoFalhar, controle, altura = 440 }) {
  const t = useT()
  const ref = useRef(null)
  const inicial = useRef(null)
  const [estado, setEstado] = useState('carregando') // 'carregando' | 'ok' | 'falhou'
  if (!inicial.current) inicial.current = `${ORIGEM_3D}/view?item=${encodeURIComponent(JSON.stringify(itemParaViewer(item, m)))}${CONFIG.chave3d ? `&key=${encodeURIComponent(CONFIG.chave3d)}` : ''}`
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

// ── Inspecionar: o 3D do visualizador (gira com o mouse); sem ele, a imagem 2D que acompanha o mouse ──
export function Inspecionar({ item, idx, adesivos, chaveiros, mapa, aoFechar }) {
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
  const pequena = useTelaPequena()
  return (
    <JanelaInspecao titulo={t('Inspecionar')} aoFechar={aoFechar} largura="grande" classe="inv-janela-insp">
      <div className="inv-inspecao" onPointerMove={tem3d && !falhou3d ? undefined : mover} onPointerLeave={() => setGiro({ x: 0, y: 0 })}>
        {tem3d && !falhou3d ? (
          <div className="inv-inspecao-3d">
            <Visualizador3D item={item} m={m} aoMudar={() => {}} aoFalhar={() => setFalhou3d(true)} altura={pequena ? 'min(52dvh, 400px)' : 520} />
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
          <SeloPadrao item={item} classe="inv-gema-info" />
        </div>
      </div>
    </JanelaInspecao>
  )
}

// Celular e tablet (até 1024 px): a edição (3D, adesivos, chaveiro) só funciona bem no computador
export function useTelaPequena() {
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


// Adesivo ou chaveiro (não existe 3D para eles): a imagem grande, que inclina para onde o mouse/dedo vai, com nome, tipo e raridade
function InspecionarEnfeite({ item, aoFechar }) {
  const t = useT()
  const catalogo = useCatalogo(item.t === 'adesivo' ? 'adesivos' : 'chaveiros')
  const [giro, setGiro] = useState({ x: 0, y: 0 })
  const linha = useMemo(() => (catalogo.dados || []).find((s) => s[0] === item.d), [catalogo.dados, item.d])
  if (!catalogo.dados) return null
  const cor = corEnfeite(item.t, linha)
  const nome = linha?.[1] || `#${item.d}`
  const raridade = item.t === 'adesivo' ? `${t('Acabamento')}: ${t(acabamentoDoAdesivo(nome))}` : t(RARIDADES_NOME[raridadeCsDaCor(cor)] || 'Chaveiro')
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setGiro({ x: ((e.clientY - r.top) / r.height - 0.5) * -22, y: ((e.clientX - r.left) / r.width - 0.5) * 26 })
  }
  return createPortal(
    <JanelaInspecao titulo={t('Inspecionar')} aoFechar={aoFechar} largura="media" classe="inv-janela-insp">
      <div className="inv-inspecao" onPointerMove={mover} onPointerLeave={() => setGiro({ x: 0, y: 0 })}>
        <div className="inv-inspecao-enfeite" style={{ '--cor': cor, transform: `perspective(900px) rotateX(${giro.x}deg) rotateY(${giro.y}deg)` }}>
          {linha?.[2] ? <img src={urlImg(linha[2], 512)} alt="" draggable="false" /> : null}
        </div>
        <div className="inv-inspecao-info">
          <b>{nome}</b>
          <span>{item.t === 'adesivo' ? t('Adesivo') : t('Chaveiro')}</span>
          <small style={{ color: cor }}>{raridade}</small>
        </div>
      </div>
    </JanelaInspecao>,
    document.body,
  )
}
const RARIDADES_NOME = ['Consumer Grade', 'Industrial Grade', 'Mil-Spec', 'Restricted', 'Classified', 'Covert', 'Extraordinary']

// Inspecionar de qualquer página: carrega sozinho os catálogos (armas, adesivos, chaveiros e o mapa do 3D) e abre a janela
export function InspecionarSkin({ item, aoFechar }) {
  if (item?.t === 'adesivo' || item?.t === 'chaveiro') return <InspecionarEnfeite item={item} aoFechar={aoFechar} />
  const armas = useCatalogo('armas')
  const adesivos = useCatalogo('adesivos')
  const chaveiros = useCatalogo('chaveiros')
  const mapa3d = useCatalogo('mapa3d')
  const idx = useMemo(() => indicar(armas.dados?.armas, []), [armas.dados])
  if (!armas.dados) return null // espera o catálogo (a janela abre em seguida)
  return createPortal(<Inspecionar item={item} idx={idx} adesivos={adesivos} chaveiros={chaveiros} mapa={mapa3d.dados} aoFechar={aoFechar} />, document.body)
}

// Arma, faca e luva abrem o 3D; adesivo e chaveiro abrem a imagem grande (a caixa não tem o que inspecionar)
export const podeInspecionar = (item) => ['arma', 'faca', 'luva', 'adesivo', 'chaveiro'].includes(item?.t)

// Botão de lupa "Inspecionar" para pôr em cima de um cartão (mercado, trocas, perfil)
export function BotaoInspecionar({ item, classe = '' }) {
  const t = useT()
  const [aberto, setAberto] = useState(false)
  if (!podeInspecionar(item)) return null
  return (
    <>
      <button
        type="button"
        className={`insp-botao ${classe}`}
        title={t('Inspecionar')}
        aria-label={t('Inspecionar')}
        onClick={(e) => {
          e.stopPropagation()
          setAberto(true)
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m20 20-4.8-4.8" />
        </svg>
        <span>{t('Inspecionar')}</span>
      </button>
      {aberto && <InspecionarSkin item={item} aoFechar={() => setAberto(false)} />}
    </>
  )
}
