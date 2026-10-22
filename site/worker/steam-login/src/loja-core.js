/*
 * Loja de caixas: regras puras (sem KV, sem rede), usadas pelo worker (loja.js) e pelos testes (test/loja.test.mjs).
 *
 * Caixa: { id (número), slug, nome, img, preco, tier: 'barata'|'media'|'premium', ativa, cor,
 *          itens: [ { d: defIndex, p: paint, r: raridade 0..4, w: peso, min, max: desgaste da skin, l: modelo antigo } ],   (as skins comuns)
 *          facas: [ { d, p, w, min, max, l } ] }                                                                          (tier especial, raridade 5)
 * Raridades: 0 Comum (cinza), 1 Incomum (azul), 2 Raro (roxo), 3 Épico (rosa), 4 Lendário (vermelho), 5 Especial/faca (dourado).
 *
 * O sorteio é feito por quem chama com um gerador "rnd()" (0 <= x < 1). No worker é o gerador criptográfico (rndSeguro).
 */

export const RARIDADES = [
  { id: 0, nome: 'Comum', cor: '#b0c3d9' },
  { id: 1, nome: 'Incomum', cor: '#4b69ff' },
  { id: 2, nome: 'Raro', cor: '#8847ff' },
  { id: 3, nome: 'Épico', cor: '#d32ce6' },
  { id: 4, nome: 'Lendário', cor: '#eb4b4b' },
  { id: 5, nome: 'Item Raro Especial', cor: '#e4ae39' },
]

// Chances (%) por raridade e por faixa de desgaste: valores iniciais; o dono muda em /admin/loja-config (KV "loja-config")
export const CONFIG_PADRAO = {
  taxas: [52, 27, 13, 5.5, 2, 0.5], // vermelho 1 em 50 e faca 1 em 200 (antes 3% e 1%: saía arma cara e faca fácil demais)
  desgaste: [
    { nome: 'Factory New', min: 0, max: 0.07, chance: 10 },
    { nome: 'Minimal Wear', min: 0.07, max: 0.15, chance: 22 },
    { nome: 'Field-Tested', min: 0.15, max: 0.38, chance: 40 },
    { nome: 'Well-Worn', min: 0.38, max: 0.45, chance: 13 },
    { nome: 'Battle-Scarred', min: 0.45, max: 1, chance: 15 },
  ],
  maxQtd: 5,
}

// Gerador criptográfico: 0 <= x < 1 com 53 bits
export function rndSeguro() {
  const a = new Uint32Array(2)
  crypto.getRandomValues(a)
  return ((a[0] >>> 5) * 67108864 + (a[1] >>> 6)) / 9007199254740992
}

// Raridade a partir da cor da skin no catálogo (Steam): cinza e azul-claro = comum; faca/luva = especial
export function raridadeDaCor(cor, ehFaca = false) {
  if (ehFaca) return 5
  switch ((cor || '').toLowerCase()) {
    case '#b0c3d9':
    case '#5e98d9':
      return 0
    case '#4b69ff':
      return 1
    case '#8847ff':
      return 2
    case '#d32ce6':
      return 3
    case '#eb4b4b':
      return 4
    case '#e4ae39':
      return 5
    default:
      return 0
  }
}

export const nomeDoDesgaste = (f) => (f < 0.07 ? 'Factory New' : f < 0.15 ? 'Minimal Wear' : f < 0.38 ? 'Field-Tested' : f < 0.45 ? 'Well-Worn' : 'Battle-Scarred')

// Dificuldade pelo valor: dentro de cada raridade, quanto mais caro o item, menos chance ele tem (o peso do item é dividido por 1 + (valor / V0)^EXPO).
// Itens de até ~150 NP quase não mudam; um de 1.000 NP fica ~10x mais raro e um de 5.000 NP, centenas de vezes. O valor vem da tabela de preços (loja.js:
// definirValorador). Modo Jester (igual: true) ignora isto.
export const DIFICULDADE = { v0: 400, expo: 2 }
let valoradorDeItem = null
export const definirValorador = (fn) => {
  valoradorDeItem = fn
}
const pesoDoItem = (it, tipo) => {
  const w = it.w > 0 ? it.w : 0
  if (!w || it.igual || !valoradorDeItem) return w
  const v = Number(valoradorDeItem(it.t ? it : { ...it, t: tipo })) || 0
  return w / (1 + Math.pow(v / DIFICULDADE.v0, DIFICULDADE.expo))
}

// Índice sorteado por pesos (pesos <= 0 nunca saem)
export function sortearPeso(pesos, rnd) {
  let total = 0
  for (const p of pesos) total += p > 0 ? p : 0
  if (total <= 0) return -1
  let x = rnd() * total
  for (let i = 0; i < pesos.length; i++) {
    if (!(pesos[i] > 0)) continue
    x -= pesos[i]
    if (x < 0) return i
  }
  return pesos.findLastIndex((p) => p > 0)
}

// Faixa de desgaste sorteada primeiro (pela chance), depois o float dentro dela.
// A skin só existe entre min e max: só entram as faixas que cruzam esse intervalo (as chances são renormalizadas).
export function sortearDesgaste(cfg, skinMin, skinMax, rnd) {
  const min = Number.isFinite(skinMin) ? skinMin : 0
  const max = Number.isFinite(skinMax) ? skinMax : 1
  const faixas = cfg.desgaste.map((f) => ({ ...f, lo: Math.max(f.min, min), hi: Math.min(f.max, max) }))
  const pesos = faixas.map((f) => (f.hi > f.lo ? f.chance : 0))
  let i = sortearPeso(pesos, rnd)
  if (i < 0) return { f: Math.min(max, Math.max(min, 0.0001)), faixa: nomeDoDesgaste(min) } // skin com intervalo fora de todas as faixas: usa o mínimo
  const fx = faixas[i]
  let f = fx.lo + rnd() * (fx.hi - fx.lo)
  f = Math.min(fx.hi - 1e-6, Math.max(fx.lo, f))
  f = Math.round(f * 1e6) / 1e6
  return { f, faixa: fx.nome }
}

// Sorteia uma abertura: { raridade, indice (na lista da raridade: itens ou facas), item: { t, d, p, f, s, l, faixa } }
export function sortearAbertura(caixa, cfg, rnd) {
  const porRaridade = [0, 1, 2, 3, 4].map((r) => caixa.itens.map((it, i) => ({ it, i })).filter((x) => x.it.r === r))
  const tem = (r) => (r === 5 ? caixa.facas.length > 0 : porRaridade[r].length > 0)
  // só as raridades que a caixa tem (as chances das outras são redistribuídas na mesma proporção)
  const raridade = sortearPeso(cfg.taxas.map((t, r) => (tem(r) ? t : 0)), rnd)
  if (raridade < 0) throw new Error('caixa vazia')
  let origem
  let indice
  let t
  if (raridade === 5) {
    indice = sortearPeso(caixa.facas.map((f) => pesoDoItem(f, 'faca')), rnd)
    origem = caixa.facas[indice]
    t = 'faca'
  } else {
    const k = sortearPeso(porRaridade[raridade].map((x) => pesoDoItem(x.it, 'arma')), rnd)
    indice = porRaridade[raridade][k].i
    origem = caixa.itens[indice]
    t = 'arma'
  }
  // adesivo e chaveiro (caixas de amuletos) não têm desgaste nem padrão: vão guardados no inventário
  if (origem.t === 'adesivo' || origem.t === 'chaveiro') return { raridade, indice, item: { t: origem.t, d: origem.d, p: 0, f: 0.5, s: 0, l: 0, faixa: null, n: origem.n || '', i: origem.i || '' } }
  const { f, faixa } = sortearDesgaste(cfg, origem.min, origem.max, rnd)
  return { raridade, indice, item: { t: origem.t === 'faca' || origem.t === 'luva' ? origem.t : t, d: origem.d, p: origem.p, f, s: Math.floor(rnd() * 1001), l: origem.l ? 1 : 0, faixa } }
}

// Faixa da roleta horizontal: itens de enchimento nas proporções das raridades, com alguns cards dourados "?", e o vencedor em `alvo`.
// Cada posição: { r, i } (i = índice em caixa.itens) ou { r: 5 } (card dourado "?"). `quase` = o vencedor não é faca e um vizinho é o card dourado.
export function gerarFaixa(caixa, cfg, ganhou, rnd, n = 60, alvo = 51) {
  const porRaridade = [0, 1, 2, 3, 4].map((r) => caixa.itens.map((it, i) => ({ it, i })).filter((x) => x.it.r === r))
  const pesos = cfg.taxas.map((t, r) => (r === 5 ? (caixa.facas.length ? 2.2 : 0) : porRaridade[r].length ? t : 0)) // o dourado aparece mais no enchimento do que sai de verdade (expectativa)
  const itens = []
  for (let k = 0; k < n; k++) {
    const r = sortearPeso(pesos, rnd)
    if (r === 5) itens.push({ r: 5 })
    else itens.push({ r, i: porRaridade[r][Math.floor(rnd() * porRaridade[r].length)].i })
  }
  itens[alvo] = ganhou.raridade === 5 ? { r: 5 } : { r: ganhou.raridade, i: ganhou.indice }
  const quase = ganhou.raridade !== 5 && (itens[alvo - 1]?.r === 5 || itens[alvo + 1]?.r === 5)
  return { itens, alvo, quase }
}

// Roleta vertical das facas (só as facas da caixa); o vencedor em `alvo`
export function gerarFaixaFacas(caixa, ganhou, rnd, n = 44, alvo = 35) {
  const itens = []
  for (let k = 0; k < n; k++) itens.push(Math.floor(rnd() * caixa.facas.length))
  itens[alvo] = ganhou.indice
  return { itens, alvo }
}

// Faixas de desgaste que uma skin pode ter (as mesmas regras de sortearDesgaste): [{ nome, p: chance 0..1, f: float do meio da faixa }]
export function faixasDeDesgaste(cfg, skinMin, skinMax) {
  const min = Number.isFinite(skinMin) ? skinMin : 0
  const max = Number.isFinite(skinMax) ? skinMax : 1
  const ok = cfg.desgaste.map((f) => ({ nome: f.nome, chance: f.chance, lo: Math.max(f.min, min), hi: Math.min(f.max, max) })).filter((f) => f.hi > f.lo && f.chance > 0)
  if (!ok.length) return [{ nome: nomeDoDesgaste(min), p: 1, f: Math.min(max, Math.max(min, 0.0001)) }]
  const total = ok.reduce((a, f) => a + f.chance, 0)
  return ok.map((f) => ({ nome: f.nome, p: f.chance / total, f: (f.lo + f.hi) / 2 }))
}

// Modos de abertura (botões da página da caixa). Mudam só as chances; o preço do modo acompanha o valor esperado (loja.js: detalhesDaCaixa).
//   jester: todos os itens com a mesma chance (cada item, inclusive cada faca, vale 1)
//   boost: as raridades altas ficam mais prováveis e as baixas menos
export const MODOS = ['jester', 'boost']
const BOOST = [0.5, 0.8, 1.4, 2.2, 3, 3]
export function aplicarModo(caixa, cfg, modo) {
  if (modo === 'jester') {
    const contagem = [0, 1, 2, 3, 4].map((r) => caixa.itens.filter((i) => i.r === r).length).concat(caixa.facas.length)
    return { caixa: { ...caixa, itens: caixa.itens.map((i) => ({ ...i, w: 1, igual: true })), facas: caixa.facas.map((f) => ({ ...f, w: 1, igual: true })) }, cfg: { ...cfg, taxas: contagem } }
  }
  if (modo === 'boost') return { caixa, cfg: { ...cfg, taxas: cfg.taxas.map((t, r) => t * BOOST[r]) } }
  return { caixa, cfg }
}

// Chances reais de cada item da caixa (%), para a página da caixa mostrar com transparência
export function chancesDaCaixa(caixa, cfg) {
  const porRaridade = [0, 1, 2, 3, 4].map((r) => caixa.itens.map((it, i) => ({ it, i })).filter((x) => x.it.r === r))
  const taxas = cfg.taxas.map((t, r) => (r === 5 ? (caixa.facas.length ? t : 0) : porRaridade[r].length ? t : 0))
  const total = taxas.reduce((a, b) => a + b, 0) || 1
  const raridades = taxas.map((t) => Math.round((t / total) * 10000) / 100)
  const itens = caixa.itens.map(() => 0)
  porRaridade.forEach((lista, r) => {
    const soma = lista.reduce((a, x) => a + pesoDoItem(x.it, 'arma'), 0) || 1
    // 6 casas: item muito caro tem chance minúscula, mas nunca zero (com 3 casas ele virava "0%" na tela)
    for (const x of lista) itens[x.i] = pesoDoItem(x.it, 'arma') > 0 ? Math.max(1e-6, Math.round(((raridades[r] * pesoDoItem(x.it, 'arma')) / soma) * 1e6) / 1e6) : 0
  })
  const somaF = caixa.facas.reduce((a, f) => a + pesoDoItem(f, 'faca'), 0) || 1
  const facas = caixa.facas.map((f) => (pesoDoItem(f, 'faca') > 0 ? Math.max(1e-6, Math.round(((raridades[5] * pesoDoItem(f, 'faca')) / somaF) * 1e6) / 1e6) : 0))
  return { raridades, itens, facas }
}

// ───────────────────────── Insígnias das caixas ─────────────────────────
// grupo: níveis da mesma conquista (mostra "nível atual e próximo"); secreta: aparece como "???" até ganhar.
// Cada nível é uma insígnia própria (arte própria). "Mestre da [Caixa]" é gerada para cada caixa (mestre-<slug>).
export const INSIGNIAS_LOJA = [
  { id: 'primeira-chave', nome: 'Primeira Chave', descricao: 'Abriu a sua primeira caixa.', cor: '#b0c3d9', meta: 1, chave: 'abertas' },
  { id: 'colecionador-bronze', nome: 'Colecionador de Caixas: Bronze', descricao: 'Abriu 10 caixas.', cor: '#4b69ff', meta: 10, chave: 'abertas', grupo: 'colecionador', nivel: 1 },
  { id: 'colecionador-prata', nome: 'Colecionador de Caixas: Prata', descricao: 'Abriu 50 caixas.', cor: '#4b69ff', meta: 50, chave: 'abertas', grupo: 'colecionador', nivel: 2 },
  { id: 'colecionador-ouro', nome: 'Colecionador de Caixas: Ouro', descricao: 'Abriu 250 caixas.', cor: '#4b69ff', meta: 250, chave: 'abertas', grupo: 'colecionador', nivel: 3 },
  { id: 'colecionador-diamante', nome: 'Colecionador de Caixas: Diamante', descricao: 'Abriu 1000 caixas.', cor: '#4b69ff', meta: 1000, chave: 'abertas', grupo: 'colecionador', nivel: 4 },
  { id: 'viciado-em-roleta', nome: 'Viciado em Roleta', descricao: 'Abriu 50 caixas no mesmo dia.', cor: '#8847ff', meta: 50, chave: 'maxDia' },
  { id: 'toque-de-midas', nome: 'Toque de Midas', descricao: 'Ganhou a sua primeira faca.', cor: '#e4ae39', meta: 1, chave: 'facas' },
  { id: 'arsenal-afiado-ouro', nome: 'Arsenal Afiado: Ouro', descricao: 'Ganhou 5 facas diferentes.', cor: '#e4ae39', meta: 5, chave: 'facasDif', grupo: 'arsenal', nivel: 1 },
  { id: 'arsenal-afiado-diamante', nome: 'Arsenal Afiado: Diamante', descricao: 'Ganhou 10 facas diferentes.', cor: '#e4ae39', meta: 10, chave: 'facasDif', grupo: 'arsenal', nivel: 2 },
  { id: 'arsenal-afiado-lendaria', nome: 'Arsenal Afiado: Lendária', descricao: 'Ganhou 25 facas diferentes.', cor: '#e4ae39', meta: 25, chave: 'facasDif', grupo: 'arsenal', nivel: 3 },
  { id: 'raio-duplo', nome: 'Raio Duplo', descricao: 'Ganhou 2 itens Lendários ou facas seguidos.', cor: '#eb4b4b', meta: 2, chave: 'seqLend' },
  { id: 'fabrica-perfeita', nome: 'Fábrica Perfeita', descricao: 'Ganhou um item com float abaixo de 0.01.', cor: '#d32ce6', meta: 1, chave: 'fabrica' },
  { id: 'cicatriz-de-guerra', nome: 'Cicatriz de Guerra', descricao: 'Ganhou um item com float acima de 0.99.', cor: '#8847ff', meta: 1, chave: 'cicatriz', secreta: true },
  { id: 'arco-iris', nome: 'Arco-Íris', descricao: 'Ganhou pelo menos um item de cada raridade.', cor: '#d32ce6', meta: 6, chave: 'raridades' },
  { id: 'maldicao-do-cinza', nome: 'Maldição do Cinza', descricao: 'Ganhou 15 itens comuns seguidos.', cor: '#b0c3d9', meta: 15, chave: 'seqComum' },
  { id: 'quase', nome: 'Quase!', descricao: 'A roleta parou ao lado do card dourado da faca.', cor: '#eb4b4b', meta: 1, chave: 'quase', secreta: true },
  { id: 'paciente', nome: 'Paciente', descricao: 'Guardou 20 caixas fechadas no inventário ao mesmo tempo.', cor: '#4b69ff', meta: 20, chave: 'fechadas' },
]
export const ID_MESTRE = /^mestre-[a-z0-9-]{1,40}$/
export const ehInsigniaLoja = (id) => INSIGNIAS_LOJA.some((i) => i.id === id) || ID_MESTRE.test(id)
export const insigniaMestre = (caixa) => ({ id: `mestre-${caixa.slug}`, nome: `Mestre da ${caixa.nome}`, descricao: `Conseguiu todas as skins da ${caixa.nome}.`, cor: '#e4ae39', chave: 'mestre', caixa: caixa.slug })

// Dia no fuso de São Paulo (UTC-3, sem horário de verão)
export const diaSP = (ts) => new Date(ts - 3 * 3600 * 1000).toISOString().slice(0, 10)

// Estatísticas a partir do histórico (linhas em ordem de abertura): { ts, caixa (slug), r, t, d, p, f, q }.
// "fechadas" (caixas fechadas no inventário agora) vem de fora.
// Identifica um item de caixa: skin/faca por arma+pintura; adesivo e chaveiro pelo id do jogo (que se repete entre os dois tipos)
export const chaveDoItem = (t, d, p) => (t === 'adesivo' ? `a${d}` : t === 'chaveiro' ? `c${d}` : `${d}:${p}`)

export function calcularStats(linhas, fechadas = 0) {
  const s = { abertas: linhas.length, maxDia: 0, facas: 0, facasDif: 0, seqLend: 0, seqComum: 0, fabrica: 0, cicatriz: 0, quase: 0, raridades: 0, fechadas, porCaixa: {} }
  const dias = {}
  const raridades = new Set()
  const facas = new Set()
  let lend = 0
  let comum = 0
  for (const l of linhas) {
    const dia = diaSP(l.ts)
    dias[dia] = (dias[dia] || 0) + 1
    raridades.add(l.r)
    if (l.t === 'faca') {
      s.facas++
      facas.add(`${l.d}:${l.p}`)
    }
    ;(s.porCaixa[l.caixa] ??= new Set()).add(chaveDoItem(l.t, l.d, l.p)) // o Mestre da Caixa só olha a lista de itens da caixa (as facas do tier especial não entram)
    lend = l.r >= 4 ? lend + 1 : 0
    s.seqLend = Math.max(s.seqLend, lend)
    comum = l.r === 0 ? comum + 1 : 0
    s.seqComum = Math.max(s.seqComum, comum)
    if (l.f < 0.01) s.fabrica = 1
    if (l.f > 0.99) s.cicatriz = 1
    if (l.q) s.quase = 1
  }
  s.maxDia = Math.max(0, ...Object.values(dias))
  s.facasDif = facas.size
  s.raridades = raridades.size
  return s
}

// Progresso de cada insígnia: [{ ...insígnia, atual, ok }]. "caixas" = lista de caixas (para as Mestre da Caixa)
export function progressoInsignias(stats, caixas = []) {
  const lista = INSIGNIAS_LOJA.map((i) => {
    const atual = Math.min(stats[i.chave] || 0, i.meta)
    return { ...i, atual, ok: (stats[i.chave] || 0) >= i.meta }
  })
  for (const c of caixas) {
    const chaves = new Set(c.itens.map((x) => chaveDoItem(x.t, x.d, x.p))) // só a lista de itens da caixa (as facas do tier especial não entram)
    const total = chaves.size
    const tem = stats.porCaixa?.[c.slug] ? [...stats.porCaixa[c.slug]].filter((k) => chaves.has(k)).length : 0
    lista.push({ ...insigniaMestre(c), meta: total, atual: tem, ok: total > 0 && tem >= total })
  }
  return lista
}

// Insígnias que o jogador já cumpre e ainda não tem (idempotente: quem já tem nunca volta na lista)
export const insigniasNovas = (progresso, tem = {}) => progresso.filter((i) => i.ok && !tem[i.id]).map((i) => i.id)

// Nomes das caixas de fábrica por slug (o site nomeia as insígnias "Mestre da ..." sem precisar baixar as caixas); caixa nova do admin: usa o slug
export const NOMES_CAIXAS = {
  'caixa-radioativa': 'Caixa Radioativa', 'caixa-explorador': 'Caixa do Explorador', 'caixa-faroeste': 'Caixa Faroeste', 'caixa-abismo': 'Caixa do Abismo',
  'caixa-pirata': 'Caixa do Pirata', 'caixa-navegador': 'Caixa do Navegador', 'caixa-naufragio': 'Caixa Naufrágio', 'caixa-sombria': 'Caixa Sombria',
  'caixa-alquimista': 'Caixa do Alquimista', 'caixa-halloween': 'Caixa Halloween', 'caixa-natal': 'Caixa de Natal', 'caixa-circo': 'Caixa do Circo',
  'caixa-artica': 'Caixa Ártica', 'caixa-dragao': 'Caixa do Dragão', 'caixa-samurai': 'Caixa Samurai', 'caixa-neon': 'Caixa Neon',
  'caixa-cosmica': 'Caixa Cósmica', 'caixa-cibernetica': 'Caixa Cibernética', 'caixa-farao': 'Caixa do Faraó',
}
export const nomeDaCaixa = (slug) => NOMES_CAIXAS[slug] || String(slug).replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase())
// Insígnia "Mestre da [Caixa]" a partir do id (mestre-<slug>), para o perfil e os avisos
export const insigniaMestreDoId = (id) => {
  const slug = String(id).replace(/^mestre-/, '')
  const nome = nomeDaCaixa(slug)
  return { id, nome: `Mestre da ${nome}`, descricao: `Conseguiu todas as skins da ${nome}.`, cor: '#e4ae39', loja: true }
}

// ───────────────────────── Venda de itens ─────────────────────────
// Raridades como no jogo (para o filtro do inventário e o valor de venda). Facas e luvas são sempre "Extraordinário".
export const RARIDADES_CS = [
  { id: 0, nome: 'Consumer Grade', curto: 'Consumer', cor: '#b0c3d9' },
  { id: 1, nome: 'Industrial Grade', curto: 'Industrial', cor: '#5e98d9' },
  { id: 2, nome: 'Mil-Spec', curto: 'Mil-Spec', cor: '#4b69ff' },
  { id: 3, nome: 'Restricted', curto: 'Restricted', cor: '#8847ff' },
  { id: 4, nome: 'Classified', curto: 'Classified', cor: '#d32ce6' },
  { id: 5, nome: 'Covert', curto: 'Covert', cor: '#eb4b4b' },
  { id: 6, nome: 'Extraordinary', curto: 'Extraordinary', cor: '#e4ae39' },
]
// Cor da skin no catálogo (Steam) -> raridade 0..5 (a mesma do worker/steam-login/src/skins-raridade.json)
export const raridadeCsDaCor = (cor) => ({ '#b0c3d9': 0, '#5e98d9': 1, '#4b69ff': 2, '#8847ff': 3, '#d32ce6': 4, '#eb4b4b': 5 })[String(cor || '').toLowerCase()] ?? 2

// Depósito de NP com dinheiro de verdade (Asaas: Pix e cartão). R$ 5,00 = 2.000 NP (1 real = 400 NP); valores maiores ganham bônus.
// O servidor calcula tudo a partir do valor pago: o site só mostra.
// Premium: NP extras por partida jogada enquanto a assinatura está valendo (creditados pelo worker, ver aplicarPremium em loja.js)
export const BONUS_PREMIUM_PARTIDA = 350

export const PAGAMENTO = {
  minCentavos: 500,
  maxCentavos: 200000,
  npPorReal: 400,
  pacotes: [5, 10, 25, 50, 100, 250, 500, 1000], // reais
  bonus: [[25, 5], [50, 10], [100, 15], [250, 20]], // [a partir de R$, % de bônus]
}
// Os valores acima são os de fábrica; o dono muda no painel (aba Pontos → Depósitos) e o worker guarda no KV "pagamento-config".
export const bonusDoPagamento = (centavos, cfg = PAGAMENTO) => cfg.bonus.filter(([reais]) => centavos >= reais * 100).reduce((_, [, pc]) => pc, 0)
export const npDoPagamento = (centavos, cfg = PAGAMENTO) => {
  const base = Math.floor((centavos * cfg.npPorReal) / 100)
  return base + Math.floor((base * bonusDoPagamento(centavos, cfg)) / 100)
}
// Confere/limpa uma configuração de depósito vinda do painel (ou do KV). Devolve { cfg } ou { erro }.
export function limparConfigPagamento(c) {
  const inteiro = (v, min, max) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const minCentavos = inteiro((Number(c?.minCentavos) || 0) / 1, 500, 1000000) // o Asaas não cobra menos de R$ 5,00
  const maxCentavos = inteiro(c?.maxCentavos, 500, 10000000)
  const npPorReal = inteiro(c?.npPorReal, 1, 100000)
  if (minCentavos === null || maxCentavos === null || npPorReal === null || maxCentavos < minCentavos) return { erro: 'valores' }
  const pacotes = [...new Set((Array.isArray(c?.pacotes) ? c.pacotes : []).map((v) => inteiro(v, 1, 100000)).filter((v) => v !== null && v * 100 >= minCentavos && v * 100 <= maxCentavos))].sort((a, b) => a - b).slice(0, 12)
  if (!pacotes.length) return { erro: 'pacotes' }
  const bonus = (Array.isArray(c?.bonus) ? c.bonus : [])
    .map((b) => [inteiro(b?.[0], 1, 100000), inteiro(b?.[1], 0, 500)])
    .filter((b) => b[0] !== null && b[1] !== null && b[1] > 0)
    .sort((a, b) => a[0] - b[0])
    .slice(0, 10)
  return { cfg: { minCentavos, maxCentavos, npPorReal, pacotes, bonus } }
}

// Valor base em NP de cada raridade, com o desgaste Factory New. Fica bem abaixo do preço das caixas (vender não paga a caixa de volta).
export const VALOR_BASE = [12, 25, 60, 150, 380, 1000, 4000]
// Quanto do valor sobra conforme o desgaste (float): interpolado entre os pontos
const CURVA_DESGASTE = [[0, 1.15], [0.07, 1], [0.15, 0.78], [0.38, 0.52], [0.45, 0.4], [1, 0.28]]
export function multiplicadorDoDesgaste(f) {
  const x = Math.min(1, Math.max(0, Number(f) || 0))
  for (let i = 1; i < CURVA_DESGASTE.length; i++) {
    const [x1, y1] = CURVA_DESGASTE[i]
    if (x <= x1) {
      const [x0, y0] = CURVA_DESGASTE[i - 1]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return CURVA_DESGASTE[CURVA_DESGASTE.length - 1][1]
}
// Valor de venda (NP) de um item { f (float), st (StatTrak) } da raridade dada (0..6)
export const valorDoItem = (item, raridade) => Math.max(1, Math.round(VALOR_BASE[raridade] * multiplicadorDoDesgaste(item.f) * (item.st ? 1.35 : 1)))

// Preço de mercado (R$ = NP) de uma skin: tabela { "<def>:<paint>": [FN, MW, FT, WW, BS, StatTrak FN..BS] } (scripts/gerar-precos.mjs); faca lisa: [preço, preço StatTrak].
// Sem preço no mercado: null (aí vale a conta por raridade e desgaste).
export function precoDeMercado(item, tabela) {
  const linha = tabela?.[`${item.d}:${item.p}`]
  if (!linha) return null
  const st = !!item.st
  if (linha.length === 2) return Math.max(1, Math.round((st ? linha[1] || linha[0] * 2 : linha[0]) || 0)) || null
  const f = Number(item.f) || 0
  const faixa = f < 0.07 ? 0 : f < 0.15 ? 1 : f < 0.38 ? 2 : f < 0.45 ? 3 : 4
  const grupo = (g) => {
    const v = linha.slice(g * 5, g * 5 + 5)
    if (v[faixa]) return v[faixa]
    for (let d = 1; d < 5; d++) if (v[faixa - d] || v[faixa + d]) return v[faixa - d] || v[faixa + d] // faixa sem preço: a mais perto
    return 0
  }
  const v = st ? grupo(1) || grupo(0) * 2 : grupo(0) || grupo(1) / 2
  return v > 0 ? Math.max(1, Math.round(v)) : null
}

// Valor base (FN) de cada faca: tabela { "<defIndex>:<paint>": NP } gerada por scripts/gerar-raridades.mjs (modelo x acabamento). Sem entrada: valor das luvas/extraordinário.
export const valorDaFaca = (item, tabela) => Math.max(1, Math.round((tabela?.[`${item.d}:${item.p}`] ?? VALOR_BASE[6]) * multiplicadorDoDesgaste(item.f) * (item.st ? 1.35 : 1)))
