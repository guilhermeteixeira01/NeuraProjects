// Cards (banners) do perfil: imagens em public/assets/cards/ (a lista vem do vite.config.js, módulo virtual).
// Para ter um card novo, é só colocar o arquivo nessa pasta (proporção do card: 282 x 395) e recarregar.
// Card animado: nome terminando em "-anim" (ex.: radar-anim.svg). Para os SVG animados, a versão sem animação fica em
// public/assets/cards/parado/ (mesmo nome) e é usada com "Melhorar desempenho" ou movimento reduzido.
import arquivos from 'virtual:cards-perfil'
import { desempenhoAtivo } from './desempenho.js'

export const CARDS = arquivos
export const ehAnimado = (nome) => /-anim\.[a-z0-9]+$/i.test(String(nome))
const semMovimento = () => {
  try {
    return desempenhoAtivo() || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
export const urlCard = (nome) => {
  const arquivo = encodeURIComponent(nome)
  return /-anim\.svg$/i.test(nome) && semMovimento() ? `/assets/cards/parado/${arquivo}` : `/assets/cards/${arquivo}`
}
// "neura-ouro.svg" -> "Neura ouro"; "radar-anim.svg" -> "Radar"
export const nomeCard = (nome) => {
  const t = String(nome).replace(/\.[^.]+$/, '').replace(/-anim$/i, '').replace(/[-_]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// Fundo do card do perfil: a imagem com um escurecido em cima/embaixo para o texto continuar legível
export const fundoCard = (nome) => `linear-gradient(180deg, rgba(18,18,18,.1), rgba(18,18,18,.35) 55%, rgba(18,18,18,.88)), url("${urlCard(nome)}")`
