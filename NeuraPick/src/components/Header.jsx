// Mesma nav do site principal (neuraproject.com.br), com o Pick & Ban marcado como página atual.
const SITE = '/'
const DOWNLOAD_URL = 'https://webhook.neuraproject.com.br/download/latest'

export default function Header({ inMatch, onHome }) {
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

        <nav className="nav-links">
          <a href={`${SITE}#recursos`}>Recursos</a>
          <a href={`${SITE}#download`}>Download</a>
          <a className="active" href={import.meta.env.BASE_URL} aria-current="page">
            Pick &amp; Ban
          </a>
        </nav>

        <div className="nav-actions">
          <a className="icon-btn" href={`${SITE}admin.html`} title="Painel de anúncios" aria-label="Painel de anúncios">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </a>
          {inMatch && (
            <button className="btn btn-ghost btn-sm" onClick={onHome}>
              Nova partida
            </button>
          )}
          <a className={`btn btn-primary btn-sm${inMatch ? ' nav-download-match' : ''}`} href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
            Baixar launcher
          </a>
        </div>
      </div>
    </header>
  )
}
