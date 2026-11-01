import IconeUI from '../../comum/IconeUI.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { seForErroApi } from '../../comum/api.js'
import Layout from '../../comum/Layout.jsx'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import {
  LADOS_TIME,
  chaveEquip,
  corEnfeite,
  descrever,
  ehC4,
  ehPerfil,
  ID_C4,
  NOME_PERFIL,
  PERFIL_TIPOS,
  indicar,
  excluirItem,
  inventarioNovo,
  lerInventario,
  salvarInventario,
  urlImg,
  useCatalogo,
} from '../../comum/skins.js'
import { useT } from '../../comum/i18n.js'
import { tocar } from '../../comum/somInventario.js'
import { avisarSaldo, lerCaixasPublicas, lerValores, venderItens } from '../../comum/loja.js'
import { EVENTO_MERCADO, anunciarItem, cancelarAnuncio, erroDoMercado, lerMercado } from '../../comum/mercado.js'
import { RARIDADES_CS, raridadeCsDaCor } from '../../../worker/steam-login/src/loja-core.js'
import Cartao, { nomeDoDesgaste } from '../../comum/CartaoSkin.jsx'
import { nomeRaridade } from '../../comum/DicaSkin.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { confirmar } from '../../comum/Dialogos.jsx'
import { comSenha } from '../../comum/seguranca.js'
import { BotaoTrocas } from '../../comum/Trocas.jsx'
import { FUNDOS, PERSONAGENS } from '../../comum/assetsV2.js'
import { ArmaComEnfeites, Visualizador3D, idNo3d, useMapas3d, Inspecionar, InspecionarSkin } from '../../comum/InspecionarSkin.jsx'

// Inventário de skins, no estilo do inventário do jogo: o jogador CRIA itens (arma/faca/luva/agente com a skin que quiser), ajusta
// cada um (desgaste, seed, StatTrak, nome, adesivos com posição) e EQUIPA no CT, no TR ou nos dois (botão direito no item).
// Tudo é salvo sozinho no worker (src/skins.js); o plugin BaseComp aplica o que está equipado quando o jogador entra no servidor.

const ABAS = [
  ['tudo', 'Tudo'],
  ['arma', 'Armas'],
  ['faca', 'Facas'],
  ['luva', 'Luvas'],
  ['adesivo', 'Adesivos'],
  ['chaveiro', 'Chaveiros'],
  ['emblema', 'Pins'],
  ['trilha', 'Trilhas'],
  ['grafite', 'Grafites'],
  ['caixa', 'Caixas'],
  ['avenda', 'À venda'],
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

let janelasAbertas = 0
const camadaAtiva = () => Math.max(...Array.from(document.querySelectorAll('[data-inv-camada]'), e => Number(e.dataset.invCamada)))
function Janela({ titulo, aoFechar, largura = 'media', classe = '', children, rodape, camada = 2600 }) {
  const t = useT()
  useEffect(() => {
    tocar('abrir')
    janelasAbertas++
    document.documentElement.classList.add('inv-travado')
    return () => {
      tocar('fechar')
      if (--janelasAbertas === 0) document.documentElement.classList.remove('inv-travado')
    }
  }, [])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && camadaAtiva() === camada && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar, camada])
  return createPortal(
    <div className="inv-fundo" data-inv-camada={camada} style={{ zIndex: camada }} onClick={aoFechar}>
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
    </div>, document.body,
  )
}

// Grade de skins de uma arma (mais a opção "sem skin"/"padrão")
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
    <Janela titulo={catalogo === 'chaveiros' ? t('Escolher chaveiro') : t('Escolher adesivo')} aoFechar={aoFechar} largura="media" camada={2800}>
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
    const tecla = (e) => e.key === 'Escape' && camadaAtiva() === 2700 && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return createPortal(
    <div className="inv-tela" data-inv-camada="2700" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="inv-tela-cab">
        <h2>{titulo}</h2>
        <p>{subtitulo}</p>
        <p className="inv-ajuda-mobile">{t('Use os controles abaixo da arma para ajustar a posição e os detalhes.')}</p>
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
    </div>,
    document.body,
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
      aviso={t('Arraste o adesivo na arma ou use os controles para ajustar a posição e a rotação. Cada adesivo colado é gasto do seu inventário.')}
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
                    <IconeUI tipo="excluir" tamanho={15}/>
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
                  <IconeUI tipo="excluir" tamanho={15}/>
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
  const porId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])
  const tem3d = !!m && idNo3d(rasc, m) !== undefined
  const [sem3d, setSem3d] = useState(false)
  const mudar = (p) => setRasc((r) => ({ ...r, ...p }))
  const comEnfeites = rasc.t === 'arma'
  // Não dá para mexer em desgaste, padrão, StatTrak nem nome: só colar adesivos/chaveiro e, se quiser, voltar a skin ao original (sem enfeites)
  const voltarAoOriginal = async () => {
    const colados = (rasc.a || []).filter(Boolean).length + (rasc.k?.i ? 1 : 0)
    if (colados && !(await confirmar(t('Voltar ao original vai REMOVER os adesivos e o amuleto (chaveiro) colados nesta arma. Os adesivos se perdem; o chaveiro volta para o seu inventário. Continuar?'), { perigo: true, ok: t('Remover e voltar') }))) return
    setRasc((r) => ({ ...r, a: [null, null, null, null, null], k: null }))
    setVersao((v) => v + 1)
  }

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
function MenuGuardado({ x, y, n, valor, cadeado, aoCadeado, aoInspecionar, aoAnunciar, aoVenderAgora, aoExcluir, aoFechar }) {
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
          <button type="button" role="menuitem" className="inv-menu-vender" disabled={cadeado} onClick={aoVenderAgora}>
            {t('Vender agora')}
            <b> +{valor.toLocaleString('pt-BR')} NP</b>
          </button>
        </li>
      )}
      <li>
        <button type="button" role="menuitem" className="inv-menu-vender" disabled={cadeado} onClick={aoAnunciar}>
          {t('Vender no mercado')}
          {valor != null ? <b> ~{valor.toLocaleString('pt-BR')} NP</b> : null}
        </button>
      </li>
      <li className="inv-menu-sep" />
      <li><button type="button" role="menuitem" onClick={aoCadeado}><IconeUI tipo="cadeado" tamanho={16} />{t(cadeado ? 'Remover cadeado' : 'Proteger com cadeado')}</button></li>
      <li>
        <button type="button" role="menuitem" className="inv-menu-perigo" onClick={aoExcluir}>
          {n > 1 ? t('Excluir 1') : t('Excluir')}
        </button>
      </li>
    </ul>
  )
}

// Só aparece o time em que o item existe no jogo (AK-47 e Glock só no TR; M4 e USP-S só no CT; agente do CT só no CT...)
function MenuContexto({ x, y, item, times, equip, aoEquipar, aoEquiparAmbos, aoDesequipar, aoEditar, aoInspecionar, aoVender, aoVenderAgora, aoCadeado, valor, aoFechar }) {
  const t = useT()
  const { ref, pos } = useMenuFlutuante(x, y, aoFechar)
  const chave = chaveEquip(item)
  // Pin, grafite e trilha sonora valem para os dois times de uma vez: só "equipar" e "tirar", sem escolher CT ou TR
  if (ehPerfil(item)) {
    const ambos = equip.ct?.[chave] === item.__id && equip.tr?.[chave] === item.__id
    return (
      <ul className="inv-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
        <li>
          <button type="button" role="menuitem" onClick={ambos ? () => { aoDesequipar('ct'); aoDesequipar('tr') } : aoEquiparAmbos}>
            <span className="inv-marcas-duas"><Marca lado="ct" /><Marca lado="tr" /></span>
            {ambos ? t('Tirar dos dois times') : t('Equipar nos dois times')}
          </button>
        </li>
      </ul>
    )
  }
  // C4: fixa e sempre equipada no TR; só dá para editar (adesivos e 1 chaveiro) e inspecionar
  if (ehC4(item))
    return (
      <ul className="inv-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
        <li><button type="button" role="menuitem" onClick={aoEditar}>{t('Editar (adesivos e chaveiro)')}</button></li>
        <li><button type="button" role="menuitem" onClick={aoInspecionar}>{t('Inspecionar')}</button></li>
      </ul>
    )
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
      {item.t === 'arma' && (
        <li>
          <button type="button" role="menuitem" onClick={aoEditar}>
            {t('Editar (adesivos e chaveiro)')}
          </button>
        </li>
      )}
      {!ehPerfil(item) && <li>
        <button type="button" role="menuitem" onClick={aoInspecionar}>
          {t('Inspecionar')}
        </button>
      </li>}
      <li className="inv-menu-sep" />
      {ehPerfil(item) ? null : <>
      {valor > 0 && (
        <li>
          <button type="button" role="menuitem" className="inv-menu-vender" disabled={item.cadeado} onClick={aoVenderAgora}>
            {t('Vender agora')}
            <b> +{valor.toLocaleString('pt-BR')} NP</b>
          </button>
        </li>
      )}
      <li>
        <button type="button" role="menuitem" className="inv-menu-vender" disabled={item.cadeado} onClick={aoVender}>
          {t('Vender no mercado')}
          {valor ? <b> ~{valor.toLocaleString('pt-BR')} NP</b> : null}
        </button>
      </li>
      </>}
      {aoCadeado && <li><button type="button" role="menuitem" onClick={aoCadeado}><IconeUI tipo="cadeado" tamanho={16} />{t(item.cadeado ? 'Remover cadeado' : 'Proteger com cadeado')}</button></li>}
    </ul>
  )
}

// ── Painel de inspeção (coluna da direita no computador; gaveta de baixo no celular) ──
// Mostra o item escolhido na grade: raridade, nome, imagem grande, float (com a barra do desgaste), padrão e as ações.
// "Equipar" coloca o item em todos os times em que ele existe; o resto (time a time, editar, vender) fica em "Mais ações",
// que abre o mesmo menu do botão direito.
const QUALIDADE_FLOAT = [
  [0.07, 'Excelente', 'var(--v2-sucesso)'],
  [0.15, 'Ótima', '#7fdc6a'],
  [0.38, 'Boa', '#e3c54a'],
  [0.45, 'Regular', '#f09a45'],
  [1.01, 'Baixa', 'var(--v2-erro)'],
]

function useCelular() {
  const [cel, setCel] = useState(false)
  useEffect(() => {
    const q = matchMedia('(max-width: 1024px)')
    const ver = () => setCel(q.matches)
    ver()
    q.addEventListener('change', ver)
    return () => q.removeEventListener('change', ver)
  }, [])
  return cel
}

function PainelItem({ alvo, idx, equip, valor, celular, aberto, aoFechar, aoEquipar, aoDesequipar, aoDetalhes, aoEditar, mapa }) {
  const t = useT()
  const fechar = useRef(null)
  const m3d = useMapas3d(mapa)
  const [sem3d, setSem3d] = useState(false)
  const idSel = alvo?.item?.__id
  useEffect(() => setSem3d(false), [idSel])
  useEffect(() => {
    if (!celular || !aberto) return
    fechar.current?.focus()
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [celular, aberto, aoFechar])
  const gaveta = celular ? { role: 'dialog', 'aria-modal': aberto ? 'true' : undefined, 'aria-hidden': aberto ? undefined : 'true', inert: aberto ? undefined : true } : {}

  if (!alvo)
    return (
      <aside className="inv-painel-v2 inv-painel-vazio" aria-label={t('Detalhes do item')} {...gaveta}>
        <IconeUI tipo="mochila" tamanho={34} />
        <b>{t('Selecione um item')}</b>
        <span>{t('Clique em um item da grade para ver os detalhes aqui.')}</span>
      </aside>
    )

  const { item, d, guardado } = alvo
  const cor = d.cor || '#6b6f76'
  const temFloat = !guardado && d.skin && item.f != null
  const f = Number(item.f)
  const qualidade = temFloat ? QUALIDADE_FLOAT.find(([max]) => f < max) : null
  const chave = !guardado ? chaveEquip(item) : null
  const times = (!guardado && d.times) || []
  const equipados = times.filter((l) => equip?.[l]?.[chave] === item.__id)
  const c4 = !guardado && ehC4(item)
  const tem3d = !guardado && !!m3d && !sem3d && ['arma', 'faca', 'luva'].includes(item.t) && idNo3d(item, m3d) !== undefined
  const equipavel = !guardado && !c4 && ['arma', 'faca', 'luva', ...PERFIL_TIPOS].includes(item.t) && times.length > 0
  const todos = equipavel && equipados.length === times.length
  const raridade = nomeRaridade(item, d.cor, t.idioma)
  return (
    <aside className={`inv-painel-v2${guardado ? ' inv-painel-compacto' : ''}${aberto ? ' aberto' : ''}`} style={{ '--cor': cor }} aria-label={t('Detalhes do item')} {...gaveta}>
      {celular && (
        <button ref={fechar} type="button" className="inv-painel-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
          <IconeUI tipo="fechar" tamanho={20} />
        </button>
      )}
      <header className="inv-painel-cab">
        {raridade && <span className="inv-rar-selo" style={{ '--cor': cor }}>{raridade}</span>}
        <h2>
          <span>{item.n ? `${d.titulo} «${item.n}»` : d.titulo}</span>
          {d.subtitulo && <em>{d.subtitulo}</em>}
        </h2>
        <small>{temFloat ? t(nomeDoDesgaste(f)) : guardado ? `${d.tipoNome}${alvo.n > 1 ? ` · ×${alvo.n}` : ''}` : ''}</small>
      </header>
      <div className="inv-painel-arte" style={{ '--inv-painel-fundo': `url("${FUNDOS.inventario.src}")` }}>
        {tem3d ? (
          // arma inspecionada em 3D (gira com o mouse), com adesivos e chaveiro; sobre o fundo do painel. Sem o 3D, a imagem da Steam.
          <div className="inv-painel-3d"><Visualizador3D key={`${item.__id}:${JSON.stringify([item.a, item.k])}`} item={item} m={m3d} aoMudar={() => {}} aoFalhar={() => setSem3d(true)} altura="100%" /></div>
        ) : d.img ? <img src={d.img} alt="" decoding="async" /> : <span className="inv-sem-img" aria-hidden="true" />}
        {item.st ? <span className="inv-st">StatTrak™</span> : null}
      </div>
      {temFloat && (
        <div className="inv-painel-float">
          <div className="inv-painel-float-cab">
            <span>Float</span>
            <b className="v2-num">{f.toFixed(f < 0.01 ? 4 : 3)}</b>
          </div>
          <div className="inv-float-barra" role="img" aria-label={t('Float {v}', { v: f.toFixed(4) })}>
            <i style={{ left: `${Math.min(100, Math.max(0, f * 100))}%` }} />
          </div>
        </div>
      )}
      <dl className="inv-painel-dados">
        {qualidade && (
          <div>
            <dt>{t('Qualidade do float')}</dt>
            <dd style={{ color: qualidade[2] }}>{t(qualidade[1])}</dd>
          </div>
        )}
        {temFloat && item.s != null && (
          <div>
            <dt>{t('Padrão')}</dt>
            <dd className="v2-num">{item.s}</dd>
          </div>
        )}
        {raridade && (
          <div>
            <dt>{t('Raridade')}</dt>
            <dd style={{ color: cor }}>{raridade}</dd>
          </div>
        )}
        {(equipavel || c4) && (
          <div>
            <dt>{t('Equipado')}</dt>
            <dd>{equipados.length ? equipados.map((l) => l.toUpperCase()).join(' · ') : t('Não')}</dd>
          </div>
        )}
        {valor != null && !c4 && (
          <div>
            <dt>{t('Valor')}</dt>
            <dd className="inv-painel-valor">
              <img src="/assets/logos/logo-np-64.png" alt="" width="14" height="14" />
              {Number(valor).toLocaleString('pt-BR')} NP
            </dd>
          </div>
        )}
      </dl>
      <div className="inv-painel-acoes">
        {equipavel && (
          <button type="button" className="v2-btn v2-btn-primario" onClick={() => (todos ? aoDesequipar(times) : aoEquipar(times))}>
            <IconeUI tipo="camisa" tamanho={18} />
            {todos ? t('Desequipar') : t('Equipar')}
          </button>
        )}
        {c4 && (
          <button type="button" className="v2-btn v2-btn-primario" onClick={aoEditar}>
            <IconeUI tipo="detalhes" tamanho={18} />
            {t('Editar adesivos e chaveiro')}
          </button>
        )}
        {alvo.caixa ? (
          <a className="v2-btn v2-btn-primario" href={`/loja/?abrir=${alvo.def}`}>
            <IconeUI tipo="caixa" tamanho={18} />
            {t('Abrir caixa')}
          </a>
        ) : ehPerfil(item) ? null : (
          <button type="button" className={`v2-btn ${equipavel || c4 ? 'v2-btn-secundario' : 'v2-btn-primario'}`} onClick={aoDetalhes}>
            <IconeUI tipo="detalhes" tamanho={18} />
            {t('Ver detalhes')}
          </button>
        )}
      </div>
    </aside>
  )
}

// Topo + conteúdo na largura da página (o topo mostra quantos itens o jogador tem)
function ComTopo({ total, children }) {
  return (
    <>
      <TopoInventario total={total} />
      <div className="wrap inv-wrap">{children}</div>
    </>
  )
}

function Conteudo() {
  const t = useT()
  const conta = useConta()
  const celular = useCelular()
  const [selChave, setSelChave] = useState(null) // 'i:<id>' (arma, faca, luva) ou 'g:<tipo>:<def>' (adesivo, chaveiro, caixa)
  const [gaveta, setGaveta] = useState(false) // celular: painel de detalhes aberto
  const gatilho = useRef(null) // cartão que abriu a gaveta (o foco volta para ele)
  const selecionar = (chave, el) => {
    setSelChave(chave)
    gatilho.current = el
    if (matchMedia('(max-width: 1024px)').matches) setGaveta(true)
  }
  const fecharGaveta = useCallback(() => {
    setGaveta(false)
    requestAnimationFrame(() => gatilho.current?.focus())
  }, [])
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
    document.body.dataset.som = 'nao' // esta página tem os sons próprios do inventário: os sons gerais do site (som.js) ficam quietos
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
  // emblemas, trilhas e grafites: o catálogo só baixa quando o jogador tem um item do tipo (ou abre a aba)
  const temPerfil = (tipo) => aba === tipo || (!!inv && Object.values(inv.itens).some((it) => it.t === tipo))
  const catEmblemas = useCatalogo('emblemas', temPerfil('emblema'))
  const catTrilhas = useCatalogo('trilhas', temPerfil('trilha'))
  const catGrafites = useCatalogo('grafites', temPerfil('grafite'))
  const mapa3d = useCatalogo('mapa3d', janela?.tipo === 'editar' || janela?.tipo === 'inspecionar' || janela?.tipo === 'confirmar' || !celular)

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
      }, seForErroApi()),
    [],
  )
  const carregarAnuncios = useCallback(() => {
    const eu = conta?.id
    if (!eu) return Promise.resolve()
    return lerMercado().then((r) => setAnuncios(r.anuncios.filter((a) => a.vendedor === eu)), seForErroApi())
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
    const id = setTimeout(() => lerValores().then((v) => vivo && setValores(v), seForErroApi()), 300)
    return () => {
      vivo = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conjunto])
  const idx = useMemo(
    () => indicar(catalogo.dados?.armas, agentes.dados, { emblema: catEmblemas.dados, trilha: catTrilhas.dados, grafite: catGrafites.dados }),
    [catalogo.dados, agentes.dados, catEmblemas.dados, catTrilhas.dados, catGrafites.dados],
  )
  // raridade de um item como no jogo (facas e luvas são sempre Extraordinary)
  const rarDe = (it) => (it.t === 'faca' || it.t === 'luva' ? 6 : raridadeCsDaCor(descrever(it, idx).cor))
  const adesivosPorId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])

  // raridade de adesivo/chaveiro (caixa fechada não tem: -1)
  const rarEnf = (g) => (g.tipo === 'caixa' || !g.linha ? -1 : raridadeCsDaCor(corEnfeite(g.tipo, g.linha)))
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
      .filter((g) => rar === 'todas' || (g.tipo !== 'caixa' && rarEnf(g) === rar))
      .sort((a, b) => rarEnf(b) - rarEnf(a) || (a.linha?.[1] || '').localeCompare(b.linha?.[1] || ''))
  }, [aba, busca, estoque, adesivosPorId, chaveirosPorId, caixasLoja, rar])

  const itens = useMemo(() => {
    if (!inv) return []
    const q = busca.trim().toLowerCase()
    const lista = Object.entries(inv.itens)
      .map(([id, it]) => ({ ...it, __id: id }))
      .filter((it) => it.__id !== ID_C4 && it.t !== 'agente' && !GUARDADO(it.t)) // agentes: bloqueados no servidor; adesivos, chaveiros e caixas têm abas próprias
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
    for (const it of Object.values(inv?.itens || {})) {
      if ((it.t === 'arma' || it.t === 'faca' || it.t === 'luva') && (aba === 'tudo' || it.t === aba)) c[rarDe(it)]++
      else if (ehPerfil(it) && (aba === 'tudo' || it.t === aba)) c[rarDe(it)]++
      else if ((it.t === 'adesivo' || it.t === 'chaveiro') && (aba === 'tudo' || it.t === aba)) {
        const linha = (it.t === 'adesivo' ? adesivosPorId : chaveirosPorId).get(it.d)
        if (linha) c[raridadeCsDaCor(corEnfeite(it.t, linha))]++
      }
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv, aba, idx, adesivosPorId, chaveirosPorId])

  const mudar = useCallback((f) => setInv((i) => f(i)), [])
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
    if (item.cadeado) return
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
  const alternarCadeado = (id) => {
    mudar(i => !i.itens[id] ? i : ({ ...i, itens: { ...i.itens, [id]: { ...i.itens[id], cadeado: !i.itens[id].cadeado } } }))
    setSel(s => { const novo = new Set(s); novo.delete(id); return novo })
  }
  const pedirVenda = (ids) => {
    if (ids.some(id => inv.itens[id]?.cadeado)) return
    setErroVenda('')
    setVenda({ ids })
  }
  const confirmarVenda = async () => {
    if (venda.ids.some(id => inv.itens[id]?.cadeado)) return
    setVendendo(true)
    try {
      const { dados: r, cancelado } = await comSenha(t('Para vender os itens por NP, digite sua senha de segurança.'), senha => venderItens(venda.ids, senha))
      if (cancelado) return
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
    if (inv.itens[id]?.cadeado) return
    setErroAnuncio('')
    setAnuncio({ id, preco: String(valores[id]?.v || '') })
  }
  const confirmarAnuncio = async () => {
    if (inv.itens[anuncio.id]?.cadeado) return
    const preco = Math.round(Number(anuncio.preco))
    if (!(preco >= 1 && preco <= 10_000_000)) return setErroAnuncio(t(erroDoMercado('preco')))
    setAnunciando(true)
    try {
      // colocar à venda pede a senha de segurança (evita golpe)
      const r = await comSenha(t('Para colocar o item à venda, digite a sua senha de segurança.'), (senha) => anunciarItem(anuncio.id, preco, nomeDoItem(inv.itens[anuncio.id]), senha))
      if (r.cancelado) return
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
      <ComTopo>
        <div className="inv-bloqueio v2-painel" role="status">
          <h2>{t('Inventário de skins')}</h2>
          <p>{t('Entre com a Steam para escolher as skins que vão aparecer para você no servidor.')}</p>
          {loginAtivo() && (
            <button type="button" className="v2-btn v2-btn-primario" onClick={entrar}>
              {t('Entrar com a Steam')}
            </button>
          )}
        </div>
      </ComTopo>
    )
  if (erroCarga) return <ComTopo><p className="inv-dica v2-painel">{t('Não consegui carregar o seu inventário. Tente de novo mais tarde.')}</p></ComTopo>
  if (!inv || !catalogo.dados) return <ComTopo>{catalogo.erro ? <p className="inv-dica v2-painel">{t('Não consegui carregar o catálogo de skins.')}</p> : <CarregandoNP />}</ComTopo>

  const itemMenu = menu ? { ...inv.itens[menu.id], __id: menu.id } : null
  const itemJanela = janela?.id && inv.itens[janela.id] ? { ...inv.itens[janela.id], __id: janela.id } : null
  const total = Object.values(inv.itens).filter((it) => it.t !== 'agente').length
  const emEmbalagem = GUARDADO(aba)
  const idsGuardados = (tipo, def) => Object.keys(inv.itens).filter((k) => inv.itens[k].t === tipo && inv.itens[k].d === def)
  const cadeadoGrupo = (tipo, def) => idsGuardados(tipo, def).every(id => inv.itens[id].cadeado)
  const alternarCadeadoGrupo = (tipo, def) => {
    const ids = idsGuardados(tipo, def)
    const proteger = !cadeadoGrupo(tipo, def)
    mudar(i => ({ ...i, itens: Object.fromEntries(Object.entries(i.itens).map(([id, it]) => [id, ids.includes(id) ? { ...it, cadeado: proteger } : it])) }))
    setSel(s => new Set([...s].filter(id => !ids.includes(id))))
  }
  // tudo que dá para selecionar (e vender) no filtro atual: skins/facas/luvas e as unidades de adesivo e chaveiro
  const idsVisiveis = [...itens.map((i) => i.__id), ...guardados.filter((g) => g.tipo !== 'caixa').flatMap((g) => idsGuardados(g.tipo, g.def))]
  // "Selecionar todos" deixa de fora o que está equipado (CT ou TR): ninguém vende a arma que usa sem querer (um por um ainda dá para marcar)
  const equipadoEmAlgum = (it) => inv.equip.ct[chaveEquip(it)] === it.__id || inv.equip.tr[chaveEquip(it)] === it.__id
  const idsParaTodos = [...itens.filter((i) => !i.cadeado && !equipadoEmAlgum(i)).map((i) => i.__id), ...guardados.filter((g) => g.tipo !== 'caixa').flatMap((g) => idsGuardados(g.tipo, g.def).filter(id => !inv.itens[id]?.cadeado))]
  // Item no painel: o escolhido, ou o primeiro da lista atual (troca de aba/filtro sem deixar o painel vazio)
  const mostrarC4 = !emEmbalagem && aba !== 'avenda' && (aba === 'tudo' || aba === 'arma') && !!inv?.itens?.[ID_C4] && rar === 'todas' && (!busca.trim() || /c4|bomba|explosiv/i.test(busca))
  const chavesVisiveis = aba === 'avenda' ? [] : [...(emEmbalagem ? [] : itens.map((i) => `i:${i.__id}`)), ...(mostrarC4 ? [`i:${ID_C4}`] : []), ...guardados.map((g) => `g:${g.tipo}:${g.def}`)]
  const selChaveAtual = chavesVisiveis.includes(selChave) ? selChave : chavesVisiveis[0] || null
  const alvo = (() => {
    if (!selChaveAtual) return null
    if (selChaveAtual.startsWith('i:')) {
      const id = selChaveAtual.slice(2)
      const item = { ...inv.itens[id], __id: id }
      return { item, d: descrever(item, idx), valor: valores[id]?.v }
    }
    const g = guardados.find((x) => `g:${x.tipo}:${x.def}` === selChaveAtual)
    if (!g) return null
    const caixa = g.tipo === 'caixa'
    const ids = caixa ? [] : idsGuardados(g.tipo, g.def)
    const tipoNome = g.tipo === 'adesivo' ? t('Adesivo') : g.tipo === 'chaveiro' ? t('Chaveiro') : t('Caixa fechada')
    return {
      guardado: true,
      caixa,
      def: g.def,
      n: g.n,
      item: { t: g.tipo, d: g.def, __id: ids[0] },
      d: { titulo: g.linha?.[1] || `#${g.def}`, subtitulo: '', img: caixa ? g.linha?.[2] : urlImg(g.linha?.[2], 512), cor: caixa ? '' : corEnfeite(g.tipo, g.linha), tipoNome },
      valor: ids[0] ? valores[ids[0]]?.v : undefined,
    }
  })()
  const maisAcoes = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (!alvo) return
    if (alvo.guardado) setMenuGuardado({ x: r.left, y: r.bottom + 6, tipo: alvo.item.t, def: alvo.def })
    else setMenu({ x: r.left, y: r.bottom + 6, id: alvo.item.__id })
  }
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
    // adesivo/chaveiro/caixa: o clique mostra no painel; o botão direito abre o menu com Vender e Excluir, igual às armas
    const protegido = cadeadoGrupo(g.tipo, g.def)
    const idsDoGrupo = caixa ? [] : idsGuardados(g.tipo, g.def).filter(id => !inv.itens[id].cadeado)
    const marcado = modoSel && idsDoGrupo.length > 0 && idsDoGrupo.every((k) => sel.has(k))
    const chaveG = `g:${g.tipo}:${g.def}`
    const clicar = (e) => {
      if (!modoSel || caixa) {
        if (celular && !caixa) return abrir(e)
        return selecionar(chaveG, e.currentTarget)
      }
      abrir(e)
    }
    const abrir = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (caixa) return selecionar(chaveG, e.currentTarget)
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
      <li key={g.tipo + g.def} className="inv-cartao-li">
        <button type="button" className={`inv-cartao-cadeado${protegido ? ' ativo' : ''}`} aria-label={t(protegido ? 'Remover cadeado' : 'Proteger skin')} aria-pressed={protegido} onClick={e => { e.stopPropagation(); alternarCadeadoGrupo(g.tipo, g.def) }}><IconeUI tipo="cadeado" tamanho={15} /></button>
        <button type="button" className={`inv-cartao inv-cartao-guardado${marcado ? ' inv-cartao-sel' : ''}${selChaveAtual === chaveG ? ' inv-cartao-ativo' : ''}`} aria-pressed={modoSel && !caixa ? marcado : undefined} {...(selChaveAtual === chaveG ? { 'aria-current': 'true' } : {})} style={{ '--cor': g.linha ? corEnfeite(g.tipo, g.linha) : '#6b6f76' }} onClick={clicar} onContextMenu={abrir}>
          {corpo}
        </button>
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
    <ComTopo total={total}>
      <div className="inv-v2">
      <div className="inv-v2-lista">
      <div className="inv-barra">
        <label className="inv-pesquisa">
          <IconeUI tipo="busca" tamanho={20}/>
          <input type="search" placeholder={t('Pesquisar no inventário…')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        {!['caixa', 'avenda'].includes(aba) && <details className="inv-filtro-raridade"><summary><IconeUI tipo="ajustes" tamanho={18} />{t("Raridade")}{rar !== "todas" && <i />}</summary>      {['tudo', 'arma', 'faca', 'luva', 'adesivo', 'chaveiro', 'emblema', 'trilha', 'grafite'].includes(aba) && total > 0 && (
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
</details>}
        <BotaoTrocas aoMudouInventario={recarregarInv} />
        {!['caixa', 'avenda'].includes(aba) && (
          <button type="button" className={`inv-btn inv-btn-sel${modoSel ? ' is-ativo' : ''}`} onClick={() => (modoSel ? sairDaSelecao() : setModoSel(true))}>
            <IconeUI tipo="selecionar" tamanho={19} />
            {modoSel ? t('Cancelar seleção') : t('Selecionar')}
          </button>
        )}
        {!['caixa', 'avenda'].includes(aba) && <label className="inv-ordem-caixa">
          <IconeUI tipo="ordenar" tamanho={18} />
          <select className="inv-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label={t('Ordenar')}>
            {ORDENS.map(([id, nome]) => (
              <option key={id} value={id}>
                {t(nome)}
              </option>
            ))}
          </select>
          <IconeUI tipo="baixo" tamanho={18} className="inv-ordem-seta" />
        </label>}
      </div>

      <div className="inv-topo">
        <nav className="inv-abas" role="tablist">
          {ABAS.map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
              {t(nome)}
              {id === 'avenda' && anuncios.length > 0 && ` (${anuncios.length})`}
            </button>
          ))}
        </nav>
        <span className="inv-estado" aria-live="polite">
          {estado === 'salvando' && t('Salvando…')}
          {estado === 'salvo' && <b className="inv-ok">{t('Salvo!')}</b>}
          {estado === 'erro' && <b className="inv-erro">{t('Não deu para salvar. Tentando de novo ao mudar algo.')}</b>}
        </span>
      </div>

      {avisoVenda && <p className="inv-aviso-venda" role="status">{avisoVenda}</p>}
      {anuncios.length > 0 && ['tudo', 'arma', 'faca', 'luva', 'adesivo', 'chaveiro'].includes(aba) && (
        <p className="inv-avenda-faixa">
          <span>{t('Você tem {n} item(ns) à venda no mercado. Enquanto estão anunciados, eles ficam fora do inventário.', { n: anuncios.length })}</span>
          <button type="button" className="inv-btn" onClick={() => setAba('avenda')}>
            {t('Ver à venda')}
          </button>
        </p>
      )}

      <div className="inv-lista-rolagem">
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
              {t('Você não tem nada à venda. Clique numa arma, adesivo ou chaveiro e escolha "Vender no mercado" para anunciar pelo preço que quiser.')} <a href="/loja/?aba=skins">{t('Ver o mercado')}</a>
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
        <div className="inv-secoes">
        {itens.some((it) => !ehPerfil(it)) && <section aria-label={t('Armas e skins')}>
        {aba === 'tudo' && <h3>{t('Armas e skins')}</h3>}
        <ul className="inv-itens">
          {itens.filter((it) => !ehPerfil(it)).map((it) => (
            <Cartao key={it.__id} item={it} idx={idx} adesivos={adesivosPorId} chaveiros={chaveirosPorId} equip={inv.equip} aoAbrirMenu={modoSel ? alternarSel : abrirMenu} aoSelecionar={modoSel ? undefined : (e) => celular ? abrirMenu(e, it) : selecionar(`i:${it.__id}`, e.currentTarget)} aoCadeado={() => alternarCadeado(it.__id)} ativo={!modoSel && selChaveAtual === `i:${it.__id}`} selecionado={modoSel ? sel.has(it.__id) : undefined} valor={valores[it.__id]?.v} />
          ))}
        </ul>
        </section>}
        {mostrarC4 && <section aria-label="C4"><h3>C4</h3><ul className="inv-itens"><Cartao key="c4" item={{ ...inv.itens[ID_C4], __id: ID_C4 }} idx={idx} adesivos={adesivosPorId} chaveiros={chaveirosPorId} equip={inv.equip} aoAbrirMenu={abrirMenu} aoSelecionar={(e) => celular ? abrirMenu(e, { ...inv.itens[ID_C4], __id: ID_C4 }) : selecionar(`i:${ID_C4}`, e.currentTarget)} ativo={selChaveAtual === `i:${ID_C4}`} /></ul></section>}
        {PERFIL_TIPOS.map((tipo) => {
          const grupo = itens.filter((it) => it.t === tipo)
          return grupo.length > 0 && <section key={tipo} aria-label={t(NOME_PERFIL[tipo])}>
            {aba === 'tudo' && <h3>{t(tipo === 'emblema' ? 'Pins' : tipo === 'trilha' ? 'Trilhas sonoras' : 'Grafites')}</h3>}
            <ul className="inv-itens">{grupo.map((it) => (
              <Cartao key={it.__id} item={it} idx={idx} adesivos={adesivosPorId} chaveiros={chaveirosPorId} equip={inv.equip} aoAbrirMenu={abrirMenu} aoSelecionar={(e) => celular ? abrirMenu(e, it) : selecionar(`i:${it.__id}`, e.currentTarget)} ativo={selChaveAtual === `i:${it.__id}`} />
            ))}</ul>
          </section>
        })}
        {[[ 'adesivo', 'Adesivos' ], [ 'chaveiro', 'Amuletos' ], [ 'caixa', 'Caixas' ]].map(([tipo, nome]) => {
          const grupo = guardados.filter(g => g.tipo === tipo)
          return grupo.length > 0 && <section key={tipo} aria-label={t(nome)}>
            <h3>{t(nome)}</h3>
            <ul className="inv-itens">{grupo.map(cartaoGuardado)}</ul>
          </section>
        })}
        {!itens.length && !guardados.length && !mostrarC4 && <p className="inv-nada">{t('Nenhum item encontrado.')}</p>}
        </div>
      )}
      </div>
      </div>
      {!celular && <PainelItem
        mapa={mapa3d.dados}
        alvo={alvo}
        idx={idx}
        equip={inv.equip}
        valor={alvo?.valor}
        celular={celular}
        aberto={gaveta}
        aoFechar={fecharGaveta}
        aoEquipar={(times) => times.forEach((l) => equipar(alvo.item.__id, l))}
        aoDesequipar={(times) => times.forEach((l) => desequipar(alvo.item.__id, l))}
        aoEditar={() => setJanela({ tipo: 'editar', id: alvo.item.__id })}
        aoDetalhes={() => (alvo.guardado ? setInspEnfeite({ t: alvo.item.t, d: alvo.def, p: 0 }) : setJanela({ tipo: 'inspecionar', id: alvo.item.__id }))}
      />}
      </div>

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
          aoEditar={() => { setJanela({ tipo: 'editar', id: menu.id }); fecharMenu() }}
          aoInspecionar={() => { setJanela({ tipo: 'inspecionar', id: menu.id }); fecharMenu() }}
          valor={valores[menu.id]?.v}
          aoVender={() => { pedirAnuncio(menu.id); fecharMenu() }}
          aoVenderAgora={() => { pedirVenda([menu.id]); fecharMenu() }}
          aoCadeado={() => { alternarCadeado(menu.id); fecharMenu() }}
        />
      )}
      {menuGuardado && guardadoDoMenu && (() => {
        const todosIds = idsGuardados(guardadoDoMenu.tipo, guardadoDoMenu.def)
        const protegido = cadeadoGrupo(guardadoDoMenu.tipo, guardadoDoMenu.def)
        const ids = todosIds.filter(id => !inv.itens[id].cadeado)
        const fechar = () => setMenuGuardado(null)
        return (
          <MenuGuardado
            x={menuGuardado.x}
            y={menuGuardado.y}
            n={guardadoDoMenu.n}
            cadeado={protegido}
            aoCadeado={() => { alternarCadeadoGrupo(guardadoDoMenu.tipo, guardadoDoMenu.def); fechar() }}
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
      {janela?.tipo === 'editar' && itemJanela && (
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
            mudar((i) => ({ ...i, itens: { ...i.itens, [janela.id]: { ...limpo, cadeado: !!i.itens[janela.id]?.cadeado } } }))
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
          <button type="button" className="inv-btn" onClick={() => setSel(new Set(idsParaTodos))} title={t('Itens equipados ou com cadeado ficam de fora')}>
            {t('Selecionar todos ({n})', { n: idsParaTodos.length })}
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
    </ComTopo>
  )
}

// Topo da página: título e quantos itens o jogador tem, sobre a Mirage com a dupla de agentes (decorativos)
function TopoInventario({ total }) {
  const t = useT()
  return (
    <section className="v2-topo-pagina v2-cena inv-v2-topo">
      <img className="v2-cena-fundo" src={FUNDOS.inventario.src} width={FUNDOS.inventario.w} height={FUNDOS.inventario.h} alt="" decoding="async" fetchPriority="high" />
      <img className="v2-topo-arte" src={PERSONAGENS.inventarioDupla.src} width={PERSONAGENS.inventarioDupla.w} height={PERSONAGENS.inventarioDupla.h} alt="" decoding="async" />
      <header className="wrap v2-titulo">
        <div>
          <h1>{t('Seu inventário')}</h1>
          <p>{t('Organize sua coleção e personalize seu jogo.')}</p>
          {total != null && (
            <p className="inv-v2-total">
              <IconeUI tipo="mochila" tamanho={26} />
              <b className="v2-num">{t('{n} itens', { n: total.toLocaleString('pt-BR') })}</b>
            </p>
          )}
        </div>
      </header>
    </section>
  )
}

export default function Inventario() {
  return (
    <Layout pagina="inventario">
      <main className="inv-pagina">
        <Conteudo />
      </main>
    </Layout>
  )
}
