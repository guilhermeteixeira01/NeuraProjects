import { useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import Setup from './components/Setup.jsx'
import Veto from './components/Veto.jsx'

export default function App() {
  const [match, setMatch] = useState(null)

  return (
    <div className="app">
      <Layout pagina="pick">
        <main className="main">
          {match ? (
            <Veto key={match.id} match={match} onNewMatch={() => setMatch(null)} />
          ) : (
            <Setup onStart={setMatch} />
          )}
        </main>
      </Layout>
    </div>
  )
}
