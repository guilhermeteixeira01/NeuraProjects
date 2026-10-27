import { mudarDoc } from './dados.js'

export const LIMITE_HALL = 10
export async function cotaHall(env, chave, agora = Date.now()) {
  const dia = new Date(agora).toISOString().slice(0, 10)
  const d = await mudarDoc(env, 'hall-cota', anterior => {
    const atual = anterior.dia === dia ? anterior : { dia, chaves: [] }
    if (!chave || atual.chaves.includes(chave) || atual.chaves.length >= LIMITE_HALL) return atual
    return { ...atual, chaves: [...atual.chaves, chave] }
  }, {})
  return { permitido: !!chave && d.chaves.includes(chave), usadas: d.chaves.length, limite: LIMITE_HALL, reiniciaEm: Date.parse(`${dia}T00:00:00Z`) + 86400000 }
}
