// Personalização do perfil de cada jogador: moldura do avatar e time.
// As escolhas ficam no worker do login (KV, GET /perfis = { steamId: { moldura, time, xp } }). Toda página que mostra
// avatar ou time lê o mapa e confere de novo a cada 30 s (sem recarregar a página); quem troca vê na hora.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { chamarApi, lerTextoApi, seForErroApi, enderecoApi } from './api.js'
import { useConta } from './conta.js'
import { podeUsarMolduraEvento, estiloFotoMoldura, classeForma, molduraPorId, urlMoldura, urlParada } from './molduras.js'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from './desempenho.js'
import { useT } from './i18n.js'
import { IconeCargo } from './cargos.jsx'
import { useOrdemRanking } from './ranking.js'
import { carregarTimes } from './times.js'
import { urlSelo } from './selosEquipe.js'
import { idCard } from './cardsPerfil.js'
import EmblemaSub from './EmblemaSub.jsx'
import { NIVEIS_SUB, SUB_MESES_PADRAO, nivelDaSub } from './assinatura.js'

const EVENTO = 'np-perfis'
const CACHE = 'np_perfis' // última lista lida (aparece já na troca de página, sem esperar a rede)

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
let lido = false // já leu os perfis do worker nesta página (o que veio do cache da aba pode estar velho)
function buscar() {
  if (!enderecoApi() || buscando) return
  buscando = lerTextoApi('/perfis', { cache: 'no-store' })
    .then((texto) => {
      if (texto !== textoPerfis) {
        textoPerfis = texto
        const d = JSON.parse(texto)
        if (d && typeof d === 'object') publicar(d)
      }
      // "frescos" só depois de publicar: quem espera (avisos de nível/insígnia) precisa já ver os perfis novos (XP do admin, o que já foi visto)
      if (!lido) {
        lido = true
        window.dispatchEvent(new Event(EVENTO))
      }
    })
    .catch(seForErroApi()) // worker fora: ficam os perfis que já tinha
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
  // Perfil que chegou pela conexão ao vivo (amigos.js): o admin mudou o meu perfil agora (insígnia nova, moldura...)
  window.addEventListener('np-perfil-ao-vivo', (e) => {
    const { id, perfil } = e.detail || {}
    if (!id) return
    const novo = { ...(mapa || {}) }
    if (perfil) novo[id] = perfil
    else delete novo[id]
    publicar(novo)
  })
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

// true depois que os perfis chegaram do worker (avisos de nível/insígnia esperam isso para saber o que já foi visto)
// Apelido escolhido no site (vem junto dos perfis do worker): vale no lugar do nome da Steam/do jogo em tudo que mostra jogadores
export const apelidoDe = (perfis, id, padrao = '') => (id && perfis?.[id]?.nick) || padrao
// troca o campo "nome" de uma lista de jogadores ({ steamId, nome }) pelo apelido de cada um
export const comApelidos = (lista, perfis) => (Array.isArray(lista) ? lista.map((j) => (perfis?.[j?.steamId]?.nick ? { ...j, nome: perfis[j.steamId].nick } : j)) : lista)

export function usePerfisFrescos() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const ler = () => setOk(lido)
    ler()
    window.addEventListener(EVENTO, ler)
    return () => window.removeEventListener(EVENTO, ler)
  }, [])
  return ok
}

// Chamada ao worker com o login (api.js: erro tipado; login vencido sai da conta). Resposta que traz os perfis já atualiza a página
export async function chamar(rota, corpo) {
  const d = await chamarApi(rota, corpo)
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
  dono: { nome: 'Dono', cor: '#ff4655', icone: 'coroa', imagem: 'verified.png', mostrar: true, pick: false },
  admin: { nome: 'Admin', cor: '#3498db', icone: 'escudo', imagem: 'verified.png', mostrar: true, pick: false },
}
const CONFIG_PADRAO = { molduraPorNivel: false, nivelMoldura: {}, cardPorNivel: false, nivelCard: {}, cardCargo: {}, cargos: [], molduraCargo: {}, selos: SELOS_PADRAO, equipe: { dono: null, admins: [] }, subMeses: SUB_MESES_PADRAO, molduraSub: {}, cardSub: {} }
let config = null
let textoConfig = null
let buscandoConfig = null
function buscarConfig() {
  if (!enderecoApi() || buscandoConfig) return
  buscandoConfig = lerTextoApi('/config', { cache: 'no-store' })
    .then((texto) => {
      if (texto === textoConfig) return
      textoConfig = texto
      const d = JSON.parse(texto)
      config = {
        molduraPorNivel: !!d?.molduraPorNivel,
        nivelMoldura: d?.nivelMoldura || {},
        cardPorNivel: !!d?.cardPorNivel,
        nivelCard: d?.nivelCard || {},
        cardCargo: d?.cardCargo || {},
        cargos: Array.isArray(d?.cargos) ? d.cargos : [],
        molduraCargo: d?.molduraCargo || {},
        selos: { dono: { ...SELOS_PADRAO.dono, ...d?.selos?.dono }, admin: { ...SELOS_PADRAO.admin, ...d?.selos?.admin } },
        equipe: { dono: d?.equipe?.dono || null, admins: Array.isArray(d?.equipe?.admins) ? d.equipe.admins : [] },
        subMeses: { ...SUB_MESES_PADRAO, ...d?.subMeses },
        molduraSub: d?.molduraSub || {},
        cardSub: d?.cardSub || {},
      }
      window.dispatchEvent(new Event(EVENTO_CONFIG))
    })
    .catch(seForErroApi()) // worker fora: fica a configuração que já tinha
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
// Os mesmos ajudantes para os cards (banners) do perfil: o id é o nome do arquivo
export const nivelDoCard = (config, nome) => (config.cardPorNivel ? Number(config.nivelCard?.[nome]) || 1 : 1)
export const cargoDoCard = (config, nome) => cargosComEquipe(config).find((c) => c.id === config.cardCargo?.[nome]) || null
// Cargos do painel + os da equipe: "_dono" (só o dono) e "_admin" (dono e admins), com o nome e a cor dos selos da equipe.
// Moldura/card exclusivo pode ser de qualquer um deles.
export const cargosComEquipe = (config) => [
  ...(config.cargos || []),
  { id: '_dono', nome: config.selos?.dono?.nome || 'Dono', cor: config.selos?.dono?.cor || '#ff4655', icone: config.selos?.dono?.icone || 'coroa' },
  { id: '_admin', nome: config.selos?.admin?.nome || 'Admin', cor: config.selos?.admin?.cor || '#3498db', icone: config.selos?.admin?.icone || 'escudo' },
]
export const cargoDaMoldura = (config, id) => cargosComEquipe(config).find((c) => c.id === config.molduraCargo?.[id]) || null
// Moldura / card só para assinantes: o nível mínimo de assinatura que exige (um item de NIVEIS_SUB) ou null. O Subscriber é "qualquer assinante".
export const subDaMoldura = (config, id) => NIVEIS_SUB.find((n) => n.id === config.molduraSub?.[id]) || null
export const subDoCard = (config, id) => NIVEIS_SUB.find((n) => n.id === config.cardSub?.[id]) || null
// true se o jogador (nivel = resultado de useNivelSub: null sem assinatura ativa) NÃO tem o nível mínimo exigido
export const semSubMinima = (minimo, nivel) => !!minimo && (nivel ? NIVEIS_SUB.findIndex((n) => n.id === nivel.id) : -1) < NIVEIS_SUB.findIndex((n) => n.id === minimo.id)

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
  const { cargos, equipe } = useConfigSite()
  const pos = usePosicaoTop(steamId)
  // quem é da equipe também "tem" os cargos _dono/_admin (usados só para molduras e cards exclusivos)
  const daEquipe = steamId && steamId === equipe?.dono ? ['_dono', '_admin'] : equipe?.admins?.includes(steamId) ? ['_admin'] : []
  return [...new Set([...manuais, ...daEquipe, ...cargos.filter((c) => c.top > 0 && pos >= 0 && pos < c.top).map((c) => c.id)])]
}

// Pick & Ban: a página fica escondida de todo mundo. Só vê quem tem um cargo com "Ver Pick & Ban" ligado, ou, sendo o dono ou um
// admin, o botão "Ver Pick & Ban" ligado no selo de Dono/Admin (painel admin → Cargos → Selos da equipe; desligado por padrão).
export function useAcessoPick() {
  const conta = useConta()
  const { cargos, selos, equipe } = useConfigSite()
  const ids = useCargosIdsDe(conta?.id)
  const doDono = !!conta && conta.id === equipe?.dono && !!selos?.dono?.pick
  const doAdmin = !!conta && !!equipe?.admins?.includes(conta.id) && !!selos?.admin?.pick
  return !!conta && (doDono || doAdmin || cargos.some((c) => c.pick && ids.includes(c.id)))
}

// Selo da equipe do jogador ({ id: '_dono' | '_admin', nome, cor, icone }), ou null se não for da equipe
// ou se o admin desligou esse selo ("mostrar")
function useSeloEquipe(steamId) {
  const { selos, equipe } = useConfigSite()
  if (steamId && steamId === equipe?.dono) return selos?.dono?.mostrar ? { id: '_dono', ...selos.dono } : null
  if (equipe?.admins?.includes(steamId)) return selos?.admin?.mostrar ? { id: '_admin', ...selos.admin } : null
  return null
}

// Selos do jogador: os cargos e, por último, o da equipe (dono ou admin, se estiver ligado)
export function useCargosDe(steamId) {
  const ids = useCargosIdsDe(steamId)
  const { cargos } = useConfigSite()
  const seloEquipe = useSeloEquipe(steamId)
  const pos = usePosicaoTop(steamId)
  // Cargos primeiro; o selo da equipe (Dono/Admin) por último, para não tomar o lugar do cargo onde só cabe 1.
  // Cargo com "Mostrar no site" desligado (oculto) não aparece como selo, mas continua valendo (molduras exclusivas).
  return [...cargos.filter((c) => ids.includes(c.id) && !c.oculto).map((c) => ({ ...c, nome: nomeDoCargo(c, pos) })), ...(seloEquipe ? [seloEquipe] : [])]
}

// Imagem do selo de dono/admin: escolhida no painel (aba Cargos), arquivo em public/assets/selos-equipe/ (selosEquipe.js).
// Se a imagem não carregar, volta o ícone desenhado do cargo.

// Imagem de selo (arquivo de public/assets/selos-equipe/). GIF animado: com "Melhorar desempenho" ou movimento reduzido
// mostra só o primeiro quadro (como os cards animados), desenhado num canvas.
function ImgSelo({ nome, className, onError, tamanho }) {
  const desempenho = useDesempenho()
  const semAnimacao = useSemAnimacao()
  const parar = (desempenho || semAnimacao) && /\.gif$/i.test(String(nome))
  const [parado, setParado] = useState(null)
  useEffect(() => {
    if (!parar) return setParado(null)
    let vivo = true
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d').drawImage(img, 0, 0)
        if (vivo) setParado(c.toDataURL('image/png'))
      } catch {
        // sem canvas: segue animado
      }
    }
    img.src = urlSelo(nome)
    return () => {
      vivo = false
    }
  }, [parar, nome])
  return <img className={className} src={parar && parado ? parado : urlSelo(nome)} alt="" width={tamanho} height={tamanho} draggable={false} onError={onError} />
}

// Dono e admin: só o ícone, colado na frente do nome do jogador. Nada se não for da equipe.
// Use dentro do nome: <IconeEquipe steamId={id} />{nome}
// Passando o mouse (ou focando/tocando) abre a mesma caixinha das insígnias, com a imagem, o nome e o que ele significa.
// A caixinha vai para o <body> (portal) e fica em position: fixed, porque o nome fica dentro de cartões com overflow: hidden
// (pódio e tabela do ranking, lista de amigos) que cortariam uma caixinha comum.
export function IconeEquipe({ steamId }) {
  const t = useT()
  const selo = useSeloEquipe(steamId)
  const [semImagem, setSemImagem] = useState(false)
  const [dica, setDica] = useState(null) // { x, y, ax, acima }
  if (!selo) return null
  const abrir = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const meio = r.left + r.width / 2
    const x = Math.min(Math.max(meio, 160), window.innerWidth - 160) // caixinha de até ~300px, sem sair da tela
    const acima = r.bottom + 130 > window.innerHeight
    setDica({ x, ax: meio - x, y: acima ? r.top - 10 : r.bottom + 10, acima })
  }
  const descricao = selo.id === '_dono' ? t('Dono da Neura Project.') : t('Faz parte da equipe de administração da Neura Project.')
  const imagem = semImagem ? <IconeCargo icone={selo.icone} tamanho={60} /> : <ImgSelo nome={selo.imagem} />
  return (
    <span
      className="icone-equipe"
      style={{ '--cg': selo.cor }}
      role="img"
      aria-label={selo.nome}
      tabIndex={0}
      onMouseEnter={abrir}
      onMouseLeave={() => setDica(null)}
      onFocus={abrir}
      onBlur={() => setDica(null)}
    >
      {semImagem ? <IconeCargo icone={selo.icone} tamanho={16} /> : <ImgSelo nome={selo.imagem} onError={() => setSemImagem(true)} />}
      {dica &&
        createPortal(
          <span className={`ins-dica ins-dica-fixa${dica.acima ? ' acima' : ''}`} role="tooltip" style={{ left: dica.x, top: dica.y, '--ax': `${dica.ax}px`, '--cg': selo.cor }}>
            {imagem}
            <span>
              <b>{selo.nome}</b>
              <small>{descricao}</small>
            </span>
          </span>,
          document.body,
        )}
    </span>
  )
}

// Selo de dono/admin com a imagem escolhida + nome (painel admin)
export function SeloEquipe({ selo, classe = '' }) {
  const [semImagem, setSemImagem] = useState(false)
  return (
    <span className={`selo-cargo ${classe}`} style={{ '--cg': selo.cor }} title={selo.nome}>
      {semImagem ? <IconeCargo icone={selo.icone} /> : <ImgSelo className="selo-img" nome={selo.imagem} onError={() => setSemImagem(true)} />}
      {selo.nome}
    </span>
  )
}

// Ícone do cargo: a imagem escolhida no painel (arquivo de public/assets/selos-equipe/, como o selo do dono e dos admins) ou, sem
// imagem (ou se ela não carregar), o ícone desenhado.
export function IconeDoCargo({ cargo, tamanho = 12 }) {
  const [semImagem, setSemImagem] = useState(false)
  if (!cargo.imagem || semImagem) return <IconeCargo icone={cargo.icone} tamanho={tamanho} />
  return <ImgSelo className="selo-img" nome={cargo.imagem} tamanho={tamanho} onError={() => setSemImagem(true)} />
}

// Selo de cargo: imagem (ou ícone) + nome, na cor do cargo
export function SeloCargo({ cargo, classe = '' }) {
  return (
    <span className={`selo-cargo ${classe}`} style={{ '--cg': cargo.cor }} title={`Cargo: ${cargo.nome}`}>
      {cargo.imagem ? <IconeDoCargo cargo={cargo} /> : <IconeCargo icone={cargo.icone} />}
      {cargo.nome}
    </span>
  )
}

// Selos de cargo de um jogador (nada se não tiver). Com `max`, mostra só os primeiros e uma bolinha "+N" que abre
// os outros num painel (fecha clicando fora, com Esc ou ao rolar). O painel vai para o <body> (portal) e fica em
// position: fixed embaixo da bolinha: assim os cards com overflow: hidden (pódio e tabela do ranking) não cortam.
// lista: selos já montados (ex.: tabela do painel admin) no lugar dos do jogador
export function CargosDe({ steamId, classe = '', max = Infinity, lista }) {
  const t = useT()
  const doJogador = useCargosDe(steamId)
  // Dono/admin aparecem só como ícone na frente do nome (IconeEquipe), não como selo de texto.
  // Com `lista` (tabela do painel admin) nada muda: os selos vêm prontos.
  const cargos = lista ?? doJogador.filter((c) => c.id !== '_dono' && c.id !== '_admin')
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
let eu = { id: null, admin: false, dono: false, painel: false, abas: [] }
let buscandoEu = null
export function useAdmin(conta) {
  const [atual, setAtual] = useState(eu)
  useEffect(() => {
    if (!conta?.id) {
      setAtual({ id: null, admin: false, dono: false, painel: false, abas: [] })
      return
    }
    if (eu.id !== conta.id) buscandoEu = null
    buscandoEu ??= chamar('/eu')
      .then((d) => (eu = { id: d.id, admin: !!d.admin, dono: !!d.dono, painel: !!d.painel, abas: Array.isArray(d.abas) ? d.abas : [] }))
      .catch(seForErroApi(() => (eu = { id: conta.id, admin: false, dono: false, painel: false, abas: [] })))
    let vivo = true
    buscandoEu.then((e) => vivo && setAtual(e))
    return () => {
      vivo = false
    }
  }, [conta?.id])
  return atual
}

// ── Time escolhido ──
// Lista de times (nome + logo): só os times criados no site (página /equipes/). Time apagado não aparece.
let times = null
let buscandoTimes = null

export function useListaTimes() {
  const [lista, setLista] = useState(() => times || [])
  useEffect(() => {
    buscandoTimes ??= carregarTimes()
      .then((l) => (times = l.filter((t) => t?.nome)))
      .catch(seForErroApi(() => (times = [])))
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

// Molduras animam também no celular. Movimento reduzido e economia de dados
// preservam a versão parada; a animação só carrega quando aparece na tela.
function useSemAnimacao() {
  const [sem, setSem] = useState(false)
  useEffect(() => {
    const consultas = ['(prefers-reduced-motion: reduce)'].map((q) => window.matchMedia(q))
    const ler = () => setSem(consultas.some((c) => c.matches) || !!navigator.connection?.saveData)
    ler()
    consultas.forEach((c) => c.addEventListener('change', ler))
    return () => consultas.forEach((c) => c.removeEventListener('change', ler))
  }, [])
  return sem
}

// Desenho da moldura por cima de um avatar (o pai precisa ter position: relative e o tamanho do avatar)
export function CamadaMoldura({ id, parada = false }) {
  const desempenho = useDesempenho()
  const semAnimacao = useSemAnimacao()
  const ref = useRef(null)
  const [vista, setVista] = useState(false)
  const m = molduraPorId(id)
  const podeAnimar = !parada && !desempenho && !semAnimacao
  useEffect(() => {
    if (!m || !podeAnimar || vista) return
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return setVista(true)
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVista(true)
          obs.disconnect()
        }
      },
      { rootMargin: '100px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [m, podeAnimar, vista])
  if (!m) return null
  const url = podeAnimar && vista ? urlMoldura(m.id) : urlParada(m.id)
  return <span ref={ref} className="moldura" aria-hidden="true" style={{ backgroundImage: `url("${url}")`, ...(m.escala ? { '--escala': m.escala } : {}) }} />
}

// Envolve o avatar e põe a moldura do jogador por cima (sem moldura, devolve o avatar como está).
// cheio: o avatar ocupa 100% do pai (ex.: avatar do pódio do ranking, que tem tamanho fixo).
// Moldura exclusiva de um cargo que o jogador perdeu (ex.: saiu do top 3) some na hora e o worker tira do perfil.
// Vale também para moldura posta por admin: exclusiva só aparece para quem tem o cargo (o worker ainda tira do perfil).
// Emblema Premium é opt-in (prop `emblema`): usado em todo lugar que mostra o avatar do jogador (nav, ranking, partidas,
// lobby, amigos, perfil...), menos onde o chamador decide que fica poluído (ex.: pódio do ranking, com a moldura do carnaval).
// O tamanho do emblema já é proporcional ao avatar (site.css: .emblema-sub), então ele nunca fica grande demais num lugar pequeno.
// soEmblema mantém listas e avisos sem moldura, sem adicionar emblemas.
export function ComMoldura({ steamId, children, cheio = false, emblema = false, soEmblema = false, parado = false }) {
  const perfil = usePerfis()[steamId] || {}
  const config = useConfigSite()
  const cargos = useCargosIdsDe(steamId)
  const nivelSub = useNivelSub(steamId)
  const desempenho = useDesempenho()
  const semMovimento = useSemAnimacao()
  const semAnimacao = parado || desempenho || semMovimento // listas mobile usam o mesmo emblema, sem decodificar animações
  const id = perfil.moldura
  const exige = config.molduraCargo?.[id]
  // Dono e admins usam qualquer moldura (exclusiva de cargo também)
  const daEquipe = steamId === config.equipe?.dono || !!config.equipe?.admins?.includes(steamId)
  const selo = emblema && nivelSub ? <EmblemaSub nivel={nivelSub} parado={semAnimacao} /> : null
  const faltaSub = !daEquipe && semSubMinima(subDaMoldura(config, id), nivelSub) // moldura só de assinantes e o jogador não tem o nível
  if (soEmblema || !podeUsarMolduraEvento(id, perfil) || !molduraPorId(id) || faltaSub || (exige && !cargos.includes(exige) && !(daEquipe && exige !== '_dono')))
    return selo ? (
      <span className={`emblema-box${cheio ? ' cheio' : ''}`}>
        {children}
        {selo}
      </span>
    ) : (
      children
    )
  return (
    <span className={`moldura-box${cheio ? ' cheio' : ''}${classeForma(id)}`} style={estiloFotoMoldura(id)}>
      {children}
      <CamadaMoldura id={id} parada={parado} />
      {selo}
    </span>
  )
}

// Só o emblema (para quem monta a própria caixa do avatar, como a prévia do Personalizar): nada se o jogador não é assinante
export function EmblemaDe({ steamId }) {
  const nivel = useNivelSub(steamId)
  const desempenho = useDesempenho()
  const semMovimento = useSemAnimacao()
  return nivel ? <EmblemaSub nivel={nivel} parado={desempenho || semMovimento} /> : null
}

// Estado da assinatura Premium do jogador (ver assinatura.js): null sem assinatura ativa, ou { id, nome, meses, ... } do nível dele
export function useNivelSub(steamId) {
  const sub = usePerfis()[steamId]?.sub
  const { subMeses } = useConfigSite()
  return nivelDaSub(sub, subMeses)
}

// Card (banner) do jogador, como mostram o perfil e o ranking: o id do card escolhido, ou null se não tem. Card exclusivo de um
// cargo que o jogador não tem some na hora (o worker tira do perfil depois). Dono e admins usam qualquer um, menos os "só do dono".
export function useCardDe(steamId) {
  const salvo = usePerfis()[steamId]?.card
  const config = useConfigSite()
  const cargos = useCargosIdsDe(steamId)
  const nivelSub = useNivelSub(steamId)
  if (!salvo) return null
  const id = idCard(salvo)
  const exige = config.cardCargo?.[id]
  const daEquipe = steamId === config.equipe?.dono || !!config.equipe?.admins?.includes(steamId)
  if (!daEquipe && semSubMinima(subDoCard(config, id), nivelSub)) return null // card só de assinantes e o jogador não tem o nível
  return !exige || cargos.includes(exige) || (daEquipe && exige !== '_dono') ? id : null
}

// Selo do time escolhido (logo + nome), ou nada se o jogador não escolheu. classe: estilo de cada página.
// soLogo: só o logo (o nome fica no tooltip), para quando falta espaço (pódio do ranking)
export function TimeEscolhido({ steamId, classe = '', soLogo = false }) {
  const t = useT()
  const time = useTimeDe(steamId)
  const [erroLogo, setErroLogo] = useState(false)
  if (!time) return null
  return (
    <span className={`time-escolhido${soLogo ? ' so-logo' : ''} ${classe}`} title={t('Time: {nome}', { nome: time.nome })}>
      {/^https?:\/\//.test(time.logo || '') && !erroLogo ? <img src={time.logo} alt="" loading="lazy" onError={() => setErroLogo(true)} /> : <i aria-hidden="true">{time.nome.slice(0, 1)}</i>}
      {!soLogo && <span>{time.nome}</span>}
    </span>
  )
}
