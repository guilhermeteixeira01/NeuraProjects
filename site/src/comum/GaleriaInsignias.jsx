import RecompensasInsignia, { recompensasDaInsignia } from './RecompensasInsignia.jsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePerfis, salvarPerfil } from './Moldura.jsx'
import { useConta } from './conta.js'
import { imagemInsignia, insigniasDe, insigniasDestacadasDe } from './insignias.js'
import { localeAtual, useT } from './i18n.js'
import './galeriaInsignias.css'

const CATEGORIAS = { todas: 'Todas', combate: 'Combate', amizades: 'Amizades', mapas: 'Mapas', eventos: 'Eventos', loja: 'Coleção de caixas', comunidade: 'Comunidade' }
const categoriaDe = i => i.categoria || (i.loja || i.id.startsWith('mestre-') ? 'loja' : 'comunidade')

export function JanelaRecompensas({ insignia, conquistada = true, aoFechar }) {
  const t = useT(), ref = useRef(null)
  useEffect(() => { ref.current.showModal() }, [])
  return createPortal(<dialog ref={ref} className="ig-recompensas-dialog" aria-labelledby="ig-recompensas-titulo" onClose={aoFechar} onClick={e => { if (e.target === e.currentTarget) aoFechar() }}>
    <div className="ig-recompensas-conteudo" onClick={e => e.stopPropagation()}>
      <header><h2 id="ig-recompensas-titulo">{t(insignia.nome)}</h2><button type="button" onClick={aoFechar} aria-label={t('Fechar')}>×</button></header>
      <RecompensasInsignia id={insignia.id} conquistada={conquistada} />
    </div>
  </dialog>, document.body)
}

function CardInsignia({ insignia: i, podeDestacar, destacada, aoDestacar, desabilitada }) {
  const t = useT()
  const [verRecompensas, setVerRecompensas] = useState(false)
  const temRecompensas = recompensasDaInsignia(i.id).length > 0
  return <article className="ig-card" style={{ '--ins-cor': i.cor || '#428de8' }}>
    <div className="ig-card-arte"><img src={imagemInsignia(i.id)} alt="" loading="lazy" decoding="async" draggable="false" /></div>
    <div className="ig-card-texto">
      <span className="ig-card-categoria">{t(CATEGORIAS[categoriaDe(i)] || 'Comunidade')}</span>
      <h3>{t(i.nome)}</h3><p>{t(i.descricao)}</p>
    </div>
    {podeDestacar && <button type="button" className="ig-destacar" aria-pressed={destacada} disabled={desabilitada} onClick={() => aoDestacar(i.id)} aria-label={`${destacada ? 'Remover destaque de' : 'Destacar'} ${i.nome}`}>{destacada ? '★ Destacada' : '☆ Destacar'}</button>}
    {verRecompensas && <JanelaRecompensas insignia={i} aoFechar={() => setVerRecompensas(false)} />}
    <footer><span className="ig-conquista-info"><span className="ig-conquistada">✓ {t('Conquistada')}</span>{i.desde && <time dateTime={new Date(i.desde).toISOString()}>{new Date(i.desde).toLocaleDateString(localeAtual())}</time>}</span>{temRecompensas && <button type="button" className="ig-ver-recompensas" onClick={() => setVerRecompensas(true)} aria-label={t('Ver recompensas')}>{t('Recompensas')}</button>}</footer>
  </article>
}

export default function GaleriaInsignias({ steamId }) {
  const t = useT(), perfis = usePerfis()
  const conta = useConta(), eu = conta?.id === steamId
  const [salvando, setSalvando] = useState(false), [aviso, setAviso] = useState(''), trava = useRef(false)
  const [categoria, setCategoria] = useState('todas')
  const lista = insigniasDe(perfis, steamId)
  const destaques = insigniasDestacadasDe(perfis, steamId)
  const ids = destaques.map(i => i.id)
  const salvar = async novos => {
    if (trava.current) return
    trava.current = true; setSalvando(true); setAviso('')
    try { await salvarPerfil({ insigniasDestacadas: novos }); setAviso('Destaques salvos.') }
    catch { setAviso('Não foi possível salvar os destaques. Tente novamente.') }
    finally { trava.current = false; setSalvando(false) }
  }
  const alternar = id => { if (ids.includes(id)) salvar(ids.filter(k => k !== id)); else if (ids.length < 3) salvar([...ids, id]) }
  const mover = (indice, passo) => { const novos = [...ids]; [novos[indice], novos[indice + passo]] = [novos[indice + passo], novos[indice]]; salvar(novos) }
  const visiveis = lista.filter(i => categoria === 'todas' || categoriaDe(i) === categoria)
  return <section className="ig-pagina" aria-labelledby="ig-titulo">
    <header className="ig-cabecalho"><div><span className="ig-sobretitulo">{t('Coleção do jogador')}</span><h2 id="ig-titulo">{t('Insígnias')}</h2><p>{t('Cada conquista faz parte da sua história na Neura.')}</p></div><span className="ig-total"><b>{lista.length}</b>{t('conquistadas')}</span></header>
    {(eu || destaques.length > 0) && <section className="ig-destaques" aria-label="Insígnias em destaque" aria-busy={salvando}>
      <header><div><h3>Insígnias em destaque</h3><p>{eu ? 'Escolha até 3 conquistas abaixo. A ordem vale no perfil e nas listas de amigos.' : 'As conquistas escolhidas pelo jogador.'}</p></div><b>{destaques.length}/3</b></header>
      <ol className="ig-destaques-slots">{Array.from({ length: 3 }, (_, n) => { const i = destaques[n]; return <li key={n}>
        <span className="ig-slot-numero">{n + 1}</span>
        {i ? <><img src={imagemInsignia(i.id)} alt="" /><strong>{i.nome}</strong>{eu && <div className="ig-slot-acoes">
          <button type="button" disabled={salvando || n === 0} onClick={() => mover(n, -1)} aria-label={`Mover ${i.nome} para antes`}>←</button>
          <button type="button" disabled={salvando || n === destaques.length - 1} onClick={() => mover(n, 1)} aria-label={`Mover ${i.nome} para depois`}>→</button>
          <button type="button" disabled={salvando} onClick={() => alternar(i.id)} aria-label={`Remover destaque de ${i.nome}`}>×</button>
        </div>}</> : <span className="ig-slot-vazio">☆<small>{eu ? 'Escolha uma insígnia' : 'Espaço livre'}</small></span>}
      </li> })}</ol>
      {eu && <p role="status">{salvando ? 'Salvando…' : aviso || (ids.length === 3 ? 'Três destaques selecionados. Remova um para escolher outro.' : 'Use o botão Destacar nas insígnias conquistadas.')}</p>}
    </section>}
    <nav className="ig-categorias" aria-label={t('Categorias de insígnias')}>
      {Object.entries(CATEGORIAS).map(([id, nome]) => <button type="button" key={id} aria-pressed={categoria === id} onClick={() => setCategoria(id)}>{t(nome)}<span>{id === 'todas' ? lista.length : lista.filter(i => categoriaDe(i) === id).length}</span></button>)}
    </nav>
    <p className="ig-resultado" role="status">{t('{n} insígnias', { n: visiveis.length })}</p>
    {visiveis.length ? <div className="ig-grade">{visiveis.map(i => <CardInsignia key={i.id} insignia={i} podeDestacar={eu} destacada={ids.includes(i.id)} aoDestacar={alternar} desabilitada={salvando || (!ids.includes(i.id) && ids.length >= 3)} />)}</div> : <div className="ig-vazio"><h3>{t('Nenhuma insígnia por aqui ainda')}</h3><p>{t('As insígnias conquistadas nesta categoria aparecerão aqui.')}</p></div>}
    <p className="ig-privado">{t('Este jogador mantém suas conquistas privadas.')}</p>
  </section>
}
