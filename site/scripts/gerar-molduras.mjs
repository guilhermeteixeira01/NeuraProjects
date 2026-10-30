// Acrescenta ao catálogo (src/comum/molduras.js) as molduras novas que estão em public/assets/molduras/<pasta>/[<coleção>/] e ainda não
// estão lá. Organização: times/Brasil, times/Internacional, eventos/, outros/<Coleção>/ (ex.: outros/Chainsaw-Man/02_Power.png).
// Para cada arte (PNG 512×512 com o centro transparente) acha o buraco onde entra o avatar: os pixels transparentes ligados ao
// centro. Daí sai a "abertura" (caixa do buraco) e o "recorte" (contorno do buraco, uma linha a cada 1/56 da altura, em % da caixa),
// no mesmo formato das molduras que já estavam no catálogo. As que já existem não mudam.
// A coleção vem da subpasta de outros/ (ou da tabela COLECAO_DE, por nome do arquivo); o que não achar vai para "Outros".
// Em todas (novas e antigas) grava também abertura.fundo: a última linha com arte, para o espaço que a moldura ocupa abaixo do avatar.
//
// Uso (na pasta site/):  node scripts/gerar-molduras.mjs            grava o catálogo
//                        node scripts/gerar-molduras.mjs --conferir  só compara o cálculo com as molduras já catalogadas
// Precisa do sharp instalado globalmente (npm i -g sharp), como o tratar-imagens.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const sharp = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))('sharp')
const aqui = path.dirname(fileURLToPath(import.meta.url))
const pastaMolduras = path.resolve(aqui, '../public/assets/molduras')
const arquivoCatalogo = path.resolve(aqui, '../src/comum/molduras.js')
const LINHAS = 56
const TRANSPARENTE = 200 // alpha abaixo disso conta como buraco

// Ordem das coleções no seletor (as de anime em ordem alfabética, depois as outras)
export const COLECOES = [
  'Times', 'Eventos',
  'Attack on Titan', 'Bleach', 'Chainsaw Man', 'Death Note', 'Demon Slayer', 'Dragon Ball', 'Evangelion', 'Fullmetal Alchemist', 'Gundam',
  'Hunter x Hunter', 'Jujutsu Kaisen', 'My Hero Academia', 'Naruto', 'One Piece', 'Pokémon', 'Sailor Moon', 'Solo Leveling', 'Spy x Family', 'Tokyo Ghoul',
  'Marvel', 'Harry Potter', 'Filmes', 'Terror', 'Outros',
]
// arquivo (sem o número e a extensão) -> [coleção, nome bonito]
const COLECAO_DE = {
  Naruto: ['Naruto', 'Naruto'], Akatsuki: ['Naruto', 'Akatsuki'], Sasuke: ['Naruto', 'Sasuke'],
  'Dragon-Ball': ['Dragon Ball', 'Dragon Ball'], Vegeta: ['Dragon Ball', 'Vegeta'],
  'One-Piece': ['One Piece', 'One Piece'], Zoro: ['One Piece', 'Zoro'],
  'Demon-Slayer': ['Demon Slayer', 'Demon Slayer'], Nezuko: ['Demon Slayer', 'Nezuko'],
  'Jujutsu-Kaisen': ['Jujutsu Kaisen', 'Jujutsu Kaisen'], Sukuna: ['Jujutsu Kaisen', 'Sukuna'],
  'Attack-on-Titan': ['Attack on Titan', 'Attack on Titan'], Bleach: ['Bleach', 'Bleach'], 'Death-Note': ['Death Note', 'Death Note'],
  'Fullmetal-Alchemist': ['Fullmetal Alchemist', 'Fullmetal Alchemist'], 'Hunter-x-Hunter': ['Hunter x Hunter', 'Hunter x Hunter'],
  Pokemon: ['Pokémon', 'Pokémon'], 'Sailor-Moon': ['Sailor Moon', 'Sailor Moon'], Evangelion: ['Evangelion', 'Evangelion'], Gundam: ['Gundam', 'Gundam'],
  'Tokyo-Ghoul': ['Tokyo Ghoul', 'Tokyo Ghoul'], 'Chainsaw-Man': ['Chainsaw Man', 'Chainsaw Man'], 'Solo-Leveling': ['Solo Leveling', 'Solo Leveling'],
  'Spy-x-Family': ['Spy x Family', 'Spy x Family'], 'My-Hero-Academia': ['My Hero Academia', 'My Hero Academia'],
  'Iron-Man': ['Marvel', 'Iron Man'], Thor: ['Marvel', 'Thor'], 'Captain-America': ['Marvel', 'Captain America'], 'Black-Panther': ['Marvel', 'Black Panther'], 'Doctor-Strange': ['Marvel', 'Doctor Strange'],
  'Harry-Potter': ['Harry Potter', 'Harry Potter'], Slytherin: ['Harry Potter', 'Slytherin'],
  'Indiana-Jones': ['Filmes', 'Indiana Jones'], 'De-Volta-Para-o-Futuro': ['Filmes', 'De Volta para o Futuro'], 'Lord-of-the-Rings': ['Filmes', 'O Senhor dos Anéis'],
  'Star-Wars-Jedi': ['Filmes', 'Star Wars Jedi'], Dune: ['Filmes', 'Duna'], 'Pirates-Caribbean': ['Filmes', 'Piratas do Caribe'], 'Jurassic-Park': ['Filmes', 'Jurassic Park'],
  'Avatar-Pandora': ['Filmes', 'Avatar Pandora'], Matrix: ['Filmes', 'Matrix'], Tron: ['Filmes', 'Tron'], Transformers: ['Filmes', 'Transformers'], Ghostbusters: ['Filmes', 'Caça-Fantasmas'],
  Ghostface: ['Terror', 'Ghostface'], Jason: ['Terror', 'Jason'],
  'Samurai-Celestial': ['Outros', 'Samurai Celestial'], 'Dragao-de-Gelo': ['Outros', 'Dragão de Gelo'], Necromante: ['Outros', 'Necromante'], 'Cyberpunk-Sakura': ['Outros', 'Cyberpunk Sakura'],
}

const pct = (v) => `${Math.round(v * 100) / 100}%`.replace(/(\.\d)%$/, '$1%').replace(/^(\d+)%$/, '$1.0%')

export async function calcularAbertura(arquivo) {
  const { data, info } = await sharp(arquivo).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const buraco = new Uint8Array(w * h)
  const pilha = [(h >> 1) * w + (w >> 1)]
  while (pilha.length) {
    const p = pilha.pop()
    if (buraco[p] || data[p * 4 + 3] >= TRANSPARENTE) continue
    buraco[p] = 1
    const x = p % w, y = (p / w) | 0
    if (x > 0) pilha.push(p - 1)
    if (x < w - 1) pilha.push(p + 1)
    if (y > 0) pilha.push(p - w)
    if (y < h - 1) pilha.push(p + w)
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let p = 0; p < w * h; p++) if (buraco[p]) { const x = p % w, y = (p / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (x1 < 0) throw new Error(`sem buraco transparente no centro: ${arquivo}`)
  const largura = x1 - x0 + 1, altura = y1 - y0 + 1
  const dir = [], esq = []
  for (let i = 0; i <= LINHAS; i++) {
    const fy = i / LINHAS
    const y = Math.min(y1, y0 + Math.round(fy * (altura - 1)))
    let a = -1, b = -1
    for (let x = x0; x <= x1; x++) if (buraco[y * w + x]) { if (a < 0) a = x; b = x }
    if (a < 0) continue
    const py = pct(Math.min(fy * 100, 99.7))
    dir.push(`${pct(((b - x0 + 1) / largura) * 100)} ${py}`)
    esq.push(`${pct(((a - x0) / largura) * 100)} ${py}`)
  }
  let fundo = h
  while (fundo > y1 + 1 && !temArte(data, w, fundo - 1)) fundo--
  return { x: x0, y: y0, largura, altura, fundo, recorte: `polygon(${[...dir, ...esq.reverse()].join(',')})` }
}

// linha y tem algum pixel visível da arte
const temArte = (data, w, y) => { for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) return true; return false }

// pasta de outros/ -> coleção (Pokemon -> Pokémon, Diversos -> Outros, Chainsaw-Man -> Chainsaw Man)
const colecaoDaPasta = (sub) => (sub === 'Diversos' ? 'Outros' : COLECOES.find((c) => slug(c) === slug(sub)) || null)

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function principal() {
  const { MOLDURAS } = await import(pathToFileURL(arquivoCatalogo).href)
  if (process.argv.includes('--conferir')) {
    for (const m of MOLDURAS.slice(0, 6)) {
      const a = await calcularAbertura(path.join(pastaMolduras, m.arquivo))
      console.log(m.id.padEnd(24), 'catálogo', [m.abertura.x, m.abertura.y, m.abertura.largura, m.abertura.altura].join(','), ' calculado', [a.x, a.y, a.largura, a.altura].join(','))
    }
    return
  }
  const conhecidos = new Set(MOLDURAS.map((m) => m.arquivo))
  const novas = []
  // PNGs de cada pasta e das subpastas dela: [pasta, subpasta | null, arquivo]
  const pngs = []
  for (const pasta of fs.readdirSync(pastaMolduras)) {
    const dir = path.join(pastaMolduras, pasta)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const f of fs.readdirSync(dir).sort()) {
      if (/\.png$/i.test(f)) pngs.push([pasta, null, f])
      else if (fs.statSync(path.join(dir, f)).isDirectory())
        for (const g of fs.readdirSync(path.join(dir, f)).filter((g) => /\.png$/i.test(g)).sort()) pngs.push([pasta, f, g])
    }
  }
  for (const [pasta, sub, f] of pngs) {
    const arquivo = [pasta, sub, f].filter(Boolean).join('/')
    if (conhecidos.has(arquivo)) continue
    const base = f.replace(/^\d+_/, '').replace(/\.png$/i, '')
    const daPasta = pasta === 'times' ? 'Times' : pasta === 'eventos' ? 'Eventos' : sub && colecaoDaPasta(sub)
    const tabela = COLECAO_DE[base] && (!daPasta || COLECAO_DE[base][0] === daPasta) ? COLECAO_DE[base] : null
    const [colecao, nome] = tabela || [daPasta || 'Outros', base.replace(/-/g, ' ')]
    // id com uma barra só (o worker exige pasta/nome): a subpasta de outros/ entra no nome (outros/chainsaw-man-power)
    const id = `${pasta}/${sub && pasta === 'outros' ? `${slug(sub)}-` : ''}${slug(base)}`
    const abertura = await calcularAbertura(path.join(pastaMolduras, arquivo))
    novas.push({ id, nome, colecao, fonte: 'neura', forma: 'quadrada', escala: Math.round((512 / abertura.largura) * 100) / 100, arquivo, abertura })
    console.log(`+ ${arquivo} -> ${colecao} / ${nome} (abertura ${abertura.largura}×${abertura.altura})`)
  }
  // fundo das que já estavam (só ele entra; abertura e recorte ficam como estão)
  for (const m of MOLDURAS) {
    if (!m.abertura || m.abertura.fundo != null) continue
    const { fundo } = await calcularAbertura(path.join(pastaMolduras, m.arquivo))
    const { recorte, ...resto } = m.abertura
    m.abertura = { ...resto, fundo, recorte }
  }
  const ids = new Set(MOLDURAS.map((m) => m.id))
  for (const m of novas) if (ids.has(m.id)) throw new Error(`id repetido: ${m.id}`)
  const todas = [...MOLDURAS, ...novas]
  const semColecao = [...new Set(todas.map((m) => m.colecao))].filter((c) => !COLECOES.includes(c))
  if (semColecao.length) throw new Error(`coleção fora da lista COLECOES: ${semColecao.join(', ')}`)
  const texto = fs.readFileSync(arquivoCatalogo, 'utf8')
  const ini = texto.indexOf('export const COLECOES')
  const fim = texto.indexOf('\nconst PORID')
  const novo = `${texto.slice(0, ini)}export const COLECOES = ${JSON.stringify(COLECOES)}\nexport const MOLDURAS = ${JSON.stringify(todas, null, 2)}${texto.slice(fim)}`
  fs.writeFileSync(arquivoCatalogo, novo)
  console.log(`${novas.length} moldura(s) nova(s); catálogo com ${todas.length}.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal()
