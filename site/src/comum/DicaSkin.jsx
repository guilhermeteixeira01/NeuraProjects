// Ficha da skin ao passar o mouse num cartão (inventário, loja de skins e inventário do perfil), no estilo do inventário do jogo:
// ícone da coleção, nome, coleção, raridade, exterior, equipe, descrição da arma + da pintura e a frase de efeito.
// Os textos traduzidos vêm de /assets/skins/detalhes-<idioma>.json (ferramentas/skins/gerar-detalhes.mjs), baixado no primeiro hover.
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCatalogo } from './skins.js'
import { useT } from './i18n.js'
import './dicaSkin.css'

const ICONE_COLECAO = 'https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/set_icons/'

// Raridade pela cor, com os nomes do jogo em cada idioma (tabela própria: "Oculto" no dicionário do site é outra coisa)
const RARIDADES = {
  '#b0c3d9': { pt: 'Nível Consumidor', en: 'Consumer Grade', es: 'Grado de consumidor' },
  '#5e98d9': { pt: 'Nível Industrial', en: 'Industrial Grade', es: 'Grado industrial' },
  '#4b69ff': { pt: 'Nível Militar', en: 'Mil-Spec', es: 'Grado militar' },
  '#8847ff': { pt: 'Restrito', en: 'Restricted', es: 'Restringido' },
  '#d32ce6': { pt: 'Secreto', en: 'Classified', es: 'Clasificado' },
  '#eb4b4b': { pt: 'Oculto', en: 'Covert', es: 'Encubierto' },
  '#e4ae39': { pt: 'Contrabando', en: 'Contraband', es: 'Contrabando' },
  luva: { pt: 'Extraordinário', en: 'Extraordinary', es: 'Extraordinario' },
}
const PRECISAO = new Set(['weapon_awp', 'weapon_ssg08', 'weapon_scar20', 'weapon_g3sg1'])
const METRALHADORAS = new Set(['weapon_m249', 'weapon_negev'])
function tipoDaArma(item, arma) {
  if (item.t === 'faca') return 'Faca'
  if (item.t === 'luva') return 'Luvas'
  if (PRECISAO.has(arma?.k)) return 'Rifle de Precisão'
  if (METRALHADORAS.has(arma?.k)) return 'Metralhadora'
  return { rifles: 'Rifle', smgs: 'Submetralhadora', pistols: 'Pistola', heavy: 'Escopeta' }[arma?.c] || ''
}
const exterior = (f) => (f < 0.07 ? 'Nova de Fábrica' : f < 0.15 ? 'Pouco Usada' : f < 0.38 ? 'Testada em Campo' : f < 0.45 ? 'Bem Desgastada' : 'Veterana de Guerra')
const EQUIPES = { tr: 'Terrorista', ct: 'Contraterrorista', both: 'Ambas as equipes' }

// Só faz sentido para arma, faca e luva (agente, adesivo e chaveiro não têm coleção/descrição no catálogo)
export const temDica = (item) => item.t === 'arma' || item.t === 'faca' || item.t === 'luva'

// alvo: o elemento do cartão (a ficha fica do lado dele, onde couber)
export default function DicaSkin({ item, idx, alvo }) {
  const t = useT()
  const { dados } = useCatalogo(`detalhes-${t.idioma}`)
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  const arma = idx?.armas.get(item.d)
  const skin = arma?.s.find((s) => s[0] === item.p)
  const det = dados?.skins[`${item.d}:${item.p}`]
  const base = dados?.armas[item.d]
  const colecao = det?.[1] ? dados.colecoes[det[1]] : null
  const nomeArma = base?.[0] || arma?.n || `#${item.d}`
  const nomeSkin = det?.[0] || skin?.[1] || ''
  const cor = skin?.[2] || ''
  const raridade = RARIDADES[item.t === 'luva' ? 'luva' : cor]?.[t.idioma]
  const tipo = tipoDaArma(item, arma)
  const descricao = [base?.[1], det?.[2]].filter(Boolean).join(' ')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !alvo) return
    const r = alvo.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const m = 10
    let left = r.right + m
    if (left + w > innerWidth - m) left = r.left - m - w
    if (left < m) left = Math.max(m, Math.min(innerWidth - w - m, r.left + r.width / 2 - w / 2))
    const top = Math.max(m, Math.min(innerHeight - h - m, r.top))
    setPos({ left, top })
  }, [alvo, dados])

  return createPortal(
    <div ref={ref} className="dica-skin" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}>
      <div className="dica-skin-topo">
        {colecao?.[1] ? <img className="dica-skin-colecao" src={ICONE_COLECAO + colecao[1]} alt="" /> : null}
        <div>
          <b>
            {item.t === 'faca' || item.t === 'luva' ? '★ ' : ''}
            {nomeSkin ? `${nomeArma} | ${nomeSkin}` : nomeArma}
            {item.n ? ` «${item.n}»` : ''}
          </b>
          {colecao && <span>{colecao[0]}</span>}
        </div>
      </div>
      <dl className="dica-skin-dados">
        {raridade && (
          <>
            <dt>{t('Raridade')}:</dt>
            <dd style={{ color: cor || undefined }}>
              {item.st ? 'StatTrak™ ' : ''}
              {tipo ? `${t(tipo)} (${raridade})` : raridade}
            </dd>
          </>
        )}
        {skin && item.f != null && (
          <>
            <dt>{t('Exterior')}:</dt>
            <dd>
              {t(exterior(Number(item.f)))} <small>{Number(item.f).toFixed(6)}</small>
            </dd>
          </>
        )}
        {arma?.e && (
          <>
            <dt>{t('Equipe')}:</dt>
            <dd className="dica-skin-equipe">
              {(arma.e === 'both' ? ['ct', 'tr'] : [arma.e]).map((l) => (
                <img key={l} className="dica-skin-lado" src={`/neurapick/lados/${l}_logo.webp`} alt="" />
              ))}
              {t(EQUIPES[arma.e])}
            </dd>
          </>
        )}
      </dl>
      {descricao && (
        <div className="dica-skin-texto">
          <p>{descricao}</p>
          {det?.[3] && <p className="dica-skin-frase">{det[3]}</p>}
        </div>
      )}
    </div>,
    document.body,
  )
}
