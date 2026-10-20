// Imagens PROVISÓRIAS das caixas novas (ainda sem arte do Gemini): uma caixa desenhada em SVG com a cor e o nome do tema.
// Só cria o que ainda não existe: quando você tiver a arte de verdade, ponha o arquivo em public/assets/caixas/, acrescente em CAIXAS em
// scripts/tratar-imagens.mjs e rode  node scripts/tratar-imagens.mjs <id>  (isso substitui a provisória).
//   node scripts/gerar-caixas-provisorias.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const sharp = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))('sharp')
const aqui = path.dirname(fileURLToPath(import.meta.url))
const pasta = path.resolve(aqui, '../public/assets/caixas')
const CAIXAS = JSON.parse(fs.readFileSync(path.resolve(aqui, '../worker/steam-login/src/caixas-iniciais.json'), 'utf8'))

const mistura = (hex, alvo, t) => {
  const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = c(hex)
  const b = c(alvo)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
const svg = (nome, cor) => {
  const claro = mistura(cor, '#ffffff', 0.35)
  const escuro = mistura(cor, '#000000', 0.55)
  const medio = mistura(cor, '#000000', 0.25)
  const palavras = nome.replace(/^Caixa (de )?/, '').toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${claro}"/><stop offset="1" stop-color="${cor}"/></linearGradient>
    <linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="${medio}"/></linearGradient>
    <linearGradient id="d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${medio}"/><stop offset="1" stop-color="${escuro}"/></linearGradient>
    <radialGradient id="b" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="${cor}" stop-opacity=".45"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="256" cy="400" rx="200" ry="40" fill="#000" opacity=".35"/>
  <ellipse cx="256" cy="300" rx="230" ry="190" fill="url(#b)"/>
  <polygon points="256,120 430,205 256,290 82,205" fill="url(#t)" stroke="${escuro}" stroke-width="4" stroke-linejoin="round"/>
  <polygon points="82,205 256,290 256,420 82,335" fill="url(#e)" stroke="${escuro}" stroke-width="4" stroke-linejoin="round"/>
  <polygon points="256,290 430,205 430,335 256,420" fill="url(#d)" stroke="${escuro}" stroke-width="4" stroke-linejoin="round"/>
  <polygon points="256,120 430,205 256,290 82,205 256,120" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
  <polygon points="150,236 256,288 256,330 150,278" fill="${escuro}" opacity=".35"/>
  <polygon points="236,288 276,288 276,420 236,420" fill="#f5c542" opacity=".85"/>
  <rect x="104" y="395" width="304" height="46" rx="8" fill="#000" opacity=".55"/>
  <text x="256" y="428" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${palavras.length > 11 ? 22 : 28}" fill="#fff" letter-spacing="2">${palavras}</text>
</svg>`
}

fs.mkdirSync(path.join(pasta, 'web'), { recursive: true })
fs.mkdirSync(path.join(pasta, 'mini'), { recursive: true })
for (const c of CAIXAS) {
  const alvo = path.join(pasta, 'web', `${c.slug}.webp`)
  if (fs.existsSync(alvo)) continue
  const png = await sharp(Buffer.from(svg(c.nome, c.cor))).png().toBuffer()
  const img = sharp(png)
  await img.clone().png({ compressionLevel: 9 }).toFile(path.join(pasta, `${c.slug}.png`))
  await img.clone().webp({ quality: 90, alphaQuality: 100 }).toFile(alvo)
  await img.clone().resize(128, 128).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(pasta, 'mini', `${c.slug}.webp`))
  console.log('provisória:', c.slug)
}
