// Prepara as imagens das insígnias e das caixas (geradas no Gemini: JPEG com fundo preto/azul ou xadrez desenhado):
//   1. guarda o original em <pasta>/originais/ (só na primeira vez; nunca apaga nem altera o que já está lá);
//   2. tira o fundo (preenche a partir das bordas) e suaviza o contorno;
//   3. recorta o vazio, centraliza num quadrado transparente com a mesma margem e fixa em 512×512;
//   4. grava PNG (reserva) e WebP, a miniatura de 128 px e, nas insígnias, as versões "bloqueada" (cinza) e "secreta" (borrada).
//
// Uso (na pasta site/):  node scripts/tratar-imagens.mjs            (trata tudo que está na lista abaixo)
//                        node scripts/tratar-imagens.mjs paciente   (só o(s) id(s) citado(s))
// Imagem nova: ponha o arquivo na pasta, acrescente uma linha em INSIGNIAS ou CAIXAS e rode de novo.
// Precisa do sharp instalado globalmente (npm i -g sharp): nada é instalado no projeto.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const requireGlobal = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))
const sharp = requireGlobal('sharp')

const aqui = path.dirname(fileURLToPath(import.meta.url))
const assets = path.resolve(aqui, '../public/assets')
const TAM = 512
const MARGEM = 0.05 // folga em volta (fração do quadrado)

// fundo: 'preto' | 'xadrez' | 'azul' | 'nenhum' (já transparente) | 'cinza'
// de: arquivo (dentro da pasta, ou em originais/ se já foi guardado)
export const INSIGNIAS = [
  { id: 'primeira-chave', de: 'Emblema Futurista Primeira Chave.png', fundo: 'nenhum', secreta: false },
  { id: 'fabrica-perfeita', de: 'Gemini_Generated_Image_2o7qqi2o7qqi2o7q.jfif', fundo: 'preto' },
  { id: 'cicatriz-de-guerra', de: 'Gemini_Generated_Image_4988x94988x94988.jfif', fundo: 'preto' },
  { id: 'raio-duplo', de: 'Gemini_Generated_Image_a494jwa494jwa494.jfif', fundo: 'preto' },
  { id: 'colecionador-bronze', de: 'Gemini_Generated_Image_bj902abj902abj90 (2).jfif', fundo: 'preto' },
  { id: 'colecionador-prata', de: 'Gemini_Generated_Image_bj902abj902abj90 (1).jfif', fundo: 'preto' },
  { id: 'colecionador-diamante', de: 'Gemini_Generated_Image_bj902abj902abj90.jfif', fundo: 'preto' },
  // provisória: o Gemini não gerou o nível ouro; é a prata recolorida para dourado (troque pela arte de verdade quando tiver)
  { id: 'colecionador-ouro', de: 'Gemini_Generated_Image_bj902abj902abj90 (1).jfif', fundo: 'preto', douradaProvisoria: true },
  { id: 'arco-iris', de: 'Gemini_Generated_Image_dyol4cdyol4cdyol.jfif', fundo: 'xadrez' },
  { id: 'maldicao-do-cinza', de: 'Gemini_Generated_Image_etv27letv27letv2.jfif', fundo: 'preto' },
  { id: 'viciado-em-roleta', de: 'Gemini_Generated_Image_gcr94ngcr94ngcr9.jfif', fundo: 'preto' },
  { id: 'arsenal-afiado-lendaria', de: 'Gemini_Generated_Image_h5ok2jh5ok2jh5ok (2).jfif', fundo: 'preto' },
  { id: 'arsenal-afiado-ouro', de: 'Gemini_Generated_Image_h5ok2jh5ok2jh5ok.jfif', fundo: 'preto' },
  { id: 'arsenal-afiado-diamante', de: 'Gemini_Generated_Image_h5ok2jh5ok2jh5ok (1).jfif', fundo: 'preto' },
  { id: 'quase', de: 'Gemini_Generated_Image_mx3n0qmx3n0qmx3n.jfif', fundo: 'xadrez' },
  { id: 'mestre-da-caixa', de: 'Gemini_Generated_Image_q6gtq4q6gtq4q6gt.jfif', fundo: 'preto' },
  { id: 'toque-de-midas', de: 'Gemini_Generated_Image_sbz6hbsbz6hbsbz6.jfif', fundo: 'preto' },
  { id: 'paciente', de: 'Gemini_Generated_Image_wa12pewa12pewa12.jfif', fundo: 'preto' },
]
export const CAIXAS = [
  ['caixa-radioativa', 'Gemini_Generated_Image_fqm6j1fqm6j1fqm6.jfif'],
  ['caixa-explorador', 'Gemini_Generated_Image_a17nnoa17nnoa17n.jfif'],
  ['caixa-faroeste', 'Gemini_Generated_Image_wghlrqwghlrqwghl.jfif'],
  ['caixa-abismo', 'Gemini_Generated_Image_5bywq05bywq05byw.jfif'],
  ['caixa-pirata', 'Gemini_Generated_Image_pm7r9zpm7r9zpm7r (1).jfif'],
  ['caixa-navegador', 'Gemini_Generated_Image_pm7r9zpm7r9zpm7r (4).jfif'],
  ['caixa-naufragio', 'Gemini_Generated_Image_pm7r9zpm7r9zpm7r.jfif'],
  ['caixa-sombria', 'Gemini_Generated_Image_pm7r9zpm7r9zpm7r (2).jfif'],
  ['caixa-alquimista', 'Gemini_Generated_Image_pm7r9zpm7r9zpm7rr.jfif'],
  ['caixa-halloween', 'Gemini_Generated_Image_pxeivgpxeivgpxei.jfif'],
  ['caixa-natal', 'Gemini_Generated_Image_wbca4lwbca4lwbca.jfif'],
  ['caixa-circo', 'Gemini_Generated_Image_xu52s0xu52s0xu52.jfif'],
  ['caixa-artica', 'Gemini_Generated_Image_9qilc89qilc89qil.jfif'],
  ['caixa-dragao', 'Gemini_Generated_Image_3z83el3z83el3z83.jfif'],
  ['caixa-samurai', 'Gemini_Generated_Image_7rvlm37rvlm37rvl.jfif'],
  ['caixa-neon', 'Gemini_Generated_Image_pm7r9zpm7r9zpm7r (3).jfif'],
  ['caixa-cosmica', 'Gemini_Generated_Image_pzq61cpzq61cpzq6.jfif'],
  ['caixa-cibernetica', 'Gemini_Generated_Image_vjwcfyvjwcfyvjwc.jfif'],
  ['caixa-farao', 'Gemini_Generated_Image_z56r0sz56r0sz56r.jfif'],
].map(([id, de]) => ({ id, de, fundo: 'azul' }))

// ── fundo ──
const dist = (d, i, r, g, b) => Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b)

// Preenche a partir das bordas tudo que "parece fundo" (conectado à borda) e devolve o mapa de pixels de fundo
function fundoPorInundacao(d, w, h, pertence) {
  const marca = new Uint8Array(w * h)
  const pilha = []
  const entrar = (x, y) => {
    const p = y * w + x
    if (marca[p] || !pertence(p * 4)) return
    marca[p] = 1
    pilha.push(p)
  }
  for (let x = 0; x < w; x++) (entrar(x, 0), entrar(x, h - 1))
  for (let y = 0; y < h; y++) (entrar(0, y), entrar(w - 1, y))
  while (pilha.length) {
    const p = pilha.pop()
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) entrar(x - 1, y)
    if (x < w - 1) entrar(x + 1, y)
    if (y > 0) entrar(x, y - 1)
    if (y < h - 1) entrar(x, y + 1)
  }
  return marca
}

function tirarFundo(d, w, h, tipo) {
  if (tipo === 'nenhum') return
  const brilho = (i) => Math.max(d[i], d[i + 1], d[i + 2])
  let pertence
  if (tipo === 'preto') pertence = (i) => brilho(i) <= 30
  else if (tipo === 'xadrez') pertence = (i) => brilho(i) <= 100 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 30 // casas cinza-escuras, sem cor
  else {
    // fundo azul-marinho do Gemini: compara com a cor média das bordas (varia pouco)
    let r = 0, g = 0, b = 0, n = 0
    for (let x = 0; x < w; x += 7) for (const y of [2, h - 3]) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
    for (let y = 0; y < h; y += 7) for (const x of [2, w - 3]) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
    r /= n; g /= n; b /= n
    pertence = (i) => dist(d, i, r, g, b) <= 40 && d[i + 2] >= d[i] // azulado e perto da cor do fundo
  }
  const fundo = fundoPorInundacao(d, w, h, pertence)
  // alfa: 0 no fundo; nos 3 px junto dele, sobe com a distância (contorno suave, sem serrilhado nem halo preto)
  const alfa = new Uint8Array(w * h).fill(255)
  for (let p = 0; p < w * h; p++) if (fundo[p]) alfa[p] = 0
  const RAIO = 3
  const copia = Uint8Array.from(alfa)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (copia[p] === 0) continue
      let menor = RAIO + 1
      for (let dy = -RAIO; dy <= RAIO && menor > 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -RAIO; dx <= RAIO; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          if (copia[yy * w + xx] === 0) menor = Math.min(menor, Math.max(Math.abs(dx), Math.abs(dy)))
        }
      }
      if (menor <= RAIO) alfa[p] = Math.round(255 * (menor / (RAIO + 1)))
    }
  }
  for (let p = 0; p < w * h; p++) d[p * 4 + 3] = Math.min(d[p * 4 + 3], alfa[p])
}

// Troca o aço por dourado, mantendo as luzes azuis (provisório do Colecionador ouro)
function dourar(d, w, h) {
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const r = d[i], g = d[i + 1], b = d[i + 2]
    if (b > r * 1.35 && b > 90) continue // luz azul
    const l = 0.3 * r + 0.59 * g + 0.11 * b
    const v = Math.min(255, l * 1.15)
    d[i] = Math.min(255, v * 1.15 + 12)
    d[i + 1] = Math.min(255, v * 0.88 + 6)
    d[i + 2] = Math.min(255, v * 0.42)
  }
}

// Recorta a caixa delimitadora do que não é transparente e centraliza no quadrado com margem
async function quadrado(buf, w, h) {
  const d = buf
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const cw = x1 - x0 + 1
  const ch = y1 - y0 + 1
  const lado = Math.round(TAM * (1 - 2 * MARGEM))
  const recorte = await sharp(d, { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0, top: y0, width: cw, height: ch }).resize(lado, lado, { fit: 'inside' }).png().toBuffer()
  return sharp({ create: { width: TAM, height: TAM, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: recorte, gravity: 'center' }]).png().toBuffer()
}

const garantirPasta = (p) => fs.mkdirSync(p, { recursive: true })
const gravar = (img, arq) => {
  garantirPasta(path.dirname(arq))
  return img.clone().webp({ quality: 88, alphaQuality: 100 }).toFile(arq)
}

async function tratar(pasta, item, tipo) {
  const dir = path.join(assets, pasta)
  const orig = path.join(dir, 'originais')
  garantirPasta(orig)
  const no_dir = path.join(dir, item.de)
  const guardado = path.join(orig, item.de)
  if (fs.existsSync(no_dir)) {
    // o original sobra na pasta principal: guarda uma cópia antes de qualquer coisa (e só então move)
    if (!fs.existsSync(guardado)) fs.copyFileSync(no_dir, guardado)
  }
  if (!fs.existsSync(guardado)) throw new Error(`sem o arquivo ${item.de} em ${pasta}/`)
  const { data, info } = await sharp(guardado).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const d = Buffer.from(data)
  tirarFundo(d, info.width, info.height, item.fundo)
  if (item.douradaProvisoria) dourar(d, info.width, info.height)
  const png = await quadrado(d, info.width, info.height)
  const base = sharp(png)
  const principal = path.join(dir, `${item.id}.png`)
  await base.clone().png({ compressionLevel: 9 }).toFile(principal)
  // web/ e mini/ (onde o site já procura as insígnias); caixas: web/ só
  await gravar(base.clone().resize(TAM, TAM), path.join(dir, 'web', `${item.id}.webp`))
  await gravar(base.clone().resize(128, 128), path.join(dir, 'mini', `${item.id}.webp`))
  if (tipo === 'insignia') {
    // bloqueada: cinza e escura; secreta: só a silhueta borrada
    await gravar(base.clone().modulate({ saturation: 0, brightness: 0.45 }).resize(TAM, TAM), path.join(dir, 'bloqueada', `${item.id}.webp`))
    await gravar(base.clone().modulate({ saturation: 0, brightness: 0.18 }).blur(10).resize(TAM, TAM), path.join(dir, 'secreta', `${item.id}.webp`))
  }
  // a cópia da pasta principal (jfif/png original) já está em originais/: tira de lá para a pasta ficar só com as artes tratadas
  if (fs.existsSync(no_dir) && fs.existsSync(guardado) && no_dir !== principal) fs.rmSync(no_dir)
  return `${item.id}: ${info.width}×${info.height} (${item.fundo}) → ${TAM}×${TAM} png+webp+mini${tipo === 'insignia' ? '+bloqueada+secreta' : ''}`
}

const so = new Set(process.argv.slice(2))
const quer = (it) => !so.size || so.has(it.id)
for (const it of INSIGNIAS.filter(quer)) console.log(await tratar('insignia', it, 'insignia'))
for (const it of CAIXAS.filter(quer)) console.log(await tratar('caixas', it, 'caixa'))
