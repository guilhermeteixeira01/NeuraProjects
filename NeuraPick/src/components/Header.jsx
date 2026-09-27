// Nav enxuta: só a marca e o botão para voltar ao site principal (neuraproject.com.br).
const SITE = '/'

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

        <a className="btn btn-ghost btn-sm" href={SITE}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Voltar ao site
        </a>
      </div>
    </header>
  )
}
