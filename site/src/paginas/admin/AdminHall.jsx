import { useCallback, useEffect, useState } from 'react'
import { chamarApi } from '../../comum/api.js'

export default function AdminHall() {
  const [lista, setLista] = useState([]), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState('')
  const [disponivel, setDisponivel] = useState(false), [motivos, setMotivos] = useState({})
  const [simulacao, setSimulacao] = useState(false), [cota, setCota] = useState(null)
  const carregar = useCallback(async () => {
    try { const d = await chamarApi('/hall/revisao'); setLista(d.pedidos || []); setDisponivel(!!d.geracaoDisponivel); setSimulacao(!!d.simulacao); setCota(d.cota || null) }
    catch { setErro('Não foi possível carregar as fotos.') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const emGeracao = lista.some(p => ['fila', 'gerando'].includes(p.estado))
  useEffect(() => {
    if (!emGeracao) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 5000)
    return () => clearInterval(timer)
  }, [emGeracao, carregar])
  const revisar = async (p, acao) => {
    setOcupado(p.id); setErro('')
    try { await chamarApi('/hall/revisao', { id: p.id, pedido: p.pedido, acao, motivo: motivos[p.id] || '' }); await carregar() }
    catch (e) { setErro(e.message === 'hall-config' ? 'A geração automática precisa ser configurada no servidor.' : e.message === 'hall-tentativas' ? 'Este envio já atingiu três tentativas. Peça uma nova foto ao jogador.' : 'Não foi possível salvar a revisão. Atualize a lista e tente novamente.') }
    finally { setOcupado('') }
  }
  return <section className="caixa" style={{ padding: 24, marginBottom: 24 }}>
    <h2>Hall da Fama · revisão das fotos</h2>
    <p>Confira se o rosto está de frente, inteiro e bem iluminado. Ao aprovar, o retrato com a camisa escolhida será gerado e publicado automaticamente no card.</p>
    {simulacao && <p role="status">Prévia local: a geração é simulada com a imagem da camisa, sem envio à Cloudflare Workers AI e sem cobrança.</p>}
    {cota && <p role="status">Cloudflare · {cota.usadas}/{cota.limite} tentativas usadas hoje. A cota renova às 21h de Brasília (00h UTC).</p>}
    {!disponivel && <p role="status">A geração automática ainda não está configurada. As fotos podem ser conferidas e recusadas enquanto isso.</p>}
    <button className="btn btn-ghost" type="button" onClick={carregar}>Atualizar lista</button>
    {!lista.length && <p>Nenhuma foto aguardando revisão.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18, marginTop: 18 }}>
      {lista.map(p => {
        const gerando = ['fila', 'gerando'].includes(p.estado)
        return <article key={p.id} className="caixa" style={{ padding: 18 }}>
          <h3>{p.nome || p.id}</h3><p>Camisa {p.camisa === 'clara' ? 'clara' : 'escura'}</p>
          <img src={p.original} alt="Foto enviada para revisão" style={{ width: '100%', height: 240, objectFit: 'contain' }} />
          {gerando ? <p role="status">{p.aguardaCota ? 'Limite diário atingido. A geração será retomada automaticamente na próxima cota.' : p.estado === 'fila' ? 'Foto aprovada. Aguardando geração…' : 'Gerando o retrato… Você pode sair desta página.'}</p> : <>
            {p.estado === 'falhou' && <p role="status">A geração não foi concluída. O retrato anterior foi preservado. Confira a configuração antes de tentar novamente.</p>}
            <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>Orientação para pedir outra foto
              <input value={motivos[p.id] || ''} maxLength={200} placeholder="Ex.: envie uma foto sem óculos escuros" onChange={e => setMotivos(v => ({ ...v, [p.id]: e.target.value }))} />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-primary" disabled={!!ocupado || !disponivel || p.provedorGeracao === 'cloudflare' && (p.tentativasGeracao || 0) >= 3} onClick={() => revisar(p, 'aprovar')}>{ocupado === p.id ? 'Salvando…' : p.estado === 'falhou' ? 'Tentar geração novamente' : 'Aprovar foto e gerar retrato'}</button>
              <button type="button" className="btn btn-ghost" disabled={!!ocupado} onClick={() => revisar(p, 'reprovar')}>Pedir outra foto</button>
            </div>
          </>}
        </article>
      })}
    </div>
    {erro && <p role="alert">{erro}</p>}
  </section>
}
