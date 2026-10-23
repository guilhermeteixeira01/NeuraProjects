// Cartão de um item do inventário de skins (o mesmo do /inventario/ e da aba Skins do painel admin): arma sobre fundo transparente com a barra
// da raridade, bolinhas dos times em que está equipada, StatTrak, chaveiro e adesivos no canto de baixo, nome, skin e desgaste.
// item: { t, d, p, f, st, n, a, k, __id }   equip: { ct: {chave: id}, tr: {...} }   adesivos/chaveiros: Map(id do jogo -> linha do catálogo)
// aoAbrirMenu: o que fazer ao clicar (menu do botão direito no inventário); sem ele o cartão é só para olhar. extra: algo embaixo (ex.: botão "Tirar").
import { useState } from 'react'
import { LADOS_TIME, chaveEquip, corEnfeite, descrever, urlImg } from './skins.js'
import { useT } from './i18n.js'
import { padraoRaro } from '../../worker/steam-login/src/loja-core.js'

function Imagem({ src, classe = '' }) {
  const [erro, setErro] = useState(false)
  return src && !erro ? <img className={classe} src={src} alt="" loading="lazy" onError={() => setErro(true)} /> : <span className={`inv-sem-img ${classe}`} aria-hidden="true" />
}

const Marca = ({ lado }) => <i className={`inv-marca inv-marca-${lado}`} title={lado === 'ct' ? 'CT' : 'TR'} aria-label={lado === 'ct' ? 'CT' : 'TR'} />

// Selo de padrão raro (blue gem etc.): gema colorida pelo tier, com o nome e quantas vezes vale mais
export function SeloPadrao({ item, classe = '' }) {
  const t = useT()
  const pr = padraoRaro(item)
  if (!pr) return null
  return (
    <span className={`inv-gema inv-gema-${pr.tier} ${classe}`} title={`${pr.nome} · ${t('Padrão')} ${pr.seed} · ×${pr.mult}`}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" opacity=".9" />
        <path d="M2 9h20M9 3 7 9l5 12M15 3l2 6-5 12" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1" />
      </svg>
      <b>{pr.rotulo} T{pr.tier}</b>
    </span>
  )
}

// Só o diamante (na frente do nome da arma): ao passar o mouse mostra o nome do padrão, o tier e quanto vale a mais
export function GemaNome({ item }) {
  const t = useT()
  const pr = padraoRaro(item)
  if (!pr) return null
  const dica = `${pr.rotulo} T${pr.tier} · ${t('Padrão')} ${pr.seed} · ×${pr.mult}`
  return (
    <span className={`inv-gema-i inv-gema-${pr.tier}`} data-dica={dica} role="img" aria-label={dica} tabIndex={0}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" opacity=".92" />
        <path d="M2 9h20M9 3 7 9l5 12M15 3l2 6-5 12" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1" />
      </svg>
    </span>
  )
}

export const nomeDoDesgaste = (f) => (f < 0.07 ? 'Factory New' : f < 0.15 ? 'Minimal Wear' : f < 0.38 ? 'Field-Tested' : f < 0.45 ? 'Well-Worn' : 'Battle-Scarred')

// valor: NP do item (aparece embaixo do nome; no mercado, o preço do anúncio)
export default function CartaoSkin({ item, idx, adesivos, chaveiros, equip, aoAbrirMenu, extra, selecionado, valor }) {
  const t = useT()
  // adesivo/chaveiro guardado (mercado): nome, imagem e cor vêm do catálogo dele ([id, nome, imagem, cor])
  const enfeite = item.t === 'adesivo' || item.t === 'chaveiro'
  const linha = enfeite ? (item.t === 'adesivo' ? adesivos : chaveiros)?.get(item.d) : null
  const d = enfeite ? { titulo: linha?.[1] || `#${item.d}`, subtitulo: t(item.t === 'adesivo' ? 'Adesivo' : 'Chaveiro'), img: urlImg(linha?.[2], 256), cor: corEnfeite(item.t, linha) } : descrever(item, idx)
  const chave = chaveEquip(item)
  const lados = LADOS_TIME.filter(([l]) => equip?.[l]?.[chave] === item.__id)
  const corpo = (
    <>
      <span className="inv-cartao-arte">
        <span className="inv-arma-box">
          <Imagem src={d.img} classe="inv-arma-img" />
        </span>
        {item.t === 'arma' && (item.k?.i > 0 || item.a?.some(Boolean)) && (
          <span className="inv-enfeites">
            {item.k?.i > 0 && <Imagem src={urlImg(chaveiros?.get(item.k.i)?.[2], 64)} classe="inv-enfeite-chaveiro" />}
            <span className="inv-enfeites-fileira">
              {(item.a || []).map((s, k) => (s?.i ? <Imagem key={k} src={urlImg(adesivos?.get(s.i)?.[2], 64)} /> : null))}
            </span>
          </span>
        )}
        <span className="inv-marcas">
          {lados.map(([l]) => (
            <Marca key={l} lado={l} />
          ))}
        </span>
        {item.st ? <span className="inv-st">StatTrak™</span> : null}
        {selecionado !== undefined && <i className={`inv-check${selecionado ? ' on' : ''}`} aria-hidden="true" />}
      </span>
      <span className="inv-cartao-nome">
        <b>
          <GemaNome item={item} />
          {item.n ? `${d.titulo} «${item.n}»` : d.titulo}
        </b>
        <small>{d.subtitulo}</small>
        {d.skin && (
          <em>
            {t(nomeDoDesgaste(Number(item.f)))} · {Number(item.f).toFixed(3)}
          </em>
        )}
        {valor != null && (
          <span className="inv-cartao-valor">
            <img src="/assets/logos/logo-np-64.png" alt="" width="14" height="14" />
            {Number(valor).toLocaleString('pt-BR')} NP
          </span>
        )}
      </span>
    </>
  )
  return (
    <li>
      {aoAbrirMenu ? (
        <button
          type="button"
          className={`inv-cartao${selecionado ? ' inv-cartao-sel' : ''}`}
          aria-pressed={selecionado === undefined ? undefined : selecionado}
          style={{ '--cor': d.cor || '#6b6f76' }}
          onContextMenu={(e) => {
            e.preventDefault()
            aoAbrirMenu(e, item)
          }}
          onClick={(e) => aoAbrirMenu(e, item)}
        >
          {corpo}
        </button>
      ) : (
        <div className="inv-cartao inv-cartao-fixo" style={{ '--cor': d.cor || '#6b6f76' }}>
          {corpo}
        </div>
      )}
      {extra}
    </li>
  )
}
