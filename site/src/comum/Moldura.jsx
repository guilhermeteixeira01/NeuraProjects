// Personalização do perfil de cada jogador: moldura do avatar e time.
// As escolhas ficam no worker do login (KV, GET /perfis = { steamId: { moldura, time, xp } }). Toda página que mostra
// avatar ou time lê o mapa e confere de novo a cada 30 s (sem recarregar a página); quem troca vê na hora.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CONFIG } from './config.js'
import { sair, tokenConta } from './conta.js'
import { classeForma, molduraPorId, urlMoldura, urlParada } from './molduras.js'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from './desempenho.js'
import { useT } from './i18n.js'
import { IconeCargo } from './cargos.jsx'
import { useOrdemRanking } from './ranking.js'

const EVENTO = 'np-perfis'
const CACHE = 'np_perfis' // última lista lida (aparece já na troca de página, sem esperar a rede)
const base = () => CONFIG.loginSteam.replace(/\/$/, '')

let mapa = null // { steamId: { moldura?, time? } }
let buscando = null

function publicar(novo) {
  mapa = novo || {}
  try {
    sessionStorage.setItem(CACHE, JSON.stringify(mapa))
  } catch {
    // sem armazenamento: só não guarda para a próxima página
  }
  window.dispatchEvent(new Event(EVENTO))
}

// Lê os perfis do worker; só republica (e a página só redesenha) se mudou desde a última leitura
let textoPerfis = null
function buscar() {
  if (!CONFIG.loginSteam || buscando) return
  buscando = fetch(`${base()}/perfis`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : null))
    .then((texto) => {
      if (!texto || texto === textoPerfis) return
      textoPerfis = texto
      const d = JSON.parse(texto)
      if (d && typeof d === 'object') publicar(d)
    })
    .catch(() => {})
    .finally(() => (buscando = null))
}

// Atualização sozinha: perfis (moldura, time, XP do admin) e regras das molduras a cada 30 s, só com a aba visível,
// e na hora em que a pessoa volta para a aba. Quem troca a moldura num lugar vê em todas as abas e aparelhos.
const A_CADA = 30000
let relogio = false
function atualizarSozinho() {
  if (relogio || typeof window === 'undefined') return
  relogio = true
  const tudo = () => {
    if (document.visibilityState !== 'visible') return
    buscar()
    buscarConfig()
  }
  setInterval(tudo, A_CADA)
  document.addEventListener('visibilitychange', tudo)
  // Voltou para esta janela (ex.: mudou algo no celular e voltou ao computador): confere na hora
  window.addEventListener('focus', tudo)
}

// Perfis de todos os jogadores ({} no HTML gerado e até a primeira leitura no navegador)
export function usePerfis() {
  // Começa vazio (igual ao HTML gerado); componente que abre depois (ex.: janela) já pega o que foi lido
  const [atual, setAtual] = useState(() => (typeof window === 'undefined' ? {} : mapa || {}))
  useEffect(() => {
    if (!mapa) {
      try {
        mapa = JSON.parse(sessionStorage.getItem(CACHE) || 'null')
      } catch {
        mapa = null
      }
    }
    const ler = () => setAtual(mapa || {})
    ler()
    buscar()
    atualizarSozinho()
    window.addEventListener(EVENTO, ler)
    return () => window.removeEventListener(EVENTO, ler)
  }, [])
  return atual
}

// Chamada ao worker com o login (GET sem corpo, POST com corpo). Erros: 'login' (login vencido: sai da conta)
// ou a resposta do worker ({ erro, ... }, ex.: 'nivel', 'bloqueado', 'admin').
export async function chamar(rota, corpo) {
  const token = tokenConta()
  if (!token || !CONFIG.loginSteam) throw Object.assign(new Error('login'), { dados: {} })
  const r = await fetch(`${base()}${rota}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => null)
  if (r.status === 401) {
    sair()
    throw Object.assign(new Error('login'), { dados: d || {} })
  }
  if (!r.ok || d?.erro) throw Object.assign(new Error(d?.erro || 'falhou'), { dados: d || {} })
  if (d?.perfis) {
    publicar(d.perfis) // toda mudança de perfil já aparece na página
    textoPerfis = null // a próxima leitura sozinha confirma com o worker
  }
  return d
}

// Salva o perfil de quem está logado. mudar = { moldura?, time? } (só os campos enviados mudam; null tira).
export const salvarPerfil = (mudar) => chamar('/perfil', mudar)

// Regras públicas: { molduraPorNivel, nivelMoldura: { idMoldura: nível } }
const EVENTO_CONFIG = 'np-config'
// Selos da equipe (dono e admins): o dono edita no painel (aba Cargos). Padrão igual ao do worker.
export const SELOS_PADRAO = {
  dono: { nome: 'Dono', cor: '#ff4655', icone: 'coroa', mostrar: true },
  admin: { nome: 'Admin', cor: '#3498db', icone: 'escudo', mostrar: true },
}
const CONFIG_PADRAO = { molduraPorNivel: false, nivelMoldura: {}, cargos: [], molduraCargo: {}, selos: SELOS_PADRAO, equipe: { dono: null, admins: [] } }
let config = null
let textoConfig = null
let buscandoConfig = null
function buscarConfig() {
  if (!CONFIG.loginSteam || buscandoConfig) return
  buscandoConfig = fetch(`${base()}/config`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : null))
    .then((texto) => {
      if (!texto || texto === textoConfig) return
      textoConfig = texto
      const d = JSON.parse(texto)
      config = {
        molduraPorNivel: !!d?.molduraPorNivel,
        nivelMoldura: d?.nivelMoldura || {},
        cargos: Array.isArray(d?.cargos) ? d.cargos : [],
        molduraCargo: d?.molduraCargo || {},
        selos: { dono: { ...SELOS_PADRAO.dono, ...d?.selos?.dono }, admin: { ...SELOS_PADRAO.admin, ...d?.selos?.admin } },
        equipe: { dono: d?.equipe?.dono || null, admins: Array.isArray(d?.equipe?.admins) ? d.equipe.admins : [] },
      }
      window.dispatchEvent(new Event(EVENTO_CONFIG))
    })
    .catch(() => {})
    .finally(() => (buscandoConfig = null))
}
export function useConfigSite() {
  const [atual, setAtual] = useState(() => config || CONFIG_PADRAO)
  useEffect(() => {
    const ler = () => setAtual(config || CONFIG_PADRAO)
    ler()
    buscarConfig()
    atualizarSozinho()
    window.addEventListener(EVENTO_CONFIG, ler)
    return () => window.removeEventListener(EVENTO_CONFIG, ler)
  }, [])
  return atual
}
// Nível que a moldura exige (1 = livre), conforme a regra do admin
export const nivelDaMoldura = (config, id) => (config.molduraPorNivel ? Number(config.nivelMoldura?.[id]) || 1 : 1)
// Cargo de quem pode usar a moldura (exclusiva de Premium, VIP...), ou null
export const cargoDaMoldura = (config, id) => (config.cargos || []).find((c) => c.id === config.molduraCargo?.[id]) || null

// Nome do cargo no selo. Cargo automático com "numerar" ligado mostra a posição de quem está no top:
// "Campeão 1", "Campeão 2", "Campeão 3". pos = posição no ranking (0 = primeiro), -1 = fora.
export const nomeDoCargo = (c, pos) => (c.numerar && c.top > 0 && pos >= 0 && pos < c.top ? `${c.nome} ${pos + 1}` : c.nome)

// Posição do jogador no ranking que vale para os cargos automáticos (-1 = fora ou sem cargo automático)
function usePosicaoTop(steamId) {
  const perfis = usePerfis()
  const { cargos } = useConfigSite()
  const ordem = useOrdemRanking(cargos.some((c) => c.top > 0))
  return ordem.filter((id) => !perfis[id]?.ocultoRanking).indexOf(steamId) // oculto do ranking: o próximo sobe
}

// Ids dos cargos do jogador: os que o admin deu + os automáticos ("top N do ranking", entram e saem com a posição)
export function useCargosIdsDe(steamId) {
  const perfis = usePerfis()
  const manuais = perfis[steamId]?.cargos || []
  const { cargos } = useConfigSite()
  const pos = usePosicaoTop(steamId)
  return [...new Set([...manuais, ...cargos.filter((c) => c.top > 0 && pos >= 0 && pos < c.top).map((c) => c.id)])]
}

// Selos do jogador: primeiro o da equipe (dono ou admin, se estiver ligado), depois os cargos
export function useCargosDe(steamId) {
  const ids = useCargosIdsDe(steamId)
  const { cargos, selos, equipe } = useConfigSite()
  const daEquipe =
    steamId && steamId === equipe?.dono ? (selos?.dono?.mostrar ? [{ id: '_dono', ...selos.dono }] : [])
    : equipe?.admins?.includes(steamId) ? (selos?.admin?.mostrar ? [{ id: '_admin', ...selos.admin }] : [])
    : []
  const pos = usePosicaoTop(steamId)
  return [...daEquipe, ...cargos.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, nome: nomeDoCargo(c, pos) }))]
}

// Selo de cargo: coroa + nome, na cor do cargo
export function SeloCargo({ cargo, classe = '' }) {
  return (
    <span className={`selo-cargo ${classe}`} style={{ '--cg': cargo.cor }} title={`Cargo: ${cargo.nome}`}>
      <IconeCargo icone={cargo.icone} />
      {cargo.nome}
    </span>
  )
}

// Selos de cargo de um jogador (nada se não tiver). Com `max`, mostra só os primeiros e uma bolinha "+N" que abre
// os outros num painel (fecha clicando fora, com Esc ou ao rolar). O painel vai para o <body> (portal) e fica em
// position: fixed embaixo da bolinha: assim os cards com overflow: hidden (pódio e tabela do ranking) não cortam.
export function CargosDe({ steamId, classe = '', max = Infinity }) {
  const t = useT()
  const cargos = useCargosDe(steamId)
  const [aberto, setAberto] = useState(null) // posição do painel ({ top, left }) ou null
  const caixa = useRef(null)
  const painel = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const fechar = () => setAberto(null)
    const fora = (e) => !caixa.current?.contains(e.target) && !painel.current?.contains(e.target) && fechar()
    const tecla = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', fechar, { passive: true, capture: true })
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', fechar, { capture: true })
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])
  const alternar = (e) => {
    if (aberto) return setAberto(null)
    const r = e.currentTarget.getBoundingClientRect()
    // centralizado na bolinha, sem sair da tela (painel tem uns 180px de largura)
    setAberto({ top: r.bottom + 8, left: Math.min(Math.max(r.left + r.width / 2, 100), window.innerWidth - 100) })
  }
  if (!cargos.length) return null
  const visiveis = cargos.length > max ? cargos.slice(0, max) : cargos
  const resto = cargos.slice(visiveis.length)
  return (
    <span className={`cargos ${classe}`}>
      {visiveis.map((c) => (
        <SeloCargo key={c.id} cargo={c} />
      ))}
      {resto.length > 0 && (
        <span className="cargos-mais" ref={caixa}>
          <button
            type="button"
            className="cargos-mais-btn"
            aria-expanded={!!aberto}
            aria-label={t('Mostrar mais {n} cargos', { n: resto.length })}
            onClick={alternar}
          >
            +{resto.length}
          </button>
          {aberto &&
            createPortal(
              <span className="cargos-mais-painel" ref={painel} role="dialog" aria-label={t('Cargos')} style={{ top: aberto.top, left: aberto.left }}>
                {resto.map((c) => (
                  <SeloCargo key={c.id} cargo={c} />
                ))}
              </span>,
              document.body,
            )}
        </span>
      )}
    </span>
  )
}

// Quem está logado é admin? (o worker confere de verdade em toda ação; aqui é só para mostrar a aba)
let eu = { id: null, admin: false, dono: false }
let buscandoEu = null
export function useAdmin(conta) {
  const [atual, setAtual] = useState(eu)
  useEffect(() => {
    if (!conta?.id) {
      setAtual({ id: null, admin: false, dono: false })
      return
    }
    if (eu.id !== conta.id) buscandoEu = null
    buscandoEu ??= chamar('/eu')
      .then((d) => (eu = { id: d.id, admin: !!d.admin, dono: !!d.dono }))
      .catch(() => (eu = { id: conta.id, admin: false, dono: false }))
    let vivo = true
    buscandoEu.then((e) => vivo && setAtual(e))
    return () => {
      vivo = false
    }
  }, [conta?.id])
  return atual
}

// ── Time escolhido ──
// Lista de times (nome + logo) da cópia publicada no site (assets/data/times.json, editada em /times/).
// Time que saiu da lista não aparece.
let times = null
let buscandoTimes = null

export function useListaTimes() {
  const [lista, setLista] = useState(() => times || [])
  useEffect(() => {
    buscandoTimes ??= fetch('/assets/data/times.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (times = Array.isArray(d?.times) ? d.times.filter((t) => t?.nome) : []))
      .catch(() => (times = []))
    let vivo = true
    buscandoTimes.then((l) => vivo && setLista(l))
    return () => {
      vivo = false
    }
  }, [])
  return lista
}

// { nome, logo } do time escolhido pelo jogador, ou null
export function useTimeDe(steamId) {
  const perfis = usePerfis()
  const lista = useListaTimes()
  const nome = perfis[steamId]?.time
  return (nome && lista.find((t) => t.nome === nome)) || null
}

// ── Moldura ──
// "Melhorar desempenho" ligado: molduras paradas (imagem estática no lugar da animação). Começa desligado (igual ao
// HTML gerado) e acompanha a troca na hora.
function useDesempenho() {
  const [ligado, setLigado] = useState(false)
  useEffect(() => {
    const ler = () => setLigado(desempenhoAtivo())
    ler()
    window.addEventListener(EVENTO_DESEMPENHO, ler)
    return () => window.removeEventListener(EVENTO_DESEMPENHO, ler)
  }, [])
  return ligado
}

// Desenho da moldura por cima de um avatar (o pai precisa ter position: relative e o tamanho do avatar)
export function CamadaMoldura({ id, parada = false }) {
  const desempenho = useDesempenho()
  const m = molduraPorId(id)
  if (!m) return null
  const url = parada || desempenho ? urlParada(m.id) : urlMoldura(m.id)
  return <span className="moldura" aria-hidden="true" style={{ backgroundImage: `url("${url}")`, ...(m.escala ? { '--escala': m.escala } : {}) }} />
}

// Envolve o avatar e põe a moldura do jogador por cima (sem moldura, devolve o avatar como está).
// cheio: o avatar ocupa 100% do pai (ex.: avatar do pódio do ranking, que tem tamanho fixo).
// Moldura exclusiva de um cargo que o jogador perdeu (ex.: saiu do top 3) some na hora e o worker tira do perfil.
// Vale também para moldura posta por admin: exclusiva só aparece para quem tem o cargo (o worker ainda tira do perfil).
export function ComMoldura({ steamId, children, cheio = false }) {
  const perfil = usePerfis()[steamId] || {}
  const config = useConfigSite()
  const cargos = useCargosIdsDe(steamId)
  const id = perfil.moldura
  const exige = config.molduraCargo?.[id]
  // Dono e admins usam qualquer moldura (exclusiva de cargo também)
  const daEquipe = steamId === config.equipe?.dono || !!config.equipe?.admins?.includes(steamId)
  if (!molduraPorId(id) || (exige && !cargos.includes(exige) && !daEquipe)) return children
  return (
    <span className={`moldura-box${cheio ? ' cheio' : ''}${classeForma(id)}`}>
      {children}
      <CamadaMoldura id={id} />
    </span>
  )
}

// Selo do time escolhido (logo + nome), ou nada se o jogador não escolheu. classe: estilo de cada página.
export function TimeEscolhido({ steamId, classe = '' }) {
  const t = useT()
  const time = useTimeDe(steamId)
  const [erroLogo, setErroLogo] = useState(false)
  if (!time) return null
  return (
    <span className={`time-escolhido ${classe}`} title={t('Time: {nome}', { nome: time.nome })}>
      {/^https?:\/\//.test(time.logo || '') && !erroLogo ? <img src={time.logo} alt="" loading="lazy" onError={() => setErroLogo(true)} /> : <i aria-hidden="true">{time.nome.slice(0, 1)}</i>}
      <span>{time.nome}</span>
    </span>
  )
}
