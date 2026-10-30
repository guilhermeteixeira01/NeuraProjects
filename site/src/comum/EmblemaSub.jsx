// Emblema da assinatura Premium, no canto superior direito do avatar (ComMoldura, com emblema). Passando o mouse (ou focando) abre
// uma caixinha com o nível ("Premium Gold"); clicando abre a janela com os 6 níveis (a 3ª imagem de referência). Subscriber, Gold e
// Platinum são imagens paradas; Diamond, Elite e Legend são animadas. A caixinha e a janela vão para o <body> (portal): o avatar fica
// dentro de cartões com overflow: hidden.
// nivel: { id, nome, meses, proximo, faltam } (assinatura.js: nivelDaSub). parado: usa a versão sem animação.
import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { entrar, loginAtivo, useConta } from './conta.js'
import { NIVEIS_SUB, SUB_MESES_PADRAO, tituloNivel, urlEmblema } from './assinatura.js'
import { useConfigSite, useNivelSub } from './Moldura.jsx'
import ParticulasPremium from './ParticulasPremium.jsx'
import { useT } from './i18n.js'

// Cor (r,g,b) de cada nível: halo do emblema e partículas
const COR_NIVEL = { subscriber: '140,220,60', gold: '255,200,60', platinum: '160,205,255', diamond: '70,130,255', elite: '170,120,255', legend: '255,110,60' }

const Deposito = lazy(() => import('../paginas/loja/Deposito.jsx')) // só baixa quando alguém clica em "Seja Premium"

function JanelaPremium({ nivel, parado, aoFechar }) {
  const t = useT()
  const conta = useConta()
  const [assinando, setAssinando] = useState(false) // abre a apresentação/planos do Premium (a mesma do menu da conta)
  const { subMeses } = useConfigSite()
  const [vendo, setVendo] = useState(nivel.id) // nível aberto no destaque (clicar nos emblemas troca)
  const v = NIVEIS_SUB.find((n) => n.id === vendo) || nivel
  const meses = (n) => (n.id === 'subscriber' ? 0 : Number(subMeses?.[n.id]) || SUB_MESES_PADRAO[n.id])
  const cor = COR_NIVEL[v.id]
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <>
    <div className="pm-fundo" onClick={aoFechar}>
      <div className="pm-janela" style={{ '--cn': cor }} role="dialog" aria-modal="true" aria-labelledby="pm-titulo" onClick={(e) => e.stopPropagation()}>
        <ParticulasPremium quantidade={34} cor={cor} />
        <div className="pm-cab">
          <h2 id="pm-titulo">{t('Emblema de assinatura Premium')}</h2>
          <button type="button" className="pm-x" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </div>
        <div className="pm-niveis">
          {NIVEIS_SUB.map((n) => (
            <figure key={n.id} className={`${n.id === vendo ? 'atual' : ''}${n.id === nivel.id ? ' meu' : ''}`} style={{ '--cn': COR_NIVEL[n.id] }} title={tituloNivel(n)} onClick={() => setVendo(n.id)} onMouseEnter={() => setVendo(n.id)}>
              <img src={urlEmblema(n.id, parado)} alt="" draggable={false} />
              <figcaption>{n.nome}</figcaption>
            </figure>
          ))}
        </div>
        <div className="pm-destaque" key={v.id}>
          <span className="pm-halo" aria-hidden="true" />
          <img src={urlEmblema(v.id, parado)} alt="" draggable={false} />
          <div>
            <b>{tituloNivel(v)}</b>
            <small>{meses(v) === 0 ? t('Desde o 1º mês de assinatura') : t('A partir de {n} meses de assinatura', { n: meses(v) })}</small>
            {v.id === nivel.id && <em>{t('Nível atual')}</em>}
          </div>
        </div>
        <p className="pm-atual">
          {t('Este jogador está no nível {nivel}.', { nivel: nivel.nome })}
          {nivel.proximo && ` ${t('Evolui para {proximo} com mais tempo de assinatura.', { proximo: nivel.proximo.nome })}`}
        </p>
        <p className="pm-texto">{t('Seja Premium e evolua o seu emblema com o tempo de assinatura, do Subscriber até o Legend. O emblema aparece somente no seu perfil.')}</p>
        <div className="pm-rodape">
          <button type="button" className="pm-fechar" onClick={aoFechar}>
            {t('FECHAR')}
          </button>
          <button type="button" className="pm-premium" onClick={() => (conta || !loginAtivo() ? setAssinando(true) : entrar())}>
            {t('SEJA PREMIUM')}
          </button>
        </div>
      </div>
    </div>
    {assinando && (
      <Suspense fallback={null}>
        <Deposito modo="sub" aoFechar={() => setAssinando(false)} />
      </Suspense>
    )}
    </>
  )
}

export default function EmblemaSub({ nivel, parado = false }) {
  const t = useT()
  const conta = useConta()
  const souPremium = !!useNivelSub(conta?.id) // quem já assina não vê a janela "Seja Premium"
  const [dica, setDica] = useState(null) // { x, y } da caixinha (tela)
  const [aberta, setAberta] = useState(false)
  const abrirDica = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setDica({ x: Math.min(Math.max(r.left + r.width / 2, 70), window.innerWidth - 70), y: r.top })
  }
  const abrirJanela = (e) => {
    // o avatar costuma estar dentro de um link (perfil): clicar no emblema não navega
    e.preventDefault()
    e.stopPropagation()
    setDica(null)
    if (!souPremium) setAberta(true)
  }
  return (
    <>
      <span
        className={`emblema-sub${souPremium ? ' emblema-sub-fixo' : ''}`}
        role={souPremium ? 'img' : 'button'}
        tabIndex={souPremium ? -1 : 0}
        aria-label={tituloNivel(nivel)}
        onMouseEnter={abrirDica}
        onMouseLeave={() => setDica(null)}
        onFocus={abrirDica}
        onBlur={() => setDica(null)}
        onClick={abrirJanela}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && abrirJanela(e)}
      >
        <img src={urlEmblema(nivel.id, parado)} alt="" draggable={false} />
      </span>
      {dica &&
        createPortal(
          <span className="emblema-dica" role="tooltip" style={{ left: dica.x, top: dica.y }}>
            {t('Premium {nivel}', { nivel: nivel.nome })}
          </span>,
          document.body,
        )}
      {aberta && createPortal(<JanelaPremium nivel={nivel} parado={parado} aoFechar={() => setAberta(false)} />, document.body)}
    </>
  )
}
