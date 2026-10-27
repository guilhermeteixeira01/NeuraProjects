import { encode } from 'fast-png'
import { recortarHall, pngHall } from '../src/hall-codec.js'

export const referencia = encode({ width: 1, height: 1, channels: 4, depth: 8, data: new Uint8Array([150, 100, 80, 255]) })
export const foto = `data:image/png;base64,${Buffer.from(referencia).toString('base64')}`
const width = 768, height = 1152, data = new Uint8Array(width * height * 4)
let seed = 12345
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4
  if (x > 200 && x < 568 && y > 100 && y < 1100) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data[i] = 90 + seed % 150; data[i + 1] = 30 + seed % 60; data[i + 2] = seed % 100
  } else data[i + 1] = 255
  data[i + 3] = 255
}
export const binario = pngHall(recortarHall({ width, height, data }))
export const retornoImagem = { image: Buffer.from(encode({ width, height, channels: 4, depth: 8, data })).toString('base64') }

export function simularAI(chamadas = [], provedor = async () => retornoImagem) {
  return { run: async (model, { multipart }) => {
    const body = await new Response(multipart.body, { headers: { 'Content-Type': multipart.contentType } }).formData()
    chamadas.push({ model, body })
    const r = await provedor()
    if (r instanceof Response) { if (!r.ok) throw Error('provedor'); return r.json() }
    return r
  } }
}
