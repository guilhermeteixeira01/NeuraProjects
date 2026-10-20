// Aba "Caixas" do painel (só o dono): taxas e desgaste do sorteio, as caixas da loja (nome, preço, itens e pesos), NP de um jogador e a
// reconferência das insígnias. O worker (src/loja.js) valida tudo de novo ao salvar.
import { useEffect, useMemo, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { useT } from '../../comum/i18n.js'
import { urlImgArma, useCatalogo } from '../../comum/skins.js'
import { RARIDADES, raridadeDaCor } from '../../../worker/steam-login/src/loja-core.js'

const erroTexto = (e) => ({ login: 'Seu login venceu. Entre de novo com a Steam.', dono: 'Só o dono mexe na loja.', caixas: 'Lista de caixas inválida (nomes repetidos?).', taxas: 'As taxas não podem ser todas zero.', id: 'SteamID64 inválido.' })[e.message] || 'Não deu para salvar. Tente de novo.'
const slugDe = (nome) => nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

// escolhe arma + skin do catálogo; devolve a linha pronta
function EscolherSkin({ armas, facas, aoEscolher, rotulo }) {
  const t = useT()
  const lista = armas.filter((a) => (facas ? a.c === 'facas' : ['rifles', 'smgs', 'pistols', 'heavy'].includes(a.c)))
  const [d, setD] = useState(lista[0]?.d)
  const [filtro, setFiltro] = useState('')
  const arma = lista.find((a) => a.d === d) || lista[0]
  const skins = (arma?.s || []).filter((s) => !filtro || s[1].toLowerCase().includes(filtro.toLowerCase()))
  const [p, setP] = useState('')
  const skin = skins.find((s) => String(s[0]) === String(p)) || skins[0]
  return (
    <div className="adm-cx-add">
      <select value={arma?.d ?? ''} onChange={(e) => setD(Number(e.target.value))} aria-label={t('Arma')}>
        {lista.map((a) => (
          <option key={a.d} value={a.d}>
            {a.n}
          </option>
        ))}
      </select>
      <input type="search" placeholder={t('Filtrar skin')} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      <select value={skin?.[0] ?? ''} onChange={(e) => setP(e.target.value)} aria-label={t('Skin')}>
        {skins.map((s) => (
          <option key={s[0]} value={s[0]}>
            {s[1]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost" disabled={!arma || !skin} onClick={() => aoEscolher(arma, skin)}>
        {rotulo}
      </button>
    </div>
  )
}

function EditorCaixa({ c, armas, achar, mudar, remover }) {
  const t = useT()
  const nomeDe = (x) => {
    const a = achar.get(`${x.d}:${x.p}`)
    return a ? `${a.arma.n} | ${a.skin[1]}` : `#${x.d}/${x.p}`
  }
  const setItem = (lista, i, parte) => mudar({ [lista]: c[lista].map((x, k) => (k === i ? { ...x, ...parte } : x)) })
  const tirar = (lista, i) => mudar({ [lista]: c[lista].filter((_, k) => k !== i) })
  const peso = (lista, x, i) => <input type="number" min="1" max="100000" value={x.w} onChange={(e) => setItem(lista, i, { w: Math.max(1, Number(e.target.value) || 1) })} aria-label={t('Peso')} className="adm-cx-peso" />
  return (
    <div className="adm-cx-corpo">
      <div className="adm-cx-campos">
        <label>
          {t('Nome')}
          <input type="text" value={c.nome} maxLength={40} onChange={(e) => mudar({ nome: e.target.value })} />
        </label>
        <label>
          {t('Preço (NP)')}
          <input type="number" min="1" value={c.preco} onChange={(e) => mudar({ preco: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label>
          {t('Faixa')}
          <select value={c.tier} onChange={(e) => mudar({ tier: e.target.value })}>
            <option value="barata">{t('Barata')}</option>
            <option value="media">{t('Média')}</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <label>
          {t('Cor')}
          <input type="color" value={c.cor} onChange={(e) => mudar({ cor: e.target.value })} />
        </label>
        <label className="adm-cx-ativa">
          <input type="checkbox" checked={c.ativa !== false} onChange={(e) => mudar({ ativa: e.target.checked })} /> {t('À venda')}
        </label>
        <label>
          {t('Imagem')}
          <input type="text" value={c.img} onChange={(e) => mudar({ img: e.target.value })} />
        </label>
        <button type="button" className="btn btn-ghost adm-perigo" onClick={() => window.confirm(t('Apagar esta caixa? (Quem tem ela fechada no inventário continua com o item, mas não consegue abrir.)')) && remover()}>
          {t('Apagar caixa')}
        </button>
      </div>

      <h4>{t('Skins')} ({c.itens.length})</h4>
      <EscolherSkin armas={armas} aoEscolher={(a, s) => mudar({ itens: [...c.itens, { d: a.d, p: s[0], r: raridadeDaCor(s[2]), w: 100, min: s[3], max: s[4], l: s[7] ? 1 : 0 }] })} rotulo={t('Adicionar skin')} />
      <ul className="adm-cx-lista">
        {[4, 3, 2, 1, 0].flatMap((r) =>
          c.itens.map((x, i) => ({ x, i })).filter((y) => y.x.r === r).map(({ x, i }) => (
            <li key={`${x.d}:${x.p}`} style={{ '--cor': RARIDADES[r].cor }}>
              <i />
              <span>{nomeDe(x)}</span>
              <select value={x.r} onChange={(e) => setItem('itens', i, { r: Number(e.target.value) })} aria-label={t('Raridade')}>
                {RARIDADES.slice(0, 5).map((q) => (
                  <option key={q.id} value={q.id}>
                    {t(q.nome)}
                  </option>
                ))}
              </select>
              {peso('itens', x, i)}
              <button type="button" onClick={() => tirar('itens', i)} aria-label={t('Tirar')}>
                ×
              </button>
            </li>
          )),
        )}
      </ul>

      <h4>{t('Facas (item raro especial)')} ({c.facas.length})</h4>
      <EscolherSkin armas={armas} facas aoEscolher={(a, s) => mudar({ facas: [...c.facas, { d: a.d, p: s[0], w: 100, min: s[3], max: s[4], l: s[7] ? 1 : 0 }] })} rotulo={t('Adicionar faca')} />
      <ul className="adm-cx-lista">
        {c.facas.map((x, i) => (
          <li key={`${x.d}:${x.p}`} style={{ '--cor': RARIDADES[5].cor }}>
            <i />
            <span>{nomeDe(x)}</span>
            {peso('facas', x, i)}
            <button type="button" onClick={() => tirar('facas', i)} aria-label={t('Tirar')}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AdminCaixas() {
  const t = useT()
  const catalogo = useCatalogo('armas')
  const [caixas, setCaixas] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [estado, setEstado] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    chamar('/admin/caixas-lista', {}).then(setCaixas, (e) => setEstado(erroTexto(e)))
    chamar('/admin/loja-config', {}).then(setCfg, () => {})
  }, [])
  const armas = catalogo.dados?.armas || []
  const achar = useMemo(() => {
    const m = new Map()
    for (const a of armas) for (const s of a.s) m.set(`${a.d}:${s[0]}`, { arma: a, skin: s })
    return m
  }, [armas])

  const rodar = async (fn, ok) => {
    setOcupado(true)
    setEstado('')
    try {
      await fn()
      if (ok) setEstado(ok)
    } catch (e) {
      setEstado(erroTexto(e))
    } finally {
      setOcupado(false)
    }
  }
  const mudarCaixa = (id, parte) => setCaixas((l) => l.map((c) => (c.id === id ? { ...c, ...parte } : c)))
  const nova = () => {
    const nome = window.prompt(t('Nome da caixa nova:'))?.trim()
    if (!nome) return
    let slug = slugDe(nome) || 'caixa'
    if (caixas.some((c) => c.slug === slug)) slug += '-2'
    const id = Math.max(0, ...caixas.map((c) => c.id)) + 1
    setCaixas((l) => [...l, { id, slug, nome, img: `/assets/caixas/web/${slug}.webp`, preco: 500, tier: 'media', ativa: false, cor: '#8aa0c0', itens: [], facas: [] }])
  }

  if (!caixas || !catalogo.dados) return <p>{estado || t('Carregando…')}</p>
  const somaTaxas = cfg ? cfg.taxas.reduce((a, b) => a + Number(b || 0), 0) : 0
  return (
    <div className="caixa adm-cx">
      <p className="adm-dar-dica">{t('Loja de caixas: só o dono mexe aqui. Mudanças valem na hora para quem abrir a loja depois de salvar.')}</p>

      {cfg && (
        <section className="adm-cx-bloco">
          <h3>{t('Taxas do sorteio')}</h3>
          <div className="adm-cx-taxas">
            {RARIDADES.map((r, i) => (
              <label key={r.id} style={{ '--cor': r.cor }}>
                {t(r.nome)} (%)
                <input type="number" min="0" max="100" step="0.1" value={cfg.taxas[i]} onChange={(e) => setCfg({ ...cfg, taxas: cfg.taxas.map((x, k) => (k === i ? e.target.value : x)) })} />
              </label>
            ))}
          </div>
          <p className="adm-dar-dica">
            {t('Soma')}: {somaTaxas.toFixed(2)}% {Math.abs(somaTaxas - 100) > 0.001 && `· ${t('não precisa fechar 100: o servidor ajusta na mesma proporção')}`}
          </p>
          <h3>{t('Desgaste (chance de cada faixa, %)')}</h3>
          <div className="adm-cx-taxas">
            {cfg.desgaste.map((f, i) => (
              <label key={f.nome}>
                {f.nome}
                <input type="number" min="0" max="100" step="0.1" value={f.chance} onChange={(e) => setCfg({ ...cfg, desgaste: cfg.desgaste.map((x, k) => (k === i ? { ...x, chance: e.target.value } : x)) })} />
              </label>
            ))}
            <label>
              {t('Máx. por abertura')}
              <input type="number" min="1" max="10" value={cfg.maxQtd} onChange={(e) => setCfg({ ...cfg, maxQtd: e.target.value })} />
            </label>
          </div>
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => rodar(async () => setCfg(await chamar('/admin/loja-config', { taxas: cfg.taxas.map(Number), desgaste: cfg.desgaste.map((f) => ({ chance: Number(f.chance) })), maxQtd: Number(cfg.maxQtd) })), t('Taxas salvas!'))}>
            {t('Salvar taxas')}
          </button>
        </section>
      )}

      <section className="adm-cx-bloco">
        <h3>{t('Caixas')} ({caixas.length})</h3>
        {caixas.map((c) => (
          <details key={c.id} className="adm-cx-caixa">
            <summary style={{ '--cor': c.cor }}>
              <img src={c.img} alt="" width="46" height="46" />
              <b>{c.nome}</b>
              <em>
                {c.tier} · {c.preco} NP · {c.itens.length} skins · {c.facas.length} facas {c.ativa === false && `· ${t('fora de venda')}`}
              </em>
            </summary>
            <EditorCaixa c={c} armas={armas} achar={achar} mudar={(parte) => mudarCaixa(c.id, parte)} remover={() => setCaixas((l) => l.filter((x) => x.id !== c.id))} />
          </details>
        ))}
        <div className="adm-cx-barra">
          <button type="button" className="btn btn-ghost" onClick={nova}>
            {t('+ Nova caixa')}
          </button>
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => rodar(async () => await chamar('/admin/caixas', { caixas }), t('Caixas salvas!'))}>
            {t('Salvar caixas')}
          </button>
        </div>
      </section>

      {estado && <p className="adm-dar-estado">{estado}</p>}
    </div>
  )
}
