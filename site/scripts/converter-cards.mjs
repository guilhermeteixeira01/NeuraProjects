// Converte vídeos (.mp4/.webm/.mov) de cards em AVIF animado, igual aos cards que já existem (public/assets/cards/**/*.avif):
// sem som, na proporção do card (5:7), 400×560, em sequência ("avis"), que o navegador toca em loop. Mantém os quadros e a duração do vídeo.
//   node scripts/converter-cards.mjs [pasta]      (padrão: novos = public/assets/cards/novos)
// O vídeo original NÃO fica em public/ (iria para o site e pesa dezenas de MB): é movido para ferramentas/cards-originais/<pasta>/.
// Depois: node scripts/gerar-miniaturas.mjs  (cria a miniatura parada da grade do Personalizar).
// Precisa do ffmpeg: npm i -g ffmpeg-static (só global, nada entra no projeto).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const pasta = process.argv[2] || 'novos' // pasta com os vídeos; depois separe os .avif por série (ex.: one-piece, jujutsu-kaisen)
const origem = path.resolve(aqui, '../public/assets/cards', pasta)
const guardar = path.resolve(aqui, '../ferramentas/cards-originais', pasta)
const ffmpeg = path.join(execSync('npm root -g').toString().trim(), 'ffmpeg-static', 'ffmpeg.exe')
createRequire(import.meta.url) // (só para deixar claro que nada local é carregado)

// "Zoro_executing_sword_slash_20261020161422.mp4" -> nome curto do card (o que aparece no Personalizar)
const NOMES = [
  ['Blond_man_kicking_with_fire', 'Chute de fogo'], ['Capybara_defusing_bomb', 'Capivara desarmando'], ['Character_slicing_with_hand', 'Corte com a mão'],
  ['Character_striking_nails', 'Unhas afiadas'], ['Character_throwing_fire_punch', 'Soco de fogo'], ['Character_throwing_right_straigh', 'Direto de direita'],
  ['Character_throws_Jajanken', 'Jajanken'], ['Character_uses_sword_slash', 'Corte de espada'], ['Chrollo', 'Chrollo'], ['Diver_spirit', 'Espírito do mergulhador'],
  ['Frieza', 'Freeza'], ['Gohan', 'Gohan'], ['Hisoka', 'Hisoka'], ['Inosuke', 'Inosuke'], ['Killua', 'Killua'], ['Kraken', 'Kraken'], ['Kurapika', 'Kurapika'],
  ['Luffy', 'Luffy'], ['Megumi', 'Megumi'], ['Ninja_performing', 'Ninja'], ['Piccolo', 'Piccolo'], ['Serpent_uncoiling', 'Serpente'], ['Shark_swimming', 'Tubarão'],
  ['Shinobu', 'Shinobu'], ['Skeleton_cowboy', 'Caveira cowboy'], ['Snake_striking', 'Cobra tática'], ['Swordsman_delivers', 'Espadachim de fogo'],
  ['Tanjiro', 'Tanjiro'], ['Vegeta', 'Vegeta'], ['Zenitsu', 'Zenitsu'], ['Zoro', 'Zoro'],
]
const nomeDe = (arq) => {
  const base = arq.replace(/\.[^.]+$/, '')
  const achou = NOMES.find(([prefixo]) => base.startsWith(prefixo))
  if (achou) return achou[1]
  return base.replace(/_?\d{10,}$/, '').replace(/[…_]+/g, ' ').trim() // sem nome na lista: usa o do arquivo
}

if (!fs.existsSync(origem)) throw new Error('pasta não existe: ' + origem)
const videos = fs.readdirSync(origem).filter((f) => /\.(mp4|webm|mov|mkv)$/i.test(f))
if (!videos.length) console.log('nenhum vídeo em', origem)
fs.mkdirSync(guardar, { recursive: true })
let n = 0
for (const v of videos) {
  const nome = nomeDe(v)
  const saida = path.join(origem, `${nome}.avif`)
  const t0 = Date.now()
  // 720×1280 (9:16) -> corta para 5:7 (um pouco acima do centro, onde costuma estar o rosto) e reduz para 400×560; sem áudio
  const filtro = 'crop=iw:trunc(iw*7/5/2)*2:0:trunc((ih-trunc(iw*7/5/2)*2)*0.35/2)*2,scale=400:560:flags=lanczos,format=yuv420p'
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(origem, v), '-an', '-vf', filtro, '-c:v', 'libaom-av1', '-crf', '32', '-b:v', '0', '-cpu-used', '4', '-row-mt', '1', '-f', 'avif', saida])
  fs.renameSync(path.join(origem, v), path.join(guardar, v))
  n++
  console.log(`${String(n).padStart(2)}/${videos.length} ${nome}.avif  ${(fs.statSync(saida).size / 1024).toFixed(0)} KB  ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
