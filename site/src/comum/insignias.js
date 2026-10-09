// Insígnias: conquistas com arte própria que aparecem no perfil (passando o mouse mostra a descrição).
// Quem tem cada uma fica nos perfis do worker: perfis[id].insignias = { "<insígnia>": quando ganhou (ms) }.
//  - o admin dá e tira no painel (Usuários → Editar);
//  - "top3" é automática: o worker dá para quem aparecer no top 3 do ranking pelo menos uma vez (e não tira mais).
// Nova insígnia: ponha a arte em public/assets/insignia/<id>.png, rode `node ferramentas/molduras/insignias.mjs`
// (gera a versão leve em web/<id>.webp), adicione aqui e na lista INSIGNIAS do worker (src/index.js).
import { usePerfis } from './Moldura.jsx'

export const INSIGNIAS = [
  { id: 'top3', nome: 'Top 3', descricao: 'Chegou ao top 3 do ranking da Neura Projects.', auto: true },
  { id: 'staff', nome: 'Staff', descricao: 'Faz parte da equipe da Neura Projects.' },
  { id: 'embaixador', nome: 'Embaixador', descricao: 'Representa e divulga a Neura Projects na comunidade.' },
  { id: 'designer', nome: 'Designer', descricao: 'Cria as artes e o visual da Neura Projects.' },
]

export const imagemInsignia = (id) => `/assets/insignia/web/${id}.webp`
export const insigniaPorId = (id) => INSIGNIAS.find((i) => i.id === id) || null

// Insígnias de um jogador, na ordem do catálogo: [{ ...insígnia, desde }]
export function insigniasDe(perfis, steamId) {
  const tem = perfis?.[steamId]?.insignias || {}
  return INSIGNIAS.filter((i) => tem[i.id]).map((i) => ({ ...i, desde: Number(tem[i.id]) || null }))
}

export function useInsignias(steamId) {
  return insigniasDe(usePerfis(), steamId)
}
