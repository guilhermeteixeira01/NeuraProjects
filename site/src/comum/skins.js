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
const completa = (s) => /^https?:/.test(s) // alguns itens (adesivos antigos, trilhas) têm o endereço completo no catálogo
export const urlImg = (sufixo, tamanho = 256) => (sufixo ? (completa(sufixo) ? sufixo : `${IMG_BASE}${sufixo}/${tamanho}fx${tamanho}f`) : '')
// Arma/faca/luva: imagem 4:3 (a quadrada da Steam corta a ponta da arma)
export const urlImgArma = (sufixo, largura = 384) => (sufixo ? completa(sufixo) ? sufixo : `${IMG_BASE}${sufixo}/${largura}fx${Math.round(largura * 0.75)}f` : '')

export const CATEGORIAS = [
  ['rifles', 'Rifles'],
  ['smgs', 'SMGs'],
  ['pistols', 'Pistolas'],
  ['heavy', 'Pesadas'],
  ['equip', 'Equipamento'],
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
// C4: item fixo de todo jogador (sempre equipada no TR, sem pintura): o catálogo de skins não tem ela, então entra aqui
export const ID_C4 = 'c4'
export const DEF_C4 = 49
export const ehC4 = (item) => item?.t === 'arma' && item.d === DEF_C4
// imagem oficial da Steam da C4 padrão (mesma origem das outras armas)
const IMG_C4 = 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnjqWwLvfOoavw8IvTCV2bEle1w6Lk-TSq2k0x25jiBzN_9dXqVaQ91W5AkW6dU5WnQha4l'
const ARMA_C4 = { d: DEF_C4, n: 'C4 Explosive', e: 'tr', s: [] }
// Itens de perfil (um de cada tipo fica equipado): emblema (pin/moeda), trilha (trilha sonora) e grafite (cada cor é um item: p = a tinta)
export const PERFIL_TIPOS = ['emblema', 'trilha', 'grafite']
export const ehPerfil = (item) => PERFIL_TIPOS.includes(item?.t)
export const NOME_PERFIL = { emblema: 'Emblema', trilha: 'Trilha sonora', grafite: 'Grafite' }
// catálogos de perfil: a imagem vem como final de endereço da Steam ou como endereço completo (as trilhas)
export const urlPerfil = (sufixo, tamanho = 256) => (/^https?:/.test(sufixo || '') ? sufixo : urlImg(sufixo, tamanho))
export const chavePerfil = (t, d, p = 0) => (t === 'grafite' ? `${d}:${p || 0}` : d)
export function indicar(catalogoArmas, agentes, perfil = {}) {
  const armas = new Map((catalogoArmas || []).map((a) => [a.d, a]))
  const porPerfil = Object.fromEntries(PERFIL_TIPOS.map((t) => [t, new Map((perfil[t] || []).map((l) => [t === 'grafite' ? `${l[0]}:${l[4]}` : l[0], l]))]))
  armas.set(DEF_C4, ARMA_C4)
  const porAgente = new Map((agentes || []).map((a) => [a.d, a]))
  return { armas, porAgente, porPerfil }
}

// Como o item aparece num cartão: { titulo, subtitulo, img, cor }
export function descrever(item, idx) {
  if (item.t === 'agente') {
    const a = idx.porAgente.get(item.d)
    return { titulo: 'Agente', subtitulo: a?.n || `#${item.d}`, img: a ? urlImg(a.i, 360) : '', cor: a?.c || '', times: a ? [a.t === 'ct' ? 'ct' : 'tr'] : ['ct', 'tr'] }
  }
  if (ehPerfil(item)) {
    const l = idx.porPerfil?.[item.t]?.get(chavePerfil(item.t, item.d, item.p))
    const sub = item.t === 'grafite' && l?.[5] ? `${NOME_PERFIL.grafite} · ${l[5]}` : item.t === 'emblema' && l?.[4] ? l[4] : NOME_PERFIL[item.t]
    return { titulo: l?.[1] || `#${item.d}`, subtitulo: sub, img: urlPerfil(l?.[2], 512), cor: l?.[3] || '', skin: null, times: ['ct', 'tr'] }
  }
  if (ehC4(item)) return { titulo: ARMA_C4.n, subtitulo: 'Padrão', img: urlImgArma(IMG_C4, 512), cor: '', skin: null, times: ['tr'] }
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
