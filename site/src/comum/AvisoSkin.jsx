// Aviso de skin nova (o dono deu): "Você recebeu uma nova skin!" no meio da tela, com som, igual ao das insígnias, e uma notificação no sino.
// O que já foi avisado fica na conta (o worker marca em skins:<id>.presentes). Com o site aberto o aviso chega na hora pela conexão ao vivo
// (evento np-skin, amigos.js); sem ela, é conferido ao abrir o site, ao voltar para a aba e a cada minuto.
import { useCallback, useEffect, useRef, useState } from 'react'
import { chamarApi, seForErroApi, enderecoApi } from './api.js'
import { tokenConta, useConta } from './conta.js'
import { registrarNotificacao } from './notificacoes.js'
import { lerCaixasPublicas } from './loja.js'
import { descrever, indicar, lerInventario, urlImg, urlImgArma, useCatalogo, corEnfeite } from './skins.js'
import { prepararSom, tocarConquista } from './Insignias.jsx'
import { desempenhoAtivo } from './desempenho.js'
import { useT } from './i18n.js'

// Avisos de skin nova já vistos; se não gravar agora, o aviso só aparece de novo na próxima visita
async function marcarVistos(ids) {
  if (!tokenConta() || !ids.length) return
  await chamarApi('/skins/presentes', { vistos: ids }).catch(seForErroApi())
}

export default function AvisoSkin() {
  const t = useT()
  const conta = useConta()
  const [pendentes, setPendentes] = useState([]) // [{ id, item }]
  const [livre, setLivre] = useState(false)
  const tocou = useRef('')
  const catalogo = useCatalogo('armas', pendentes.length > 0)
  const ativo = !!conta?.id && !!enderecoApi()
  const temAdesivo = pendentes.some((p) => p.item.t === 'adesivo')
  const temChaveiro = pendentes.some((p) => p.item.t === 'chaveiro')
  const temCaixa = pendentes.some((p) => p.item.t === 'caixa')
  const [caixasLoja, setCaixasLoja] = useState([])
  useEffect(() => {
    if (temCaixa) lerCaixasPublicas().then(setCaixasLoja)
  }, [temCaixa])
  const adesivosCat = useCatalogo('adesivos', temAdesivo)
  const chaveirosCat = useCatalogo('chaveiros', temChaveiro)

  const conferir = useCallback(async () => {
    if (!ativo) return
    try {
      const inv = await lerInventario()
      const novos = (inv.presentes || []).filter((p) => !p.v && inv.itens?.[p.i]).map((p) => ({ id: p.i, item: inv.itens[p.i], n: p.n || 1 }))
      setPendentes((antigos) => (novos.length === antigos.length && novos.every((n, k) => n.id === antigos[k]?.id) ? antigos : novos))
    } catch {
      // sem login/worker fora: sem aviso agora
    }
  }, [ativo])

  useEffect(() => {
    if (!ativo) return setPendentes([])
    prepararSom()
    conferir()
    const aoVoltar = () => document.visibilityState === 'visible' && conferir()
    window.addEventListener('np-skin', conferir)
    document.addEventListener('visibilitychange', aoVoltar)
    const relogio = setInterval(aoVoltar, 60000)
    return () => {
      window.removeEventListener('np-skin', conferir)
      document.removeEventListener('visibilitychange', aoVoltar)
      clearInterval(relogio)
    }
  }, [ativo, conferir])

  // Espera o aviso de nível/insígnia fechar (ficariam um por cima do outro)
  useEffect(() => {
    if (!pendentes.length) return
    const ver = () => setLivre(!document.querySelector('.nx-nivel-fundo, .ins-fundo'))
    ver()
    const i = setInterval(ver, 500)
    return () => clearInterval(i)
  }, [pendentes.length])

  const idx = catalogo.dados ? indicar(catalogo.dados.armas, []) : null
  // adesivo/chaveiro: nome e imagem vêm dos catálogos deles; skin: do catálogo de armas
  const descreverAviso = (p) => {
    if (p.item.t === 'caixa') {
      const c = caixasLoja.find((x) => x.id === p.item.d)
      if (!c) return null // espera o nome da caixa carregar (sem inventar "skin #31")
      return { titulo: c.nome, subtitulo: `Caixa fechada${p.n > 1 ? ` ×${p.n}` : ''}`, img: c.img, cor: c.cor || '', embalagem: true, caixa: true }
    }
    if (p.item.t !== 'adesivo' && p.item.t !== 'chaveiro') return descrever(p.item, idx)
    const cat = p.item.t === 'adesivo' ? adesivosCat.dados : chaveirosCat.dados
    const linha = cat?.find((x) => x[0] === p.item.d)
    if (!linha) return null
    return { titulo: linha[1], subtitulo: `${p.item.t === 'adesivo' ? 'Adesivo' : 'Chaveiro'}${p.n > 1 ? ` ×${p.n}` : ''}`, img: urlImg(linha[2], 256), cor: corEnfeite(p.item.t, linha), embalagem: true }
  }
  const atual = livre && idx ? pendentes[0] : null
  const d = atual && idx ? descreverAviso(atual) : null

  // fica também no sino
  useEffect(() => {
    if (!idx || !conta?.id) return
    for (const p of pendentes) {
      const x = descreverAviso(p)
      if (!x) continue
      registrarNotificacao(conta.id, { id: `skin:${p.id}`, imagem: x.caixa ? x.img : x.img ? x.img.replace(/\/\d+fx\d+f$/, '/128fx96f') : '', titulo: x.embalagem ? `Você recebeu: ${x.titulo} (${x.subtitulo})` : `Você recebeu a skin ${x.titulo}${x.subtitulo ? ` | ${x.subtitulo}` : ''}`, texto: 'Já está no seu inventário.', link: '/inventario/' })
    }
  }, [pendentes, idx, conta?.id, adesivosCat.dados, chaveirosCat.dados, caixasLoja]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!atual || tocou.current === atual.id) return
    tocou.current = atual.id
    tocarConquista()
  }, [atual])

  const fechar = (irParaInventario = false) => {
    if (!atual) return
    marcarVistos([atual.id])
    setPendentes((l) => l.slice(1))
    if (irParaInventario && !location.pathname.startsWith('/inventario')) location.assign('/inventario/')
  }
  useEffect(() => {
    if (!atual) return
    const tecla = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  })

  if (!atual || !d) return null
  const resto = pendentes.length - 1
  return (
    <div className="skin-fundo" onClick={() => fechar()}>
      <div
        key={atual.id}
        className={`skin-aviso${d.embalagem ? ' skin-aviso-emb' : ''}${desempenhoAtivo() ? ' parado' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skin-aviso-titulo"
        style={{ '--cor-skin': d.cor || '#8aa0c0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="skin-kicker">{d.embalagem ? t('NOVO ITEM') : t('NOVA SKIN')}</span>
        <div className={`skin-palco${d.embalagem ? ' skin-palco-emb' : ''}`} aria-hidden="true">
          <img src={d.img || urlImgArma(d.skin?.[6], 512)} alt="" />
        </div>
        <h2 id="skin-aviso-titulo">{d.embalagem ? t('Você recebeu um novo item!') : t('Você recebeu uma nova skin!')}</h2>
        <b className="skin-nome">{d.titulo}</b>
        {d.subtitulo && <span className="skin-sub">{d.subtitulo}</span>}
        <p>{d.caixa ? t('Ela já está no seu inventário: abra na loja ou pelo botão Abrir.') : d.embalagem ? t('Ele já está no seu inventário: cole numa arma ao editá-la (cada um colado é gasto).') : t('Ela já está no seu inventário: dá para ajustar o desgaste, colocar adesivos e equipar no CT ou no TR.')}</p>
        <div className="skin-botoes">
          <button type="button" className="skin-ok" onClick={() => fechar(true)} autoFocus>
            {t('Ver no inventário')}
          </button>
          <button type="button" className="skin-ok skin-ok-sec" onClick={() => fechar()}>
            {resto > 0 ? t('Próxima ({n})', { n: resto }) : t('Continuar')}
          </button>
        </div>
      </div>
    </div>
  )
}
