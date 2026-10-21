// Notificações do sino: regra de junção usada pelo site (cópia no navegador) e pelo worker (cópia na conta, Durable Object do jogador).
// Documento: { lista: [{ id, titulo, texto?, link?, imagem?, cargo?, quando, lida }], vistos: [id], limpoEm: ms }
//  - "Limpar" só sobe o limpoEm (nada que veio antes dele volta, em nenhum aparelho);
//  - "vistos" é a memória de tudo que já virou notificação (a mesma nunca entra duas vezes, em nenhum aparelho);
//  - lida: se qualquer aparelho marcou como lida, fica lida.
export const MAX_NOTIFS = 30
export const MAX_VISTOS = 300

export const docVazio = () => ({ lista: [], vistos: [], limpoEm: 0 })

export function limparDoc(d) {
  const lista = Array.isArray(d?.lista) ? d.lista : []
  return {
    lista: lista
      .filter((n) => n && typeof n.id === 'string' && n.id.length <= 120)
      .map((n) => ({
        id: n.id,
        titulo: String(n.titulo || '').slice(0, 160),
        ...(n.texto ? { texto: String(n.texto).slice(0, 300) } : {}),
        ...(n.link ? { link: String(n.link).slice(0, 200) } : {}),
        ...(n.imagem ? { imagem: String(n.imagem).slice(0, 300) } : {}),
        ...(n.insignia ? { insignia: String(n.insignia).slice(0, 80) } : {}),
        ...(n.cargo ? { cargo: String(n.cargo).slice(0, 80) } : {}),
        ...(Number.isFinite(Number(n.nivel)) && n.nivel !== null && n.nivel !== undefined ? { nivel: Number(n.nivel) } : {}),
        quando: Number(n.quando) || 0,
        lida: !!n.lida,
      }))
      .slice(0, 100),
    vistos: (Array.isArray(d?.vistos) ? d.vistos : []).filter((v) => typeof v === 'string').slice(-MAX_VISTOS),
    limpoEm: Number(d?.limpoEm) || 0,
  }
}

export function juntar(a, b) {
  const x = limparDoc(a)
  const y = limparDoc(b)
  const limpoEm = Math.max(x.limpoEm, y.limpoEm)
  const por = new Map()
  for (const n of [...x.lista, ...y.lista]) {
    if (n.quando <= limpoEm) continue
    const antes = por.get(n.id)
    por.set(n.id, antes ? { ...antes, lida: antes.lida || n.lida } : n)
  }
  const vistos = [...new Set([...x.vistos, ...y.vistos])].slice(-MAX_VISTOS)
  // cargo repetido (mesmo cargo em duas notificações) fica só com a mais nova
  const lista = [...por.values()].sort((p, q) => q.quando - p.quando)
  const cargos = new Set()
  const sem = lista.filter((n) => {
    if (!n.cargo) return true
    if (cargos.has(n.cargo)) return false
    cargos.add(n.cargo)
    return true
  })
  return { lista: sem.slice(0, MAX_NOTIFS), vistos, limpoEm }
}
