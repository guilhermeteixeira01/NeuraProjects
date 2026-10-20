// Insígnias (catálogo e regras: comum/insignias.js)
//  - InsigniasMini: versão pequena, ao lado do nome na lista de amigos.
//  - InsigniasDe: fileira de insígnias do perfil; passando o mouse (ou tocando, no celular) abre a caixinha com nome,
//    descrição e quando ganhou.
//  - AvisoInsignia (no Layout, só com login): "Você recebeu uma nova insígnia!" por cima do site, com som, uma vez
//    para cada insígnia nova. As já avisadas ficam no navegador (localStorage np_insignias_<SteamID>); os perfis são
//    relidos a cada 30 s e, com o site aberto, o perfil novo chega na hora pela conexão ao vivo (amigos.js).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConta } from './conta.js'
import { salvarPerfil, usePerfis, usePerfisFrescos } from './Moldura.jsx'
import { registrarNotificacao } from './notificacoes.js'
import { imagemInsignia, insigniasDe, miniaturaInsignia } from './insignias.js'

// miniatura leve; se ela não existir, usa a imagem grande
const caiNaGrande = (id) => (e) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = imagemInsignia(id)
}
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
        <img src={miniaturaInsignia(i.id)} alt="" loading="lazy" decoding="async" draggable="false" onError={caiNaGrande(i.id)} />
      </button>
      <span className="ins-dica" role="tooltip" id={`ins-${i.id}`}>
        <img src={miniaturaInsignia(i.id)} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={caiNaGrande(i.id)} />
        <span>
          <b>{t(i.nome)}</b>
          <small>{t(i.descricao)}</small>
          {data && <em>{t('Recebida em {data}', { data })}</em>}
        </span>
      </span>
    </li>
  )
}

// ── Estante de insígnias: todas as do jogador em colmeia, como numa prateleira de troféus (o fundo do site fica embaçado) ──
const COR_PADRAO = '#5aa9e6'
function Estante({ lista, aoFechar }) {
  const t = useT()
  const [larg, setLarg] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth))
  useEffect(() => {
    const r = () => setLarg(window.innerWidth)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])
  useEffect(() => {
    // fundo embaçado e sem rolagem enquanto a estante está aberta
    document.documentElement.classList.add('ins-estante-aberta')
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => {
      document.documentElement.classList.remove('ins-estante-aberta')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])
  // fileiras alternadas (n, n-1, n, ...): é o que dá o desenho de colmeia
  const n = larg >= 1000 ? 6 : larg >= 760 ? 5 : larg >= 520 ? 4 : 3
  const fileiras = []
  for (let k = 0, i = 0; i < lista.length; k++) {
    const c = k % 2 === 0 ? n : n - 1
    fileiras.push(lista.slice(i, i + c))
    i += c
  }
  return createPortal(
    <div className="ins-est-fundo" onClick={aoFechar}>
      <div className="ins-est" role="dialog" aria-modal="true" aria-label={t('Insígnias')} onClick={(e) => e.stopPropagation()}>
        <header className="ins-est-cab">
          <h2>{t('Insígnias')}</h2>
          <span>{lista.length}</span>
          <button type="button" className="ins-est-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <div className="ins-est-vitrine">
          {fileiras.map((f, r) => (
            <div className="ins-est-fileira" key={r}>
              {f.map((i) => {
                const data = i.desde ? new Date(i.desde).toLocaleDateString(localeAtual()) : null
                return (
                  <button type="button" className="ins-hex" key={i.id} style={{ '--cor': i.cor || COR_PADRAO }} aria-label={t(i.nome)}>
                    <span className="ins-hex-placa" aria-hidden="true" />
                    <img src={imagemInsignia(i.id)} alt="" loading="lazy" decoding="async" draggable="false" onError={caiNaGrande(i.id)} />
                    <span className="ins-hex-info" role="tooltip">
                      <b>{t(i.nome)}</b>
                      <small>{t(i.descricao)}</small>
                      {data && <em>{t('Recebida em {data}', { data })}</em>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Fileira do perfil: mostra 4; se tiver mais, o "+N" abre a estante com todas
export function InsigniasDe({ steamId, classe = '', max = 4 }) {
  const t = useT()
  const lista = insigniasDe(usePerfis(), steamId)
  const [aberta, setAberta] = useState(false)
  if (!lista.length) return null
  const mostrar = lista.length > max ? lista.slice(0, max) : lista
  const resto = lista.length - mostrar.length
  return (
    <>
      <ul className={`ins-lista ${classe}`}>
        {mostrar.map((i) => (
          <Item key={i.id} i={i} />
        ))}
        {resto > 0 && (
          <li className="ins-item ins-item-mais">
            <button type="button" className="ins-mais" onClick={() => setAberta(true)} aria-haspopup="dialog" title={t('Ver todas as insígnias')}>
              <b>+{resto}</b>
              <small>{t('ver todas')}</small>
            </button>
          </li>
        )}
      </ul>
      {aberta && <Estante lista={lista} aoFechar={() => setAberta(false)} />}
    </>
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
        <img key={i.id} src={miniaturaInsignia(i.id)} alt={t(i.nome)} title={`${t(i.nome)} · ${t(i.descricao)}`} loading="lazy" decoding="async" draggable="false" onError={caiNaGrande(i.id)} />
      ))}
    </span>
  )
}

// ── Aviso de insígnia nova ──
// O que já foi visto fica na conta (perfil no worker, campo vistos.ins): vale em todos os aparelhos. O navegador
// guarda uma cópia (localStorage) para o caso do worker estar fora do ar.
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
  salvarPerfil({ vistos: { ins: [marca] } }).catch(() => {}) // na conta, para os outros aparelhos não avisarem de novo
}
// Cada insígnia avisa UMA vez (a marca é só o id): antes era id+data, e qualquer mudança de data (gravação repetida) avisava de novo.
// Marcas antigas ("id:data") ainda valem: o que vem depois dos dois pontos é ignorado.
const marcaDe = (i) => i.id
const idDaMarca = (m) => String(m).split(':')[0]

// Som de conquista (feito na hora, sem arquivo): acorde subindo com brilho no fim.
// Os navegadores só liberam som depois de um toque/clique/tecla na página. No celular o toque só conta quando o dedo
// solta (touchend/pointerup/click), não quando encosta. Por isso: o som é liberado no primeiro toque em qualquer lugar
// do site (antes mesmo da insígnia chegar); se a insígnia chegar antes disso, o aviso aparece na hora mesmo assim e o
// som toca no primeiro toque com ele aberto.
let audio = null
let somPendente = false
function contexto() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    audio = null
  }
  return audio
}
const GESTOS = ['pointerup', 'touchend', 'click', 'keydown']
let preparado = false
export function prepararSom() {
  if (preparado || typeof window === 'undefined') return
  preparado = true
  const liberar = () => {
    const ctx = contexto()
    if (!ctx) return parar()
    const pronto = () => {
      if (ctx.state !== 'running') return
      parar()
      // Espera o clique terminar: se o toque foi no "Continuar" (fechou o aviso), não toca
      setTimeout(() => somPendente && tocar(), 80)
    }
    if (ctx.state === 'running') return pronto()
    ctx.resume().then(pronto, () => {})
  }
  const parar = () => GESTOS.forEach((g) => window.removeEventListener(g, liberar, true))
  GESTOS.forEach((g) => window.addEventListener(g, liberar, true))
}
// Som de conquista (também usado pelo aviso de skin nova)
export const tocarConquista = () => tocar()
function tocar() {
  const ctx = contexto()
  if (!ctx || ctx.state !== 'running') {
    somPendente = true // toca quando o navegador liberar (primeiro toque)
    return
  }
  somPendente = false
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
  const [livre, setLivre] = useState(false) // sem o aviso de nível aberto por cima
  const tocou = useRef(null)
  const frescos = usePerfisFrescos()
  const migrado = useRef(false)

  // Com login: já deixa o som pronto para liberar no primeiro toque/clique no site
  useEffect(() => {
    if (conta?.id) prepararSom()
  }, [conta?.id])

  // Espera o aviso de nível fechar (os dois juntos ficariam um por cima do outro)
  useEffect(() => {
    if (!fila.length) return
    const ver = () => setLivre(!document.querySelector('.nx-nivel-fundo, .lj-abertura'))
    ver()
    const t = setInterval(ver, 500)
    return () => clearInterval(t)
  }, [fila.length])

  // A roleta da loja (.lj-abertura) ainda rodando: a insígnia que ela deu só aparece (e vai para o sino) depois que ela acaba, para não estragar a surpresa
  const [roleta, setRoleta] = useState(false)
  useEffect(() => {
    const ver = () => setRoleta(!!document.querySelector('.lj-abertura'))
    window.addEventListener('np-loja-fim', ver)
    window.addEventListener('np-loja-inicio', ver)
    return () => {
      window.removeEventListener('np-loja-fim', ver)
      window.removeEventListener('np-loja-inicio', ver)
    }
  }, [])

  useEffect(() => {
    if (!conta?.id) return setFila([])
    if (!frescos) return // espera a conta responder: o que já foi visto em outro aparelho vem de lá
    if (roleta) return // só depois da roleta da loja
    const doServidor = (perfis[conta.id]?.vistos?.ins || []).map(idDaMarca)
    const locais = vistas(conta.id).map(idDaMarca)
    // avisos vistos só neste navegador (antes de existir o salvo na conta) vão para a conta, uma vez
    const faltam = locais.filter((m) => !doServidor.includes(m))
    if (faltam.length && !migrado.current) {
      migrado.current = true
      salvarPerfil({ vistos: { ins: faltam } }).catch(() => {})
    }
    const ja = new Set([...doServidor, ...locais])
    const novas = insigniasDe(perfis, conta.id).filter((i) => !ja.has(marcaDe(i)))
    // fica também no sino (o mesmo id não entra duas vezes)
    for (const i of novas) registrarNotificacao(conta.id, { id: `ins:${marcaDe(i)}`, insignia: i.id, titulo: `Você ganhou a insígnia ${i.nome}`, texto: i.descricao })
    setFila((f) => [...f, ...novas.filter((i) => !f.some((x) => marcaDe(x) === marcaDe(i)))])
  }, [conta?.id, perfis, frescos, roleta])

  // O aviso aparece na hora (não espera o som ser liberado)
  const atual = livre ? fila[0] : null
  useEffect(() => {
    if (!atual || tocou.current === marcaDe(atual)) return
    tocou.current = marcaDe(atual)
    tocar()
  }, [atual])

  const fechar = () => {
    if (!atual) return
    somPendente = false // fechou antes de o som ser liberado: não toca depois
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
