// "Ver inventário" do perfil: mostra (só leitura) o que o jogador tem. Dados: worker GET /skins/inventario?id= (público, sem login).
// Skins, facas e luvas com adesivos/chaveiro colados e onde estão equipadas (CT/TR); adesivos, chaveiros e caixas guardados, agrupados com a quantidade.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CartaoSkin from './CartaoSkin.jsx'
import { CONFIG } from './config.js'
import { useT } from './i18n.js'
import { lerCaixasPublicas } from './loja.js'
import { indicar, urlImg, useCatalogo } from './skins.js'

const ABAS = [
  ['tudo', 'TUDO'],
  ['arma', 'ARMAS'],
  ['faca', 'FACAS'],
  ['luva', 'LUVAS'],
  ['adesivo', 'ADESIVOS'],
  ['chaveiro', 'CHAVEIROS'],
  ['caixa', 'CAIXAS'],
]
const GUARDADOS = new Set(['adesivo', 'chaveiro', 'caixa'])

function Imagem({ src }) {
  const [erro, setErro] = useState(false)
  return src && !erro ? <img src={src} alt="" loading="lazy" onError={() => setErro(true)} /> : <span className="inv-sem-img" aria-hidden="true" />
}

export default function InventarioDoJogador({ steamId, nome, aoFechar }) {
  const t = useT()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(false)
  const [aba, setAba] = useState('tudo')
  const catalogo = useCatalogo('armas')
  const adesivos = useCatalogo('adesivos')
  const chaveiros = useCatalogo('chaveiros')
  const [caixas, setCaixas] = useState([])

  useEffect(() => {
    let vivo = true
    fetch(`${CONFIG.loginSteam.replace(/\/$/, '')}/skins/inventario?id=${encodeURIComponent(steamId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => vivo && setDados(d))
      .catch(() => vivo && setErro(true))
    lerCaixasPublicas().then((c) => vivo && setCaixas(c))
    return () => {
      vivo = false
    }
  }, [steamId])
  useEffect(() => {
    document.documentElement.classList.add('ins-estante-aberta') // mesmo fundo embaçado da estante de insígnias
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => {
      document.documentElement.classList.remove('ins-estante-aberta')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])

  const idx = useMemo(() => indicar(catalogo.dados?.armas, []), [catalogo.dados])
  const mapaAd = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const mapaCh = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])

  const itens = useMemo(() => Object.entries(dados?.itens || {}).map(([id, it]) => ({ ...it, __id: id })), [dados])
  const cartoes = useMemo(
    () => itens.filter((i) => !GUARDADOS.has(i.t) && i.t !== 'agente').sort((a, b) => (dados?.criado?.[b.__id] || 0) - (dados?.criado?.[a.__id] || 0)),
    [itens, dados],
  )
  // guardados agrupados: { tipo, def, n }
  const grupos = useMemo(() => {
    const g = new Map()
    for (const i of itens) if (GUARDADOS.has(i.t)) g.set(`${i.t}:${i.d}`, { tipo: i.t, def: i.d, n: (g.get(`${i.t}:${i.d}`)?.n || 0) + 1 })
    return [...g.values()]
  }, [itens])
  const contagem = (id) => (id === 'tudo' ? cartoes.length + grupos.reduce((a, g) => a + g.n, 0) : GUARDADOS.has(id) ? grupos.filter((g) => g.tipo === id).reduce((a, g) => a + g.n, 0) : cartoes.filter((c) => c.t === id).length)
  const verCartoes = aba === 'tudo' ? cartoes : cartoes.filter((c) => c.t === aba)
  const verGrupos = aba === 'tudo' ? grupos : grupos.filter((g) => g.tipo === aba)
  const dadosDoGrupo = (g) => {
    if (g.tipo === 'caixa') {
      const c = caixas.find((x) => x.id === g.def)
      return { nome: c?.nome || `#${g.def}`, img: c?.img, sub: t('Caixa fechada'), cor: c?.cor }
    }
    const linha = (g.tipo === 'adesivo' ? mapaAd : mapaCh).get(g.def)
    return { nome: linha?.[1] || `#${g.def}`, img: linha ? urlImg(linha[2], 256) : '', sub: g.tipo === 'adesivo' ? t('Adesivo') : t('Chaveiro'), cor: linha?.[3] }
  }

  return createPortal(
    <div className="ins-est-fundo" onClick={aoFechar}>
      <div className="ins-est ij-janela" role="dialog" aria-modal="true" aria-label={t('Inventário')} onClick={(e) => e.stopPropagation()}>
        <header className="ins-est-cab">
          <h2>
            {t('Inventário de')} {nome}
          </h2>
          {dados && <span>{contagem('tudo')}</span>}
          <button type="button" className="ins-est-fechar" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <nav className="ij-abas" role="tablist">
          {ABAS.map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativo' : ''} onClick={() => setAba(id)}>
              {t(rotulo)} <small>{contagem(id)}</small>
            </button>
          ))}
        </nav>
        {erro ? (
          <p className="ij-vazio">{t('Não consegui carregar o inventário agora.')}</p>
        ) : !dados || !catalogo.dados ? (
          <p className="ij-vazio">{t('Carregando…')}</p>
        ) : !verCartoes.length && !verGrupos.length ? (
          <p className="ij-vazio">{t('Nada por aqui.')}</p>
        ) : (
          <ul className="inv-itens ij-itens">
            {verCartoes.map((it) => (
              <CartaoSkin key={it.__id} item={it} idx={idx} adesivos={mapaAd} chaveiros={mapaCh} equip={dados.equip} />
            ))}
            {verGrupos.map((g) => {
              const d = dadosDoGrupo(g)
              return (
                <li key={`${g.tipo}${g.def}`}>
                  <div className="inv-cartao inv-cartao-fixo" style={{ '--cor': d.cor || '#6b6f76' }}>
                    <span className="inv-cartao-arte">
                      <span className="inv-arma-box">
                        <Imagem src={d.img} />
                      </span>
                      <span className="inv-st">×{g.n}</span>
                    </span>
                    <span className="inv-cartao-nome">
                      <b>{d.nome}</b>
                      <small>{d.sub}</small>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
