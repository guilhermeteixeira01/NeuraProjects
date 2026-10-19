// Prepara os emblemas de assinatura (Subscriber, Gold, Platinum, Diamond, Elite, Legend) para o site:
//   - tira o fundo (as imagens vêm sobre fundo branco/cinza claro): o fundo é o que encosta nas bordas e se parece com a cor dele;
//     o branco que está DENTRO do emblema (a letra, os brilhos) fica
//   - recorta no emblema e reduz para 128 x 128 (o site mostra de 16 a 64 px; 128 dá nitidez em tela retina)
//   - GIF animado: continua animado, em WebP com transparência (metade dos quadros, mesmo tempo total) e ganha uma versão
//     parada (primeiro quadro, "<nome>-parado.webp") para "Melhorar desempenho" e movimento reduzido
// Originais (pesados: 10 MB cada GIF) ficam em ferramentas/sub/originais/ (fora do git); a saída vai para public/assets/sub/.
//
// Uso (precisa do pacote sharp: npm i sharp, numa pasta de trabalho fora do repositório):
//   node processar.mjs [pasta dos originais] [pasta de saída]
// Para trocar uma imagem: ponha o arquivo novo em originais/ com o mesmo prefixo (sub-, gold-, platina-, diamante-, elite-, legend-)
// e rode de novo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const entrada = path.resolve(process.argv[2] || path.join(aqui, 'originais'))
const saida = path.resolve(process.argv[3] || path.join(aqui, '../../public/assets/sub'))
const TAMANHO = 128
const PULO = 2 // GIF: usa 1 quadro a cada PULO (o tempo de cada um sobe junto: a animação dura o mesmo)

// prefixo do arquivo -> nível (ids usados pelo site em src/comum/assinatura.js)
const NIVEIS = { sub: 'subscriber', gold: 'gold', platina: 'platinum', diamante: 'diamond', elite: 'elite', legend: 'legend' }

async function lerQuadro(arquivo, pagina) {
  const base = /\.gif$/i.test(arquivo) ? sharp(arquivo, { page: pagina }) : sharp(arquivo)
  const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

// Fundo = pixels parecidos com a cor das bordas e ligados a elas (inundação a partir da borda)
function tirarFundo({ data, w, h }, tolerancia = 26) {
  const amostra = []
  for (let x = 0; x < w; x += 7) amostra.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y += 7) amostra.push(y * w, y * w + w - 1)
  const canal = (c) => amostra.map((p) => data[p * 4 + c]).sort((a, b) => a - b)[amostra.length >> 1]
  const [br, bg, bb] = [canal(0), canal(1), canal(2)]
  const dist = (p) => Math.max(Math.abs(data[p * 4] - br), Math.abs(data[p * 4 + 1] - bg), Math.abs(data[p * 4 + 2] - bb))

  const fundo = new Uint8Array(w * h)
  const pilha = []
  const entrar = (p) => {
    if (!fundo[p] && dist(p) <= tolerancia) {
      fundo[p] = 1
      pilha.push(p)
    }
  }
  for (let x = 0; x < w; x++) {
    entrar(x)
    entrar((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    entrar(y * w)
    entrar(y * w + w - 1)
  }
  while (pilha.length) {
    const p = pilha.pop()
    const x = p % w
    if (x > 0) entrar(p - 1)
    if (x < w - 1) entrar(p + 1)
    if (p >= w) entrar(p - w)
    if (p < w * (h - 1)) entrar(p + w)
  }

  // Borda suave: pixel claro encostado no fundo vira meio transparente (sem "halo" branco em volta do emblema)
  for (let p = 0; p < w * h; p++) {
    if (fundo[p]) {
      data[p * 4 + 3] = 0
      continue
    }
    const x = p % w
    const encosta = (x > 0 && fundo[p - 1]) || (x < w - 1 && fundo[p + 1]) || (p >= w && fundo[p - w]) || (p < w * (h - 1) && fundo[p + w])
    if (encosta) {
      const d = dist(p)
      data[p * 4 + 3] = d >= 70 ? 255 : Math.round(255 * Math.max(0.3, (d - tolerancia) / (70 - tolerancia)))
    }
  }
  return fundo
}

// Retângulo que contém o emblema (colunas/linhas com pelo menos alguns pixels fora do fundo)
function caixa(fundo, w, h) {
  const col = new Uint32Array(w)
  const lin = new Uint32Array(h)
  // ignora 4 px da borda: alguns GIFs trazem uma linha fina ali, que não é parte do emblema
  const M = 4
  for (let p = 0; p < w * h; p++) {
    const x = p % w
    const y = (p / w) | 0
    if (!fundo[p] && x >= M && x < w - M && y >= M && y < h - M) (col[x]++, lin[y]++)
  }
  // só conta coluna/linha com presença forte do emblema (faíscas soltas e ruído do GIF não alargam o recorte)
  const acha = (v) => {
    const min = Math.max(4, Math.max(...v) * 0.08)
    return [v.findIndex((n) => n >= min), v.length - 1 - [...v].reverse().findIndex((n) => n >= min)]
  }
  const [x0, x1] = acha(col)
  const [y0, y1] = acha(lin)
  return { x0, y0, x1, y1 }
}

async function reduzir({ data, w, h }, c) {
  const largura = c.x1 - c.x0 + 1
  const altura = c.y1 - c.y0 + 1
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: c.x0, top: c.y0, width: largura, height: altura })
    .resize(TAMANHO - 4, TAMANHO - 4, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer()
}

fs.mkdirSync(saida, { recursive: true })
const arquivos = fs.readdirSync(entrada).filter((f) => /\.(gif|jpe?g|png|webp)$/i.test(f)).sort()
if (!arquivos.length) throw new Error(`Nenhuma imagem em ${entrada}`)

for (const nome of arquivos) {
  const nivel = NIVEIS[nome.split('-')[0].toLowerCase()]
  if (!nivel) {
    console.log('ignorado (prefixo desconhecido):', nome)
    continue
  }
  const arquivo = path.join(entrada, nome)
  const animado = /\.gif$/i.test(nome) && (await sharp(arquivo).metadata()).pages > 1
  const total = animado ? (await sharp(arquivo).metadata()).pages : 1
  const paginas = animado ? Array.from({ length: Math.ceil(total / PULO) }, (_, i) => i * PULO) : [0]
  const atraso = animado ? Math.round(((await sharp(arquivo).metadata()).delay?.[0] || 33) * PULO) : 0

  // 1) quadros sem fundo e a caixa do emblema (mediana de todos os quadros: o recorte não "pula" de um quadro para o outro e o brilho
  //    que passa do emblema em poucos quadros não alarga o recorte)
  const quadros = []
  const caixas = []
  for (const pagina of paginas) {
    const q = await lerQuadro(arquivo, pagina)
    const fundo = tirarFundo(q)
    const c = caixa(fundo, q.w, q.h)
    caixas.push(c)
    quadros.push(q)
  }
  const mediana = (campo) => caixas.map((c) => c[campo]).sort((a, b) => a - b)[caixas.length >> 1]
  const caixaTodos = { x0: mediana('x0'), y0: mediana('y0'), x1: mediana('x1'), y1: mediana('y1') }
  // quadrado em volta do emblema (o recorte é "contain": não distorce)
  // 2) reduz e grava
  const reduzidos = []
  for (const q of quadros) reduzidos.push(await reduzir(q, caixaTodos))

  if (!animado) {
    await sharp(reduzidos[0], { raw: { width: TAMANHO, height: TAMANHO, channels: 4 } }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(path.join(saida, `${nivel}.webp`))
  } else {
    // cada quadro vira um PNG e o sharp junta todos numa animação só (join), com transparência
    const png = await Promise.all(reduzidos.map((r) => sharp(r, { raw: { width: TAMANHO, height: TAMANHO, channels: 4 } }).png().toBuffer()))
    await sharp(png, { join: { animated: true } })
      .webp({ quality: 72, alphaQuality: 90, effort: 4, loop: 0, delay: reduzidos.map(() => atraso) })
      .toFile(path.join(saida, `${nivel}.webp`))
    await sharp(reduzidos[0], { raw: { width: TAMANHO, height: TAMANHO, channels: 4 } }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(path.join(saida, `${nivel}-parado.webp`))
  }
  const kb = (fs.statSync(path.join(saida, `${nivel}.webp`)).size / 1024).toFixed(0)
  console.log(`${nivel.padEnd(11)} ${animado ? `animado, ${reduzidos.length} quadros de ${atraso} ms` : 'parado'} → ${kb} KB (caixa ${caixaTodos.x1 - caixaTodos.x0 + 1}x${caixaTodos.y1 - caixaTodos.y0 + 1})`)
}
