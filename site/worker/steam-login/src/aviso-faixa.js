// Aviso em faixa (letreiro amarelo no topo de todas as páginas do site): texto escrito à mão no painel admin.
// Doc 'aviso-faixa' = { ativo, texto, atualizadoEm }. Público: GET /aviso-faixa. Admin: GET/POST /admin/aviso-faixa.
import { lerDoc, mudarDoc } from './dados.js'
import { ErroPedido } from './erros.js'
import { json } from './http.js'

const DOC = 'aviso-faixa'
export const MAX_TEXTO_AVISO = 280

// Uma linha só: tira quebras e caracteres de controle e junta espaços repetidos
export const limparTextoAviso = (s) => String(s ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim()

export function validarAviso(corpo) {
  const texto = limparTextoAviso(corpo?.texto)
  const ativo = corpo?.ativo === true
  if (texto.length > MAX_TEXTO_AVISO) return { erro: 'texto-longo' }
  if (ativo && !texto) return { erro: 'texto-vazio' }
  return { aviso: { ativo, texto } }
}

const publico = (d) => (d?.ativo && d.texto ? { ativo: true, texto: d.texto, atualizadoEm: d.atualizadoEm || 0 } : { ativo: false })

export async function rotaAvisoPublico(env, cors) {
  return json(publico(await lerDoc(env, DOC, null)), 200, { ...cors, 'Cache-Control': 'public, max-age=30' })
}

export async function rotaAdminAviso(env, metodo, corpo) {
  if (metodo === 'POST') {
    const r = validarAviso(corpo)
    if (r.erro) throw new ErroPedido('aviso', { campo: r.erro })
    await mudarDoc(env, DOC, () => ({ ...r.aviso, atualizadoEm: Date.now() }))
  }
  const d = await lerDoc(env, DOC, null, { fresco: true })
  return { aviso: { ativo: d?.ativo === true, texto: d?.texto || '', atualizadoEm: d?.atualizadoEm || 0 }, max: MAX_TEXTO_AVISO }
}
