/*
 * Zerar tudo (pedido do dono, 2026-10-21): todo jogador volta para o começo. NÃO TEM VOLTA.
 *   - Neura Pontos: apaga os gastos/créditos (movimentos) de cada jogador; os bônus "para todos" já lançados passam a valer 0
 *     (quem ainda não tinha recebido não recebe mais) e cada jogador já fica marcado como tendo visto todos;
 *   - insígnias: saem todas, menos as de cargo dadas à mão (Staff, Embaixador, Designer); o histórico de aberturas da loja (de onde saem
 *     as insígnias da loja) e as já ganhas também saem;
 *   - inventário de skins: vazio (e a cópia antiga do KV skins:<id> é apagada); anúncios do mercado, drops e trocas também;
 *   - XP: o ajuste do admin (perfis[id].xp) e os avisos já vistos (nível/insígnia) saem. O ranking vem das partidas registradas.
 *
 *   POST /admin/zerar-tudo { confirmar: 'ZERAR TUDO', simular?: true }   (só o dono)
 */
const INSIGNIAS_DE_CARGO = new Set(['staff', 'embaixador', 'designer'])
const ID_STEAM = /^\d{17}$/

const loja = (env, id) => env.LOJA.get(env.LOJA.idFromName(id))
const objetoGlobal = (ns) => ns.get(ns.idFromName('global'))
const postar = async (stub, url, corpo) => (await stub.fetch(url, { method: 'POST', body: JSON.stringify(corpo) })).json()

// todo mundo que pode ter alguma coisa guardada: quem já entrou no site, quem já abriu caixa, quem tem perfil e quem tem inventário antigo no KV
async function todosOsJogadores(env) {
  const ids = new Set()
  const usuarios = (await env.MOLDURAS.get('usuarios', 'json').catch(() => null)) || {}
  const perfis = (await env.MOLDURAS.get('perfis', 'json').catch(() => null)) || {}
  const abriram = (await env.MOLDURAS.get('loja-jogadores', 'json').catch(() => null)) || []
  for (const id of [...Object.keys(usuarios), ...Object.keys(perfis), ...abriram]) if (ID_STEAM.test(id)) ids.add(id)
  const chavesSkins = []
  let cursor
  do {
    const r = await env.MOLDURAS.list({ prefix: 'skins:', cursor })
    for (const k of r.keys) {
      chavesSkins.push(k.name)
      const id = k.name.slice(6)
      if (ID_STEAM.test(id)) ids.add(id)
    }
    cursor = r.list_complete ? undefined : r.cursor
  } while (cursor)
  return { ids: [...ids], perfis, chavesSkins }
}

export async function zerarTudo(env, simular) {
  const { ids, perfis, chavesSkins } = await todosOsJogadores(env)
  const bonus = (await env.MOLDURAS.get('loja-bonus', 'json').catch(() => null)) || []
  const bonusMax = Math.max(0, ...bonus.map((b) => b.id))
  const resumo = { jogadores: ids.length, perfis: Object.keys(perfis).length, inventariosKv: chavesSkins.length, bonus: bonus.length, simulado: !!simular }
  if (simular) return resumo

  // 1. objeto de cada jogador: NP, histórico de aberturas, insígnias da loja e inventário
  const falhas = []
  const fila = [...ids]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (fila.length) {
        const id = fila.shift()
        const r = await postar(loja(env, id), 'https://loja/', { id, acao: 'zerar', bonusMax }).catch(() => null)
        if (!r?.ok) falhas.push(id)
      }
    }),
  )
  // 2. perfis: só as insígnias de cargo ficam; sem XP do admin e sem avisos já vistos
  for (const p of Object.values(perfis)) {
    if (p.insignias) p.insignias = Object.fromEntries(Object.entries(p.insignias).filter(([k]) => INSIGNIAS_DE_CARGO.has(k)))
    delete p.xp
    delete p.vistos
  }
  await env.MOLDURAS.put('perfis', JSON.stringify(perfis))
  // 3. bônus já lançados valem 0 (os ids continuam, para os próximos bônus funcionarem) e ninguém mais na lista de quem abriu caixa
  await env.MOLDURAS.put('loja-bonus', JSON.stringify(bonus.map((b) => ({ ...b, valor: 0 }))))
  await env.MOLDURAS.put('loja-jogadores', '[]')
  // 4. inventários antigos no KV (o objeto do jogador lia daqui na primeira vez)
  for (const k of chavesSkins) await env.MOLDURAS.delete(k).catch(() => {})
  // 5. mercado (anúncios, créditos pendentes, drops) e trocas
  const mercado = await postar(objetoGlobal(env.MERCADO), 'https://mercado/', { acao: 'zerar' }).catch(() => null)
  const trocas = await postar(objetoGlobal(env.TROCAS), 'https://trocas/', { acao: 'zerar' }).catch(() => null)
  return { ...resumo, falhas, mercado: !!mercado?.ok, trocas: !!trocas?.ok }
}
