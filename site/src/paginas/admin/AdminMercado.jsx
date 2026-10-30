// Loja de personalização (aba Loja do painel): preço do Boost e do Freeze, molduras/cards/fundos à venda e kits (card + moldura + fundo).
// Escolhe-se clicando na miniatura; enfeite à venda (solto ou em kit) fica travado no Personalizar até o jogador comprar.
// Worker: src/loja-oficial.js (GET/POST /admin/loja-oficial).
import { useEffect, useMemo, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { useT } from '../../comum/i18n.js'
import { MOLDURAS } from '../../comum/molduras.js'
import { CARDS } from '../../comum/cardsPerfil.js'
import { FUNDOS_PERFIL } from '../../../worker/steam-login/src/fundos-perfil.js'
import { infoEnfeite } from '../loja/MercadoOficial.jsx'

const TIPOS = [
  ['moldura', 'Molduras', 'Moldura'],
  ['card', 'Cards', 'Card'],
  ['fundo', 'Fundos', 'Fundo de perfil'],
]
const IDS = { moldura: MOLDURAS.map((m) => m.id), card: CARDS, fundo: FUNDOS_PERFIL }
const inteiro = (v) => Math.max(0, Math.round(Number(v) || 0))
const numero = (n) => Number(n).toLocaleString('pt-BR')
const rotulo = (tipo) => TIPOS.find(([id]) => id === tipo)[2]

export default function MercadoOficialAdmin() {
  const t = useT()
  const [cat, setCat] = useState(null)
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)
  const [tipo, setTipo] = useState('moldura')
  const [busca, setBusca] = useState('')
  const [escolha, setEscolha] = useState({}) // { moldura?, card?, fundo? } clicados na grade
  const [preco, setPreco] = useState(1000)
  const [nomeKit, setNomeKit] = useState('')

  useEffect(() => {
    chamar('/admin/loja-oficial').then(setCat, () => setEstado({ texto: t('Não deu para ler o catálogo.'), ok: false }))
  }, [t])

  const grade = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return IDS[tipo].map((id) => ({ id, ...infoEnfeite(tipo, id) })).filter((x) => !q || `${x.nome} ${x.sub} ${x.id}`.toLowerCase().includes(q))
  }, [tipo, busca])

  const salvar = async (proximo, texto = t('Salvo.')) => {
    setOcupado(true)
    try {
      setCat(await chamar('/admin/loja-oficial', proximo))
      setEstado({ texto, ok: true })
      return true
    } catch {
      setEstado({ texto: t('Não deu para salvar.'), ok: false })
      return false
    } finally {
      setOcupado(false)
    }
  }
  if (!cat) return <section className="adm-mo">{estado.texto || t('Carregando…')}</section>

  const escolhidas = TIPOS.map(([tp]) => tp).filter((tp) => escolha[tp])
  const aVenda = (tp, id) => cat.itens.some((x) => x.tipo === tp && x.id === id)
  const venderSoltos = async () => {
    if (!inteiro(preco)) return setEstado({ texto: t('Coloque um preço maior que zero.'), ok: false })
    const novos = escolhidas.map((tp) => ({ tipo: tp, id: escolha[tp], preco: inteiro(preco) }))
    const itens = [...cat.itens.filter((x) => !novos.some((n) => n.tipo === x.tipo && n.id === x.id)), ...novos]
    if (await salvar({ ...cat, itens }, t('Posto à venda.'))) setEscolha({})
  }
  const criarKit = async () => {
    if (!nomeKit.trim()) return setEstado({ texto: t('Dê um nome ao kit.'), ok: false })
    if (!inteiro(preco)) return setEstado({ texto: t('Coloque um preço maior que zero.'), ok: false })
    const id = `kit-${nomeKit.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'novo'}-${Date.now().toString(36).slice(-4)}`
    const kit = { id, nome: nomeKit.trim(), preco: inteiro(preco), ...Object.fromEntries(escolhidas.map((tp) => [tp, escolha[tp]])) }
    if (await salvar({ ...cat, kits: [...cat.kits, kit] }, t('Kit criado.'))) {
      setEscolha({})
      setNomeKit('')
    }
  }
  const mudarPreco = (lista, alvo, valor) => setCat((c) => ({ ...c, [lista]: c[lista].map((y) => (y === alvo ? { ...y, preco: inteiro(valor) } : y)) }))

  return (
    <section className="adm-mo">
      <header className="adm-mo-cab">
        <h3>{t('Loja de personalização')}</h3>
        <p>{t('Item à venda fica travado no Personalizar até o jogador comprar. Preço 0 tira o Boost/Freeze da venda.')}</p>
      </header>

      <div className="adm-mo-consumiveis">
        {['boost', 'freeze'].map((k) => (
          <label key={k}>
            <span>{k === 'boost' ? 'Boost' : 'Freeze'}</span>
            <input type="number" min="0" value={cat.consumiveis[k]} onChange={(e) => setCat((c) => ({ ...c, consumiveis: { ...c.consumiveis, [k]: inteiro(e.target.value) } }))} onBlur={() => salvar(cat)} />
            <small>NP</small>
          </label>
        ))}
      </div>

      <h4>{t('Adicionar')}</h4>
      <div className="adm-mo-barra">
        <div className="adm-mo-abas" role="tablist">
          {TIPOS.map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={tipo === id} className={tipo === id ? 'is-ativo' : ''} onClick={() => setTipo(id)}>
              {t(nome)}
            </button>
          ))}
        </div>
        <input type="search" className="adm-mo-busca" placeholder={t('Buscar...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <ul className={`adm-mo-grade adm-mo-grade-${tipo}`}>
        {grade.map((x) => (
          <li key={x.id}>
            <button type="button" className={`${escolha[tipo] === x.id ? 'is-sel' : ''}${aVenda(tipo, x.id) ? ' is-venda' : ''}`} title={x.nome} onClick={() => setEscolha((e) => ({ ...e, [tipo]: e[tipo] === x.id ? undefined : x.id }))}>
              <img src={x.img} alt="" loading="lazy" />
              <span>{x.nome}</span>
            </button>
          </li>
        ))}
      </ul>

      {escolhidas.length > 0 && (
        <div className="adm-mo-acao">
          <div className="adm-mo-escolhas">
            {escolhidas.map((tp) => (
              <button key={tp} type="button" title={t('Tirar')} onClick={() => setEscolha((e) => ({ ...e, [tp]: undefined }))}>
                <small>{t(rotulo(tp))}</small> {infoEnfeite(tp, escolha[tp]).nome} ×
              </button>
            ))}
          </div>
          <label className="adm-mo-preco">
            <input type="number" min="1" value={preco} onChange={(e) => setPreco(e.target.value)} aria-label={t('Preço (NP)')} />
            <small>NP</small>
          </label>
          <button type="button" className="adm-mo-btn" disabled={ocupado} onClick={venderSoltos}>
            {escolhidas.length > 1 ? t('Vender separados') : t('Pôr à venda')}
          </button>
          <input className="adm-mo-nome" value={nomeKit} maxLength={60} placeholder={t('Nome do kit')} onChange={(e) => setNomeKit(e.target.value)} />
          <button type="button" className="adm-mo-btn adm-mo-btn-2" disabled={ocupado} onClick={criarKit}>
            {t('Criar kit')}
          </button>
        </div>
      )}

      {(cat.itens.length > 0 || cat.kits.length > 0) && <h4>{t('À venda')}</h4>}
      <ul className="adm-mo-lista">
        {cat.kits.map((k) => (
          <li key={k.id}>
            <img src={infoEnfeite(k.card ? 'card' : k.moldura ? 'moldura' : 'fundo', k.card || k.moldura || k.fundo).img} alt="" loading="lazy" />
            <span>
              <b>{k.nome}</b>
              <small>
                {t('Kit')} · {['card', 'moldura', 'fundo'].filter((p) => k[p]).map((p) => infoEnfeite(p, k[p]).nome).join(' · ')}
              </small>
            </span>
            <input type="number" min="1" value={k.preco} aria-label={t('Preço (NP)')} onChange={(e) => mudarPreco('kits', k, e.target.value)} onBlur={() => salvar(cat)} />
            <button type="button" aria-label={t('Tirar')} disabled={ocupado} onClick={() => salvar({ ...cat, kits: cat.kits.filter((y) => y !== k) })}>
              ×
            </button>
          </li>
        ))}
        {cat.itens.map((x) => {
          const info = infoEnfeite(x.tipo, x.id)
          return (
            <li key={`${x.tipo}:${x.id}`}>
              <img src={info.img} alt="" loading="lazy" />
              <span>
                <b>{info.nome}</b>
                <small>{t(rotulo(x.tipo))}</small>
              </span>
              <input type="number" min="1" value={x.preco} aria-label={t('Preço (NP)')} title={`${numero(x.preco)} NP`} onChange={(e) => mudarPreco('itens', x, e.target.value)} onBlur={() => salvar(cat)} />
              <button type="button" aria-label={t('Tirar')} disabled={ocupado} onClick={() => salvar({ ...cat, itens: cat.itens.filter((y) => y !== x) })}>
                ×
              </button>
            </li>
          )
        })}
      </ul>
      {estado.texto && <p className={estado.ok ? 'adm-mo-ok' : 'adm-mo-erro'} role="status">{estado.texto}</p>}
    </section>
  )
}
