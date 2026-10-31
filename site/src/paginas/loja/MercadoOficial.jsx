// Loja geral (aba LOJA GERAL da loja): o site vende por NP os itens de partida do lobby (Boost/Freeze) e os
// enfeites do perfil que o admin pôs à venda: molduras, cards, fundos de perfil e kits (card + moldura + fundo juntos).
// Enfeite comprado fica liberado para sempre no Personalizar do perfil. Worker: src/loja-oficial.js.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../comum/i18n.js'
import { EVENTO_OFICIAL, avisarSaldo, comprarOficial, lerOficial } from '../../comum/loja.js'
import { confirmar } from '../../comum/Dialogos.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import { entrar, useConta } from '../../comum/conta.js'
import { molduraPorId, urlMiniatura } from '../../comum/molduras.js'
import { nomeCard, urlMiniCard } from '../../comum/cardsPerfil.js'
import { imagemFundoPerfil, nomeFundoPerfil } from '../../../worker/steam-login/src/fundos-perfil.js'
import { tocarSom } from '../../comum/som.js'
import IconeUI from '../../comum/IconeUI.jsx'

const numero = (n) => Number(n).toLocaleString('pt-BR')
const SECOES = [
  ['tudo', 'Tudo'],
  ['partida', 'Itens de partida'],
  ['kit', 'Kits'],
  ['moldura', 'Molduras'],
  ['card', 'Cards'],
  ['fundo', 'Fundos de perfil'],
]
const CONSUMIVEIS = {
  boost: { nome: 'Boost', icone: 'boost', texto: 'Ative no lobby antes da partida: se vencer, o XP ganho vale em dobro.' },
  freeze: { nome: 'Freeze', icone: 'escudo', texto: 'Ative no lobby antes da partida: ela não ganha nem perde XP.' },
}
const ERROS = {
  saldo: 'Você não tem Neura Pontos suficientes.',
  'ja-tem': 'Você já tem esse item.',
  limite: 'Você já tem o máximo desse item (99).',
  oferta: 'Esse item não está mais à venda.',
}

// Imagem e nome de um enfeite do catálogo
export function infoEnfeite(tipo, id) {
  if (tipo === 'moldura') return { nome: molduraPorId(id)?.nome || id, img: urlMiniatura(id), sub: molduraPorId(id)?.colecao || 'Moldura' }
  if (tipo === 'card') return { nome: nomeCard(id), img: urlMiniCard(id), sub: 'Card' }
  return { nome: nomeFundoPerfil(id), img: imagemFundoPerfil(id), sub: 'Fundo de perfil' }
}

function Preco({ valor, saldo }) {
  const falta = saldo != null && saldo < valor
  return (
    <span className={`mo-preco${falta ? ' is-falta' : ''}`}>
      <IconeUI tipo="pontos" tamanho={14} />
      {numero(valor)} <small>NP</small>
    </span>
  )
}

export default function MercadoOficial({ saldo }) {
  const t = useT()
  const conta = useConta()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(false)
  const [secao, setSecao] = useState('tudo')
  const [qtd, setQtd] = useState({ boost: 1, freeze: 1 })
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null)

  const carregar = useCallback(() => lerOficial().then((d) => (setDados(d), setErro(false)), () => setErro(true)), [])
  useEffect(() => {
    if (!conta) return
    carregar()
    const atualizar = () => { if (!document.hidden) carregar() }
    window.addEventListener('focus', atualizar)
    document.addEventListener('visibilitychange', atualizar)
    window.addEventListener(EVENTO_OFICIAL, atualizar)
    return () => {
      window.removeEventListener('focus', atualizar)
      document.removeEventListener('visibilitychange', atualizar)
      window.removeEventListener(EVENTO_OFICIAL, atualizar)
    }
  }, [conta, carregar])

  const tem = (tipo, id) => !!dados?.possui?.[tipo]?.includes(id)
  const kits = useMemo(() => (dados?.catalogo.kits || []).map((k) => ({ ...k, partes: ['card', 'moldura', 'fundo'].filter((p) => k[p]).map((p) => ({ tipo: p, id: k[p], ...infoEnfeite(p, k[p]) })) })), [dados])

  const comprar = async (tipo, id, preco, nome, n) => {
    if (saldo != null && saldo < preco) {
      tocarSom('erro')
      return setAviso({ texto: t(ERROS.saldo), ok: false })
    }
    const texto = n ? t('Comprar {n}x {item} por {preco} NP?', { n, item: nome, preco: numero(preco) }) : t('Comprar {item} por {preco} NP? Ele fica liberado para sempre no Personalizar do seu perfil.', { item: nome, preco: numero(preco) })
    if (!(await confirmar(texto, { titulo: t('Loja geral'), ok: t('Comprar') }))) return
    setOcupado(`${tipo}:${id || ''}`)
    try {
      const r = await comprarOficial(tipo, id, n)
      avisarSaldo(r.saldo)
      setDados((d) => ({ ...d, possui: r.possui, consumiveis: r.consumiveis, saldo: r.saldo }))
      window.dispatchEvent(new Event(EVENTO_OFICIAL))
      tocarSom('compra')
      setAviso({ texto: n ? t('Comprado! Use no lobby antes da partida.') : t('Comprado! Já está liberado no Personalizar do perfil.'), ok: true, link: n ? '/lobby/' : '/perfil/' })
    } catch (e) {
      tocarSom('erro')
      setAviso({ texto: t(ERROS[e.message] || 'Não deu agora. Tente de novo.'), ok: false })
    } finally {
      setOcupado('')
    }
  }

  if (!conta)
    return (
      <div className="mo-vazio">
        <p>{t('Entre com a Steam para ver a loja geral.')}</p>
        <button type="button" className="lj-btn lj-btn-p" onClick={entrar}>
          {t('Entrar')}
        </button>
      </div>
    )
  if (erro && !dados) return <p className="lj-dica">{t('Não consegui carregar o mercado. Tente de novo mais tarde.')}</p>
  if (!dados) return <CarregandoNP />

  const { catalogo, consumiveis } = dados
  const ver = (s) => secao === 'tudo' || secao === s
  const enfeites = (tipo) => catalogo.itens.filter((x) => x.tipo === tipo)
  const vendendoConsumivel = Object.keys(CONSUMIVEIS).some((k) => catalogo.consumiveis[k] > 0)
  const nada = !vendendoConsumivel && !kits.length && !catalogo.itens.length

  const cartaoEnfeite = (x) => {
    const info = infoEnfeite(x.tipo, x.id)
    const possui = tem(x.tipo, x.id)
    const chave = `${x.tipo}:${x.id}`
    return (
      <li key={chave} className={`mo-item mo-item-${x.tipo}${possui ? ' is-tem' : ''}`}>
        <span className="mo-item-arte">
          <img src={info.img} alt="" loading="lazy" draggable="false" />
        </span>
        <span className="mo-item-info">
          <small>{t(info.sub)}</small>
          <b title={info.nome}>{info.nome}</b>
        </span>
        <span className="mo-item-pe">
          {possui ? (
            <span className="mo-tem">
              <IconeUI tipo="check" tamanho={14} /> {t('Você tem')}
            </span>
          ) : (
            <>
              <Preco valor={x.preco} saldo={saldo} />
              <button type="button" className="lj-btn lj-btn-p mo-comprar" data-som="nao" disabled={!!ocupado} onClick={() => comprar(x.tipo, x.id, x.preco, info.nome)}>
                {ocupado === chave ? t('Comprando…') : t('Comprar')}
              </button>
            </>
          )}
        </span>
      </li>
    )
  }

  return (
    <section className="mo" aria-label={t('Loja geral')}>
      <nav className="mo-secoes" role="tablist" aria-label={t('Seções do mercado oficial')}>
        {SECOES.map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={secao === id} className={secao === id ? 'is-ativo' : ''} onClick={() => setSecao(id)}>
            {t(rotulo)}
          </button>
        ))}
      </nav>

      {aviso && (
        <p className={aviso.ok ? 'lj-aviso' : 'lj-aviso lj-aviso-erro'} role="status">
          {aviso.texto} {aviso.ok && aviso.link && <a href={aviso.link}>{aviso.link === '/lobby/' ? t('Ir para o lobby') : t('Personalizar perfil')}</a>}
        </p>
      )}
      {nada && <p className="mo-vazio">{t('Nada à venda no momento. Volte mais tarde!')}</p>}

      {ver('partida') && vendendoConsumivel && (
        <div className="mo-bloco">
          <header className="mo-bloco-cab">
            <h3>{t('Itens de partida')}</h3>
            <p>{t('Use no lobby antes de entrar na partida. Só um ativo por vez; cancelar antes da partida devolve o item.')}</p>
          </header>
          <ul className="mo-consumiveis">
            {Object.entries(CONSUMIVEIS)
              .filter(([k]) => catalogo.consumiveis[k] > 0)
              .map(([k, c]) => {
                const n = qtd[k]
                const preco = catalogo.consumiveis[k] * n
                return (
                  <li key={k} className={`mo-consumivel mo-${k}`}>
                    <span className="mo-consumivel-icone">
                      <IconeUI tipo={c.icone} tamanho={34} />
                    </span>
                    <span className="mo-consumivel-info">
                      <b>{c.nome}</b>
                      <p>{t(c.texto)}</p>
                      <small>{t('Você tem: {n}', { n: consumiveis?.[k] ?? 0 })}</small>
                    </span>
                    <span className="mo-consumivel-compra">
                      <span className="mo-qtd" role="group" aria-label={t('Quantidade')}>
                        {[1, 5, 10].map((q) => (
                          <button key={q} type="button" className={n === q ? 'is-ativo' : ''} onClick={() => setQtd((v) => ({ ...v, [k]: q }))}>
                            {q}x
                          </button>
                        ))}
                      </span>
                      <Preco valor={preco} saldo={saldo} />
                      <button type="button" className="lj-btn lj-btn-p mo-comprar" data-som="nao" disabled={!!ocupado} onClick={() => comprar(k, undefined, preco, c.nome, n)}>
                        {ocupado === `${k}:` ? t('Comprando…') : t('Comprar')}
                      </button>
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>
      )}

      {ver('kit') && kits.length > 0 && (
        <div className="mo-bloco">
          <header className="mo-bloco-cab">
            <h3>{t('Kits')}</h3>
            <p>{t('Card, moldura e fundo de perfil combinando, mais barato juntos.')}</p>
          </header>
          <ul className="mo-kits">
            {kits.map((k) => {
              const completo = k.partes.every((p) => tem(p.tipo, p.id))
              const avulso = k.partes.reduce((a, p) => a + (catalogo.itens.find((x) => x.tipo === p.tipo && x.id === p.id)?.preco || 0), 0)
              const fundo = k.partes.find((p) => p.tipo === 'fundo')
              const card = k.partes.find((p) => p.tipo === 'card')
              const moldura = k.partes.find((p) => p.tipo === 'moldura')
              return (
                <li key={k.id} className={`mo-kit${completo ? ' is-tem' : ''}`}>
                  <div className="mo-kit-vitrine" style={fundo ? { '--fundo': `url("${fundo.img}")` } : undefined}>
                    {card && <img className="mo-kit-card" src={card.img} alt="" loading="lazy" draggable="false" />}
                    {moldura && <img className="mo-kit-moldura" src={moldura.img} alt="" loading="lazy" draggable="false" />}
                  </div>
                  <div className="mo-kit-corpo">
                    <b>{k.nome}</b>
                    <ul className="mo-kit-partes">
                      {k.partes.map((p) => (
                        <li key={p.tipo} className={tem(p.tipo, p.id) ? 'is-tem' : ''}>
                          <small>{t(p.sub === 'Card' || p.sub === 'Fundo de perfil' ? p.sub : 'Moldura')}</small> {p.nome}
                        </li>
                      ))}
                    </ul>
                    <div className="mo-item-pe">
                      {completo ? (
                        <span className="mo-tem">
                          <IconeUI tipo="check" tamanho={14} /> {t('Você tem o kit')}
                        </span>
                      ) : (
                        <>
                          {avulso > k.preco && <s className="mo-de">{numero(avulso)} NP</s>}
                          <Preco valor={k.preco} saldo={saldo} />
                          <button type="button" className="lj-btn lj-btn-p mo-comprar" data-som="nao" disabled={!!ocupado} onClick={() => comprar('kit', k.id, k.preco, k.nome)}>
                            {ocupado === `kit:${k.id}` ? t('Comprando…') : t('Comprar kit')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {[
        ['moldura', 'Molduras', 'Molduras para o avatar.'],
        ['card', 'Cards', 'O cartão do seu perfil, ranking e lobby.'],
        ['fundo', 'Fundos de perfil', 'A imagem de fundo do seu perfil.'],
      ].map(([tipo, titulo, texto]) =>
        ver(tipo) && enfeites(tipo).length > 0 ? (
          <div key={tipo} className="mo-bloco">
            <header className="mo-bloco-cab">
              <h3>{t(titulo)}</h3>
              <p>{t(texto)}</p>
            </header>
            <ul className={`mo-grade mo-grade-${tipo}`}>{enfeites(tipo).map(cartaoEnfeite)}</ul>
          </div>
        ) : null,
      )}
    </section>
  )
}
