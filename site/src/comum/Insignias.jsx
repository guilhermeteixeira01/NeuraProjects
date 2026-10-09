// Insígnias (catálogo e regras: comum/insignias.js)
//  - InsigniasMini: versão pequena, ao lado do nome na lista de amigos.
//  - InsigniasDe: fileira de insígnias do perfil; passando o mouse (ou tocando, no celular) abre a caixinha com nome,
//    descrição e quando ganhou.
//  - AvisoInsignia (no Layout, só com login): "Você recebeu uma nova insígnia!" por cima do site, com som, uma vez
//    para cada insígnia nova. As já avisadas ficam no navegador (localStorage np_insignias_<SteamID>); os perfis são
//    relidos a cada 30 s, então quem ganha com o site aberto vê o aviso em seguida.
import { useEffect, useRef, useState } from 'react'
import { useConta } from './conta.js'
import { usePerfis } from './Moldura.jsx'
import { imagemInsignia, insigniasDe } from './insignias.js'
import { desempenhoAtivo } from './desempenho.js'
import { localeAtual, useT } from './i18n.js'

function Item({ i }) {
  const t = useT()
  const ref = useRef(null)
  const [dx, setDx] = useState(0)
  // Caixinha centralizada na insígnia, mas sem sair da tela (insígnia encostada na borda, no celular)
  const ajustar = () => {
    const el = ref.current
    const caixa = el?.querySelector('.ins-dica')
    if (!caixa) return
    const r = el.getBoundingClientRect()
    const meio = r.left + r.width / 2
    const meia = caixa.offsetWidth / 2
    setDx(Math.round(Math.min(Math.max(meio, meia + 10), innerWidth - meia - 10) - meio))
  }
  const data = i.desde ? new Date(i.desde).toLocaleDateString(localeAtual()) : null
  return (
    <li className="ins-item" ref={ref} onMouseEnter={ajustar} onFocus={ajustar} style={{ '--dx': `${dx}px` }}>
      <button type="button" className="ins-botao" aria-label={t(i.nome)} aria-describedby={`ins-${i.id}`}>
        <img src={imagemInsignia(i.id)} alt="" loading="lazy" draggable="false" />
      </button>
      <span className="ins-dica" role="tooltip" id={`ins-${i.id}`}>
        <img src={imagemInsignia(i.id)} alt="" aria-hidden="true" />
        <span>
          <b>{t(i.nome)}</b>
          <small>{t(i.descricao)}</small>
          {data && <em>{t('Recebida em {data}', { data })}</em>}
        </span>
      </span>
    </li>
  )
}

export function InsigniasDe({ steamId, classe = '' }) {
  const lista = insigniasDe(usePerfis(), steamId)
  if (!lista.length) return null
  return (
    <ul className={`ins-lista ${classe}`}>
      {lista.map((i) => (
        <Item key={i.id} i={i} />
      ))}
    </ul>
  )
}

// Versão pequena (lista de amigos): só as artes, ao lado do nome; o nome de cada uma aparece ao parar o mouse
export function InsigniasMini({ steamId, max = 4, classe = '' }) {
  const t = useT()
  const lista = insigniasDe(usePerfis(), steamId).slice(0, max)
  if (!lista.length) return null
  return (
    <span className={`ins-mini ${classe}`}>
      {lista.map((i) => (
        <img key={i.id} src={imagemInsignia(i.id)} alt={t(i.nome)} title={`${t(i.nome)} · ${t(i.descricao)}`} loading="lazy" draggable="false" />
      ))}
    </span>
  )
}

// ── Aviso de insígnia nova ──
const chave = (id) => `np_insignias_${id}`
const vistas = (id) => {
  try {
    const v = JSON.parse(localStorage.getItem(chave(id)) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const marcar = (id, marca) => {
  try {
    localStorage.setItem(chave(id), JSON.stringify([...new Set([...vistas(id), marca])].slice(-50)))
  } catch {
    // sem armazenamento: o aviso pode repetir, mas não quebra nada
  }
}
// Marca = insígnia + quando ganhou: se o admin tirar e der de novo, avisa de novo
const marcaDe = (i) => `${i.id}:${i.desde || 0}`

// Som de conquista (feito na hora, sem arquivo): acorde subindo com brilho no fim
let audio = null
function contexto() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    audio = null
  }
  return audio
}
function tocar() {
  const ctx = contexto()
  if (!ctx || ctx.state !== 'running') return
  const agora = ctx.currentTime + 0.05
  const geral = ctx.createGain()
  geral.gain.value = 0.22
  geral.connect(ctx.destination)
  const nota = (freq, quando, dur, tipo = 'triangle', vol = 1) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = tipo
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, quando)
    g.gain.exponentialRampToValueAtTime(vol, quando + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
    o.connect(g).connect(geral)
    o.start(quando)
    o.stop(quando + dur + 0.05)
  }
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, n) => nota(f, agora + n * 0.09, 0.5))
  nota(1046.5, agora + 0.4, 1.3, 'sine', 0.8)
  nota(1567.98, agora + 0.42, 1.1, 'sine', 0.45)
  nota(2093, agora + 0.5, 0.9, 'sine', 0.25)
}

export default function AvisoInsignia() {
  const t = useT()
  const conta = useConta()
  const perfis = usePerfis()
  const [fila, setFila] = useState([])
  const [pode, setPode] = useState(false) // som liberado pelo navegador (ou a pessoa já clicou/teclou na página)
  const [livre, setLivre] = useState(false) // sem o aviso de nível aberto por cima
  const tocou = useRef(null)

  // Navegadores só deixam tocar som depois que a pessoa interage com o site: espera o primeiro clique/tecla
  useEffect(() => {
    if (!fila.length || pode) return
    const ctx = contexto()
    if (!ctx || ctx.state === 'running') return setPode(true)
    const liberar = () => ctx.resume().finally(() => setPode(true))
    ctx.resume().then(() => ctx.state === 'running' && setPode(true)).catch(() => {})
    window.addEventListener('pointerdown', liberar, { once: true, capture: true })
    window.addEventListener('keydown', liberar, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', liberar, { capture: true })
      window.removeEventListener('keydown', liberar, { capture: true })
    }
  }, [fila.length, pode])

  // Espera o aviso de nível fechar (os dois juntos ficariam um por cima do outro)
  useEffect(() => {
    if (!fila.length) return
    const ver = () => setLivre(!document.querySelector('.nx-nivel-fundo'))
    ver()
    const t = setInterval(ver, 500)
    return () => clearInterval(t)
  }, [fila.length])

  useEffect(() => {
    if (!conta?.id) return setFila([])
    const ja = new Set(vistas(conta.id))
    const novas = insigniasDe(perfis, conta.id).filter((i) => !ja.has(marcaDe(i)))
    setFila((f) => [...f, ...novas.filter((i) => !f.some((x) => marcaDe(x) === marcaDe(i)))])
  }, [conta?.id, perfis])

  const atual = pode && livre ? fila[0] : null
  useEffect(() => {
    if (!atual || tocou.current === marcaDe(atual)) return
    tocou.current = marcaDe(atual)
    tocar()
  }, [atual])

  const fechar = () => {
    if (!atual) return
    marcar(conta.id, marcaDe(atual))
    setFila((f) => f.slice(1))
  }
  useEffect(() => {
    if (!atual) return
    const tecla = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  })

  if (!atual) return null
  const resto = fila.length - 1
  return (
    <div className="ins-fundo" onClick={fechar}>
      <div className={`ins-aviso${desempenhoAtivo() ? ' parado' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ins-aviso-titulo" onClick={(e) => e.stopPropagation()}>
        <span className="ins-kicker">{t('NOVA INSÍGNIA')}</span>
        <div className="ins-palco" aria-hidden="true">
          <span className="ins-raios" />
          <img key={atual.id} src={imagemInsignia(atual.id)} alt="" />
        </div>
        <h2 id="ins-aviso-titulo">{t('Você recebeu uma nova insígnia!')}</h2>
        <b className="ins-nome">{t(atual.nome)}</b>
        <p>{t(atual.descricao)}</p>
        <small className="ins-onde">{t('Ela já aparece no seu perfil.')}</small>
        <button type="button" className="ins-ok" onClick={fechar} autoFocus>
          {resto > 0 ? t('Próxima ({n})', { n: resto }) : t('Continuar')}
        </button>
      </div>
    </div>
  )
}
