// Carrossel de drops ao vivo no topo da loja: o que os jogadores estão ganhando nas caixas (worker: GET /loja/drops, src/mercado.js).
// Três botões à esquerda: relógio = tudo, na hora; joinha = drops bons (Épico para cima); estrela = os mais valiosos das últimas 24 h, só vermelhos (Lendário) e Item Raro Especial.
// A lista pergunta ao worker a cada poucos segundos; o drop novo entra pela esquerda e empurra os outros. Passar o mouse mostra quem ganhou.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../../comum/i18n.js'
import { lerDrops } from '../../comum/loja.js'
import { RARIDADES } from '../../../worker/steam-login/src/loja-core.js'
import { dadosDoItem } from './Abertura.jsx'

const INTERVALO = 5000
const ABAS = [
  ['recentes', 'Drops ao vivo', 'TUDO', <path key="r" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />],
  ['bons', 'Drops bons (Épico para cima)', 'BONS', <path key="b" d="M7 11v9H4v-9h3Zm0 0 4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" />],
  ['top', 'Top drops das últimas 24 horas (vermelhos e itens raros especiais)', 'TOP', <path key="t" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" />],
]

function tempo(t, ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 2) return t('agora')
  if (s < 60) return t('há {n} segundos', { n: s })
  const m = Math.floor(s / 60)
  if (m < 60) return m === 1 ? t('há 1 minuto') : t('há {n} minutos', { n: m })
  const h = Math.floor(m / 60)
  return h === 1 ? t('há 1 hora') : t('há {n} horas', { n: h })
}

export default function Drops({ achar }) {
  const t = useT()
  const [aba, setAba] = useState('recentes')
  const [dados, setDados] = useState(null)
  const [agora, setAgora] = useState(() => Date.now())
  const vistos = useRef(null) // ids que já estavam na tela: o resto entra animado
  const [novos, setNovos] = useState(() => new Set())
  const diferenca = useRef(0) // relógio do worker - relógio daqui (para o "há X segundos" não mentir)
  const faixa = useRef(null)

  // A faixa vai de uma ponta à outra da área da página: da borda da barra da esquerda até a borda da barra da direita
  // (o body guarda o espaço das barras como padding). Mede de novo quando a janela muda de tamanho.
  useLayoutEffect(() => {
    const el = faixa.current
    if (!el) return
    const ajustar = () => {
      el.style.marginLeft = '0px'
      el.style.width = 'auto'
      const cs = getComputedStyle(document.body)
      const esq = parseFloat(cs.paddingLeft) || 0
      const dir = parseFloat(cs.paddingRight) || 0
      const largura = document.body.clientWidth - esq - dir // em px da página (o site usa zoom no computador, então tudo é medido nessa mesma unidade)
      const pai = el.parentElement
      const r = pai.getBoundingClientRect()
      const zoom = pai.offsetWidth ? r.width / pai.offsetWidth : 1 // tela / página
      const paiEsq = r.left / zoom + (parseFloat(getComputedStyle(pai).paddingLeft) || 0) // a margem conta a partir de dentro do padding do pai
      el.style.marginLeft = `${esq - paiEsq}px`
      el.style.width = `${largura}px`
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(document.body)
    ro.observe(el.parentElement) // a página pode se reacomodar depois que a loja carrega
    window.addEventListener('resize', ajustar)
    const cedo = [100, 400, 1200].map((ms) => setTimeout(ajustar, ms))
    return () => {
      ro.disconnect()
      cedo.forEach(clearTimeout)
      window.removeEventListener('resize', ajustar)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const buscar = () => {
      if (document.visibilityState !== 'visible') return
      lerDrops().then(
        (d) => {
          if (!vivo) return
          diferenca.current = d.agora - Date.now()
          setDados(d)
        },
        () => {},
      )
    }
    buscar()
    const i = setInterval(buscar, INTERVALO)
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    document.addEventListener('visibilitychange', buscar)
    return () => {
      vivo = false
      clearInterval(i)
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', buscar)
    }
  }, [])

  const lista = dados?.[aba] || []
  // marca o que chegou agora (só depois da primeira carga da aba; trocar de aba não anima tudo)
  useEffect(() => {
    if (!dados) return
    const ids = lista.map((x) => x.id)
    if (vistos.current?.aba === aba) {
      const antes = vistos.current.ids
      setNovos(new Set(ids.filter((id) => !antes.has(id))))
    } else setNovos(new Set())
    vistos.current = { aba, ids: new Set(ids) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, aba])

  return (
    <section className="lj-drops" ref={faixa} aria-label={t('Drops ao vivo')}>
      <div className="lj-drops-abas" role="tablist">
        {ABAS.map(([id, rotulo, curto, icone]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} title={t(rotulo)} aria-label={t(rotulo)} onClick={() => setAba(id)}>
            <span>{curto}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icone}
            </svg>
          </button>
        ))}
      </div>
      <ul className="lj-drops-lista">
        {lista.map((x) => {
          const it = dadosDoItem(x.t, x.d, x.p, x.n, x.i, achar)
          const cor = RARIDADES[x.r]?.cor || RARIDADES[0].cor
          return (
            <li key={x.id} className={novos.has(x.id) ? 'is-novo' : ''}>
              <a className="lj-tile" href={`/perfil/?id=${x.quem}`} style={{ '--cor': cor }} title={`${x.nome || t('Jogador')} · ${it.nome}${it.enfeite ? '' : ` | ${it.skin}`}`}>
                <span className="lj-tile-arma">{it.img ? <img src={it.img} alt="" loading="lazy" draggable="false" /> : <span className="inv-sem-img" />}</span>
                <svg className="lj-tile-origem" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-label={t('Aberto numa caixa')}>
                  <path d="M3 7h18v4H3zM5 11v9h14v-9M10 15h4" />
                </svg>
                <span className="lj-tile-nome">{it.enfeite ? it.nome : it.skin || it.nome}</span>
                {/* passar o mouse: quem ganhou */}
                <span className="lj-tile-quem">
                  {x.avatar ? <img src={x.avatar} alt="" loading="lazy" /> : <i aria-hidden="true" />}
                  <b>{x.nome || t('Jogador')}</b>
                  <small>{tempo(t, agora + diferenca.current - x.ts)}</small>
                </span>
              </a>
            </li>
          )
        })}
        {dados && !lista.length && <li className="lj-drops-vazio">{t('Nenhum drop ainda. Abra uma caixa e apareça aqui!')}</li>}
        {!dados && <li className="lj-drops-vazio">{t('Carregando…')}</li>}
      </ul>
    </section>
  )
}
