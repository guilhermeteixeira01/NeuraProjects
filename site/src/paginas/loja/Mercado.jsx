// Aba LOJA DE SKINS da loja (mercado entre jogadores; a LOJA GERAL é o MercadoOficial.jsx): skins que os jogadores anunciaram no inventário ("Vender no mercado"), com quem está vendendo e o preço que escolheu.
// Comprar desconta os NP e põe o item no inventário; o vendedor recebe os NP e uma notificação (worker: src/mercado.js).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConta } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo } from '../../comum/loja.js'
import { EVENTO_MERCADO, cancelarAnuncio, comprarAnuncio, erroDoMercado, lerMercado } from '../../comum/mercado.js'
import { descrever, indicar, useCatalogo } from '../../comum/skins.js'
import { confirmar } from '../../comum/Dialogos.jsx'
import Cartao from '../../comum/CartaoSkin.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { BotaoInspecionar } from '../../comum/InspecionarSkin.jsx'

const TIPOS = [
  ['todos', 'Todos'],
  ['arma', 'Armas'],
  ['faca', 'Facas'],
  ['luva', 'Luvas'],
  ['adesivo', 'Adesivos'],
  ['chaveiro', 'Amuletos'],
]
const ENFEITE = (t) => t === 'adesivo' || t === 'chaveiro'
const ORDENS = [
  ['recente', 'Mais recentes'],
  ['barato', 'Menor preço'],
  ['caro', 'Maior preço'],
]
const numero = (n) => Number(n).toLocaleString('pt-BR')

export default function MercadoJogadores({ saldo, aoMudarSaldo }) {
  const t = useT()
  const conta = useConta()
  const [anuncios, setAnuncios] = useState(null)
  const [erro, setErro] = useState(false)
  const [tipo, setTipo] = useState('todos')
  const [ordem, setOrdem] = useState('recente')
  const [busca, setBusca] = useState('')
  const [soMeus, setSoMeus] = useState(false)
  const [ocupado, setOcupado] = useState('') // id do anúncio sendo comprado/cancelado
  const [aviso, setAviso] = useState(null) // { texto, ok }
  const catalogo = useCatalogo('armas')
  const temEnfeite = !!anuncios?.some((a) => ENFEITE(a.item.t) || a.item.a?.some(Boolean) || a.item.k?.i)
  const adesivos = useCatalogo('adesivos', temEnfeite)
  const chaveiros = useCatalogo('chaveiros', temEnfeite)
  const idx = useMemo(() => indicar(catalogo.dados?.armas, []), [catalogo.dados])
  const adesivosPorId = useMemo(() => new Map((adesivos.dados || []).map((s) => [s[0], s])), [adesivos.dados])
  const chaveirosPorId = useMemo(() => new Map((chaveiros.dados || []).map((s) => [s[0], s])), [chaveiros.dados])

  const carregar = useCallback(() => lerMercado().then((r) => (setAnuncios(r.anuncios), setErro(false)), () => setErro(true)), [])
  useEffect(() => {
    carregar()
    window.addEventListener(EVENTO_MERCADO, carregar)
    return () => window.removeEventListener(EVENTO_MERCADO, carregar)
  }, [carregar])

  const nome = (it) => {
    if (ENFEITE(it.t)) return (it.t === 'adesivo' ? adesivosPorId : chaveirosPorId).get(it.d)?.[1] || `#${it.d}`
    const d = descrever(it, idx)
    return `${d.titulo}${d.subtitulo ? ` | ${d.subtitulo}` : ''}`
  }
  const lista = useMemo(() => {
    if (!anuncios) return []
    const q = busca.trim().toLowerCase()
    const r = anuncios
      .filter((a) => tipo === 'todos' || a.item.t === tipo)
      .filter((a) => !soMeus || a.vendedor === conta?.id)
      .filter((a) => !q || `${nome(a.item)} ${a.vendedorNome}`.toLowerCase().includes(q))
    if (ordem === 'barato') r.sort((a, b) => a.preco - b.preco)
    else if (ordem === 'caro') r.sort((a, b) => b.preco - a.preco)
    else r.sort((a, b) => b.criado - a.criado)
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anuncios, tipo, ordem, busca, soMeus, conta?.id, idx, adesivosPorId, chaveirosPorId])

  const comprar = async (a) => {
    if (saldo != null && saldo < a.preco) return setAviso({ texto: t(erroDoMercado('saldo')), ok: false })
    const ok = await confirmar(t('Comprar {item} de {nome} por {n} NP? O item vai direto para o seu inventário.', { item: nome(a.item), nome: a.vendedorNome || t('outro jogador'), n: numero(a.preco) }), { titulo: t('Comprar no mercado'), ok: t('Comprar') })
    if (!ok) return
    setOcupado(a.id)
    try {
      const r = await comprarAnuncio(a.id)
      avisarSaldo(r.saldo)
      aoMudarSaldo?.()
      setAviso({ texto: t('Comprado! {item} já está no seu inventário.', { item: nome(a.item) }), ok: true })
    } catch (e) {
      setAviso({ texto: t(erroDoMercado(e.message)), ok: false })
    } finally {
      setOcupado('')
      carregar()
    }
  }
  const cancelar = async (a) => {
    if (!(await confirmar(t('Cancelar a venda? O item volta para o seu inventário.'), { ok: t('Cancelar venda'), cancelar: t('Voltar') }))) return
    setOcupado(a.id)
    try {
      await cancelarAnuncio(a.id)
      setAviso({ texto: t('Venda cancelada: o item voltou para o seu inventário.'), ok: true })
    } catch (e) {
      setAviso({ texto: t(erroDoMercado(e.message)), ok: false })
    } finally {
      setOcupado('')
      carregar()
    }
  }

  if (erro && !anuncios) return <p className="lj-dica">{t('Não consegui carregar o mercado. Tente de novo mais tarde.')}</p>
  if (!anuncios || !catalogo.dados) return <CarregandoNP />

  return (
    <section className="lj-mercado" aria-label={t('Mercado')}>
      <p className="lj-mercado-intro">
        {t('Skins, adesivos e amuletos anunciados por outros jogadores. Para vender o seu, abra o inventário, clique no item e escolha "Vender no mercado".')}{' '}
        <a href="/inventario/">{t('Ir para o inventário')}</a>
      </p>
      <div className="lj-filtros lj-mercado-filtros">
        {TIPOS.map(([id, rotulo]) => (
          <button key={id} type="button" className={tipo === id ? 'is-ativo' : ''} onClick={() => setTipo(id)}>
            {t(rotulo)}
          </button>
        ))}
        <button type="button" className={soMeus ? 'is-ativo' : ''} onClick={() => setSoMeus((v) => !v)}>
          {t('Meus anúncios')}
        </button>
        <input type="search" className="lj-mercado-busca" placeholder={t('Pesquisar skin ou vendedor')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="lj-mercado-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label={t('Ordenar')}>
          {ORDENS.map(([id, rotulo]) => (
            <option key={id} value={id}>
              {t(rotulo)}
            </option>
          ))}
        </select>
      </div>
      {aviso && (
        <p className={aviso.ok ? 'lj-aviso' : 'lj-aviso lj-aviso-erro'} role="status">
          {aviso.texto} {aviso.ok && <a href="/inventario/">{t('Ver no inventário')}</a>}
        </p>
      )}
      <ul className="inv-itens lj-mercado-grade">
        {lista.map((a) => {
          const meu = a.vendedor === conta?.id
          return (
            <Cartao
              key={a.id}
              item={{ ...a.item, __id: a.id }}
              idx={idx}
              adesivos={adesivosPorId}
              chaveiros={chaveirosPorId}
              valor={a.preco}
              extra={
                <div className="lj-anuncio">
                  <div className="lj-anuncio-topo">
                    <a className="lj-anuncio-vendedor" href={'/perfil/?id=' + a.vendedor} title={t('Vendido por')}>
                      {a.vendedorAvatar ? <img src={a.vendedorAvatar} alt="" width="22" height="22" loading="lazy" /> : <i aria-hidden="true" />}
                      <span>{meu ? t('Você está vendendo') : a.vendedorNome || t('Jogador')}</span>
                    </a>
                    {a.ref != null && <small className="lj-anuncio-ref" title={t('Referência: {n} NP', { n: numero(a.ref) })}>{t('Ref. {n}', { n: numero(a.ref) })}</small>}
                  </div>
                  <div className="lj-anuncio-acoes">
                    <BotaoInspecionar item={{ ...a.item, __id: a.id }} classe="lj-anuncio-insp" />
                    {meu ? (
                      <button type="button" className="lj-btn" disabled={ocupado === a.id} onClick={() => cancelar(a)}>
                        {ocupado === a.id ? t('Cancelando…') : t('Cancelar venda')}
                      </button>
                    ) : (
                      <button type="button" className="lj-btn lj-btn-p" disabled={!!ocupado} onClick={() => comprar(a)}>
                        {ocupado === a.id ? t('Comprando…') : t('Comprar')}
                      </button>
                    )}
                  </div>
                </div>
              }
            />
          )
        })}
        {!lista.length && <li className="inv-nada">{anuncios.length ? t('Nenhum anúncio encontrado.') : t('Ninguém está vendendo nada no momento.')}</li>}
      </ul>
    </section>
  )
}
