import { useState } from 'react'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Setup from './components/Setup.jsx'
import Veto from './components/Veto.jsx'

export default function App() {
  const [match, setMatch] = useState(null)

  return (
    <div className="app">
      <Header />
      <main className="main">
        {match ? (
          <Veto key={match.id} match={match} onNewMatch={() => setMatch(null)} />
        ) : (
          <Setup onStart={setMatch} />
        )}
      </main>
      <Footer />
    </div>
  )
}
