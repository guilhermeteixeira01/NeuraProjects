import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import {
  CATEGORIAS,
  LADOS_TIME,
  chaveEquip,
  corEnfeite,
  descrever,
  indicar,
  excluirItem,
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
import { avisarSaldo, lerCaixasPublicas, lerValores, venderItens } from '../../comum/loja.js'
import { EVENTO_MERCADO, anunciarItem, cancelarAnuncio, erroDoMercado, lerMercado } from '../../comum/mercado.js'
import { RARIDADES_CS, raridadeCsDaCor } from '../../../worker/steam-login/src/loja-core.js'
import Cartao, { nomeDoDesgaste } from '../../comum/CartaoSkin.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { confirmar } from '../../comum/Dialogos.jsx'
import { BotaoTrocas } from '../../comum/Trocas.jsx'
import { ArmaComEnfeites, Visualizador3D, idNo3d, useMapas3d, Inspecionar, useTelaPequena, InspecionarSkin } from '../../comum/InspecionarSkin.jsx'

// Inventário de skins, no estilo do inventário do jogo: o jogador CRIA itens (arma/faca/luva/agente com a skin que quiser), ajusta
// cada um (desgaste, seed, StatTrak, nome, adesivos com posição) e EQUIPA no CT, no TR ou nos dois (botão direito no item).
// Tudo é salvo sozinho no worker (src/skins.js); o plugin BaseComp aplica o que está equipado quando o jogador entra no servidor.

const ABAS = [
  ['tudo', 'TUDO'],
  ['arma', 'ARMAS'],
  ['faca', 'FACAS'],
  ['luva', 'LUVAS'],
  ['adesivo', 'ADESIVOS'],
  ['chaveiro', 'CHAVEIROS'],
  ['caixa', 'CAIXAS'],
  ['avenda', 'À VENDA'],
]
const EMBALAGEM = (t) => t === 'adesivo' || t === 'chaveiro' // itens guardados que se gastam ao colar numa arma
const GUARDADO = (t) => EMBALAGEM(t) || t === 'caixa' // + caixas fechadas da loja (o botão Abrir leva para a roleta)

// Quantos de cada adesivo/chaveiro o jogador ainda pode usar na arma que está editando:
// o que tem guardado + o que a arma já tinha (salvo) - o que está colado agora na edição
function livresParaColar(estoque, tipo, original, atual) {
  const uso = (it) => {
    const m = new Map()
    const somar = (def) => def && m.set(def, (m.get(def) || 0) + 1)
    if (tipo === 'adesivo') (it?.a || []).forEach((s) => somar(s?.i))
    else somar(it?.k?.i)
    return m
  }
  const antes = uso(original)
  const agora = uso(atual)
  const r = new Map()
  for (const def of new Set([...estoque.keys(), ...antes.keys()])) {
    const n = (estoque.get(def) || 0) + (antes.get(def) || 0) - (agora.get(def) || 0)
    if (n > 0) r.set(def, n)
  }
  return r
}
const ORDENS = [
  ['equipado', 'Equipado'],
  ['valor', 'Mais caro'],
  ['raridade', 'Raridade'],
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

function Janela({ titulo, aoFechar, largura = 'media', classe = '', children, rodape }) {
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
    <div className="inv-fundo" onClick={aoFechar}>
      <div className={`inv-janela inv-janela-${largura} ${classe}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
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
function SeletorAdesivo({ aoEscolher, aoFechar, catalogo = 'adesivos', livres }) {
  const t = useT()
  const { dados, erro } = useCatalogo(catalogo)
  const [busca, setBusca] = useState('')
  const lista = useMemo(() => {
    if (!dados) return []
    const q = busca.trim().toLowerCase()
    const meus = livres ? dados.filter((s) => livres.has(s[0])) : dados // só dá para usar o que está no inventário
    return (q ? meus.filter((s) => s[1].toLowerCase().includes(q)) : meus).slice(0, 90)
  }, [dados, busca, livres])
  return (
    <Janela titulo={catalogo === 'chaveiros' ? t('Escolher chaveiro') : t('Escolher adesivo')} aoFechar={aoFechar} largura="media">
      <input type="search" className="inv-busca" placeholder={catalogo === 'chaveiros' ? t('Pesquisar chaveiro') : t('Pesquisar adesivo (ex.: Katowice, holo, Navi)')} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      <ul className="inv-adesivos">
        {lista.map((s) => (
          <li key={s[0]}>
            <button type="button" onClick={() => aoEscolher(s[0])} title={s[1]}>
              <Imagem src={urlImg(s[2], 128)} />
              <small>{livres ? `${s[1]} ×${livres.get(s[0])}` : s[1]}</small>
            </button>
          </li>
        ))}
        {erro && <li className="inv-nada">{t('Não consegui carregar os adesivos.')}</li>}
        {!dados && !erro && <li className="inv-nada">{t('Carregando…')}</li>}
        {dados && !lista.length && <li className="inv-nada">{livres && !livres.size ? t(catalogo === 'chaveiros' ? 'Você não tem chaveiros disponíveis no inventário.' : 'Você não tem adesivos disponíveis no inventário.') : t('Nenhum adesivo encontrado.')}</li>}
      </ul>
    </Janela>
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
function TelaAdesivos({ item, d, m, adesivos, estoque, original, aoColar, aoFechar }) {
  const t = useT()
  const controle = useRef(null)
  const [loc, setLoc] = useState({ a: item.a || [null, null, null, null, null], k: item.k || null })
  const [viewer, setViewer] = useState({ activeSticker: null, schemaCount: 5 })
  const [escolhendo, setEscolhendo] = useState(false)
  const [sem3d, setSem3d] = useState(false)
  const porId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const tem3d = !!m && idNo3d(item, m) !== undefined && !sem3d
  const enviar = (tipo, dados) => controle.current?.enviar(tipo, dados)
  const [rec3d, setRec3d] = useState(0) // recarrega o 3D com os dados atuais (o 5º adesivo só entra assim: o 3D só aceita 4 pelo addSticker)
  const [ativoLocal, setAtivoLocal] = useState(null) // adesivo escolhido que o 3D não conhece (o 5º)
  const slotAtivo = (ativoLocal != null && loc.a[ativoLocal] ? ativoLocal : null) ?? viewer.activeSticker ?? [0, 1, 2, 3, 4].find((k) => loc.a[k]) ?? null
  const ad = slotAtivo != null ? loc.a[slotAtivo] : null
  const usados = loc.a.filter(Boolean).length
  const livres = Array.from({ length: 5 }, (_, k) => k).filter((k) => !loc.a.some((s) => s && s.s === k))
  const mudar2D = (k, parte) => setLoc((l) => ({ ...l, a: l.a.map((s, j) => (j === k ? { i: 0, s: 0, r: 0, w: 0, ...(s || {}), ...parte } : s)) }))

  // quantos espaços o próprio 3D informa (se ele só tiver 4, o 5º vai direto nos dados); sem informação, assume 5
  const limite3d = viewer.schemaCount ?? 5
  const adicionar = (def) => {
    if (tem3d && (livres[0] ?? 0) < limite3d) enviar('addSticker', { id: m.adesivos.paraLib.get(def), schema: livres[0] ?? 0 })
    else {
      const k = loc.a.findIndex((s) => !s)
      if (k >= 0) mudar2D(k, { i: def, s: k })
    }
    // sem espaço no 3D: o adesivo entra só nos dados e já fica selecionado na lista
    if (!tem3d || (livres[0] ?? 0) >= limite3d) {
      const k = loc.a.findIndex((x) => !x)
      if (k >= 0) setAtivoLocal(k)
      if (tem3d) {
        setRec3d((v) => v + 1)
        // depois que o 3D recarregar, seleciona o novo adesivo nele (senão só dava para mexer depois de clicar em outro e voltar)
        if (k >= 0) [1500, 3000, 5000].forEach((ms) => setTimeout(() => enviar('setActiveSticker', { index: k }), ms))
      }
    } else setAtivoLocal(null)
  }
  const remover = (k) => {
    if (tem3d && k < limite3d) return enviar('removeSticker', { index: k })
    setLoc((l) => ({ ...l, a: l.a.map((s, j) => (j === k ? null : s)) }))
    if (tem3d) setRec3d((v) => v + 1)
  }
  const mexer = (k, campo, valor) => {
    if (!tem3d) return mudar2D(k, { [campo]: valor })
    if (k >= limite3d) mudar2D(k, { [campo]: valor }) // o 5º: grava nos dados e também tenta no 3D (ele aceita depois de recarregar com o adesivo)
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
      aviso={t('Arraste o adesivo na arma, gire com o botão direito do mouse e use a roda para aproximar. Cada adesivo colado é gasto do seu inventário.')}
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
                  <button type="button" className="inv-painel-item" onClick={() => (k >= limite3d ? (setAtivoLocal(k), tem3d && enviar('setActiveSticker', { index: k })) : (setAtivoLocal(null), tem3d && enviar('setActiveSticker', { index: k })))}>
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
          {usados < 5 && (
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
        <Visualizador3D key={rec3d} item={{ ...item, a: loc.a, k: loc.k }} m={m} aoMudar={(p) => setLoc((l) => ({ ...l, a: p.a.map((x, i) => x || (i >= limite3d ? l.a[i] : null)), k: p.k }))} aoEstado={setViewer} aoFalhar={() => setSem3d(true)} controle={controle} altura="100%" />
      ) : (
        <div className="inv-previa-grande inv-previa-img">
          <ArmaComEnfeites item={{ ...item, a: loc.a, k: loc.k }} d={d} adesivos={porId} chaveiros={new Map()} />
        </div>
      )}
      {escolhendo && (
        <SeletorAdesivo
          livres={livresParaColar(estoque, 'adesivo', original, loc)}
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
function TelaChaveiro({ item, d, m, chaveiros, estoque, original, aoPrender, aoFechar }) {
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
      aviso={t('Arraste o chaveiro na arma para escolher onde ele fica. O chaveiro prendido é gasto do seu inventário; ao tirar, ele volta.')}
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
          livres={livresParaColar(estoque, 'chaveiro', original, loc)}
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
function DialogoItem({ inicial, modo, idx, adesivos, chaveiros, estoque, mapa, aoConfirmar, aoFechar }) {
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
  // Não dá para mexer em desgaste, padrão, StatTrak nem nome: só colar adesivos/chaveiro e, se quiser, voltar a skin ao original (sem enfeites)
  const voltarAoOriginal = async () => {
    const colados = (rasc.a || []).filter(Boolean).length + (rasc.k?.i ? 1 : 0)
    if (colados && !(await confirmar(t('Voltar ao original vai REMOVER os adesivos e o amuleto (chaveiro) colados nesta arma. Os adesivos se perdem; o chaveiro volta para o seu inventário. Continuar?'), { perigo: true, ok: t('Remover e voltar') }))) return
    setRasc((r) => ({ ...r, a: [null, null, null, null, null], k: null }))
    setVersao((v) => v + 1)
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
          <button type="button" className="inv-reset" onClick={voltarAoOriginal} title={t('Voltar ao original')} aria-label={t('Voltar ao original')}>
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
          estoque={estoque.adesivo}
          original={inicial}
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
          estoque={estoque.chaveiro}
          original={inicial}
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

// ── Menu do botão direito ──
// Fecha ao clicar fora, no Esc ou ao rolar, e não deixa o menu sair da tela
function useMenuFlutuante(x, y, aoFechar) {
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
  return { ref, pos }
}

// Menu de adesivo/chaveiro guardado (o mesmo visual do menu das armas): vender no mercado e excluir
function MenuGuardado({ x, y, n, valor, aoInspecionar, aoAnunciar, aoVenderAgora, aoExcluir, aoFechar }) {
  const t = useT()
  const { ref, pos } = useMenuFlutuante(x, y, aoFechar)
  return (
    <ul className="inv-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {aoInspecionar && (
        <li>
          <button type="button" role="menuitem" onClick={aoInspecionar}>
            {t('Inspecionar')}
          </button>
        </li>
      )}
      {valor != null && (
        <li>
          <button type="button" role="menuitem" className="inv-menu-vender" onClick={aoVenderAgora}>
            {t('Vender agora')}
            <b> +{valor.toLocaleString('pt-BR')} NP</b>
          </button>
        </li>
      )}
      <li>
        <button type="button" role="menuitem" className="inv-menu-vender" onClick={aoAnunciar}>
          {t('Vender no mercado')}
          {valor != null ? <b> ~{valor.toLocaleString('pt-BR')} NP</b> : null}
        </button>
      </li>
      <li className="inv-menu-sep" />
      <li>
        <button type="button" role="menuitem" className="inv-menu-perigo" onClick={aoExcluir}>
          {n > 1 ? t('Excluir 1') : t('Excluir')}
        </button>
      </li>
    </ul>
  )
}

// Só aparece o time em que o item existe no jogo (AK-47 e Glock só no TR; M4 e USP-S só no CT; agente do CT só no CT...)
function MenuContexto({ x, y, item, times, equip, aoEquipar, aoEquiparAmbos, aoDesequipar, aoEditar, aoInspecionar, aoVender, aoVenderAgora, valor, podeEditar, aoFechar }) {
  const t = useT()
  const { ref, pos } = useMenuFlutuante(x, y, aoFechar)
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
      {item.t === 'arma' && !podeEditar && (
        <li>
          <span className="inv-menu-aviso">{t('Editar (adesivos e chaveiro) só no computador')}</span>
        </li>
      )}
      {item.t === 'arma' && podeEditar && (
        <li>
          <button type="button" role="menuitem" onClick={aoEditar}>
            {t('Editar (adesivos e chaveiro)')}
          </button>
        </li>
      )}
      <li>
        <button type="button" role="menuitem" onClick={aoInspecionar}>
          {t('Inspecionar')}
        </button>
      </li>
      <li className="inv-menu-sep" />
      {valor > 0 && (
        <li>
          <button type="button" role="menuitem" className="inv-menu-vender" onClick={aoVenderAgora}>
            {t('Vender agora')}
            <b> +{valor.toLocaleString('pt-BR')} NP</b>
          </button>
        </li>
      )}
      <li>
        <button type="button" role="menuitem" className="inv-menu-vender" onClick={aoVender}>
          {t('Vender no mercado')}
          {valor ? <b> ~{valor.toLocaleString('pt-BR')} NP</b> : null}
        </button>
      </li>
    </ul>
  )
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const [inv, setInv] = useState(null)
  const salvo = useRef('')
  const [aba, setAba] = useState('tudo')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('valor')
  const [inspEnfeite, setInspEnfeite] = useState(null) // adesivo/chaveiro aberto na janela Inspecionar
  const [rar, setRar] = useState('todas') // filtro de raridade (0..6 como no jogo) ou 'todas'
  const [modoSel, setModoSel] = useState(false) // selecionar vários itens (para vender)
  const [sel, setSel] = useState(() => new Set())
  const [valores, setValores] = useState({}) // { <id do item>: { r, v } } (vem do servidor)
  const [venda, setVenda] = useState(null) // { ids } enquanto a pergunta de venda está aberta
  const [vendendo, setVendendo] = useState(false)
  const [erroVenda, setErroVenda] = useState('')
  const [avisoVenda, setAvisoVenda] = useState('')
  const [menuGuardado, setMenuGuardado] = useState(null) // { x, y, tipo, def } (menu de adesivo/chaveiro)
  const [anuncios, setAnuncios] = useState([]) // meus itens à venda no mercado (saíram do inventário)
  const [anuncio, setAnuncio] = useState(null) // { id, preco } enquanto a janela "Vender no mercado" está aberta
  const [anunciando, setAnunciando] = useState(false)
  const [erroAnuncio, setErroAnuncio] = useState('')
  const [cancelando, setCancelando] = useState('') // id do anúncio sendo cancelado
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
    // mouse: toca ao apertar; toque na tela: só quando o toque vira clique (rolar a lista com o dedo não faz barulho)
    let tipo = 'mouse'
    const apertou = (e) => {
      tipo = e.pointerType || 'mouse'
      if (tipo === 'mouse') clique(e)
    }
    const tocou = (e) => tipo !== 'mouse' && clique(e)
    const sobre = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return // sem "hover" no celular
      const c = e.target.closest?.('.inv-cartao')
      if (c && !c.contains(e.relatedTarget)) tocar('hover')
    }
    document.addEventListener('pointerdown', apertou)
    document.addEventListener('click', tocou)
    document.addEventListener('pointerover', sobre)
    return () => {
      document.removeEventListener('pointerdown', apertou)
      document.removeEventListener('click', tocou)
      document.removeEventListener('pointerover', sobre)
    }
  }, [])
  const precisaAdesivos = janela?.tipo === 'editar' || janela?.tipo === 'confirmar' || janela?.tipo === 'inspecionar' || aba === 'adesivo' || aba === 'chaveiro' || aba === 'avenda' || (!!inv && Object.values(inv.itens).some((it) => it.a?.some(Boolean) || it.k?.i || EMBALAGEM(it.t)))
  const [caixasLoja, setCaixasLoja] = useState([])
  const temCaixa = (!!inv && Object.values(inv.itens).some((it) => it.t === 'caixa')) || aba === 'caixa'
  useEffect(() => {
    if (temCaixa) lerCaixasPublicas().then(setCaixasLoja)
  }, [temCaixa])
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

  // O servidor mexeu no inventário (anúncio no mercado, troca): adota a versão dele
  const recarregarInv = useCallback(
    () =>
      lerInventario().then((d) => {
        const base = { ...inventarioNovo(), ...d }
        salvo.current = JSON.stringify(base)
        setInv(base)
      }, () => {}),
    [],
  )
  const carregarAnuncios = useCallback(() => {
    const eu = conta?.id
    if (!eu) return Promise.resolve()
    return lerMercado().then((r) => setAnuncios(r.anuncios.filter((a) => a.vendedor === eu)), () => {})
  }, [conta?.id])
  useEffect(() => {
    carregarAnuncios()
    window.addEventListener(EVENTO_MERCADO, carregarAnuncios) // venderam um item meu: sai da lista "À venda"
    return () => window.removeEventListener(EVENTO_MERCADO, carregarAnuncios)
  }, [carregarAnuncios])

  // Salva sozinho (um instante depois da última mudança)
  useEffect(() => {
    if (!inv) return
    const atual = JSON.stringify(inv)
    if (atual === salvo.current) return
    setEstado('salvando')
    const id = setTimeout(async () => {
      try {
        const d = await salvarInventario(inv)
        const novo = { ...inventarioNovo(), ...d }
        salvo.current = JSON.stringify(novo)
        // o servidor gasta os adesivos/chaveiros colados (e devolve o chaveiro tirado): adota o que ele guardou
        setInv((cur) => (JSON.stringify(cur) === atual ? novo : cur))
        setEstado(atual === salvo.current || JSON.stringify(inv) === salvo.current ? 'salvo' : 'salvando')
      } catch {
        setEstado('erro')
      }
    }, 800)
    return () => clearTimeout(id)
  }, [inv])

  const conjunto = inv ? Object.keys(inv.itens).join(',') : ''
  useEffect(() => {
    if (!inv) return
    let vivo = true
    const id = setTimeout(() => lerValores().then((v) => vivo && setValores(v), () => {}), 300)
    return () => {
      vivo = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conjunto])
  const idx = useMemo(() => indicar(catalogo.dados?.armas, agentes.dados), [catalogo.dados, agentes.dados])
  // raridade de um item como no jogo (facas e luvas são sempre Extraordinary)
  const rarDe = (it) => (it.t === 'faca' || it.t === 'luva' ? 6 : raridadeCsDaCor(descrever(it, idx).cor))
  const adesivosPorId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])

  // adesivos e chaveiros guardados: def -> quantidade
  const estoque = useMemo(() => {
    const r = { adesivo: new Map(), chaveiro: new Map(), caixa: new Map() }
    for (const it of Object.values(inv?.itens || {})) if (GUARDADO(it.t)) r[it.t].set(it.d, (r[it.t].get(it.d) || 0) + 1)
    return r
  }, [inv])
  const guardados = useMemo(() => {
    if (!GUARDADO(aba) && aba !== 'tudo') return []
    const q = busca.trim().toLowerCase()
    const caixaPor = (def) => {
      const c = caixasLoja.find((x) => x.id === def)
      return c ? [def, c.nome, c.img, c.cor] : undefined // mesmo formato das linhas dos catálogos: [id, nome, imagem, cor]
    }
    return (aba === 'tudo' ? ['adesivo', 'chaveiro', 'caixa'] : [aba])
      .flatMap((tipo) => [...estoque[tipo].entries()].map(([def, n]) => ({ tipo, def, n, linha: tipo === 'caixa' ? caixaPor(def) : (tipo === 'adesivo' ? adesivosPorId : chaveirosPorId).get(def) })))
      .filter((g) => !q || (g.linha?.[1] || '').toLowerCase().includes(q))
      .sort((a, b) => (a.linha?.[1] || '').localeCompare(b.linha?.[1] || ''))
  }, [aba, busca, estoque, adesivosPorId, chaveirosPorId, caixasLoja])

  const itens = useMemo(() => {
    if (!inv) return []
    const q = busca.trim().toLowerCase()
    const lista = Object.entries(inv.itens)
      .map(([id, it]) => ({ ...it, __id: id }))
      .filter((it) => it.t !== 'agente' && !GUARDADO(it.t)) // agentes: bloqueados no servidor; adesivos, chaveiros e caixas têm abas próprias
      .filter((it) => aba === 'tudo' || it.t === aba)
      .filter((it) => rar === 'todas' || rarDe(it) === rar)
      .filter((it) => {
        if (!q) return true
        const d = descrever(it, idx)
        return `${d.titulo} ${d.subtitulo} ${it.n || ''}`.toLowerCase().includes(q)
      })
    const equipado = (it) => (inv.equip.ct[chaveEquip(it)] === it.__id ? 1 : 0) + (inv.equip.tr[chaveEquip(it)] === it.__id ? 1 : 0)
    const nome = (it) => descrever(it, idx).titulo
    lista.sort((a, b) => {
      const valorDe = (it) => valores[it.__id]?.v || 0
      if (ordem === 'valor') return valorDe(b) - valorDe(a) || nome(a).localeCompare(nome(b))
      if (ordem === 'raridade') return rarDe(b) - rarDe(a) || valorDe(b) - valorDe(a)
      if (ordem === 'equipado') return equipado(b) - equipado(a) || nome(a).localeCompare(nome(b))
      if (ordem === 'recente') return (inv.criado[b.__id] || 0) - (inv.criado[a.__id] || 0)
      return nome(a).localeCompare(nome(b))
    })
    return lista
  }, [inv, aba, busca, ordem, idx, rar, valores])

  // quantos itens de cada raridade (na aba atual) para os botões do filtro
  const contagemRar = useMemo(() => {
    const c = Array(7).fill(0)
    for (const it of Object.values(inv?.itens || {})) if ((it.t === 'arma' || it.t === 'faca' || it.t === 'luva') && (aba === 'tudo' || it.t === aba)) c[rarDe(it)]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv, aba, idx])

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
  // Excluir: pergunta antes (não tem volta). apagar = { id, nome } enquanto a pergunta está aberta
  const [apagar, setApagar] = useState(null)
  const [apagando, setApagando] = useState(false)
  const [erroApagar, setErroApagar] = useState('')
  const pedirExclusao = (id, nome) => {
    setErroApagar('')
    setApagar({ id, nome })
  }
  const nomeDoItem = (it) => {
    if (it.t === 'adesivo' || it.t === 'chaveiro') return (it.t === 'adesivo' ? adesivosPorId : chaveirosPorId).get(it.d)?.[1] || `#${it.d}`
    const d = descrever(it, idx)
    return `${d.titulo}${d.subtitulo ? ` | ${d.subtitulo}` : ''}`
  }
  const confirmarExclusao = async () => {
    setApagando(true)
    try {
      const d = await excluirItem(apagar.id)
      const novo = { ...inventarioNovo(), ...d }
      salvo.current = JSON.stringify(novo)
      setInv(novo)
      tocar('fechar')
      setApagar(null)
    } catch {
      setErroApagar(t('Não deu para excluir agora. Tente de novo.'))
    } finally {
      setApagando(false)
    }
  }
  const alternarSel = (e, item) => {
    e.stopPropagation()
    setSel((s) => {
      const n = new Set(s)
      if (n.has(item.__id)) n.delete(item.__id)
      else n.add(item.__id)
      return n
    })
  }
  const sairDaSelecao = () => {
    setModoSel(false)
    setSel(new Set())
  }
  const valorTotal = (ids) => ids.reduce((a, k) => a + (valores[k]?.v || 0), 0)
  const pedirVenda = (ids) => {
    setErroVenda('')
    setVenda({ ids })
  }
  const confirmarVenda = async () => {
    setVendendo(true)
    try {
      const r = await venderItens(venda.ids)
      const novo = { ...inventarioNovo(), ...r.inv }
      salvo.current = JSON.stringify(novo)
      setInv(novo)
      avisarSaldo(r.saldo)
      tocar('criado')
      setAvisoVenda(t('Vendido! +{n} NP na sua conta.', { n: r.total.toLocaleString('pt-BR') }))
      setTimeout(() => setAvisoVenda(''), 6000)
      setVenda(null)
      setSel(new Set())
    } catch {
      setErroVenda(t('Não deu para vender agora. Tente de novo.'))
    } finally {
      setVendendo(false)
    }
  }
  // Vender no mercado: o jogador escolhe o preço (começa no valor do item); o item sai do inventário enquanto está anunciado
  const pedirAnuncio = (id) => {
    setErroAnuncio('')
    setAnuncio({ id, preco: String(valores[id]?.v || '') })
  }
  const confirmarAnuncio = async () => {
    const preco = Math.round(Number(anuncio.preco))
    if (!(preco >= 1 && preco <= 10_000_000)) return setErroAnuncio(t(erroDoMercado('preco')))
    setAnunciando(true)
    try {
      await anunciarItem(anuncio.id, preco, nomeDoItem(inv.itens[anuncio.id]))
      tocar('criado')
      setAnuncio(null)
      setAvisoVenda(t('Anunciado no mercado por {n} NP! Você acompanha (e pode cancelar) na aba À VENDA.', { n: preco.toLocaleString('pt-BR') }))
      setTimeout(() => setAvisoVenda(''), 7000)
      await Promise.all([recarregarInv(), carregarAnuncios()])
    } catch (e) {
      setErroAnuncio(t(erroDoMercado(e.message)))
    } finally {
      setAnunciando(false)
    }
  }
  const cancelarVenda = async (a) => {
    setCancelando(a.id)
    try {
      await cancelarAnuncio(a.id)
      tocar('fechar')
      setAvisoVenda(t('Venda cancelada: o item voltou para o seu inventário.'))
      setTimeout(() => setAvisoVenda(''), 6000)
      await Promise.all([recarregarInv(), carregarAnuncios()])
    } catch (e) {
      setAvisoVenda(t(erroDoMercado(e.message)))
      carregarAnuncios()
    } finally {
      setCancelando('')
    }
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
  if (!inv || !catalogo.dados) return catalogo.erro ? <p className="inv-dica">{t('Não consegui carregar o catálogo de skins.')}</p> : <CarregandoNP />

  const itemMenu = menu ? { ...inv.itens[menu.id], __id: menu.id } : null
  const itemJanela = janela?.id && inv.itens[janela.id] ? { ...inv.itens[janela.id], __id: janela.id } : null
  const total = Object.values(inv.itens).filter((it) => it.t !== 'agente').length
  const emEmbalagem = GUARDADO(aba)
  const idsGuardados = (tipo, def) => Object.keys(inv.itens).filter((k) => inv.itens[k].t === tipo && inv.itens[k].d === def)
  // tudo que dá para selecionar (e vender) no filtro atual: skins/facas/luvas e as unidades de adesivo e chaveiro
  const idsVisiveis = [...itens.map((i) => i.__id), ...guardados.filter((g) => g.tipo !== 'caixa').flatMap((g) => idsGuardados(g.tipo, g.def))]
  const cartaoGuardado = (g) => {
    const caixa = g.tipo === 'caixa'
    const v = caixa ? undefined : valores[idsGuardados(g.tipo, g.def)[0]]?.v
    const corpo = (
      <>
        <span className="inv-cartao-arte">
          <span className="inv-arma-box">
            <Imagem src={caixa ? g.linha?.[2] : urlImg(g.linha?.[2], 256)} classe="inv-arma-img" />
          </span>
          <span className="inv-st">×{g.n}</span>
        </span>
        <span className="inv-cartao-nome">
          <b>{g.linha?.[1] || `#${g.def}`}</b>
          <small>{g.tipo === 'adesivo' ? t('Adesivo') : g.tipo === 'chaveiro' ? t('Chaveiro') : t('Caixa fechada')}</small>
          {v != null && (
            <span className="inv-cartao-valor">
              <img src="/assets/logos/logo-np-64.png" alt="" width="14" height="14" />
              {v.toLocaleString('pt-BR')} NP
            </span>
          )}
        </span>
      </>
    )
    // adesivo/chaveiro: clicar (ou botão direito) abre o menu com Vender e Excluir, igual às armas
    const idsDoGrupo = caixa ? [] : idsGuardados(g.tipo, g.def)
    const marcado = modoSel && idsDoGrupo.length > 0 && idsDoGrupo.every((k) => sel.has(k))
    const abrir = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (modoSel) {
        // selecionando: o clique marca (ou desmarca) todas as unidades deste adesivo/chaveiro
        setSel((s) => {
          const n = new Set(s)
          for (const k of idsDoGrupo) marcado ? n.delete(k) : n.add(k)
          return n
        })
        return
      }
      setMenuGuardado({ x: e.clientX, y: e.clientY, tipo: g.tipo, def: g.def })
    }
    return (
      <li key={g.tipo + g.def}>
        {caixa ? (
          <div className="inv-cartao inv-cartao-fixo" style={{ '--cor': g.linha ? corEnfeite(g.tipo, g.linha) : '#6b6f76' }}>
            {corpo}
          </div>
        ) : (
          <button type="button" className={`inv-cartao inv-cartao-guardado${marcado ? ' inv-cartao-sel' : ''}`} aria-pressed={modoSel ? marcado : undefined} style={{ '--cor': g.linha ? corEnfeite(g.tipo, g.linha) : '#6b6f76' }} onClick={abrir} onContextMenu={abrir}>
            {corpo}
          </button>
        )}
        {caixa && (
          <a className="inv-btn inv-btn-p inv-abrir-caixa" href={`/loja/?abrir=${g.def}`}>
            {t('Abrir')}
          </a>
        )}
      </li>
    )
  }
  const guardadoDoMenu = menuGuardado ? guardados.find((g) => g.tipo === menuGuardado.tipo && g.def === menuGuardado.def) : null
  return (
    <>
      <div className="inv-topo">
        <nav className="inv-abas" role="tablist">
          {ABAS.map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
              {t(nome)}
              {id === 'avenda' && anuncios.length > 0 && ` (${anuncios.length})`}
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
        <BotaoTrocas aoMudouInventario={recarregarInv} />
        <span className="inv-total">{t('{n} itens', { n: total })}</span>
        {!['caixa', 'avenda'].includes(aba) && (
          <button type="button" className={`inv-btn inv-btn-sel${modoSel ? ' is-ativo' : ''}`} onClick={() => (modoSel ? sairDaSelecao() : setModoSel(true))}>
            {modoSel ? t('Cancelar seleção') : t('Selecionar')}
          </button>
        )}
        <select className="inv-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label={t('Ordenar')}>
          {ORDENS.map(([id, nome]) => (
            <option key={id} value={id}>
              {t(nome)}
            </option>
          ))}
        </select>
      </div>

      {['tudo', 'arma', 'faca', 'luva'].includes(aba) && total > 0 && (
        <div className="inv-rar" role="group" aria-label={t('Filtrar por raridade')}>
          <button type="button" className={rar === 'todas' ? 'is-ativo' : ''} onClick={() => setRar('todas')}>
            {t('Todas')}
          </button>
          {RARIDADES_CS.map((r) =>
            contagemRar[r.id] ? (
              <button key={r.id} type="button" className={rar === r.id ? 'is-ativo' : ''} style={{ '--cor': r.cor }} onClick={() => setRar(rar === r.id ? 'todas' : r.id)}>
                <i /> {t(r.curto)} <em>{contagemRar[r.id]}</em>
              </button>
            ) : null,
          )}
        </div>
      )}
      {avisoVenda && <p className="inv-aviso-venda" role="status">{avisoVenda}</p>}
      {anuncios.length > 0 && ['tudo', 'arma', 'faca', 'luva', 'adesivo', 'chaveiro'].includes(aba) && (
        <p className="inv-avenda-faixa">
          <span>{t('Você tem {n} item(ns) à venda no mercado. Enquanto estão anunciados, eles ficam fora do inventário.', { n: anuncios.length })}</span>
          <button type="button" className="inv-btn" onClick={() => setAba('avenda')}>
            {t('Ver à venda')}
          </button>
        </p>
      )}

      {aba === 'avenda' ? (
        <ul className="inv-itens">
          {anuncios.map((a) => (
            <Cartao
              key={a.id}
              item={{ ...a.item, __id: a.id }}
              idx={idx}
              adesivos={adesivosPorId}
              chaveiros={chaveirosPorId}
              valor={a.preco}
              extra={
                <div className="inv-avenda-info">
                  <button type="button" className="inv-btn inv-btn-perigo" disabled={cancelando === a.id} onClick={() => cancelarVenda(a)}>
                    {cancelando === a.id ? t('Cancelando…') : t('Cancelar venda')}
                  </button>
                </div>
              }
            />
          ))}
          {!anuncios.length && (
            <li className="inv-nada">
              {t('Você não tem nada à venda. Clique numa arma, adesivo ou chaveiro e escolha "Vender no mercado" para anunciar pelo preço que quiser.')} <a href="/loja/?aba=mercado">{t('Ver o mercado')}</a>
            </li>
          )}
        </ul>
      ) : total === 0 ? (
        <div className="inv-vazio">
          <p>{t('Seu inventário está vazio. As skins são entregues pelo dono do servidor: quando você receber uma, ela aparece aqui e um aviso no meio da tela.')}</p>
        </div>
      ) : emEmbalagem ? (
        <ul className="inv-itens">
          {guardados.map(cartaoGuardado)}
          {!guardados.length && <li className="inv-nada">{t(aba === 'adesivo' ? 'Você não tem adesivos. Eles são entregues pelo dono do servidor; use-os ao editar uma arma.' : aba === 'caixa' ? 'Você não tem caixas fechadas. Compre na loja e abra aqui ou na roleta.' : 'Você não tem chaveiros. Eles são entregues pelo dono do servidor; use-os ao editar uma arma.')}</li>}
        </ul>
      ) : (
        <ul className="inv-itens">
          {itens.map((it) => (
            <Cartao key={it.__id} item={it} idx={idx} adesivos={adesivosPorId} chaveiros={chaveirosPorId} equip={inv.equip} aoAbrirMenu={modoSel ? alternarSel : abrirMenu} selecionado={modoSel ? sel.has(it.__id) : undefined} valor={valores[it.__id]?.v} />
          ))}
          {guardados.map(cartaoGuardado)}
          {!itens.length && !guardados.length && <li className="inv-nada">{t('Nenhum item encontrado.')}</li>}
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
          valor={valores[menu.id]?.v}
          aoVender={() => { pedirAnuncio(menu.id); fecharMenu() }}
          aoVenderAgora={() => { pedirVenda([menu.id]); fecharMenu() }}
        />
      )}
      {menuGuardado && guardadoDoMenu && (() => {
        const ids = idsGuardados(guardadoDoMenu.tipo, guardadoDoMenu.def)
        const fechar = () => setMenuGuardado(null)
        return (
          <MenuGuardado
            x={menuGuardado.x}
            y={menuGuardado.y}
            n={guardadoDoMenu.n}
            valor={valores[ids[0]]?.v}
            aoFechar={fechar}
            aoInspecionar={() => { setInspEnfeite({ t: menuGuardado.tipo, d: menuGuardado.def, p: 0 }); fechar() }}
            aoAnunciar={() => { pedirAnuncio(ids[0]); fechar() }}
            aoVenderAgora={() => { pedirVenda([ids[0]]); fechar() }}
            aoExcluir={() => { pedirExclusao(ids[0], `${guardadoDoMenu.linha?.[1] || `#${guardadoDoMenu.def}`} (1)`); fechar() }}
          />
        )
      })()}
      {anuncio && inv.itens[anuncio.id] && (() => {
        const item = inv.itens[anuncio.id]
        const enfeite = EMBALAGEM(item.t)
        const linha = enfeite ? (item.t === 'adesivo' ? adesivosPorId : chaveirosPorId).get(item.d) : null
        const d = enfeite ? { img: urlImg(linha?.[2], 256), cor: corEnfeite(item.t, linha) } : descrever(item, idx)
        const ref = valores[anuncio.id]?.v
        const preco = Math.round(Number(anuncio.preco)) || 0
        return (
          <Janela
            titulo={t('Vender no mercado')}
            aoFechar={() => !anunciando && setAnuncio(null)}
            largura="media"
            rodape={
              <>
                <button type="button" className="inv-btn" disabled={anunciando} onClick={() => setAnuncio(null)}>
                  {t('Cancelar')}
                </button>
                <button type="button" className="inv-btn inv-btn-p" disabled={anunciando || preco < 1} onClick={confirmarAnuncio}>
                  {anunciando ? t('Anunciando…') : t('Anunciar por {n} NP', { n: preco.toLocaleString('pt-BR') })}
                </button>
              </>
            }
          >
            <div className="inv-anuncio">
              <span className="inv-anuncio-arte" style={{ '--cor': d.cor || '#6b6f76' }}>
                <ArmaComEnfeites item={item} d={d} adesivos={adesivosPorId} chaveiros={chaveirosPorId} />
              </span>
              <span className="inv-anuncio-nome">
                <b>{nomeDoItem(item)}</b>
                {enfeite && <small>{item.t === 'adesivo' ? t('Adesivo') : t('Chaveiro')}</small>}
                {d.skin && <small>{t(nomeDoDesgaste(Number(item.f)))} · {Number(item.f).toFixed(4)}</small>}
                {ref != null && <small>{t('Valor de referência')}: <b className="inv-cartao-valor">{ref.toLocaleString('pt-BR')} NP</b></small>}
              </span>
            </div>
            <div className="inv-anuncio-aviso">
              <b>{t('Seu item vai ser postado no mercado.')}</b>
              <ul>
                <li>{t('Outros jogadores vão ver que é você quem está vendendo e o preço que você escolher.')}</li>
                <li>{t('Enquanto estiver à venda, o item sai do seu inventário e você não pode usá-lo (nem equipar, trocar ou editar).')}</li>
                <li>{t('Você pode cancelar a venda a qualquer momento na aba À VENDA: o item volta para o seu inventário.')}</li>
                <li>{t('Quando alguém comprar, você recebe os Neura Pontos e uma notificação.')}</li>
              </ul>
            </div>
            <label className="inv-campo">
              <span>{t('Preço (NP)')}</span>
              <span className="inv-anuncio-preco">
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  inputMode="numeric"
                  value={anuncio.preco}
                  autoFocus
                  onChange={(e) => setAnuncio((a) => ({ ...a, preco: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && !anunciando && confirmarAnuncio()}
                />
                {ref != null && (
                  <button type="button" className="inv-btn" onClick={() => setAnuncio((a) => ({ ...a, preco: String(ref) }))}>
                    {t('Usar o valor de referência')}
                  </button>
                )}
              </span>
            </label>
            {erroAnuncio && <p className="inv-excluir-erro">{erroAnuncio}</p>}
          </Janela>
        )
      })()}
      {janela?.tipo === 'editar' && itemJanela && !pequena && (
        <DialogoItem
          inicial={itemJanela}
          modo="editar"
          idx={idx}
          adesivos={adesivos}
          chaveiros={chaveiros}
          estoque={estoque}
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
      {modoSel && !['caixa', 'avenda'].includes(aba) && (
        <div className="inv-selbar" role="region" aria-label={t('Itens selecionados')}>
          <span>
            <b>{sel.size}</b> {t('selecionado(s)')}
            {sel.size > 0 && (
              <em>
                {' '}
                · {t('valem')} <b>{valorTotal([...sel]).toLocaleString('pt-BR')} NP</b>
              </em>
            )}
          </span>
          <button type="button" className="inv-btn" onClick={() => setSel(new Set(idsVisiveis))}>
            {t('Selecionar todos ({n})', { n: idsVisiveis.length })}
          </button>
          {sel.size > 0 && (
            <button type="button" className="inv-btn" onClick={() => setSel(new Set())}>
              {t('Limpar')}
            </button>
          )}
          <button type="button" className="inv-btn inv-btn-p" disabled={!sel.size} onClick={() => pedirVenda([...sel])}>
            {t('Venda rápida (NP na hora)')}
          </button>
        </div>
      )}
      {venda && (
        <Janela
          titulo={t('Vender')}
          aoFechar={() => !vendendo && setVenda(null)}
          largura="media"
          rodape={
            <>
              <button type="button" className="inv-btn" disabled={vendendo} onClick={() => setVenda(null)}>
                {t('Cancelar')}
              </button>
              <button type="button" className="inv-btn inv-btn-p" disabled={vendendo} onClick={confirmarVenda}>
                {vendendo ? t('Vendendo…') : t('Sim, vender por {n} NP', { n: valorTotal(venda.ids).toLocaleString('pt-BR') })}
              </button>
            </>
          }
        >
          <p className="inv-excluir-texto">
            {venda.ids.length === 1 ? t('Vender este item?') : t('Vender estes {n} itens?', { n: venda.ids.length })} {t('Você recebe o valor em Neura Pontos (NP), calculado pela raridade e pelo desgaste. Não tem volta: o item (e os adesivos e o chaveiro colados nele) sai do seu inventário.')}
          </p>
          <ul className="inv-venda-lista">
            {venda.ids.slice(0, 8).map((k) => (
              <li key={k}>
                <span>{inv.itens[k] ? nomeDoItem(inv.itens[k]) : k}</span>
                <b>+{(valores[k]?.v || 0).toLocaleString('pt-BR')} NP</b>
              </li>
            ))}
            {venda.ids.length > 8 && <li className="inv-venda-mais">{t('e mais {n}…', { n: venda.ids.length - 8 })}</li>}
          </ul>
          <p className="inv-venda-total">
            {t('Total')}: <b>+{valorTotal(venda.ids).toLocaleString('pt-BR')} NP</b>
          </p>
          {erroVenda && <p className="inv-excluir-erro">{erroVenda}</p>}
        </Janela>
      )}
      {apagar && (
        <Janela
          titulo={t('Excluir item')}
          aoFechar={() => !apagando && setApagar(null)}
          largura="media"
          rodape={
            <>
              <button type="button" className="inv-btn" disabled={apagando} onClick={() => setApagar(null)}>
                {t('Cancelar')}
              </button>
              <button type="button" className="inv-btn inv-btn-perigo inv-btn-excluir" disabled={apagando} onClick={confirmarExclusao}>
                {apagando ? t('Excluindo…') : t('Sim, excluir')}
              </button>
            </>
          }
        >
          <p className="inv-excluir-texto">
            {t('Tem certeza que quer excluir')} <b>{apagar.nome}</b>? {t('Isso não pode ser desfeito: o item (e os adesivos e o chaveiro colados nele) é perdido para sempre.')}
          </p>
          {erroApagar && <p className="inv-excluir-erro">{erroApagar}</p>}
        </Janela>
      )}
      {inspEnfeite && <InspecionarSkin item={inspEnfeite} aoFechar={() => setInspEnfeite(null)} />}
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
