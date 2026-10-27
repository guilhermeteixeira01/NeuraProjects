import { MISSOES, ANO_EVENTOS, idEventoMissao, insigniaMissao } from '../../worker/steam-login/src/missoes-core.js'
// Insígnias: conquistas com arte própria que aparecem no perfil (passando o mouse mostra a descrição).
// Quem tem cada uma fica nos perfis do worker: perfis[id].insignias = { "<insígnia>": quando ganhou (ms) }.
//  - o admin dá e tira no painel (Usuários → Editar);
//  - "top3" é automática: o worker dá para quem aparecer no top 3 do ranking pelo menos uma vez (e não tira mais).
// Nova insígnia: ponha a arte em public/assets/insignia/<id>.png, rode `node ferramentas/molduras/insignias.mjs`
// (gera a versão leve em web/<id>.webp), adicione aqui e na lista INSIGNIAS do worker (src/index.js).
import { usePerfis } from './Moldura.jsx'
import { ID_MESTRE, INSIGNIAS_LOJA, insigniaMestreDoId } from '../../worker/steam-login/src/loja-core.js'

export const INSIGNIAS = [
  ...MISSOES.map(m=>({...m,id:m.categoria==='eventos'?idEventoMissao(m.id,ANO_EVENTOS):m.id,auto:true,missao:true})),
  { id: 'top3', nome: 'Top 3', descricao: 'Chegou ao top 3 do ranking da Neura Projects.', auto: true },
  { id: 'staff', nome: 'Staff', descricao: 'Faz parte da equipe da Neura Projects.' },
  { id: 'embaixador', nome: 'Embaixador', descricao: 'Representa e divulga a Neura Projects na comunidade.' },
  { id: 'designer', nome: 'Designer', descricao: 'Cria as artes e o visual da Neura Projects.' },
  // Insígnias da loja de caixas (o worker dá sozinho, pelo histórico de aberturas: worker/steam-login/src/loja-core.js). "Mestre da [Caixa]" vem de mestre-<caixa>.
  ...INSIGNIAS_LOJA.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, loja: true, secreta: !!i.secreta })),
]

// Todas as "Mestre da [Caixa]" usam a mesma arte
const arteDe = (id) => (ID_MESTRE.test(id) ? 'mestre-da-caixa' : insigniaMissao(id)?.id.replace(/-20\d{2}$/, '') || id)
export const imagemInsignia = (id) => `/assets/insignia/web/${arteDe(id)}.webp`
// Miniatura de 128 px (~10 KB) para onde a insígnia aparece pequena (lista de amigos, fileira do perfil); gerada por
// scripts/gerar-miniaturas.mjs. Se faltar, quem usa cai na imagem grande (onError).
export const miniaturaInsignia = (id) => `/assets/insignia/mini/${arteDe(id)}.webp`
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
