// Partes comuns das ferramentas de molduras: ler/gravar APNG e gerar a miniatura parada.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import UPNG from 'upng-js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
// Pasta publicada das molduras: public/assets/molduras/<coleção>/<nome>.png (+ .webp)
export const PASTA = path.resolve(aqui, '../../public/assets/molduras')

// Quadros RGBA (Uint8Array) de um PNG/APNG, com o tempo de cada um (ms)
export function lerQuadros(buf) {
  const img = UPNG.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  // Primeiro quadro com descarte "voltar ao anterior" (2): pela especificação do APNG vale como "limpar" (1).
  // Sem isso o upng-js quebra procurando um quadro anterior que não existe.
  if (img.frames?.[0]?.dispose === 2) img.frames[0].dispose = 1
  const quadros = UPNG.toRGBA8(img).map((q) => new Uint8Array(q))
  const atrasos = img.frames?.length ? img.frames.map((f) => Math.max(10, Math.round(f.delay || 0))) : [0]
  return { largura: img.width, altura: img.height, quadros, atrasos }
}

// Recomprime um APNG pesado: 256 cores por quadro, mesmos quadros e tempos
export function recomprimir(buf) {
  const { largura, altura, quadros, atrasos } = lerQuadros(buf)
  const bufs = quadros.map((q) => q.buffer.slice(q.byteOffset, q.byteOffset + q.byteLength))
  return Buffer.from(UPNG.encode(bufs, largura, altura, 256, quadros.length > 1 ? atrasos : undefined))
}

// Imagem parada (.webp no tamanho original) do quadro mais "cheio" da animação (tem moldura que começa vazia).
// Serve de miniatura na tela de escolha e de moldura no modo "Melhorar desempenho" (por isso não é reduzida).
export async function miniatura(buf, destino) {
  const { largura, altura, quadros } = lerQuadros(buf)
  let melhor = quadros[0]
  let max = -1
  for (const q of quadros) {
    let soma = 0
    for (let i = 3; i < q.length; i += 4) soma += q[i]
    if (soma > max) [max, melhor] = [soma, q]
  }
  await sharp(Buffer.from(melhor), { raw: { width: largura, height: altura, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(destino)
}

// Grava a moldura animada e a miniatura em PASTA/<id>.png e .webp
export async function gravar(id, buf) {
  const destino = path.join(PASTA, ...id.split('/'))
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino + '.png', buf)
  await miniatura(buf, destino + '.webp')
  return destino
}

// "Cyan Lightning Strike [It's Chopping Time!]" -> "cyan-lightning-strike"; "Fire (vermelho)" -> "fire-vermelho"
// (o que está entre parênteses fica: diferencia variações com o mesmo nome)
export const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\[.*?\]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

export { sharp, UPNG }
