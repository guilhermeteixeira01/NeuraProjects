// Insígnias das caixas da loja (Colecionador, Arsenal, secretas e Mestre da Caixa) com o progresso de cada uma.
// Ficam na aba Missões do perfil (PainelMissoes). Dados: GET /loja (o worker calcula o progresso).
import { useEffect, useState } from 'react'
import { useT } from './i18n.js'
import { lerLoja } from './loja.js'
import './insigniasLoja.css'

const numero = (n) => Number(n).toLocaleString('pt-BR')
// ── insígnias das caixas: progresso (37/50), níveis e secretas ──
const GRUPOS = { colecionador: 'Colecionador de Caixas', arsenal: 'Arsenal Afiado' }
const arte = (i, ganha) => {
  const base = i.id.startsWith('mestre-') ? 'mestre-da-caixa' : i.id
  return `/assets/insignia/${ganha ? 'web' : i.secreta ? 'secreta' : 'bloqueada'}/${base}.webp`
}
function Barra({ atual, meta }) {
  return (
    <span className="lj-progresso">
      <i style={{ width: `${Math.min(100, (atual / meta) * 100)}%` }} />
      <small>
        {numero(Math.min(atual, meta))}/{numero(meta)}
      </small>
    </span>
  )
}
function GradeInsignias({ lista }) {
  const t = useT()
  const itens = lista.filter((i) => !i.id.startsWith('mestre-'))
  const mestres = lista.filter((i) => i.id.startsWith('mestre-'))
  const grupos = []
  for (const i of itens) {
    if (i.grupo) {
      const g = grupos.find((x) => x.grupo === i.grupo)
      if (g) g.niveis.push(i)
      else grupos.push({ grupo: i.grupo, niveis: [i] })
    } else grupos.push({ unica: i })
  }
  const unica = (i) => {
    const ganha = i.ganhou > 0
    const oculta = i.secreta && !ganha
    return (
      <li key={i.id} className={`lj-ins${ganha ? ' lj-ganha' : ''}`} style={{ '--cor': i.cor }}>
        <img src={arte(i, ganha)} alt="" loading="lazy" draggable="false" />
        <b>{oculta ? '???' : t(i.nome)}</b>
        <small>{oculta ? t('Insígnia secreta') : t(i.descricao)}</small>
        {!ganha && !oculta && <Barra atual={i.atual} meta={i.meta} />}
        {ganha && <em>{t('Conquistada')}</em>}
      </li>
    )
  }
  return (
    <div className="lj-insignias">
      <ul className="lj-ins-grade">
        {grupos.map((g) => {
          if (g.unica) return unica(g.unica)
          const ganhas = g.niveis.filter((n) => n.ganhou > 0)
          const atual = ganhas[ganhas.length - 1]
          const proximo = g.niveis.find((n) => !(n.ganhou > 0))
          const mostrar = atual || g.niveis[0]
          return (
            <li key={g.grupo} className={`lj-ins lj-ins-grupo${atual ? ' lj-ganha' : ''}`} style={{ '--cor': mostrar.cor }}>
              <img src={arte(mostrar, !!atual)} alt="" loading="lazy" draggable="false" />
              <b>{t(GRUPOS[g.grupo] || g.grupo)}</b>
              <small>{atual ? t('Nível {n} de {total}', { n: atual.nivel, total: g.niveis.length }) : t('Nível 0 de {total}', { total: g.niveis.length })}</small>
              <span className="lj-niveis">
                {g.niveis.map((n) => (
                  <img key={n.id} src={arte(n, n.ganhou > 0)} alt={t(n.nome)} title={`${t(n.nome)} · ${t(n.descricao)}`} loading="lazy" className={n.ganhou > 0 ? 'ok' : ''} />
                ))}
              </span>
              {proximo ? (
                <>
                  <small className="lj-prox">{t('Próximo: {d}', { d: t(proximo.descricao) })}</small>
                  <Barra atual={proximo.atual} meta={proximo.meta} />
                </>
              ) : (
                <em>{t('Nível máximo')}</em>
              )}
            </li>
          )
        })}
      </ul>
      {mestres.length > 0 && (
        <>
          <h3 className="lj-ins-titulo">{t('Mestre da Caixa')}</h3>
          <p className="lj-ins-dica">{t('Consiga todas as skins (as facas não contam) de cada caixa.')}</p>
          <ul className="lj-ins-grade lj-ins-mestres">{mestres.map(unica)}</ul>
        </>
      )}
    </div>
  )
}


export default function InsigniasLoja() {
  const t = useT()
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    lerLoja().then((d) => setLista(d.insignias || []), () => setErro(true))
  }, [])
  if (erro) return <p role="alert">{t('Não foi possível conferir as insígnias das caixas. Tente novamente.')}</p>
  if (!lista) return <p role="status">{t('Conferindo conquistas…')}</p>
  return <GradeInsignias lista={lista} />
}
