// Mercado oficial (aba Pontos do painel): preço do Boost e do Freeze, molduras/cards/fundos à venda e kits (card + moldura + fundo).
// Enfeite à venda (solto ou em kit) fica travado no Personalizar até o jogador comprar. Worker: src/loja-oficial.js (GET/POST /admin/loja-oficial).
import { useEffect, useMemo, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { useT } from '../../comum/i18n.js'
import { MOLDURAS } from '../../comum/molduras.js'
import { CARDS } from '../../comum/cardsPerfil.js'
import { FUNDOS_PERFIL } from '../../../worker/steam-login/src/fundos-perfil.js'
import { infoEnfeite } from '../loja/MercadoOficial.jsx'

const TIPOS = [
  ['moldura', 'Moldura'],
  ['card', 'Card'],
  ['fundo', 'Fundo de perfil'],
]
const OPCOES = {
  moldura: MOLDURAS.map((m) => [m.id, `${m.nome} · ${m.colecao}`]),
  card: CARDS.map((c) => [c, c]),
  fundo: FUNDOS_PERFIL.map((f) => [f, infoEnfeite('fundo', f).nome]),
}
const inteiro = (v) => Math.max(0, Math.round(Number(v) || 0))

// Campo com busca (datalist) para escolher uma moldura/card/fundo pelo id
function Escolher({ tipo, valor, mudar, rotulo }) {
  const lista = `adm-mo-${tipo}`
  return (
    <label className="adm-mo-campo">
      <span>{rotulo}</span>
      <input list={lista} value={valor} onChange={(e) => mudar(e.target.value.trim())} placeholder={tipo === 'card' ? 'tema/arquivo.webp' : tipo === 'moldura' ? 'colecao/nome' : 'mirage'} />
      <datalist id={lista}>
        {OPCOES[tipo].map(([id, nome]) => (
          <option key={id} value={id}>
            {nome}
          </option>
        ))}
      </datalist>
    </label>
  )
}

export default function MercadoOficialAdmin() {
  const t = useT()
  const [cat, setCat] = useState(null)
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)
  const [novo, setNovo] = useState({ tipo: 'moldura', id: '', preco: 1000 })
  const [kit, setKit] = useState({ nome: '', card: '', moldura: '', fundo: '', preco: 2500 })

  useEffect(() => {
    chamar('/admin/loja-oficial').then(setCat, () => setEstado({ texto: t('Não deu para ler o catálogo.'), ok: false }))
  }, [t])
  const validos = useMemo(() => Object.fromEntries(Object.entries(OPCOES).map(([k, l]) => [k, new Set(l.map(([id]) => id))])), [])

  const salvar = async (proximo) => {
    setOcupado(true)
    setEstado({ texto: '', ok: true })
    try {
      setCat(await chamar('/admin/loja-oficial', proximo))
      setEstado({ texto: t('Catálogo salvo.'), ok: true })
    } catch {
      setEstado({ texto: t('Não deu para salvar.'), ok: false })
    } finally {
      setOcupado(false)
    }
  }
  if (!cat) return <div className="caixa adm-pt adm-mo">{estado.texto || t('Carregando…')}</div>

  const adicionar = () => {
    if (!validos[novo.tipo].has(novo.id)) return setEstado({ texto: t('Escolha um item da lista.'), ok: false })
    if (!inteiro(novo.preco)) return setEstado({ texto: t('Coloque um preço maior que zero.'), ok: false })
    const itens = [...cat.itens.filter((x) => !(x.tipo === novo.tipo && x.id === novo.id)), { tipo: novo.tipo, id: novo.id, preco: inteiro(novo.preco) }]
    salvar({ ...cat, itens })
    setNovo((n) => ({ ...n, id: '' }))
  }
  const criarKit = () => {
    const partes = ['card', 'moldura', 'fundo'].filter((p) => kit[p])
    if (!kit.nome.trim() || !partes.length || partes.some((p) => !validos[p].has(kit[p]))) return setEstado({ texto: t('Dê um nome e escolha pelo menos uma peça válida.'), ok: false })
    if (!inteiro(kit.preco)) return setEstado({ texto: t('Coloque um preço maior que zero.'), ok: false })
    const id = `kit-${kit.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'novo'}-${Date.now().toString(36).slice(-4)}`
    salvar({ ...cat, kits: [...cat.kits, { id, nome: kit.nome.trim(), preco: inteiro(kit.preco), ...Object.fromEntries(partes.map((p) => [p, kit[p]])) }] })
    setKit({ nome: '', card: '', moldura: '', fundo: '', preco: 2500 })
  }

  return (
    <div className="caixa adm-pt adm-mo">
      <h3>{t('Mercado oficial')}</h3>
      <p className="adm-dar-dica">{t('O que o site vende por NP na aba Mercado da loja. Moldura, card ou fundo à venda (solto ou dentro de um kit) fica travado no Personalizar até o jogador comprar; quem comprou usa para sempre. Preço 0 tira o Boost/Freeze da venda.')}</p>

      <div className="adm-mo-linha">
        {['boost', 'freeze'].map((k) => (
          <label key={k} className="adm-mo-campo">
            <span>{k === 'boost' ? 'Boost' : 'Freeze'} (NP)</span>
            <input type="number" min="0" value={cat.consumiveis[k]} onChange={(e) => setCat((c) => ({ ...c, consumiveis: { ...c.consumiveis, [k]: inteiro(e.target.value) } }))} />
          </label>
        ))}
        <button type="button" className="adm-mo-salvar" disabled={ocupado} onClick={() => salvar(cat)}>
          {t('Salvar preços')}
        </button>
      </div>

      <h4>{t('Itens à venda')}</h4>
      <div className="adm-mo-linha">
        <label className="adm-mo-campo">
          <span>{t('Tipo')}</span>
          <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value, id: '' })}>
            {TIPOS.map(([id, nome]) => (
              <option key={id} value={id}>
                {t(nome)}
              </option>
            ))}
          </select>
        </label>
        <Escolher tipo={novo.tipo} valor={novo.id} mudar={(id) => setNovo({ ...novo, id })} rotulo={t('Item')} />
        <label className="adm-mo-campo adm-mo-preco">
          <span>{t('Preço (NP)')}</span>
          <input type="number" min="1" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} />
        </label>
        <button type="button" className="adm-mo-salvar" disabled={ocupado} onClick={adicionar}>
          {t('Pôr à venda')}
        </button>
      </div>
      {cat.itens.length > 0 && (
        <ul className="adm-mo-lista">
          {cat.itens.map((x) => {
            const info = infoEnfeite(x.tipo, x.id)
            return (
              <li key={`${x.tipo}:${x.id}`}>
                <img src={info.img} alt="" loading="lazy" />
                <span>
                  <small>{t(TIPOS.find(([id]) => id === x.tipo)[1])}</small>
                  <b>{info.nome}</b>
                </span>
                <input type="number" min="1" value={x.preco} aria-label={t('Preço (NP)')} onChange={(e) => setCat((c) => ({ ...c, itens: c.itens.map((y) => (y === x ? { ...y, preco: inteiro(e.target.value) } : y)) }))} onBlur={() => salvar(cat)} />
                <button type="button" disabled={ocupado} onClick={() => salvar({ ...cat, itens: cat.itens.filter((y) => y !== x) })}>
                  {t('Tirar')}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h4>{t('Kits')}</h4>
      <div className="adm-mo-linha">
        <label className="adm-mo-campo">
          <span>{t('Nome do kit')}</span>
          <input value={kit.nome} maxLength={60} onChange={(e) => setKit({ ...kit, nome: e.target.value })} />
        </label>
        {TIPOS.map(([tipo, nome]) => (
          <Escolher key={tipo} tipo={tipo} valor={kit[tipo]} mudar={(id) => setKit({ ...kit, [tipo]: id })} rotulo={t(nome)} />
        ))}
        <label className="adm-mo-campo adm-mo-preco">
          <span>{t('Preço (NP)')}</span>
          <input type="number" min="1" value={kit.preco} onChange={(e) => setKit({ ...kit, preco: e.target.value })} />
        </label>
        <button type="button" className="adm-mo-salvar" disabled={ocupado} onClick={criarKit}>
          {t('Criar kit')}
        </button>
      </div>
      {cat.kits.length > 0 && (
        <ul className="adm-mo-lista">
          {cat.kits.map((k) => (
            <li key={k.id}>
              {k.card ? <img src={infoEnfeite('card', k.card).img} alt="" loading="lazy" /> : <i />}
              <span>
                <small>{['card', 'moldura', 'fundo'].filter((p) => k[p]).map((p) => infoEnfeite(p, k[p]).nome).join(' · ')}</small>
                <b>{k.nome}</b>
              </span>
              <input type="number" min="1" value={k.preco} aria-label={t('Preço (NP)')} onChange={(e) => setCat((c) => ({ ...c, kits: c.kits.map((y) => (y === k ? { ...y, preco: inteiro(e.target.value) } : y)) }))} onBlur={() => salvar(cat)} />
              <button type="button" disabled={ocupado} onClick={() => salvar({ ...cat, kits: cat.kits.filter((y) => y !== k) })}>
                {t('Tirar')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {estado.texto && <p className={estado.ok ? 'adm-dar-estado' : 'adm-pt-erro'}>{estado.texto}</p>}
    </div>
  )
}
