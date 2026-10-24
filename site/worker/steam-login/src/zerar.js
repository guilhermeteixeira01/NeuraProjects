/*
 * Zerar tudo (pedido do dono, 2026-10-21): todo jogador volta para o começo. NÃO TEM VOLTA.
 *   - Neura Pontos: apaga os gastos/créditos (movimentos) de cada jogador; os bônus "para todos" já lançados passam a valer 0
 *     (quem ainda não tinha recebido não recebe mais) e cada jogador já fica marcado como tendo visto todos;
 *   - insígnias: saem todas, menos as de cargo dadas à mão (Staff, Embaixador, Designer); o histórico de aberturas da loja (de onde saem
 *     as insígnias da loja) e as já ganhas também saem;
 *   - inventário de skins: vazio (e a cópia antiga do KV skins:<id> é apagada); anúncios do mercado, drops e trocas também;
 *   - XP: o ajuste do admin (perfil.xp) e os avisos já vistos (nível/insígnia) saem. O ranking vem das partidas registradas.
 *
 *   POST /admin/zerar-tudo { confirmar: 'ZERAR TUDO', simular?: true }   (só o dono)
 */
import { lerColecao, lerDoc, mudar, gravarDoc, mudarDoc } from './dados.js'
import { apagarKv, listarKv } from './kv.js'
import { objetoGlobal, pedir, pedirAoJogador } from './objetos.js'

const INSIGNIAS_DE_CARGO = new Set(['staff', 'embaixador', 'designer'])
const ID_STEAM = /^\d{17}$/
const PARALELO = 6

// Todo mundo que pode ter alguma coisa guardada: quem já entrou no site, quem tem perfil, quem já abriu caixa e quem tem inventário antigo no KV
async function todosOsJogadores(env) {
  const [usuarios, perfis, abriram, chavesSkins] = await Promise.all([lerColecao(env, 'usuarios'), lerColecao(env, 'perfis'), lerDoc(env, 'loja-jogadores', []), listarKv(env, 'skins:')])
  const ids = new Set([...Object.keys(usuarios), ...Object.keys(perfis), ...abriram, ...chavesSkins.map((k) => k.slice('skins:'.length))].filter((id) => ID_STEAM.test(id)))
  return { ids: [...ids], perfis: Object.keys(perfis).length, chavesSkins }
}

export async function zerarTudo(env, simular) {
  const [{ ids, perfis, chavesSkins }, bonus] = await Promise.all([todosOsJogadores(env), lerDoc(env, 'loja-bonus', [])])
  const bonusMax = Math.max(0, ...bonus.map((b) => b.id))
  const resumo = { jogadores: ids.length, perfis, inventariosKv: chavesSkins.length, bonus: bonus.length, simulado: !!simular }
  if (simular) return resumo

  // 1. objeto de cada jogador: NP, histórico de aberturas, insígnias da loja e inventário (6 por vez; quem falhar vai na lista)
  const falhas = []
  const fila = [...ids]
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      for (let id = fila.shift(); id; id = fila.shift()) {
        try {
          await pedirAoJogador(env, id, { acao: 'zerar', bonusMax })
        } catch (e) {
          console.error('zerar: jogador', id, e)
          falhas.push(id)
        }
      }
    }),
  )
  // 2. perfis: só as insígnias de cargo ficam; sem XP do admin e sem avisos já vistos
  await mudar(env, 'perfis', null, (todos) => {
    for (const [id, p] of Object.entries(todos)) {
      const novo = { ...p }
      if (novo.insignias) novo.insignias = Object.fromEntries(Object.entries(novo.insignias).filter(([k]) => INSIGNIAS_DE_CARGO.has(k)))
      delete novo.xp
      delete novo.vistos
      todos[id] = novo
    }
  })
  // 3. bônus já lançados valem 0 (os ids continuam, para os próximos bônus funcionarem) e ninguém mais na lista de quem abriu caixa
  await mudarDoc(env, 'loja-bonus', (lista) => lista.map((b) => ({ ...b, valor: 0, ...(b.caixa ? { qtd: 0 } : {}) })), [])
  await gravarDoc(env, 'loja-jogadores', [])
  // 4. inventários antigos no KV (o objeto do jogador lia daqui na primeira vez)
  for (const k of chavesSkins) await apagarKv(env, k)
  // 5. mercado (anúncios, créditos pendentes, drops) e trocas
  const [mercado, trocas] = await Promise.all([pedir(objetoGlobal(env.MERCADO), { acao: 'zerar' }, 'https://mercado/'), pedir(objetoGlobal(env.TROCAS), { acao: 'zerar' }, 'https://trocas/')])
  return { ...resumo, falhas, mercado: !!mercado.ok, trocas: !!trocas.ok }
}
