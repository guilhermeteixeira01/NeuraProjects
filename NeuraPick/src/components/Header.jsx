export default function Header({ inMatch, onHome }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <button className="nav-brand" onClick={onHome}>
          <img className="mark" src={`${import.meta.env.BASE_URL}logos/android-chrome-192x192.png`} alt="" />
          <span>
            NEURA<span className="accent">PICK</span>
            <span className="sub">MAP VETO · CS2</span>
          </span>
        </button>

        <div className="nav-actions">
          <span className="nav-mode">{inMatch ? 'VETO EM ANDAMENTO' : 'CONFIGURAÇÃO'}</span>
          {inMatch && (
            <button className="btn btn-ghost btn-sm" onClick={onHome}>
              Nova partida
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
