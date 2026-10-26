import { useBannerEvento } from './useBannerEvento.js'
import { temaDoEvento } from './temaEvento.js'

function Simbolo({ efeito }) {
  const caminhos = {
    neve: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3',
    folhas: 'M20 3C8 2 2 8 5 16c8 4 15-2 15-13ZM5 20 16 8',
    flores: 'M12 8c-6-9-12 1-5 4-7 4-1 13 5 5 6 8 12-1 5-5 7-3 1-13-5-4ZM10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
    morcegos: 'M2 7c4 2 5 1 7-2l3 3 3-3c2 3 3 4 7 2l-2 10-5-3-3 5-3-5-5 3Z',
    coracoes: 'M12 21 3 12C-2 4 8 0 12 7c4-7 14-3 9 5Z',
    circuito: 'M3 3h6v6h6v6h6M3 21v-6h6V9h6V3h6',
    sol: 'M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0',
    confete: 'm4 2 3 5-3 3M16 3l3 4-3 4M9 15l3 6M20 16l-4 4',
    estrelas: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d={caminhos[efeito] || caminhos.estrelas} /></svg>
}

export default function BannerEvento() {
  const banner = useBannerEvento()
  return (
    <>
    <div className="np-evento-ambiente" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--particula': i }}><Simbolo efeito={temaDoEvento(banner.evento).efeito} /></i>)}
    </div>
    <div className="np-banner" data-evento={banner.evento}>
      <picture>
        <source media="(max-width: 760px)" srcSet={banner.pequeno} />
        <img src={banner.grande} width="2290" height="260" alt="Neura Project" fetchPriority="high" decoding="async" />
      </picture>
    </div>
    </>
  )
}
