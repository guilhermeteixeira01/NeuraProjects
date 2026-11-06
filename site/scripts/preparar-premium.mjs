import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { sharp } from '../ferramentas/molduras/comum.mjs'

const raiz = new URL('../public/assets/', import.meta.url)
const arquivos = [
  { fonte: 'premium/Neura_Premium_Card_Animacao.webp', anterior: 'premium/Neura_Premium_Card_Animado.webp', destino: 'cards/premium/neura-premium-anim.webp', mini: 'cards/mini/premium/neura-premium-anim.webp', parado: 'cards/med/premium/neura-premium-anim.webp', largura: 400, altura: 560 },
  { fonte: 'premium/moldura_premium.webp', destino: 'molduras/premium/neura-premium.webp', mini: 'molduras/premium/neura-premium-mini.webp', parado: 'molduras/premium/neura-premium-parada.webp', largura: 512, altura: 512 },
]
for (const a of arquivos) {
  try { await fs.access(new URL(a.fonte, raiz)) } catch (e) { if (e.code !== 'ENOENT' || !a.anterior) throw e; a.fonte = a.anterior }
  for (const f of [a.destino, a.mini, a.parado]) await fs.mkdir(new URL('.', new URL(f, raiz)), { recursive: true })
  // Cópia exata mantém todos os quadros e tempos da animação original.
  await fs.copyFile(new URL(a.fonte, raiz), new URL(a.destino, raiz))
  await sharp(fileURLToPath(new URL(a.fonte, raiz))).resize({ width: 128, height: 180, fit: 'inside' }).webp({ quality: 85, alphaQuality: 100 }).toFile(fileURLToPath(new URL(a.mini, raiz)))
  await sharp(fileURLToPath(new URL(a.fonte, raiz))).resize({ width: a.largura, height: a.altura, fit: 'inside' }).webp({ quality: 90, alphaQuality: 100 }).toFile(fileURLToPath(new URL(a.parado, raiz)))
  console.log(a.destino, '+ miniatura e versão sem movimento')
}
