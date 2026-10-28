// Testes da loja de caixas (regras puras de src/loja-core.js). Rodar (na pasta worker/steam-login):  node --test test/
// Inclui a simulação de 100.000 aberturas: mostra a distribuição real de raridades e de desgastes e confere com as taxas.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CONFIG_PADRAO, RARIDADES, INSIGNIAS_LOJA, calcularStats, chancesDaCaixa, gerarFaixa, gerarFaixaFacas, insigniaMestre, insigniasNovas, nomeDoDesgaste, progressoInsignias, sortearAbertura, sortearDesgaste, sortearPeso, rndSeguro } from '../src/loja-core.js'

const CAIXAS = JSON.parse(fs.readFileSync(new URL('../src/caixas-iniciais.json', import.meta.url), 'utf8'))
const cfg = CONFIG_PADRAO

// ── sorteio ──
test('simulação de 100.000 aberturas: raridades e desgastes batem com as taxas', () => {
  const N = 100000
  const caixa = CAIXAS.find((c) => c.slug === 'caixa-armas-ak-47')
  const raridades = [0, 0, 0, 0, 0, 0]
  const desgastes = {}
  const porTipo = { faca: 0, luva: 0, arma: 0 }
  for (let i = 0; i < N; i++) {
    const a = sortearAbertura(caixa, cfg, rndSeguro)
    raridades[a.raridade]++
    porTipo[a.item.t]++
    desgastes[a.item.faixa] = (desgastes[a.item.faixa] || 0) + 1
    assert.ok(a.item.f >= 0 && a.item.f <= 1)
  }
  console.log('\nRaridades (%), esperado: ' + cfg.taxas.join('/'))
  RARIDADES.forEach((r, i) => console.log(`  ${r.nome.padEnd(20)} ${((raridades[i] / N) * 100).toFixed(2)}%`))
  console.log('Desgastes (%) das skins que cobrem toda a faixa 0–1 estão no teste seguinte; aqui, geral (inclui skins com intervalo curto):')
  for (const f of cfg.desgaste) console.log(`  ${f.nome.padEnd(16)} ${(((desgastes[f.nome] || 0) / N) * 100).toFixed(2)}%`)
  cfg.taxas.forEach((t, i) => assert.ok(Math.abs((raridades[i] / N) * 100 - t) < 0.7, `raridade ${i}: ${(raridades[i] / N) * 100} vs ${t}`))
  assert.equal(porTipo.faca + porTipo.luva, raridades[5]) // o tier especial das caixas novas pode ter facas e luvas
})

test('simulação de 100.000 desgastes numa skin que vai de 0 a 1: 10/22/40/13/15 %', () => {
  const N = 100000
  const c = {}
  let soma = 0
  for (let i = 0; i < N; i++) {
    const d = sortearDesgaste(cfg, 0, 1, rndSeguro)
    assert.equal(nomeDoDesgaste(d.f), d.faixa, `float ${d.f} deveria ser ${nomeDoDesgaste(d.f)} e veio ${d.faixa}`)
    c[d.faixa] = (c[d.faixa] || 0) + 1
    soma += d.f
  }
  console.log('\nDesgaste (skin 0–1):')
  for (const f of cfg.desgaste) {
    const p = ((c[f.nome] || 0) / N) * 100
    console.log(`  ${f.nome.padEnd(16)} ${p.toFixed(2)}% (esperado ${f.chance}%)`)
    assert.ok(Math.abs(p - f.chance) < 0.7)
  }
  console.log(`  float médio: ${(soma / N).toFixed(4)}`)
})

test('o float respeita o intervalo da skin e as faixas que ela não alcança não saem', () => {
  for (let i = 0; i < 20000; i++) {
    const d = sortearDesgaste(cfg, 0, 0.08, rndSeguro) // só Factory New e (quase nada de) Minimal Wear
    assert.ok(d.f >= 0 && d.f <= 0.08)
    assert.ok(d.faixa === 'Factory New' || d.faixa === 'Minimal Wear')
  }
  for (let i = 0; i < 20000; i++) {
    const d = sortearDesgaste(cfg, 0.45, 1, rndSeguro)
    assert.equal(d.faixa, 'Battle-Scarred')
    assert.ok(d.f >= 0.45)
  }
})

test('dentro da raridade o sorteio é por peso (peso baixo sai menos)', () => {
  const caixa = { itens: [{ d: 1, p: 1, r: 0, w: 90, min: 0, max: 1 }, { d: 2, p: 2, r: 0, w: 10, min: 0, max: 1 }], facas: [{ d: 500, p: 1, w: 1, min: 0, max: 1 }, { d: 507, p: 2, w: 99, min: 0, max: 1 }] }
  const c = { a: 0, b: 0, k1: 0, k2: 0 }
  for (let i = 0; i < 100000; i++) {
    const a = sortearAbertura(caixa, { ...cfg, taxas: [50, 0, 0, 0, 0, 50] }, rndSeguro)
    if (a.item.t === 'faca') a.item.d === 500 ? c.k1++ : c.k2++
    else a.item.d === 1 ? c.a++ : c.b++
  }
  assert.ok(Math.abs(c.a / (c.a + c.b) - 0.9) < 0.02)
  assert.ok(Math.abs(c.k1 / (c.k1 + c.k2) - 0.01) < 0.005)
})

test('raridades que a caixa não tem são redistribuídas (sem travar)', () => {
  const caixa = { itens: [{ d: 1, p: 1, r: 2, w: 1, min: 0, max: 1 }], facas: [] }
  for (let i = 0; i < 1000; i++) assert.equal(sortearAbertura(caixa, cfg, rndSeguro).raridade, 2)
})

test('chances publicadas somam 100% por raridade e batem com as taxas', () => {
  for (const c of CAIXAS) {
    const ch = chancesDaCaixa(c, cfg)
    assert.ok(Math.abs(ch.raridades.reduce((a, b) => a + b, 0) - 100) < 0.1, c.slug)
    assert.ok(Math.abs(ch.facas.reduce((a, b) => a + b, 0) - ch.raridades[5]) < 0.05, c.slug)
  }
})

test('faixa da roleta: o vencedor está no alvo, "quase" só quando o vizinho é o card dourado', () => {
  const caixa = CAIXAS.find((c) => c.slug === 'caixa-armas-ak-47')
  let quase = 0
  for (let i = 0; i < 5000; i++) {
    const g = sortearAbertura(caixa, cfg, rndSeguro)
    const f = gerarFaixa(caixa, cfg, g, rndSeguro)
    assert.equal(f.itens.length, 60)
    if (g.raridade === 5) {
      assert.equal(f.itens[f.alvo].r, 5)
      assert.equal(f.quase, false)
      const v = gerarFaixaFacas(caixa, g, rndSeguro)
      assert.equal(v.itens[v.alvo], g.indice)
    } else {
      assert.equal(f.itens[f.alvo].i, g.indice)
      assert.equal(f.quase, f.itens[f.alvo - 1].r === 5 || f.itens[f.alvo + 1].r === 5)
      if (f.quase) quase++
    }
  }
  assert.ok(quase > 0)
})

// ── insígnias ──
const linha = (o = {}) => ({ ts: Date.UTC(2026, 5, 1, 15), caixa: 'caixa-a', r: 1, t: 'arma', d: 7, p: 100, f: 0.2, q: 0, ...o })
const tem = (linhas, id, fechadas = 0, caixas = []) => progressoInsignias(calcularStats(linhas, fechadas), caixas).find((i) => i.id === id)?.ok === true
const muitas = (n, o = (i) => ({})) => Array.from({ length: n }, (_, i) => linha({ p: 1000 + i, ...o(i) }))

test('Primeira Chave: na 1ª caixa', () => {
  assert.equal(tem([], 'primeira-chave'), false)
  assert.equal(tem([linha()], 'primeira-chave'), true)
})
test('Colecionador de Caixas: 10 / 50 / 250 / 1000', () => {
  for (const [id, meta] of [['colecionador-bronze', 10], ['colecionador-prata', 50], ['colecionador-ouro', 250], ['colecionador-diamante', 1000]]) {
    assert.equal(tem(muitas(meta - 1), id), false, id + ' com ' + (meta - 1))
    assert.equal(tem(muitas(meta), id), true, id + ' com ' + meta)
  }
})
test('Viciado em Roleta: 50 no mesmo dia (fuso de São Paulo)', () => {
  assert.equal(tem(muitas(49), 'viciado-em-roleta'), false)
  assert.equal(tem(muitas(50), 'viciado-em-roleta'), true)
  // 25 antes e 25 depois das 03:00 UTC (meia-noite em SP) = dias diferentes
  const meia = Date.UTC(2026, 5, 2, 3, 0, 0)
  const dividido = [...muitas(25, () => ({ ts: meia - 1000 })), ...muitas(25, () => ({ ts: meia + 1000 }))]
  assert.equal(tem(dividido, 'viciado-em-roleta'), false)
  // 50 espalhadas em dias diferentes não contam
  assert.equal(tem(muitas(50, (i) => ({ ts: Date.UTC(2026, 5, 1 + i, 15) })), 'viciado-em-roleta'), false)
})
test('Toque de Midas: primeira faca', () => {
  assert.equal(tem(muitas(5), 'toque-de-midas'), false)
  assert.equal(tem([...muitas(5), linha({ t: 'faca', r: 5, d: 507, p: 38 })], 'toque-de-midas'), true)
})
test('Arsenal Afiado: 5 / 10 / 25 facas DIFERENTES (repetida não conta)', () => {
  const facas = (n) => Array.from({ length: n }, (_, i) => linha({ t: 'faca', r: 5, d: 500 + (i % 5), p: 10 + i }))
  assert.equal(tem(facas(4), 'arsenal-afiado-ouro'), false)
  assert.equal(tem(facas(5), 'arsenal-afiado-ouro'), true)
  assert.equal(tem(facas(10), 'arsenal-afiado-diamante'), true)
  assert.equal(tem(facas(24), 'arsenal-afiado-lendaria'), false)
  assert.equal(tem(facas(25), 'arsenal-afiado-lendaria'), true)
  const repetidas = Array.from({ length: 30 }, () => linha({ t: 'faca', r: 5, d: 507, p: 38 }))
  assert.equal(tem(repetidas, 'arsenal-afiado-ouro'), false)
})
test('Raio Duplo: 2 lendários/facas SEGUIDOS', () => {
  assert.equal(tem([linha({ r: 4 }), linha({ r: 2 }), linha({ r: 4 })], 'raio-duplo'), false)
  assert.equal(tem([linha({ r: 4 }), linha({ r: 4 })], 'raio-duplo'), true)
  assert.equal(tem([linha({ r: 2 }), linha({ r: 4 }), linha({ r: 5, t: 'faca' })], 'raio-duplo'), true)
})
test('Fábrica Perfeita: float < 0.01; Cicatriz de Guerra: float > 0.99', () => {
  assert.equal(tem([linha({ f: 0.01 })], 'fabrica-perfeita'), false)
  assert.equal(tem([linha({ f: 0.0099 })], 'fabrica-perfeita'), true)
  assert.equal(tem([linha({ f: 0.99 })], 'cicatriz-de-guerra'), false)
  assert.equal(tem([linha({ f: 0.9901 })], 'cicatriz-de-guerra'), true)
})
test('Arco-Íris: uma de cada raridade', () => {
  const cinco = [0, 1, 2, 3, 4].map((r) => linha({ r }))
  assert.equal(tem(cinco, 'arco-iris'), false)
  assert.equal(tem([...cinco, linha({ r: 5, t: 'faca' })], 'arco-iris'), true)
})
test('Maldição do Cinza: 15 comuns seguidos (interrompido não conta)', () => {
  assert.equal(tem(muitas(14, () => ({ r: 0 })), 'maldicao-do-cinza'), false)
  assert.equal(tem(muitas(15, () => ({ r: 0 })), 'maldicao-do-cinza'), true)
  const quebrada = [...muitas(10, () => ({ r: 0 })), linha({ r: 3 }), ...muitas(10, () => ({ r: 0 }))]
  assert.equal(tem(quebrada, 'maldicao-do-cinza'), false)
})
test('Quase!: só quando a roleta parou ao lado do card dourado', () => {
  assert.equal(tem([linha()], 'quase'), false)
  assert.equal(tem([linha({ q: 1 })], 'quase'), true)
})
test('Paciente: 20 caixas fechadas ao mesmo tempo', () => {
  assert.equal(tem([], 'paciente', 19), false)
  assert.equal(tem([], 'paciente', 20), true)
})
test('Mestre da Caixa: todas as skins da caixa (e só dela)', () => {
  const caixa = { slug: 'caixa-a', nome: 'Caixa A', itens: [{ d: 7, p: 1 }, { d: 9, p: 2 }, { d: 4, p: 3 }], facas: [] }
  const outra = { slug: 'caixa-b', nome: 'Caixa B', itens: [{ d: 7, p: 1 }], facas: [] }
  const a = (d, p, c = 'caixa-a') => linha({ d, p, caixa: c })
  const ok = (linhas, c) => progressoInsignias(calcularStats(linhas), [caixa, outra]).find((i) => i.id === insigniaMestre(c).id).ok
  assert.equal(ok([a(7, 1), a(9, 2)], caixa), false)
  assert.equal(ok([a(7, 1), a(9, 2), a(9, 2), a(4, 3)], caixa), true)
  assert.equal(ok([a(7, 1, 'caixa-b'), a(9, 2), a(4, 3)], caixa), false) // a skin 7:1 saiu de OUTRA caixa
  assert.equal(ok([a(7, 1, 'caixa-b')], outra), true)
})

test('desbloqueio idempotente: a mesma insígnia (ou nível) nunca sai duas vezes', () => {
  const linhas = muitas(12)
  const prog = progressoInsignias(calcularStats(linhas), [])
  const primeira = insigniasNovas(prog, {})
  assert.deepEqual(primeira.sort(), ['colecionador-bronze', 'primeira-chave'])
  const ganhas = Object.fromEntries(primeira.map((i) => [i, 1]))
  assert.deepEqual(insigniasNovas(prog, ganhas), [])
  // mais aberturas: só o nível seguinte entra, o anterior não repete
  const prog2 = progressoInsignias(calcularStats(muitas(60, (i) => ({ ts: Date.UTC(2026, 5, 1 + i, 15) }))), [])
  assert.deepEqual(insigniasNovas(prog2, ganhas), ['colecionador-prata'])
})

test('toda insígnia do catálogo tem arte tratada e todas as secretas têm a versão borrada', () => {
  const dir = new URL('../../../public/assets/insignia/', import.meta.url)
  for (const i of INSIGNIAS_LOJA) {
    for (const pasta of ['web', 'mini', 'bloqueada', 'secreta']) assert.ok(fs.existsSync(new URL(`${pasta}/${i.id}.webp`, dir)), `${pasta}/${i.id}.webp`)
  }
  assert.ok(fs.existsSync(new URL('web/mestre-da-caixa.webp', dir)))
})

test('as caixas iniciais são válidas (imagem existe, tem de tudo, pesos > 0)', () => {
  const dir = new URL('../../../public/assets/caixas/web/', import.meta.url)
  assert.equal(CAIXAS.length, 130)
  assert.equal(CAIXAS.filter((c) => c.arquivada && !c.diaria).length, 0) // as 31 antigas foram apagadas (revisão 11)
  const removidas = JSON.parse(fs.readFileSync(new URL('../src/caixas-removidas.json', import.meta.url), 'utf8'))
  assert.equal(removidas.length, 101)
  assert.ok(CAIXAS.every((c) => !removidas.includes(c.slug)))
  assert.equal(new Set(CAIXAS.map((c) => c.id)).size, CAIXAS.length)
  assert.equal(new Set(CAIXAS.map((c) => c.slug)).size, CAIXAS.length)
  for (const c of CAIXAS) {
    assert.ok(fs.existsSync(c.diaria ? new URL(`../../../public${c.img}`, import.meta.url) : new URL(`${c.slug}.webp`, dir)), c.slug)
    assert.ok(c.diaria ? c.preco === 0 && c.arquivada : c.preco > 0)
    if (c.itens.every((x) => !x.t)) assert.ok(c.facas.length >= 5, c.slug + ' sem facas do tier especial') // caixas de arma
    else assert.equal(c.facas.length, 0) // facas e amuletos: sem tier de facas
    for (const r of [0, 1, 2, 3, 4]) assert.ok(c.itens.some((x) => x.r === r), `${c.slug} sem raridade ${r}`)
    assert.ok([...c.itens, ...c.facas].every((x) => x.w > 0 && x.d > 0 && (x.p > 0 || x.t === 'adesivo' || x.t === 'chaveiro')))
  }
})

test('sortearPeso ignora pesos zerados', () => {
  for (let i = 0; i < 1000; i++) assert.equal(sortearPeso([0, 5, 0], rndSeguro), 1)
  assert.equal(sortearPeso([0, 0], rndSeguro), -1)
})

// ── venda ──
import { definirValorador, faixasDeDesgaste, multiplicadorDoDesgaste, precoDeMercado, valorDoItem } from '../src/loja-core.js'
test('valor de venda: maior com raridade maior e desgaste melhor; StatTrak vale mais', () => {
  for (let r = 1; r <= 6; r++) assert.ok(valorDoItem({ f: 0.1 }, r) > valorDoItem({ f: 0.1 }, r - 1), 'raridade ' + r)
  for (const f of [0, 0.05, 0.1, 0.2, 0.4, 0.6, 0.9]) assert.ok(valorDoItem({ f }, 3) >= valorDoItem({ f: f + 0.05 }, 3), 'desgaste ' + f)
  assert.ok(valorDoItem({ f: 0.1, st: 1 }, 3) > valorDoItem({ f: 0.1 }, 3))
  assert.ok(multiplicadorDoDesgaste(0) > multiplicadorDoDesgaste(0.07) && multiplicadorDoDesgaste(1) > 0)
  assert.equal(valorDoItem({ f: 0.0701 }, 0) >= 1, true)
})
test('vender não paga a caixa de volta (valor esperado de uma abertura fica bem abaixo do preço)', () => {
  const cfg2 = CONFIG_PADRAO
  for (const c of CAIXAS.filter((x) => !x.arquivada)) {
    // as caixas novas são precificadas pelo preço de mercado (scripts/precos-caixas.mjs: média x 1,6 ≈ 62%); o que se vende fica abaixo do preço
    const precos = JSON.parse(fs.readFileSync(new URL('../src/precos.json', import.meta.url), 'utf8'))
    const valor = (it) => (it.t === 'adesivo' ? precos.a[it.d] : it.t === 'chaveiro' ? precos.c[it.d] : precoDeMercado(it, precos.skins)) || 0 // igual ao scripts/precos-caixas.mjs
    // o sorteio de verdade (loja.js) deixa o item caro mais raro pelo preço de mercado; o preço das caixas conta com isso
    definirValorador((x) => (x.t === 'adesivo' ? precos.a[x.d] : x.t === 'chaveiro' ? precos.c[x.d] : precoDeMercado({ ...x, f: Math.min(0.45, ((x.min ?? 0) + (x.max ?? 1)) / 2), st: 0 }, precos.skins)) || 0)
    // valor esperado exato (chances × valor em cada faixa de desgaste): sorteando, uma skin caríssima rara fazia o teste falhar às vezes
    const ch = chancesDaCaixa(c, cfg2)
    const medio = (it, t) => (it.t === 'adesivo' || it.t === 'chaveiro' ? valor(it) : faixasDeDesgaste(cfg2, it.min, it.max).reduce((a, fx) => a + fx.p * valor({ ...it, t: it.t || t, f: fx.f, st: 0 }), 0))
    const esperado = c.itens.reduce((a, it, i) => a + (ch.itens[i] / 100) * medio(it, 'arma'), 0) + c.facas.reduce((a, it, i) => a + (ch.facas[i] / 100) * medio(it, 'faca'), 0)
    definirValorador(null)
    assert.ok(esperado < c.preco * 0.9, `${c.slug}: valor médio de mercado ${esperado.toFixed(0)} vs preço ${c.preco}`)
  }
})

// ── caixas de adesivos, de chaveiros e de arma ──
test('caixas de adesivos e de chaveiros: cada uma só com o tipo certo (sem arma e sem faca) e sem desgaste', () => {
  const grupos = [['caixa-stickers-', 'adesivo'], ['caixa-charms-', 'chaveiro']]
  for (const [prefixo, tipo] of grupos) {
    const lista = CAIXAS.filter((x) => x.slug.startsWith(prefixo))
    assert.ok(lista.length > 0, prefixo)
    for (const c of lista) {
      assert.ok(c.itens.every((x) => x.t === tipo), c.slug)
      for (let i = 0; i < 300; i++) {
        const a = sortearAbertura(c, CONFIG_PADRAO, rndSeguro)
        assert.equal(a.item.t, tipo)
        assert.equal(a.item.p, 0)
      }
    }
  }
})
test('caixas de arma: só skins daquela arma', () => {
  const por = { 'caixa-armas-ak-47': [7], 'caixa-armas-awp': [9], 'caixa-armas-usp-s': [61], 'caixa-armas-m4': [60, 16], 'caixa-armas-glock-18': [4] }
  for (const [slug, defs] of Object.entries(por)) assert.ok(CAIXAS.find((x) => x.slug === slug).itens.every((x) => defs.includes(x.d)), slug)
})
test('Mestre da Caixa de facas e de amuletos conta os itens certos (adesivo e chaveiro com o mesmo id não se confundem)', () => {
  const caixa = { slug: 'caixa-z', nome: 'Caixa Z', itens: [{ t: 'adesivo', d: 5, p: 0 }, { t: 'chaveiro', d: 5, p: 0 }, { t: 'faca', d: 507, p: 38 }], facas: [] }
  const ok = (linhas) => progressoInsignias(calcularStats(linhas), [caixa]).find((i) => i.id === 'mestre-caixa-z').ok
  const l = (t, d, p) => linha({ t, d, p, caixa: 'caixa-z' })
  assert.equal(ok([l('adesivo', 5, 0), l('faca', 507, 38)]), false)
  assert.equal(ok([l('adesivo', 5, 0), l('chaveiro', 5, 0), l('faca', 507, 38)]), true)
})


test('categorias da loja por franquia: Kakashi/Sasuke em Naruto, Ichigo/Hollow em Bleach, toda caixa inicial com tema', async () => {
  const { categoriaDaCaixa } = await import('../../../src/comum/temasCaixa.js')
  const cat = (slug) => categoriaDaCaixa(CAIXAS.find((c) => c.slug === slug))
  for (const s of ['caixa-naruto-naruto', 'caixa-naruto-kakashi', 'caixa-naruto-sasuke']) assert.equal(cat(s), 'naruto-novas', s)
  for (const s of ['caixa-bleach-ichigo', 'caixa-bleach-rukia']) assert.equal(cat(s), 'bleach-novas', s)
  assert.equal(cat('caixa-mapas-dust2'), 'mapas')
  assert.equal(cat('caixa-armas-awp'), 'armas-novas')
  assert.equal(cat('caixa-charms-charms-personagens'), 'charms')
  for (const c of CAIXAS) assert.notEqual(categoriaDaCaixa(c), 'tematicas', `${c.slug} sem tema`)
  assert.equal(categoriaDaCaixa({ slug: 'caixa-nova', itens: [{ t: 'faca', d: 1 }] }), 'facas') // criada no painel: pelo conteúdo
})

test('piso de chance: a skin mais cara da raridade nunca fica impossível, mas também não paga a caixa', async () => {
  const { definirValorador, PISO } = await import('../src/loja-core.js')
  // caixa com uma skin barata comum e, no vermelho, duas baratas e uma caríssima com peso minúsculo
  const valores = { 1: 5, 2: 300, 3: 300, 4: 40000 }
  definirValorador((x) => valores[x.d] || 0)
  const caixa = { preco: 250, facas: [], itens: [{ d: 1, p: 1, r: 0, w: 10000 }, { d: 2, p: 1, r: 4, w: 600 }, { d: 3, p: 1, r: 4, w: 600 }, { d: 4, p: 1, r: 4, w: 50 }] }
  const ch = chancesDaCaixa(caixa, cfg)
  const fracVermelho = cfg.taxas[4] / (cfg.taxas[0] + cfg.taxas[4])
  const minimo = Math.min(PISO.fatia, (PISO.retorno * caixa.preco) / valores[4] / fracVermelho) * fracVermelho * 100
  assert.ok(Math.abs(ch.itens[3] - minimo) < 1e-4, `chance ${ch.itens[3]} deveria ser ${minimo}`)
  assert.ok(Math.abs(ch.itens.reduce((a, b) => a + b, 0) - 100) < 1e-3) // continua somando 100%
  assert.ok((ch.itens[3] / 100) * valores[4] <= PISO.retorno * caixa.preco + 1e-6) // a skin cara não passa de 15% do preço no valor esperado
  // o sorteio segue as mesmas chances
  let n = 0
  const N = 200000
  for (let i = 0; i < N; i++) if (sortearAbertura(caixa, cfg, rndSeguro).indice === 3) n++
  assert.ok(Math.abs((n / N) * 100 - ch.itens[3]) < 0.08, `sorteio ${(n / N) * 100}% vs ${ch.itens[3]}%`)
  definirValorador(null)
})

test('abertura especial: a cada 100 caixas garante faca/luva e o índice corresponde ao tier especial', async () => {
  const { definirValorador, ehEspecial, sortearEspecial } = await import('../src/loja-core.js')
  assert.deepEqual([1, 99, 100, 150, 200, 300].map(ehEspecial), [false, false, true, false, true, true])
  const valores = { 1: 5, 2: 10, 3: 300, 4: 400, 5: 500, 6: 900, 7: 40000 }
  definirValorador((x) => valores[x.d] || 0)
  const caixa = { preco: 250, facas: [{ d: 500, p: 38, w: 100, min: 0, max: .45 }, { t: 'luva', d: 5030, p: 10018, w: 100, min: .06, max: .8 }], itens: Object.keys(valores).map((d) => ({ d: Number(d), p: 1, r: Number(d) > 5 ? 4 : 2, w: 100 })) }
  const vistos = new Set()
  const N = 2000
  for (let i = 0; i < N; i++) {
    const g = sortearEspecial(caixa, cfg, rndSeguro)
    assert.ok(g.especial)
    vistos.add(g.item.t)
    assert.equal(g.raridade, 5)
    assert.equal(caixa.facas[g.indice].d, g.item.d)
    assert.ok(['faca', 'luva'].includes(g.item.t))
  }
  assert.deepEqual(vistos, new Set(['faca', 'luva']))
  definirValorador(null)
})
