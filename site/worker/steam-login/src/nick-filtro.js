// Regras do apelido, iguais no site (validação ao vivo) e no worker (que decide de verdade):
//   formato (3 a 20 caracteres), nomes reservados e palavras impróprias (palavrões, ofensas e discriminação, em português e inglês).
// A conferência de palavrão ignora maiúscula, acento, separadores e o "leet" (4=a, 3=e, 1=i, 0=o, 5=s, 7=t, @=a, $=s):
// "P0rr4", "p.o.r.r.a" e "pórra" são pegos igual.

export const NICK = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,18}[\p{L}\p{N}]$/u

// "João_Silva 99" e "joao silva99" são o mesmo apelido para quem confere repetidos
export const chaveDoNick = (n) =>
  String(n || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export const RESERVADOS = new Set(['admin', 'administrador', 'administracao', 'moderador', 'moderacao', 'mod', 'suporte', 'staff', 'neura', 'neuraproject', 'neurapick', 'dono', 'owner', 'system', 'sistema', 'steam', 'valve', 'null', 'undefined', 'root', 'oficial', 'official'])

const LEET = { 4: 'a', '@': 'a', 3: 'e', 1: 'i', '!': 'i', 0: 'o', 5: 's', $: 's', 7: 't', 8: 'b', 9: 'g' }
// só letras, com o leet trocado e letras repetidas juntadas ("porrrraaa" -> "pora" não: juntamos depois de comparar as duas formas)
const soLetras = (n) =>
  String(n || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[4@3!105$789]/g, (c) => LEET[c] || c)
    .replace(/[^a-z]/g, '')
const semRepetidas = (s) => s.replace(/(.)\1+/g, '$1')

// Pedaços proibidos em qualquer lugar do apelido (já sem acento, só letras). Palavras curtas que aparecem dentro de nomes comuns
// ficam em INTEIRAS (precisam ser o apelido todo, ou uma palavra inteira dele).
const PROIBIDAS = [
  // português
  'porra', 'caralh', 'buceta', 'boceta', 'xoxota', 'xereca', 'piroca', 'cacete', 'putinha', 'vadia', 'vagabund', 'piranha',
  'arrombad', 'fdp', 'filhodaputa', 'filhadaputa', 'foder', 'fodase', 'foda', 'fodido', 'merda', 'bosta', 'cuzao', 'cuzinho', 'viado', 'veado',
  'traveco', 'sapatao', 'macaco', 'crioulo', 'negrinho', 'escurinho', 'retardad', 'mongol', 'aleijad', 'corno', 'chifrud', 'babaca', 'otario', 'idiota',
  'imbecil', 'desgracad', 'punheta', 'siririca', 'gozad', 'mamada', 'boquete', 'estupr', 'pedofil', 'nazis', 'hitler', 'suicid', 'kkkcp',
  // inglês
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'nigg', 'nigga', 'faggot', 'retard', 'rapist',
  'porn', 'nazi', 'kys', 'killyourself', 'asshole', 'bastard', 'motherfuck',
]
const INTEIRAS = new Set(['puta', 'puto', 'pinto', 'rola', 'bicha', 'chupa', 'fag', 'rape', 'pedo', 'cock', 'cu', 'cus', 'pau', 'pica', 'xota', 'rabo', 'anus', 'ass', 'gay', 'kys', 'sex', 'sexo', 'vtnc', 'vsf', 'pqp', 'tnc', 'krl', 'crl', 'fdp', 'pnc'])

export function nickImproprio(nick) {
  const tudo = soLetras(nick)
  const variantes = [tudo, semRepetidas(tudo)]
  if (variantes.some((v) => PROIBIDAS.some((p) => v.includes(p)))) return true
  // palavras inteiras (separadas por espaço, ponto, _ ou -) e o apelido inteiro
  const palavras = String(nick || '').split(/[\s._-]+/).map(soLetras).filter(Boolean)
  return [...palavras, ...variantes].some((w) => INTEIRAS.has(w) || INTEIRAS.has(semRepetidas(w)))
}

// Confere tudo menos "já em uso" (isso só o worker sabe). Devolve o código do erro ou null.
export function erroDoNick(bruto) {
  const nick = String(bruto ?? '').trim().replace(/\s+/g, ' ')
  if (!NICK.test(nick) || nick.length > 20) return 'nick-invalido'
  const chave = chaveDoNick(nick)
  if (chave.length < 3) return 'nick-invalido'
  if (RESERVADOS.has(chave)) return 'nick-reservado'
  if (nickImproprio(nick)) return 'nick-improprio'
  return null
}
