// Aviso de skin nova (o dono deu): "Você recebeu uma nova skin!" no meio da tela, com som, igual ao das insígnias, e uma notificação no sino.
// O que já foi avisado fica na conta (o worker marca em skins:<id>.presentes). Com o site aberto o aviso chega na hora pela conexão ao vivo
// (evento np-skin, amigos.js); sem ela, é conferido ao abrir o site, ao voltar para a aba e a cada minuto.
import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenConta, useConta } from './conta.js'
import { registrarNotificacao } from './notificacoes.js'
import { descrever, indicar, lerInventario, urlImgArma, useCatalogo } from './skins.js'
import { prepararSom, tocarConquista } from './Insignias.jsx'
import { desempenhoAtivo } from './desempenho.js'
import { useT } from './i18n.js'
import { CONFIG } from './config.js'

const base = () => CONFIG.loginSteam.replace(/\/$/, '')

async function marcarVistos(ids) {
  const token = tokenConta()
  if (!token || !ids.length) return
  await fetch(`${base()}/skins/presentes`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ vistos: ids }) }).catch(() => {})
}

export default function AvisoSkin() {
  const t = useT()
  const conta = useConta()
  const [pendentes, setPendentes] = useState([]) // [{ id, item }]
  const [livre, setLivre] = useState(false)
  const tocou = useRef('')
  const catalogo = useCatalogo('armas', pendentes.length > 0)
  const ativo = !!conta?.id && !!CONFIG.loginSteam

  const conferir = useCallback(async () => {
    if (!ativo) return
    try {
      const inv = await lerInventario()
      const novos = (inv.presentes || []).filter((p) => !p.v && inv.itens?.[p.i]).map((p) => ({ id: p.i, item: inv.itens[p.i] }))
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
  const atual = livre && idx ? pendentes[0] : null
  const d = atual && idx ? descrever(atual.item, idx) : null

  // fica também no sino
  useEffect(() => {
    if (!idx || !conta?.id) return
    for (const p of pendentes) {
      const x = descrever(p.item, idx)
      registrarNotificacao(conta.id, { id: `skin:${p.id}`, imagem: x.img ? x.img.replace(/\/\d+fx\d+f$/, '/128fx96f') : '', titulo: `Você recebeu a skin ${x.titulo}${x.subtitulo ? ` | ${x.subtitulo}` : ''}`, texto: 'Já está no seu inventário.', link: '/inventario/' })
    }
  }, [pendentes, idx, conta?.id])

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
    <div className="ins-fundo" onClick={() => fechar()}>
      <div className={`ins-aviso${desempenhoAtivo() ? ' parado' : ''}`} role="dialog" aria-modal="true" aria-labelledby="skin-aviso-titulo" onClick={(e) => e.stopPropagation()}>
        <span className="ins-kicker">{t('NOVA SKIN')}</span>
        <div className="ins-palco skin-palco" aria-hidden="true" style={{ '--cor-skin': d.cor || '#8aa0c0' }}>
          <span className="ins-raios" />
          <img key={atual.id} src={d.img || urlImgArma(d.skin?.[6], 512)} alt="" />
        </div>
        <h2 id="skin-aviso-titulo">{t('Você recebeu uma nova skin!')}</h2>
        <b className="ins-nome" style={{ color: d.cor || undefined }}>
          {d.titulo}
          {d.subtitulo ? ` | ${d.subtitulo}` : ''}
        </b>
        <p>{t('Ela já está no seu inventário: dá para ajustar o desgaste, colocar adesivos e equipar no CT ou no TR.')}</p>
        <div className="skin-botoes">
          <button type="button" className="ins-ok" onClick={() => fechar(true)} autoFocus>
            {t('Ver no inventário')}
          </button>
          <button type="button" className="ins-ok ins-ok-sec" onClick={() => fechar()}>
            {resto > 0 ? t('Próxima ({n})', { n: resto }) : t('Continuar')}
          </button>
        </div>
      </div>
    </div>
  )
}
