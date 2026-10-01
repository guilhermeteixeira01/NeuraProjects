// Nav enxuta: a marca, o histórico de partidas do servidor e o botão para voltar ao site principal (neuraproject.com.br).
const SITE = '/'
// Páginas de estatísticas que o plugin BaseComp do servidor de CS2 publica no fim de cada mapa
const PARTIDAS = '/partidas/'

export default function Header() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-brand" href={SITE}>
          <img className="mark" src={`${import.meta.env.BASE_URL}logos/logoNP.ico`} alt="logo" />
          <span>
            NEURA <span className="outline">PROJECT</span>
            <span className="sub">NEURA PROJECTS</span>
          </span>
        </a>

        <div className="nav-actions">
          <a className="btn btn-ghost btn-sm" href={PARTIDAS} title="Histórico de partidas">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3v18h18" />
              <path d="m7 15 4-4 3 3 5-6" />
            </svg>
            <span className="label-long">Histórico de partidas</span>
            <span className="label-short">Partidas</span>
          </a>

          <a className="btn btn-ghost btn-sm" href={SITE} title="Voltar ao site" aria-label="Voltar ao site">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            <span className="label-long">Voltar ao site</span>
          </a>
        </div>
      </div>
    </header>
  )
}
