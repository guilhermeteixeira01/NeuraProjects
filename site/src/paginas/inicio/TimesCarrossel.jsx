import { useState } from 'react'
import { useListaTimes } from '../../comum/Moldura.jsx'
import { useT } from '../../comum/i18n.js'

// Carrossel dos times registrados (assets/data/times.json, editada em /times/): cartões com o logo passando sem parar
// (para com o mouse em cima; o nome aparece no cartão). Poucos times: a lista se repete até encher a faixa, e o grupo
// vai duplicado para a volta ficar contínua. Sem time na lista, a seção não aparece.
const MIN_CARTOES = 12

function Cartao({ time }) {
  const [erro, setErro] = useState(false)
  const temLogo = /^https?:\/\//.test(time.logo || '') && !erro
  return (
    <span className="tc-cartao" title={time.nome}>
      {temLogo ? <img src={time.logo} alt="" loading="lazy" onError={() => setErro(true)} /> : <i aria-hidden="true">{time.nome.slice(0, 2).toUpperCase()}</i>}
      <span className="tc-nome">{time.nome}</span>
    </span>
  )
}

export default function TimesCarrossel() {
  const t = useT()
  const times = useListaTimes()
  if (!times.length) return null
  const vezes = Math.ceil(MIN_CARTOES / times.length)
  const grupo = Array.from({ length: vezes }, () => times).flat()
  return (
    <section className="secao tc-secao" aria-labelledby="tc-titulo">
      <div className="wrap">
        <div className="secao-head reveal">
          <span className="kicker">
            <b>#</b> {t('COMUNIDADE')}
          </span>
          <h2 id="tc-titulo">
            {t('Times registrados')} <span className="tc-exc">!</span>
          </h2>
          <p>{t('{n} times cadastrados no servidor.', { n: times.length })}</p>
        </div>
      </div>
      <div className="tc-faixa">
        {/* duração acompanha o tamanho do grupo: mesma velocidade com 3 ou 30 times */}
        <div className="tc-trilho" style={{ '--tc-dur': `${grupo.length * 3.2}s` }}>
          {[0, 1].map((copia) => (
            <div key={copia} className="tc-grupo" aria-hidden={copia === 1}>
              {grupo.map((time, i) => (
                <Cartao key={`${time.nome}-${i}`} time={time} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
