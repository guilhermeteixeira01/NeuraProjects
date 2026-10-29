import RecompensasInsignia from './RecompensasInsignia.jsx'
import { useState } from 'react'
import { usePerfis } from './Moldura.jsx'
import { imagemInsignia, insigniasDe } from './insignias.js'
import { localeAtual, useT } from './i18n.js'
import './galeriaInsignias.css'

const CATEGORIAS = { todas: 'Todas', combate: 'Combate', mapas: 'Mapas', eventos: 'Eventos', loja: 'Coleção de caixas', comunidade: 'Comunidade' }
const categoriaDe = i => i.categoria || (i.loja || i.id.startsWith('mestre-') ? 'loja' : 'comunidade')

function CardInsignia({ insignia: i }) {
  const t = useT()
  return <article className="ig-card" style={{ '--ins-cor': i.cor || '#428de8' }}>
    <div className="ig-card-arte"><img src={imagemInsignia(i.id)} alt="" loading="lazy" decoding="async" draggable="false" /></div>
    <div className="ig-card-texto">
      <span className="ig-card-categoria">{t(CATEGORIAS[categoriaDe(i)] || 'Comunidade')}</span>
      <h3>{t(i.nome)}</h3><p>{t(i.descricao)}</p>
    </div>
    <RecompensasInsignia id={i.id} conquistada />
    <footer><span className="ig-conquistada">✓ {t('Conquistada')}</span>{i.desde && <time dateTime={new Date(i.desde).toISOString()}>{new Date(i.desde).toLocaleDateString(localeAtual())}</time>}</footer>
  </article>
}

export default function GaleriaInsignias({ steamId }) {
  const t = useT(), perfis = usePerfis()
  const [categoria, setCategoria] = useState('todas')
  const lista = insigniasDe(perfis, steamId)
  const visiveis = lista.filter(i => categoria === 'todas' || categoriaDe(i) === categoria)
  return <section className="ig-pagina" aria-labelledby="ig-titulo">
    <header className="ig-cabecalho"><div><span className="ig-sobretitulo">{t('Coleção do jogador')}</span><h2 id="ig-titulo">{t('Insígnias')}</h2><p>{t('Cada conquista faz parte da sua história na Neura.')}</p></div><span className="ig-total"><b>{lista.length}</b>{t('conquistadas')}</span></header>
    <nav className="ig-categorias" aria-label={t('Categorias de insígnias')}>
      {Object.entries(CATEGORIAS).map(([id, nome]) => <button type="button" key={id} aria-pressed={categoria === id} onClick={() => setCategoria(id)}>{t(nome)}<span>{id === 'todas' ? lista.length : lista.filter(i => categoriaDe(i) === id).length}</span></button>)}
    </nav>
    <p className="ig-resultado" role="status">{t('{n} insígnias', { n: visiveis.length })}</p>
    {visiveis.length ? <div className="ig-grade">{visiveis.map(i => <CardInsignia key={i.id} insignia={i} />)}</div> : <div className="ig-vazio"><h3>{t('Nenhuma insígnia por aqui ainda')}</h3><p>{t('As insígnias conquistadas nesta categoria aparecerão aqui.')}</p></div>}
    <p className="ig-privado">{t('Este jogador mantém suas conquistas privadas.')}</p>
  </section>
}
