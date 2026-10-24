// Skins do jogador: catálogo (public/assets/skins/*.json, gerado por ferramentas/skins/gerar-catalogo.mjs) e inventário salvo no worker
// (GET/POST /skins). O plugin BaseComp lê o mesmo inventário e aplica no servidor de CS2.
import { useEffect, useState } from 'react'
import { chamarApi } from './api.js'

// Cor da raridade de adesivos e chaveiros guardados: o chaveiro traz a cor no catálogo (azul, roxo, rosa, vermelho); o adesivo vale pelo acabamento
// (papel cinza, Glitter azul, Holo roxo, Foil/Lenticular/Embroidered rosa, Gold vermelho)
export const ACABAMENTOS_ADESIVO = [
  ['Gold', '#eb4b4b'],
  ['Foil', '#d32ce6'],
  ['Lenticular', '#d32ce6'],
  ['Embroidered', '#d32ce6'],
  ['Holo', '#8847ff'],
  ['Glitter', '#4b69ff'],
]
export const acabamentoDoAdesivo = (nome) => {
  const m = /\((Holo|Foil|Gold|Glitter|Lenticular|Embroidered)[^)]*\)/i.exec(nome || '')
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : 'Papel'
}
export const corEnfeite = (tipo, linha) => {
  if (tipo === 'chaveiro') return linha?.[3] || '#4b69ff'
  const f = acabamentoDoAdesivo(linha?.[1])
  return ACABAMENTOS_ADESIVO.find(([n]) => n === f)?.[1] || '#b0c3d9'
}

export const IMG_BASE = 'https://community.akamai.steamstatic.com/economy/image/'
export const urlImg = (sufixo, tamanho = 256) => (sufixo ? `${IMG_BASE}${sufixo}/${tamanho}fx${tamanho}f` : '')
// Arma/faca/luva: imagem 4:3 (a quadrada da Steam corta a ponta da arma)
export const urlImgArma = (sufixo, largura = 384) => (sufixo ? `${IMG_BASE}${sufixo}/${largura}fx${Math.round(largura * 0.75)}f` : '')

export const CATEGORIAS = [
  ['rifles', 'Rifles'],
  ['smgs', 'SMGs'],
  ['pistols', 'Pistolas'],
  ['heavy', 'Pesadas'],
]

export const inventarioVazio = () => ({ armas: {}, facas: {}, luvas: {}, agentes: {} })

// Catálogos: baixados uma vez por visita
const cache = {}
function carregar(nome) {
  if (!cache[nome]) {
    cache[nome] = fetch(`/assets/skins/${nome}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('catalogo'))))
      .catch((e) => {
        delete cache[nome] // tenta de novo na próxima vez
        throw e
      })
  }
  return cache[nome]
}

// nome: 'armas' | 'agentes' | 'adesivos'. Devolve { dados, erro }
export function useCatalogo(nome, ativo = true) {
  const [estado, setEstado] = useState({ dados: null, erro: false })
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    carregar(nome).then(
      (d) => vivo && setEstado({ dados: d, erro: false }),
      () => vivo && setEstado({ dados: null, erro: true }),
    )
    return () => {
      vivo = false
    }
  }, [nome, ativo])
  return estado
}

export const lerInventario = () => chamarApi('/skins')
export const salvarInventario = (inv) => chamarApi('/skins', inv)

// Exclui um item do inventário (o worker devolve o inventário já sem ele)
export const excluirItem = (id) => chamarApi('/skins/excluir', { id })

// ── Inventário (modelo igual ao do jogo: itens criados + o que está equipado em cada time) ──
export const inventarioNovo = () => ({ v: 2, itens: {}, equip: { ct: {}, tr: {} }, criado: {} })
export const novoIdItem = () => (Math.random().toString(36).slice(2, 10) + 'aaaa').slice(0, 8)
// Onde o item entra no time: a arma pelo defIndex, o resto pelo tipo (faca, luva, agente)
export const chaveEquip = (item) => (item.t === 'arma' ? String(item.d) : item.t)
export const LADOS_TIME = [
  ['ct', 'CT'],
  ['tr', 'TR'],
]

// Índices do catálogo: defIndex -> arma, e agente -> dados
export function indicar(catalogoArmas, agentes) {
  const armas = new Map((catalogoArmas || []).map((a) => [a.d, a]))
  const porAgente = new Map((agentes || []).map((a) => [a.d, a]))
  return { armas, porAgente }
}

// Como o item aparece num cartão: { titulo, subtitulo, img, cor }
export function descrever(item, idx) {
  if (item.t === 'agente') {
    const a = idx.porAgente.get(item.d)
    return { titulo: 'Agente', subtitulo: a?.n || `#${item.d}`, img: a ? urlImg(a.i, 360) : '', cor: a?.c || '', times: a ? [a.t === 'ct' ? 'ct' : 'tr'] : ['ct', 'tr'] }
  }
  const arma = idx.armas.get(item.d)
  const skin = arma?.s.find((s) => s[0] === item.p)
  return {
    titulo: `${item.t === 'faca' ? '★ ' : ''}${arma?.n || `#${item.d}`}`,
    subtitulo: skin?.[1] || (item.t === 'faca' ? 'Faca lisa' : ''),
    img: skin ? urlImgArma(skin[6], 512) : '',
    cor: skin?.[2] || '',
    skin,
    times: arma?.e && arma.e !== 'both' ? [arma.e] : ['ct', 'tr'],
  }
}
