// Cards (banners) do perfil: imagens em public/assets/cards/<tema>/<arquivo> (cada pasta é um tema/coleção, como nas
// molduras). A lista vem do vite.config.js (módulo virtual). Para ter um card novo, é só colocar o arquivo na pasta do tema
// (ou criar uma pasta nova = tema novo), na proporção do card (282 x 395), e recarregar.
// Card animado: nome terminando em "-anim" (ex.: radar-anim.svg). Para os SVG animados, a versão sem animação fica em
// public/assets/cards/parado/<tema>/ (mesmo nome) e é usada com "Melhorar desempenho" ou movimento reduzido.
// O id de um card é "tema/arquivo.ext" (ex.: "funcoes/awper.avif").
import arquivos, { animados } from 'virtual:cards-perfil'
import minis from 'virtual:cards-mini'
import meds from 'virtual:cards-med'
import { desempenhoAtivo } from './desempenho.js'

export const CARDS = arquivos
// Animado: nome terminando em "-anim" ou imagem animada de verdade (AVIF/WebP/GIF/APNG em sequência: o vite.config.js confere o arquivo)
const animadosSet = new Set(animados)
export const ehAnimado = (nome) => /-anim\.[a-z0-9]+$/i.test(String(nome)) || animadosSet.has(String(nome)) || animadosSet.has(idCardBruto(nome))
function idCardBruto(nome) {
  return arquivos.find((c) => c.split('/').pop() === nome) || nome
}

// Cards salvos antes das pastas (só o nome do arquivo, "awper.avif") continuam valendo: acha o "tema/awper.avif"
const porArquivo = new Map(arquivos.map((c) => [c.split('/').pop(), c]))
export const idCard = (id) => (arquivos.includes(id) ? id : porArquivo.get(id) || id)
const caminho = (id) => String(id).split('/').map(encodeURIComponent).join('/')

// Tema = pasta. Nome para mostrar: "funcoes" -> "Funções" (os que não estão aqui viram "Nome da pasta")
const NOMES_TEMA = { funcoes: 'Funções', cenarios: 'Cenários', neura: 'Neura', times: 'Times' }
export const temaCard = (id) => (idCard(id).includes('/') ? idCard(id).split('/')[0] : '')
export const nomeTema = (tema) => NOMES_TEMA[tema] || String(tema).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
export const TEMAS_CARD = [...new Set(arquivos.map(temaCard))].filter(Boolean)

const semMovimento = () => {
  try {
    return desempenhoAtivo() || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
// Card parado (raster, 200 a 600 KB no original): o site mostra a versão de 400 px em webp (cards/med/, 2 a 65 KB).
// Card ANIMADO usa o próprio arquivo (a versão webp seria uma imagem parada); com "Melhorar desempenho" ou movimento reduzido
// cai na miniatura parada (raster) ou na versão parada (SVG).
export const urlCard = (nome) => {
  const id = idCard(nome)
  const base = id.replace(/\.[^.]+$/, '')
  const parado = semMovimento()
  if (!/\.svg$/i.test(id)) {
    if ((!ehAnimado(id) || parado) && meds.includes(base + '.webp')) return `/assets/cards/med/${caminho(base)}.webp`
    if (ehAnimado(id) && parado && minis.includes(base + '.webp')) return `/assets/cards/mini/${caminho(base)}.webp`
    return `/assets/cards/${caminho(id)}`
  }
  return /-anim\.svg$/i.test(id) && parado ? `/assets/cards/parado/${caminho(id)}` : `/assets/cards/${caminho(id)}`
}
// Computador sem "economia de dados": a grade da janela já mostra os cards animados se mexendo. No celular a grade mostra a
// miniatura parada (são dezenas de arquivos de até 600 KB); o card escolhido se mexe na prévia.
const gradeAnima = () => {
  try {
    return window.matchMedia('(min-width: 1025px)').matches && !navigator.connection?.saveData
  } catch {
    return false
  }
}
// Miniatura leve para a grade da janela Personalizar (public/assets/cards/mini/<tema>/<nome>.webp, gerada por
// scripts/gerar-miniaturas.mjs). Sem ela usa a imagem inteira. Card animado (SVG, leve) continua animado também na grade;
// só para com "Melhorar desempenho" ou movimento reduzido (urlCard).
export const urlMiniCard = (nome) => {
  const id = idCard(nome)
  const base = id.replace(/\.[^.]+$/, '')
  const svg = /\.svg$/i.test(id)
  // raster: miniatura parada, a não ser que seja animado e a grade possa animar (computador)
  if (!svg && minis.includes(base + '.webp') && !(ehAnimado(id) && gradeAnima() && !semMovimento())) return `/assets/cards/mini/${caminho(base)}.webp`
  return urlCard(id)
}
// "neura/neura-ouro.svg" -> "Neura ouro"; "neura/radar-anim.svg" -> "Radar"
export const nomeCard = (nome) => {
  const t = String(idCard(nome)).split('/').pop().replace(/\.[^.]+$/, '').replace(/-anim$/i, '').replace(/[-_ ]*signature card$/i, '').replace(/[-_]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// Fundo do card do perfil: a imagem com um escurecido em cima/embaixo para o texto continuar legível
// forte: escurece mais (pódio e linhas do ranking, onde tem muito texto por cima)
// Fundo do card: só a imagem, sem escurecer
export const fundoCard = (nome) => `url("${urlCard(nome)}")`
