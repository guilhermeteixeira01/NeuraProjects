import { mudarDoc } from './dados.js'
import { ErroPedido } from './erros.js'
import { lerCorpo } from './http.js'
import { Fila, responder } from './objetos.js'
import { gerarRetratoHall } from './hall-imagem.js'
import { mandarPara } from './amigos.js'
import { tirarDaFilaHall } from './hall.js'
import { cotaHall } from './hall-cota.js'

export const pedidoHall = d => d?.pedido || String(d?.enviada || 'legado')
const mesmo = (d, j) => pedidoHall(d) === j.pedido
const CHUNK = 96 * 1024

// Um objeto por jogador. O alarme persiste mesmo se o admin fechar a página.
export class HallRetratos {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.fila = new Fila(); this.executando = false }

  async fetch(req) {
    if (new URL(req.url).pathname === '/imagem') return this.imagem(new URL(req.url).searchParams.get('v'))
    return responder(async () => {
      const c = await lerCorpo(req)
      if (c.acao !== 'agendar' || !/^\d{17}$/.test(c.id || '') || typeof c.pedido !== 'string' || c.pedido.length > 80) throw new ErroPedido('pedido')
      return this.fila.rodar(async () => {
        const antes = await this.ctx.storage.get('trabalho')
        if (antes?.pedido === c.pedido && ['fila', 'gerando', 'pronto'].includes(antes.estado)) {
          if (antes.estado !== 'gerando') await this.ctx.storage.setAlarm(Date.now() + 1000)
          return { ok: true }
        }
        await this.ctx.storage.put('trabalho', { id: c.id, pedido: c.pedido, origem: c.origem, estado: 'fila' })
        await this.ctx.storage.setAlarm(Date.now() + 1000)
        return { ok: true }
      })
    })
  }

  async atualizarTrabalho(j, mudar) {
    return this.fila.rodar(async () => {
      const atual = await this.ctx.storage.get('trabalho')
      if (atual?.pedido !== j.pedido) return false
      await this.ctx.storage.put('trabalho', { ...atual, ...mudar })
      if (['concluido', 'cancelado', 'falhou'].includes(mudar.estado)) await this.ctx.storage.deleteAlarm()
      return true
    })
  }

  async alarm() {
    if (this.executando) { await this.ctx.storage.setAlarm(Date.now() + 15000); return }
    this.executando = true
    try { await this.processar() } finally { this.executando = false }
  }

  async processar() {
    const j = await this.ctx.storage.get('trabalho')
    if (!j || !['fila', 'gerando', 'pronto'].includes(j.estado)) return
    try {
      if (j.estado === 'gerando') {
        // Interrompido: não repete uma chamada possivelmente cobrada sem decisão do admin.
        await this.falhar(j, 'hall-interrompido')
        return
      }
      if (j.estado === 'fila') {
        const antes = await mudarDoc(this.env, `hall:${j.id}`, d => d, {})
        if (!mesmo(antes, j) || antes.estado !== 'fila') { await this.atualizarTrabalho(j, { estado: 'cancelado' }); return }
        const cota = await cotaHall(this.env, `${j.id}:${j.pedido}:${antes.tentativasGeracao}`)
        if (!cota.permitido) {
          await mudarDoc(this.env, `hall:${j.id}`, d => mesmo(d, j) && d.estado === 'fila' ? { ...d, aguardaCota: true, retomarEm: cota.reiniciaEm } : d, {})
          await this.ctx.storage.setAlarm(cota.reiniciaEm + 1000)
          return
        }
        const d = await mudarDoc(this.env, `hall:${j.id}`, atual => {
          if (!mesmo(atual, j) || atual.estado !== 'fila') return atual
          return { ...atual, estado: 'gerando', aguardaCota: false, retomarEm: null, geracaoIniciada: Date.now() }
        }, {})
        if (!mesmo(d, j) || d.estado !== 'gerando') { await this.atualizarTrabalho(j, { estado: 'cancelado' }); return }
        if (!(await this.atualizarTrabalho(j, { estado: 'gerando' }))) return
        await this.ctx.storage.setAlarm(Date.now() + 5 * 60_000)
        const resultado = await gerarRetratoHall(this.env, d.original, d.camisa)
        const partes = Math.ceil(resultado.bytes.length / CHUNK), dados = {}
        for (let i = 0; i < partes; i++) dados[`imagem:${j.pedido}:${i}`] = resultado.bytes.slice(i * CHUNK, (i + 1) * CHUNK)
        dados[`manifesto:${j.pedido}`] = { partes, tipo: resultado.tipo, tamanho: resultado.bytes.length }
        const salvo = await this.fila.rodar(async () => {
          const trabalho = await this.ctx.storage.get('trabalho')
          if (trabalho?.pedido !== j.pedido) return false
          await this.ctx.storage.put({ ...dados, trabalho: { ...trabalho, estado: 'pronto' } })
          return true
        })
        if (!salvo) return
        j.estado = 'pronto'
      }
      await this.publicar(j)
    } catch (e) {
      if (j.estado !== 'pronto' && (e.codigo === 'ocupado' || e.codigo === 'hall-cota-cloudflare')) {
        const amanha = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') + 86400000
        const quando = e.codigo === 'ocupado' ? Date.now() + 30000 : amanha + 1000
        await mudarDoc(this.env, `hall:${j.id}`, d => mesmo(d, j) && ['fila', 'gerando'].includes(d.estado) ? { ...d, estado: 'fila', aguardaCota: e.codigo === 'hall-cota-cloudflare', retomarEm: quando } : d, {})
        if (await this.atualizarTrabalho(j, { estado: 'fila' })) await this.ctx.storage.setAlarm(quando)
        return
      }
      if (j.estado === 'pronto') {
        // Resultado salvo: retoma somente a publicação, sem outra chamada à API.
        await this.ctx.storage.setAlarm(Date.now() + 30_000)
        throw e
      }
      await this.falhar(j, e.codigo || 'hall-falhou')
    }
  }

  async publicar(j) {
    const d = await mudarDoc(this.env, `hall:${j.id}`, atual => {
      if (!mesmo(atual, j) || !['fila', 'gerando'].includes(atual.estado)) return atual
      const foto = new URL('/hall/imagem', j.origem)
      foto.searchParams.set('id', j.id); foto.searchParams.set('v', j.pedido)
      return { ...atual, estado: 'aprovada', aprovada: foto.href, retratoVersao: j.pedido, camisaAprovada: atual.camisa, montada: true, gerada: Date.now(), erroGeracao: '' }
    }, {})
    const publicou = mesmo(d, j) && d.retratoVersao === j.pedido && d.estado === 'aprovada'
    if (!publicou) { await this.atualizarTrabalho(j, { estado: 'cancelado' }); await this.limparImagem(j.pedido) }
    if (publicou) {
      await tirarDaFilaHall(this.env, j.id, j.pedido)
      await this.atualizarTrabalho(j, { estado: 'concluido' })
      for (const chave of (await this.ctx.storage.list({ prefix: 'manifesto:' })).keys()) {
        const versao = chave.slice('manifesto:'.length)
        if (versao !== j.pedido) await this.limparImagem(versao)
      }
      await mandarPara(this.env, [j.id], { tipo: 'hall' })
    }
  }

  async falhar(j, codigo) {
    await mudarDoc(this.env, `hall:${j.id}`, d => mesmo(d, j) && ['fila', 'gerando'].includes(d.estado) ? { ...d, estado: 'falhou', erroGeracao: String(codigo).slice(0, 40) } : d, {})
    await this.atualizarTrabalho(j, { estado: 'falhou' })
  }

  async limparImagem(versao) {
    const chaves = [...(await this.ctx.storage.list({ prefix: `imagem:${versao}:` })).keys()]
    await this.ctx.storage.delete([...chaves, `manifesto:${versao}`])
  }

  async imagem(versao) {
    if (!versao || versao.length > 80) return new Response(null, { status: 404 })
    const m = await this.ctx.storage.get(`manifesto:${versao}`)
    if (!m) return new Response(null, { status: 404 })
    const chaves = Array.from({ length: m.partes }, (_, i) => `imagem:${versao}:${i}`)
    const partes = await this.ctx.storage.get(chaves)
    if (chaves.some(k => !partes.has(k))) return new Response(null, { status: 503 })
    const bytes = new Uint8Array(m.tamanho)
    chaves.forEach((k, i) => bytes.set(partes.get(k), i * CHUNK))
    return new Response(bytes, { headers: { 'Content-Type': m.tipo, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } })
  }
}
