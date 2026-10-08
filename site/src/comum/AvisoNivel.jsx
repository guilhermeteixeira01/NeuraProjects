// Aviso de nível (só para quem está logado): quando a pessoa pega o primeiro nível (completa as 10 partidas), sobe ou
// volta de nível, aparece uma vez, por cima do site, a gema nova animada.
// O último nível visto fica no navegador (localStorage np_nivel_<SteamID>); primeira vez neste navegador: guarda
// sem avisar se ainda está sem classificação, e mostra "nível desbloqueado" se já tem nível.
import { useEffect, useRef, useState } from 'react'
import { useConta } from './conta.js'
import { lerJson } from './dados.js'
import { usePerfis } from './Moldura.jsx'
import { SeloNivel } from './Nivel.jsx'
import { corNivel, nivelDe } from './niveis.js'
import { desempenhoAtivo } from './desempenho.js'
import { useT } from './i18n.js'

const chave = (id) => `np_nivel_${id}`
const ler = (id) => {
  try {
    const v = Number(localStorage.getItem(chave(id)) ?? NaN)
    return Number.isInteger(v) && v >= 0 ? v : null // vazio ou valor estranho: como se nunca tivesse visto
  } catch {
    return null
  }
}
const guardar = (id, n) => {
  try {
    localStorage.setItem(chave(id), String(n))
  } catch {
    // sem armazenamento: o aviso pode repetir, mas não quebra nada
  }
}

// Partículas saindo da gema (não roda com "Melhorar desempenho" nem com movimento reduzido)
function estourar(canvas, cor, muitas) {
  if (!canvas || desempenhoAtivo() || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const ctx = canvas.getContext('2d')
  const dpr = devicePixelRatio || 1
  const w = (canvas.width = canvas.clientWidth * dpr)
  const h = (canvas.height = canvas.clientHeight * dpr)
  const ps = Array.from({ length: muitas ? 90 : 45 }, () => {
    const a = Math.random() * Math.PI * 2
    const v = (2 + Math.random() * (muitas ? 6 : 4)) * dpr
    return { x: w / 2, y: h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 1, r: (1.5 + Math.random() * 3) * dpr }
  })
  const passo = () => {
    ctx.clearRect(0, 0, w, h)
    let vivas = 0
    for (const p of ps) {
      if (p.vida <= 0) continue
      vivas++
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.95
      p.vy = p.vy * 0.95 + 0.06 * dpr
      p.vida -= 0.018
      ctx.globalAlpha = Math.max(0, p.vida)
      ctx.fillStyle = Math.random() > 0.8 ? '#ffffff' : cor
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (vivas) requestAnimationFrame(passo)
    else ctx.clearRect(0, 0, w, h)
  }
  setTimeout(passo, 250) // junto com o "estalo" da gema
}

export default function AvisoNivel() {
  const t = useT()
  const conta = useConta()
  const perfis = usePerfis()
  const [ranking, setRanking] = useState(null)
  const [esperou, setEsperou] = useState(false)
  const [aviso, setAviso] = useState(null) // { tipo: 'revela' | 'sobe' | 'desce', de, para }
  const canvas = useRef(null)

  useEffect(() => {
    if (!conta?.id) return
    let vivo = true
    lerJson('/ranking/ranking.json').then((r) => vivo && setRanking(r || { jogadores: [] }))
    // O ajuste de XP do admin vem dos perfis (worker): espera eles um pouco para não avisar um nível errado
    const t = setTimeout(() => vivo && setEsperou(true), 3000)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [conta?.id])

  const prontos = ranking && (esperou || Object.keys(perfis).length > 0)
  useEffect(() => {
    if (!conta?.id || !prontos) return
    const j = ranking.jogadores?.find((x) => x.steamId === conta.id)
    const atual = nivelDe((Number(j?.xp) || 0) + (Number(perfis[conta.id]?.xp) || 0), Number(j?.mapas) || 0).nivel
    const visto = ler(conta.id)
    guardar(conta.id, atual)
    if (atual === 0 || visto === atual) return
    if (visto === null || visto === 0) setAviso({ tipo: 'revela', de: 0, para: atual })
    else setAviso({ tipo: atual > visto ? 'sobe' : 'desce', de: visto, para: atual })
  }, [conta?.id, prontos]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aviso) return
    if (aviso.tipo !== 'desce') estourar(canvas.current, corNivel(aviso.para), aviso.tipo === 'revela')
    const tecla = (e) => e.key === 'Escape' && setAviso(null)
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aviso])

  if (!aviso) return null
  const titulo =
    aviso.tipo === 'revela'
      ? t('Nível {n} desbloqueado!', { n: aviso.para })
      : aviso.tipo === 'sobe'
        ? t('Você subiu para o nível {n}!', { n: aviso.para })
        : t('Você voltou para o nível {n}', { n: aviso.para })
  const texto =
    aviso.tipo === 'revela'
      ? t('Você completou as 10 partidas de classificação. Agora cada partida soma ou tira XP do seu nível.')
      : aviso.tipo === 'sobe'
        ? t('Do nível {de} para o {para}. Continue jogando bem para chegar ao próximo.', { de: aviso.de, para: aviso.para })
        : t('Do nível {de} para o {para}. Vença as próximas partidas para recuperar.', { de: aviso.de, para: aviso.para })
  return (
    <div className="nx-nivel-fundo" onClick={() => setAviso(null)}>
      <div className={`nx-nivel nx-nivel-${aviso.tipo}`} role="dialog" aria-modal="true" aria-labelledby="nx-nivel-titulo" onClick={(e) => e.stopPropagation()} style={{ '--nv': corNivel(aviso.para) }}>
        <div className="nx-nivel-gema">
          <canvas ref={canvas} aria-hidden="true" />
          <SeloNivel nivel={aviso.para} tamanho={150} classe={`anim-${aviso.tipo}`} />
        </div>
        <h2 id="nx-nivel-titulo">{titulo}</h2>
        <p>{texto}</p>
        <button type="button" className="nx-nivel-ok" onClick={() => setAviso(null)} autoFocus>
          {t('Continuar')}
        </button>
      </div>
    </div>
  )
}
