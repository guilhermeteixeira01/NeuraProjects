// Carrossel de drops ao vivo no topo da loja: o que os jogadores estão ganhando nas caixas (worker: GET /loja/drops, src/mercado.js).
// Três botões à esquerda: relógio = tudo, na hora; joinha = drops bons (Épico para cima); estrela = os mais valiosos das últimas 24 h, só vermelhos (Lendário) e Item Raro Especial.
// A lista pergunta ao worker a cada poucos segundos; o drop novo entra pela esquerda e empurra os outros. Passar o mouse mostra quem ganhou.
import { useEffect, useRef, useState } from 'react'
import { useT } from '../../comum/i18n.js'
import { lerDrops } from '../../comum/loja.js'
import { RARIDADES } from '../../../worker/steam-login/src/loja-core.js'
import { dadosDoItem } from './Abertura.jsx'

const INTERVALO = 5000
const ABAS = [
  ['recentes', 'Drops ao vivo', <path key="r" d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />],
  ['bons', 'Drops bons (Épico para cima)', <path key="b" d="M7 11v9H4v-9h3Zm0 0 4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" />],
  ['top', 'Top drops das últimas 24 horas (vermelhos e itens raros especiais)',<path key="t" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" />],
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
    <section className="lj-drops" aria-label={t('Drops ao vivo')}>
      <div className="lj-drops-abas" role="tablist">
        {ABAS.map(([id, rotulo, icone]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} title={t(rotulo)} aria-label={t(rotulo)} onClick={() => setAba(id)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              {/* mesmo cartão do inventário (comum/cartaoSkin.css): arma sem fundo, barra da raridade embaixo, nome e skin */}
              <a className="inv-cartao lj-drop" href={`/perfil/?id=${x.quem}`} style={{ '--cor': cor }} title={`${x.nome || t('Jogador')} · ${it.nome}${it.enfeite ? '' : ` | ${it.skin}`}`}>
                <span className="inv-cartao-arte">
                  <span className="inv-arma-box">{it.img ? <img className="inv-arma-img" src={it.img} alt="" loading="lazy" draggable="false" /> : <span className="inv-sem-img" />}</span>
                  <svg className="lj-drop-origem" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-label={t('Aberto numa caixa')}>
                    <path d="M3 7h18v4H3zM5 11v9h14v-9M10 15h4" />
                  </svg>
                  {/* passar o mouse: quem ganhou */}
                  <span className="lj-drop-quem">
                    {x.avatar ? <img src={x.avatar} alt="" loading="lazy" /> : <i aria-hidden="true" />}
                    <b>{x.nome || t('Jogador')}</b>
                  </span>
                </span>
                <span className="inv-cartao-nome">
                  <b>{it.nome}</b>
                  <small>{it.enfeite ? t(it.skin) : it.skin}</small>
                  <em>{tempo(t, agora + diferenca.current - x.ts)}</em>
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
