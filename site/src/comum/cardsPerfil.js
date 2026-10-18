// Cards (banners) do perfil: imagens em public/assets/cards/<tema>/<arquivo> (cada pasta é um tema/coleção, como nas
// molduras). A lista vem do vite.config.js (módulo virtual). Para ter um card novo, é só colocar o arquivo na pasta do tema
// (ou criar uma pasta nova = tema novo), na proporção do card (282 x 395), e recarregar.
// Card animado: nome terminando em "-anim" (ex.: radar-anim.svg). Para os SVG animados, a versão sem animação fica em
// public/assets/cards/parado/<tema>/ (mesmo nome) e é usada com "Melhorar desempenho" ou movimento reduzido.
// O id de um card é "tema/arquivo.ext" (ex.: "funcoes/awper.avif").
import arquivos from 'virtual:cards-perfil'
import minis from 'virtual:cards-mini'
import { desempenhoAtivo } from './desempenho.js'

export const CARDS = arquivos
export const ehAnimado = (nome) => /-anim\.[a-z0-9]+$/i.test(String(nome))

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
export const urlCard = (nome) => {
  const id = idCard(nome)
  return /-anim\.svg$/i.test(id) && semMovimento() ? `/assets/cards/parado/${caminho(id)}` : `/assets/cards/${caminho(id)}`
}
// Miniatura leve para a grade da janela Personalizar (public/assets/cards/mini/<tema>/<nome>.webp, gerada por
// scripts/gerar-miniaturas-cards.mjs). Sem ela usa a imagem inteira; SVG animado usa a versão parada (sem gastar processador).
export const urlMiniCard = (nome) => {
  const id = idCard(nome)
  const base = id.replace(/\.[^.]+$/, '')
  if (minis.includes(base + '.webp')) return `/assets/cards/mini/${caminho(base)}.webp`
  return /-anim\.svg$/i.test(id) ? `/assets/cards/parado/${caminho(id)}` : `/assets/cards/${caminho(id)}`
}
// "neura/neura-ouro.svg" -> "Neura ouro"; "neura/radar-anim.svg" -> "Radar"
export const nomeCard = (nome) => {
  const t = String(idCard(nome)).split('/').pop().replace(/\.[^.]+$/, '').replace(/-anim$/i, '').replace(/[-_ ]*signature card$/i, '').replace(/[-_]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// Fundo do card do perfil: a imagem com um escurecido em cima/embaixo para o texto continuar legível
export const fundoCard = (nome) => `linear-gradient(180deg, rgba(18,18,18,.1), rgba(18,18,18,.35) 55%, rgba(18,18,18,.88)), url("${urlCard(nome)}")`
