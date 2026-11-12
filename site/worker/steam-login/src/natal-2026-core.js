// Natal na Neura 2026 — Operação Presente: regras puras (sem acesso a dados), usadas pelo worker e pelo site.
//
// Configuração (doc "natal-2026-config", editada no painel admin → Natal 2026):
//   { ativo, inicio, fim, resgateAte, divulgacao, mapas: [7 mapas, um por dia] }
// A caixa "Presente da Neura" é fixa no código (worker/steam-login/src/caixa-natal.js): só facas e luvas.
// Sem datas válidas o evento fica DESATIVADO (nada é creditado e o banner da home não aparece).
// A duração é de 7 dias com virada à meia-noite de America/Sao_Paulo: início e fim precisam cair à meia-noite de Brasília
// e o fim (exclusivo) fica exatamente 7 dias civis depois do início.

export const EVENTO_NATAL = 'natal-2026'
export const NOME_EVENTO_NATAL = 'Natal na Neura 2026 — Operação Presente'
export const LINK_EVENTO_NATAL = '/eventos/natal-2026/'
export const FUSO_NATAL = 'America/Sao_Paulo'
export const DIAS_NATAL = 7
export const META_COLETIVA_NATAL = 100
const DIA = 86400000
const PRAZO_RESGATE_MAX = 90 * DIA
const DIVULGACAO_MAX = 60 * DIA

export const INSIGNIA_NATAL = 'natal-neura-2026'
export const INSIGNIA_NATAL_DOURADA = 'natal-neura-2026-dourada'
// A arte da moldura ainda não foi entregue: a recompensa fica indisponível (sem descontar estrelas) até existir em
// src/comum/molduras.js uma moldura com este id e { recompensa: MARCA_MOLDURA_NATAL }.
export const MOLDURA_NATAL = 'eventos/natal-neura-2026'
export const MARCA_MOLDURA_NATAL = 'natal-2026-moldura'
export const CAIXA_NATAL_ID = 90002 // reservado, fora do catálogo editável (a Premium é 90001)
export const CAIXA_NATAL_SLUG = 'presente-da-neura'

export const ARTES_NATAL = {
  estrela: '/assets/eventos/natal-2026/estrela-de-natal-64.webp',
  estrelaGrande: '/assets/eventos/natal-2026/estrela-de-natal-256.webp',
  caixa: '/assets/eventos/natal-2026/presente-da-neura-512.webp',
  insignia: `/assets/insignia/web/${INSIGNIA_NATAL}.webp`,
  insigniaDourada: `/assets/insignia/web/${INSIGNIA_NATAL_DOURADA}.webp`,
  banner: '/assets/banners/09-natal.webp',
  bannerPequeno: '/assets/banners/09-natal-860.webp',
}

export const INSIGNIAS_NATAL = [
  { id: INSIGNIA_NATAL, nome: 'Natal na Neura 2026', descricao: 'Resgatada com Estrelas de Natal na Operação Presente.', categoria: 'eventos' },
  { id: INSIGNIA_NATAL_DOURADA, nome: 'Natal na Neura 2026 · Dourada', descricao: 'A comunidade completou 100 partidas válidas na Operação Presente.', categoria: 'eventos' },
]

// Missões: o crédito de cada uma tem uma chave própria (uma vez por conta ou uma vez por dia). A mesma partida avança todas.
export const MISSOES_NATAL = [
  { id: 'ativacao', titulo: 'Entrar na Operação Presente', descricao: 'Ative o evento na sua conta.', estrelas: 10, frequencia: 'conta', meta: 1 },
  { id: 'partidas-dia', titulo: 'Dupla do dia', descricao: 'Complete 2 partidas válidas no mesmo dia.', estrelas: 20, frequencia: 'dia', meta: 2 },
  { id: 'mapa-do-dia', titulo: 'Mapa do dia', descricao: 'Complete 1 partida válida no mapa do dia.', estrelas: 15, frequencia: 'dia', meta: 1 },
  { id: 'dez-partidas', titulo: 'Maratona natalina', descricao: 'Complete 10 partidas válidas durante o evento.', estrelas: 40, frequencia: 'conta', meta: 10 },
]
const ESTRELAS = Object.fromEntries(MISSOES_NATAL.map((m) => [m.id, m.estrelas]))

export const RECOMPENSAS_NATAL = [
  { id: 'insignia', nome: 'Insígnia “Natal na Neura 2026”', descricao: 'Insígnia exclusiva desta edição, exibida no seu perfil.', custo: 30, arte: ARTES_NATAL.insignia },
  { id: 'moldura', nome: 'Moldura natalina de avatar', descricao: 'Moldura exclusiva para o seu avatar.', custo: 80, arte: null },
  { id: 'caixa', nome: 'Caixa “Presente da Neura”', descricao: 'Caixa que dá somente facas e luvas, entregue no seu inventário.', custo: 120, arte: ARTES_NATAL.caixa },
]
export const recompensaNatal = (id) => RECOMPENSAS_NATAL.find((r) => r.id === id) || null

// ── Datas no fuso de Brasília ──
const partesSP = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_NATAL, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
// Dia civil em Brasília: "2026-12-18"
export function diaNatal(t) {
  const p = partesSP(t)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
const numeroDoDia = (t) => Date.parse(`${diaNatal(t)}T00:00:00Z`) / DIA
const meiaNoiteSP = (t) => { const p = partesSP(t); return p.hour === 0 && p.minute === 0 && p.second === 0 && new Date(t).getUTCMilliseconds() === 0 }
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
const data = (v) => (typeof v === 'string' && ISO_COM_FUSO.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : NaN)
const MAPA = /^[a-z]{2,3}_[a-z0-9_]{1,32}$/
export const nomeDoMapaNatal = (m) => String(m || '').toLowerCase().split('/').pop()

// Confere o que o admin mandou. Devolve { config } normalizada ou { erro: <campo> }.
export function validarConfigNatal(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { erro: 'config' }
  const inicio = data(c.inicio), fim = data(c.fim), resgateAte = data(c.resgateAte)
  if (!Number.isFinite(inicio) || !meiaNoiteSP(inicio)) return { erro: 'inicio' }
  if (!Number.isFinite(fim) || !meiaNoiteSP(fim) || numeroDoDia(fim) - numeroDoDia(inicio) !== DIAS_NATAL) return { erro: 'fim' }
  if (!Number.isFinite(resgateAte) || resgateAte < fim || resgateAte > fim + PRAZO_RESGATE_MAX) return { erro: 'resgateAte' }
  const divulgacao = c.divulgacao == null || c.divulgacao === '' ? inicio - 7 * DIA : data(c.divulgacao)
  if (!Number.isFinite(divulgacao) || divulgacao > inicio || divulgacao < inicio - DIVULGACAO_MAX) return { erro: 'divulgacao' }
  if (!Array.isArray(c.mapas) || c.mapas.length !== DIAS_NATAL || c.mapas.some((m) => typeof m !== 'string' || !MAPA.test(m))) return { erro: 'mapas' }
  const iso = (t) => new Date(t).toISOString()
  return { config: { ativo: c.ativo === true, inicio: iso(inicio), fim: iso(fim), resgateAte: iso(resgateAte), divulgacao: iso(divulgacao), mapas: [...c.mapas] } }
}

// Config salva (ou nada) -> config com "habilitado": salva com datas válidas E marcada como ativa
export function configNatal(salva) {
  const r = salva ? validarConfigNatal(salva) : { erro: 'vazia' }
  if (r.erro) return { habilitado: false, ativo: false, configurada: false }
  return { ...r.config, configurada: true, habilitado: r.config.ativo }
}

// desativado | futuro | ativo | resgate | encerrado
export function estadoNatal(cfg, agora = Date.now()) {
  if (!cfg?.habilitado) return 'desativado'
  if (agora < Date.parse(cfg.inicio)) return 'futuro'
  if (agora < Date.parse(cfg.fim)) return 'ativo'
  if (agora <= Date.parse(cfg.resgateAte)) return 'resgate'
  return 'encerrado'
}
export const emDivulgacao = (cfg, agora = Date.now()) => !!cfg?.habilitado && agora >= Date.parse(cfg.divulgacao) && agora <= Date.parse(cfg.resgateAte)
export const dentroDoPeriodoNatal = (t, cfg) => !!cfg?.habilitado && Number.isFinite(t) && t >= Date.parse(cfg.inicio) && t < Date.parse(cfg.fim)
// 0..6 (dia do evento) ou -1 fora do período
export const indiceDiaNatal = (t, cfg) => (dentroDoPeriodoNatal(t, cfg) ? numeroDoDia(t) - numeroDoDia(Date.parse(cfg.inicio)) : -1)
export const mapaDoDiaNatal = (t, cfg) => cfg?.mapas?.[indiceDiaNatal(t, cfg)] || null
// Calendário para a página: [{ dia: "2026-12-18", indice, mapa }]
export const calendarioNatal = (cfg) => (cfg?.configurada ? cfg.mapas.map((mapa, i) => ({ indice: i, dia: diaNatal(Date.parse(cfg.inicio) + i * DIA + 12 * 3600000), mapa })) : [])

// Créditos que as partidas válidas (do registro oficial) e a ativação dão: { chave: estrelas }.
// partidas: [{ chave, fim (conclusão, ms), mapa }]. Partidas fora do período ou repetidas não contam.
export function creditosNatal(partidas, cfg, ativadoEm) {
  const creditos = {}
  if (!ativadoEm || !cfg?.habilitado) return creditos
  creditos.ativacao = ESTRELAS.ativacao
  const vistas = new Set(), porDia = {}
  for (const p of partidas || []) {
    if (!p?.chave || vistas.has(p.chave) || !dentroDoPeriodoNatal(p.fim, cfg)) continue
    vistas.add(p.chave)
    const dia = diaNatal(p.fim), d = (porDia[dia] ||= { n: 0, mapa: false })
    d.n++
    if (nomeDoMapaNatal(p.mapa) === mapaDoDiaNatal(p.fim, cfg)) d.mapa = true
  }
  for (const [dia, d] of Object.entries(porDia)) {
    if (d.n >= 2) creditos[`partidas-dia:${dia}`] = ESTRELAS['partidas-dia']
    if (d.mapa) creditos[`mapa-do-dia:${dia}`] = ESTRELAS['mapa-do-dia']
  }
  if (vistas.size >= 10) creditos['dez-partidas'] = ESTRELAS['dez-partidas']
  return creditos
}

// Progresso das missões para a tela (o dia de hoje e o período inteiro)
export function progressoNatal(partidas, cfg, creditos = {}, agora = Date.now()) {
  const validas = []
  const vistas = new Set()
  for (const p of partidas || []) if (p?.chave && !vistas.has(p.chave) && dentroDoPeriodoNatal(p.fim, cfg)) { vistas.add(p.chave); validas.push(p) }
  const hoje = diaNatal(agora), mapaHoje = mapaDoDiaNatal(agora, cfg)
  const deHoje = validas.filter((p) => diaNatal(p.fim) === hoje)
  return MISSOES_NATAL.map((m) => {
    if (m.id === 'ativacao') return { ...m, atual: creditos.ativacao ? 1 : 0, concluida: !!creditos.ativacao }
    if (m.id === 'partidas-dia') return { ...m, atual: Math.min(2, deHoje.length), concluida: !!creditos[`partidas-dia:${hoje}`], diasConcluidos: Object.keys(creditos).filter((k) => k.startsWith('partidas-dia:')).length }
    if (m.id === 'mapa-do-dia') return { ...m, mapa: mapaHoje, atual: deHoje.some((p) => nomeDoMapaNatal(p.mapa) === mapaHoje) ? 1 : 0, concluida: !!creditos[`mapa-do-dia:${hoje}`], diasConcluidos: Object.keys(creditos).filter((k) => k.startsWith('mapa-do-dia:')).length }
    return { ...m, atual: Math.min(10, validas.length), concluida: !!creditos['dez-partidas'] }
  })
}

export const somaEstrelas = (creditos) => Object.values(creditos || {}).reduce((s, c) => s + (Number(c?.v ?? c) || 0), 0)
export const gastoEstrelas = (resgates) => Object.values(resgates || {}).reduce((s, r) => s + (Number(r?.custo) || 0), 0)
