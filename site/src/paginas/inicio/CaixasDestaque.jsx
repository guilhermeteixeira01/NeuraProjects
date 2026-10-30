// Caixas em destaque na página inicial: cartão grande com a arte da caixa, descrição, "Abrir caixa" (leva à página da caixa na loja)
// e os itens mais caros da caixa numa fileira. Logado: dados completos (/loja + detalhe da caixa na tela). Sem login: só as caixas
// públicas (sem itens nem preços dos itens) e o botão leva ao login da Steam.
import { useEffect, useMemo, useState } from 'react'
import { entrar, loginAtivo, useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { lerCaixasPublicas, lerDetalhesCaixa, lerLoja } from '../../comum/loja.js'
import IconeUI from '../../comum/IconeUI.jsx'
import { dadosDoItem, useAcharItem } from '../loja/Abertura.jsx'
import { RARIDADES } from '../../../worker/steam-login/src/loja-core.js'

const numero = (n) => Number(n).toLocaleString('pt-BR')
const NP = ({ tam }) => <img src="/assets/logos/logo-np-64.png" alt="" width={tam} height={tam} />

function Item({ it, achar }) {
  const x = dadosDoItem(it.t || (it.r === 5 ? 'faca' : 'arma'), it.d, it.p, it.n, it.i, achar)
  return (
    <li style={{ '--cor': RARIDADES[it.r].cor }}>
      <span className="lj-dq-item-arte">{x.img ? <img src={x.img} alt="" loading="lazy" draggable="false" /> : null}</span>
      <span className="lj-dq-item-preco">
        <NP tam={12} /> {numero(it.valor)}
      </span>
    </li>
  )
}

// O preço de um item depende só da raridade e do desgaste (não da skin): muitos itens empatam no valor máximo.
// Para a fileira mostrar uma faixa de preços, fica só o item mais caro de cada raridade.
function itensDaCaixa(c, det) {
  const porRaridade = new Map()
  const considerar = (it) => {
    const atual = porRaridade.get(it.r)
    if (!atual || it.valor > atual.valor) porRaridade.set(it.r, it)
  }
  const maior = (g) => (g ? Math.max(...g.map((x) => x.v)) : 0)
  ;(c.itens || []).forEach((it, i) => considerar({ ...it, valor: maior(det?.itens?.[i]) }))
  ;(c.facas || []).forEach((f, i) => considerar({ ...f, t: f.t || 'faca', r: 5, valor: maior(det?.facas?.[i]) }))
  return [...porRaridade.values()].sort((a, b) => b.r - a.r || b.valor - a.valor)
}

export default function CaixasDestaque() {
  const t = useT()
  const conta = useConta()
  const logado = !!conta
  const achar = useAcharItem()
  const [caixas, setCaixas] = useState(null)
  const [i, setI] = useState(0)
  const [det, setDet] = useState(null)

  useEffect(() => {
    if (!loginAtivo()) return
    let vivo = true
    ;(logado ? lerLoja().then((d) => d.caixas) : lerCaixasPublicas())
      .then((l) => vivo && setCaixas((l || []).filter((c) => !c.foraDeVenda && !c.arquivada)))
      .catch(() => vivo && setCaixas([]))
    return () => {
      vivo = false
    }
  }, [logado])

  const lista = useMemo(() => {
    if (!caixas) return []
    const premium = caixas.filter((c) => c.tier === 'premium')
    return (premium.length ? premium : [...caixas].sort((a, b) => b.preco - a.preco)).slice(0, 8)
  }, [caixas])
  const atual = Math.min(i, Math.max(0, lista.length - 1))
  const c = lista[atual]

  // preços dos itens só existem no detalhe da caixa (pede login): busca só a que está na tela
  useEffect(() => {
    if (!c || !logado) return
    let vivo = true
    setDet(null)
    lerDetalhesCaixa(c.id)
      .then((d) => vivo && setDet(d))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [c?.id, logado])

  const itens = useMemo(() => (c && logado ? itensDaCaixa(c, det) : []), [c, det, logado])
  const maiorValor = itens.reduce((m, it) => Math.max(m, it.valor), 0)

  if (!c)
    return (
      <section className="np-caixa-painel lj-destaque">
        <header className="lj-dq-cab">
          <h2>
            <IconeUI tipo="caixa" tamanho={18} /> {t('Caixas em destaque')}
          </h2>
        </header>
        <a className="np-central-vazio" href="/loja/">
          {t('Explorar caixas na loja')} →
        </a>
      </section>
    )
  const abrir = () => (logado ? location.assign(`/loja/?caixa=${encodeURIComponent(c.slug)}`) : entrar())
  return (
    <section className="np-caixa-painel lj-destaque" aria-label={t('Caixas em destaque')} style={{ '--cor': c.cor }}>
      <header className="lj-dq-cab">
        <h2>
          <IconeUI tipo="caixa" tamanho={18} /> {t('Caixas em destaque')}
        </h2>
        <span className="lj-dq-saldo">
          <NP tam={14} /> {numero(c.preco)}
        </span>
      </header>
      <div className="lj-dq-cartao">
        <button type="button" className="lj-dq-arte" onClick={abrir} aria-label={c.nome}>
          <img src={c.img} alt="" loading="lazy" draggable="false" />
        </button>
        <div className="lj-dq-info">
          <b>{c.nome}</b>
          <p>
            {!logado
              ? t('Entre com a Steam para abrir essa caixa e ver os itens.')
              : maiorValor > 0
                ? t('Pode sair até {v} NP. O item vai direto pro inventário.', { v: numero(maiorValor) })
                : t('O item vai direto pro inventário.')}
          </p>
          <button type="button" className="lj-dq-abrir" onClick={abrir}>
            <IconeUI tipo="caixa" tamanho={16} /> {t('Abrir caixa')}
          </button>
        </div>
        {logado && (
          <ul className="lj-dq-itens">
            {det ? itens.map((it, k) => <Item key={k} it={it} achar={achar} />) : <li className="lj-dq-carregando" aria-hidden="true" />}
          </ul>
        )}
      </div>
      {lista.length > 1 && (
        <nav className="lj-dq-nav" aria-label={t('Outras caixas em destaque')}>
          <button type="button" onClick={() => setI((n) => (n - 1 + lista.length) % lista.length)} aria-label={t('Anterior')}>
            <IconeUI tipo="esquerda" tamanho={16} />
          </button>
          <span className="lj-dq-miniaturas">
            {(lista.length > 2 ? [-1, 0, 1] : lista.map((_, k) => k - atual)).map((d) => {
              const k = (atual + d + lista.length) % lista.length
              const x = lista[k]
              return (
                <button key={`${x.id}:${d}`} type="button" className={d === 0 ? 'is-ativo' : ''} aria-label={x.nome} aria-current={d === 0} onClick={() => setI(k)}>
                  <img src={x.img} alt="" loading="lazy" draggable="false" />
                </button>
              )
            })}
          </span>
          <button type="button" onClick={() => setI((n) => (n + 1) % lista.length)} aria-label={t('Próxima')}>
            <IconeUI tipo="direita" tamanho={16} />
          </button>
        </nav>
      )}
    </section>
  )
}
