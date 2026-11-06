import { useEffect, useRef, useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { som } from './somLoja.js'
import './caixaPremium.css'

function ParticulasEscolha() {
  return <span className="premium-particulas" aria-hidden="true">{Array.from({ length: 12 }, (_, n) => <i key={n} style={{ '--angulo': `${n * 30}deg`, '--atraso': `${n % 3 * 35}ms` }} />)}</span>
}

export default function CaixaPremium({ c, tem, achar, aoVoltar, aoAbriu, abrirDoInventario }) {
  const dialogo = useRef(null)
  const [escolha, setEscolha] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [ganhou, setGanhou] = useState(null)
  useEffect(() => {
    if (abrirDoInventario && tem > 0 && !dialogo.current.open) dialogo.current.showModal()
  }, [abrirDoInventario, tem])
  const confirmar = async () => {
    if (!escolha || ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await chamarApi('/loja/premium/escolher', { escolha })
      setGanhou(c.itens.find(i => i.id === escolha))
      som('r4')
      dialogo.current.close()
      await aoAbriu()
    } catch (e) {
      setErro(e.message === 'item-trancado' ? 'Destranque a caixa no inventário antes de abrir.' : e.message === 'sem-caixa' || e.message === 'premium-ja-aberta' ? 'Esta caixa já foi aberta ou não está disponível. Atualize a página.' : 'Não foi possível confirmar a escolha. Tente novamente.')
    } finally { setOcupado(false) }
  }
  return <section className="premium-caixa">
    <button className="lj-btn" onClick={aoVoltar}>← Voltar às caixas</button>
    <div className="premium-hero">
      <img className="premium-baú" src={c.img} alt="Caixa azul Premium com coroa prateada" />
      <div>
        <span className="premium-tag">PRESENTE DA PRIMEIRA ASSINATURA</span>
        <h1>Caixa Premium</h1>
        <p>Três armas. A escolha é sua.</p>
        <p>Na primeira ativação do Premium, você recebe uma caixa para escolher uma destas skins para o seu inventário.</p>
        <small>Uma caixa por conta. Renovações não concedem outra. A caixa é vinculada à conta e pode ser aberta mesmo após o Premium vencer.</small>
        <button className="lj-btn lj-btn-p" disabled={!tem || !!ganhou} onClick={() => dialogo.current.showModal()}>{tem ? 'Abrir caixa e escolher arma' : ganhou ? 'Caixa já aberta' : 'Nenhuma caixa disponível'}</button>
      </div>
    </div>
    {ganhou && <div className="premium-sucesso" role="status">
      <div className="premium-revelacao"><ParticulasEscolha /><img src={achar(ganhou.d, ganhou.p).img} alt="" /></div>
      <div><span className="premium-tag">ARMA RECEBIDA</span><strong>{ganhou.nome} adicionada ao inventário!</strong></div>
      <a className="lj-btn lj-btn-p" href="/inventario/">Ver no inventário</a>
    </div>}
    <h2>Escolha uma das três</h2>
    <p>Você recebe apenas a arma confirmada. Todas em Nova de Fábrica, sem StatTrak.</p>
    <div className="premium-armas">{c.itens.map(i => <article key={i.id}><img src={achar(i.d, i.p).img} alt={i.nome} /><h3>{i.nome}</h3><span>Nova de Fábrica · Float 0.01</span></article>)}</div>
    <dialog className="premium-dialogo" ref={dialogo} aria-labelledby="premium-titulo" onCancel={e => { if (ocupado) e.preventDefault() }}>
      <button className="premium-fechar" aria-label="Fechar escolha" disabled={ocupado} onClick={() => dialogo.current.close()}>×</button>
      <span className="premium-tag">CAIXA PREMIUM</span>
      <h2 id="premium-titulo">Qual arma vai ser sua?</h2>
      <p>Escolha uma arma. Ao confirmar, a caixa será consumida e a skin irá para o seu inventário.</p>
      <fieldset disabled={ocupado}><legend>Selecione uma arma</legend><div className="premium-armas">{c.itens.map(i => <label key={i.id} className={escolha === i.id ? 'selecionada' : ''}>
        <input type="radio" name="premium-arma" value={i.id} checked={escolha === i.id} onChange={() => { setEscolha(i.id); som('tick', 0.5) }} />
        {escolha === i.id && <><span className="premium-selecao-selo" aria-hidden="true">✓ Selecionada</span><ParticulasEscolha /></>}
        <img src={achar(i.d, i.p).img} alt="" /><strong>{i.nome}</strong><span>Nova de Fábrica</span>
      </label>)}</div></fieldset>
      <p className="premium-alerta">A escolha é definitiva. Você receberá somente uma arma.</p>
      {erro && <p role="alert">{erro}</p>}
      <button key={escolha} className={`lj-btn lj-btn-p premium-confirmar${escolha ? ' pronta' : ''}`} disabled={!escolha || ocupado} onClick={confirmar}>{ocupado ? 'Adicionando ao inventário…' : escolha ? `Confirmar ${c.itens.find(i => i.id === escolha)?.nome}` : 'Selecione uma arma'}</button>
    </dialog>
  </section>
}
