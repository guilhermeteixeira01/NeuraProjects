// Notificação de pontos de partida: quando o histórico do jogador ganha um mapa novo, o sino mostra "Vitória/Derrota em <mapa>: +N NP".
// Os dados vêm de perfil/historico/<SteamID>.json (gerado no deploy, o mais novo primeiro; cada mapa traz venceu, placar e pontos).
// Guarda no aparelho qual foi o último mapa visto: na primeira vez só guarda (não enche o sino com o passado). A notificação tem id fixo por mapa,
// então outro aparelho (ou recarregar a página) nunca repete.
import { useEffect } from 'react'
import { useConta } from './conta.js'
import { lerJson } from './dados.js'
import { nomeMapa } from './mapas.js'
import { registrarNotificacao } from './notificacoes.js'

const INTERVALO = 60000
const MAX_NOVAS = 5
const chave = (id) => `np-pontos-visto:${id}`

function lerVisto(id) {
  try {
    return localStorage.getItem(chave(id))
  } catch {
    return null
  }
}
function gravarVisto(id, valor) {
  try {
    localStorage.setItem(chave(id), valor)
  } catch {
    // sem armazenamento: pode repetir o aviso ao recarregar (o id fixo evita repetir no sino)
  }
}

export default function AvisoPontos() {
  const conta = useConta()
  useEffect(() => {
    if (!conta?.id) return
    let vivo = true
    const conferir = async () => {
      const lista = await lerJson(`/perfil/historico/${conta.id}.json`).catch(() => null)
      if (!vivo || !Array.isArray(lista) || !lista.length) return
      const visto = lerVisto(conta.id)
      gravarVisto(conta.id, lista[0].caminho)
      if (visto === null || visto === lista[0].caminho) return // primeira vez, ou nada novo
      const idx = lista.findIndex((p) => p.caminho === visto)
      const novas = lista.slice(0, idx > 0 ? Math.min(idx, MAX_NOVAS) : 1).reverse()
      for (const p of novas) {
        const [meu, deles] = p.placar || [0, 0]
        registrarNotificacao(conta.id, {
          id: `pontos:${p.caminho}`,
          titulo: p.venceu ? `Vitória! +${p.pontos} NP` : `Partida encerrada: +${p.pontos} NP`,
          texto: `${p.venceu ? 'Vitória' : 'Derrota'} em ${nomeMapa(p.mapa)} (${meu} x ${deles}). Os pontos já estão na sua conta.`,
          link: `/partidas/${String(p.caminho).split('/').map(encodeURIComponent).join('/')}/`,
        })
      }
    }
    conferir()
    const i = setInterval(() => document.visibilityState === 'visible' && conferir(), INTERVALO)
    return () => {
      vivo = false
      clearInterval(i)
    }
  }, [conta?.id])
  return null
}
