import { decode, encode, convertIndexedToRgb } from 'fast-png'
import jpeg from 'jpeg-js'
import { imageSize } from 'image-size'
import decodeWebp, { init } from '@jsquash/webp/decode.js'
import wasm from '@jsquash/webp/codec/dec/webp_dec.wasm'
import { ErroServico } from './erros.js'

let pronto
export async function decodificarHall(bytes) {
  try {
    const meta = imageSize(bytes)
    if (!meta.width || !meta.height || meta.width * meta.height > 2_000_000 || Math.max(meta.width, meta.height) > 2048) throw Error('dimensoes')
    if (meta.type === 'webp') {
      pronto ||= init(wasm)
      await pronto
      return await decodeWebp(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    }
    if (meta.type === 'jpg') return jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 2, maxMemoryUsageInMB: 32 })
    if (meta.type !== 'png') throw Error('formato')
    const p = decode(bytes)
    const dados = p.palette ? convertIndexedToRgb(p) : p.data
    const canais = p.palette ? p.palette[0].length : p.channels
    if (!p.palette && p.depth !== 8) throw Error('profundidade')
    const data = new Uint8Array(p.width * p.height * 4)
    for (let i = 0; i < p.width * p.height; i++) {
      const a = i * canais, b = i * 4
      data[b] = dados[a]; data[b + 1] = canais < 3 ? dados[a] : dados[a + 1]; data[b + 2] = canais < 3 ? dados[a] : dados[a + 2]
      data[b + 3] = canais === 2 ? dados[a + 1] : canais === 4 ? dados[a + 3] : 255
    }
    return { width: p.width, height: p.height, data }
  } catch { throw new ErroServico('hall-imagem-invalida') }
}

export function reduzirHall(imagem, max = 480) {
  const escala = Math.min(1, max / Math.max(imagem.width, imagem.height))
  const width = Math.max(1, Math.round(imagem.width * escala)), height = Math.max(1, Math.round(imagem.height * escala))
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(imagem.width - 1, Math.max(0, (x + .5) / escala - .5)), sy = Math.min(imagem.height - 1, Math.max(0, (y + .5) / escala - .5))
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, imagem.width - 1), y1 = Math.min(y0 + 1, imagem.height - 1), fx = sx - x0, fy = sy - y0
    for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round((imagem.data[(y0 * imagem.width + x0) * 4 + c] * (1 - fx) + imagem.data[(y0 * imagem.width + x1) * 4 + c] * fx) * (1 - fy) + (imagem.data[(y1 * imagem.width + x0) * 4 + c] * (1 - fx) + imagem.data[(y1 * imagem.width + x1) * 4 + c] * fx) * fy)
  }
  return { width, height, data }
}

export const pngHall = imagem => encode({ ...imagem, depth: 8, channels: 4 })

// Remove o fundo e grandes vãos entre braços e camisa, preservando detalhes pequenos.
export function recortarHall(imagem) {
  const { width, height } = imagem, n = width * height, data = new Uint8Array(imagem.data)
  const mascara = new Uint8Array(n), fila = new Int32Array(n)
  let fim = 0
  const adicionar = i => {
    const k = i * 4
    if (!mascara[i] && data[k + 1] >= 80 && data[k + 1] - Math.max(data[k], data[k + 2]) >= 30) { mascara[i] = 1; fila[fim++] = i }
  }
  for (let x = 0; x < width; x++) { adicionar(x); adicionar((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { adicionar(y * width); adicionar(y * width + width - 1) }
  for (let ini = 0; ini < fim; ini++) {
    const i = fila[ini], x = i % width
    if (x) adicionar(i - 1)
    if (x < width - 1) adicionar(i + 1)
    if (i >= width) adicionar(i - width)
    if (i < n - width) adicionar(i + width)
  }
  for (let s = 0; s < n; s++) {
    const inicio = fim
    adicionar(s)
    if (inicio === fim) continue
    for (let ini = inicio; ini < fim; ini++) {
      const i = fila[ini], x = i % width
      if (x) adicionar(i - 1)
      if (x < width - 1) adicionar(i + 1)
      if (i >= width) adicionar(i - width)
      if (i < n - width) adicionar(i + width)
    }
    if (fim - inicio < Math.max(64, n * .001)) {
      for (let i = inicio; i < fim; i++) mascara[fila[i]] = 2
      fim = inicio
    }
  }
  if (fim < n * .12 || fim > n * .92) throw new ErroServico('hall-recorte')
  for (let i = 0; i < n; i++) {
    const k = i * 4
    if (mascara[i] === 1) { data[k] = data[k + 1] = data[k + 2] = data[k + 3] = 0; continue }
    if ((i % width && mascara[i - 1] === 1) || (i % width < width - 1 && mascara[i + 1] === 1) || (i >= width && mascara[i - width] === 1) || (i < n - width && mascara[i + width] === 1)) {
      const excesso = Math.max(0, data[k + 1] - Math.max(data[k], data[k + 2]))
      data[k + 1] -= excesso
      data[k + 3] = Math.round(data[k + 3] * (1 - Math.min(.8, excesso / 100)))
    }
  }
  return { width, height, data }
}
