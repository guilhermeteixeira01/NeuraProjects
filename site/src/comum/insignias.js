import { MISSOES, ANO_EVENTOS, idEventoMissao, insigniaMissao } from '../../worker/steam-login/src/missoes-core.js'
// Insígnias: conquistas com arte própria que aparecem no perfil (passando o mouse mostra a descrição).
// Quem tem cada uma fica nos perfis do worker: perfis[id].insignias = { "<insígnia>": quando ganhou (ms) }.
//  - o admin dá e tira no painel (Usuários → Editar);
//  - troféus do top 3 pertencem ao ranking, sem conceder insígnias.
// Nova insígnia: ponha a arte em public/assets/insignia/<id>.png, rode `node ferramentas/molduras/insignias.mjs`
// (gera a versão leve em web/<id>.webp), adicione aqui e na lista INSIGNIAS do worker (src/index.js).
import { usePerfis } from './Moldura.jsx'
import { ID_MESTRE, INSIGNIAS_LOJA, insigniaMestreDoId } from '../../worker/steam-login/src/loja-core.js'

export const INSIGNIAS = [
  ...MISSOES.map(m=>({...m,id:m.categoria==='eventos'?idEventoMissao(m.id,ANO_EVENTOS):m.id,auto:true,missao:true})),
  { id: 'staff', nome: 'Staff', descricao: 'Faz parte da equipe da Neura Projects.' },
  { id: 'embaixador', nome: 'Embaixador', descricao: 'Representa e divulga a Neura Projects na comunidade.' },
  { id: 'designer', nome: 'Designer', descricao: 'Cria as artes e o visual da Neura Projects.' },
  // Insígnias da loja de caixas (o worker dá sozinho, pelo histórico de aberturas: worker/steam-login/src/loja-core.js). "Mestre da [Caixa]" vem de mestre-<caixa>.
  ...INSIGNIAS_LOJA.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, loja: true, secreta: !!i.secreta })),
]

// Todas as "Mestre da [Caixa]" usam a mesma arte
const arteDe = (id) => (ID_MESTRE.test(id) ? 'mestre-da-caixa' : insigniaMissao(id)?.id.replace(/-20\d{2}$/, '') || id)
const NOVAS_ARTES_EVENTOS = new Set(["evento-holi", "evento-sao-patricio", "evento-dia-do-rock", "evento-oktoberfest", "evento-dia-dos-mortos", "evento-ano-novo-lunar", "evento-diwali"] )
const REVISAO_ARTES = '20261106-3'
const artePublicada = (id, estado) => `/assets/insignia/${estado}/${arteDe(id)}.webp?v=${REVISAO_ARTES}`
export const imagemInsignia = id => NOVAS_ARTES_EVENTOS.has(arteDe(id)) ? `/assets/insignia/eventos-2026/${arteDe(id)}.png` : artePublicada(id, 'web')
export const imagemInsigniaPendente = (id, secreta = false) => artePublicada(id, secreta ? 'secreta' : 'bloqueada')
// Miniatura de 128 px (~10 KB) para onde a insígnia aparece pequena (lista de amigos, fileira do perfil); gerada por
// scripts/gerar-miniaturas.mjs. Se faltar, quem usa cai na imagem grande (onError).
export const miniaturaInsignia = id => NOVAS_ARTES_EVENTOS.has(arteDe(id)) ? imagemInsignia(id) : artePublicada(id, 'mini')
export const insigniaPorId = (id) => INSIGNIAS.find((i) => i.id === id) || insigniaMissao(id) || null

// Insígnias de um jogador, na ordem do catálogo: [{ ...insígnia, desde }]
export function insigniasDe(perfis, steamId) {
  const tem = perfis?.[steamId]?.insignias || {}
  const fixas = Object.keys(tem).filter(id=>!ID_MESTRE.test(id)).map(id=>{const i=insigniaPorId(id);return i?{...i,desde:Number(tem[id])||null}:null}).filter(Boolean)
  const mestres = Object.keys(tem).filter((id) => ID_MESTRE.test(id)).map((id) => ({ ...insigniaMestreDoId(id), desde: Number(tem[id]) || null }))
  return [...fixas, ...mestres]
}

export function useInsignias(steamId) {
  return insigniasDe(usePerfis(), steamId)
}

// Contas sem escolha anterior começam com as três primeiras. Uma lista vazia
// salva é uma escolha explícita para não destacar nenhuma.
export function insigniasDestacadasDe(perfis, steamId) {
  const lista = insigniasDe(perfis, steamId)
  const ids = perfis?.[steamId]?.insigniasDestacadas
  if (!Array.isArray(ids)) return lista.slice(0, 3)
  return [...new Set(ids)].slice(0, 3).map(id => lista.find(i => i.id === id)).filter(Boolean)
}
