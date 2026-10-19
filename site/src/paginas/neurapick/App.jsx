import { useEffect, useState } from 'react'
import { useAcessoPick } from '../../comum/Moldura.jsx'
import Layout from '../../comum/Layout.jsx'
import Setup from './components/Setup.jsx'
import Veto from './components/Veto.jsx'

// A página é escondida: só vê quem é da equipe ou tem um cargo com "Ver Pick & Ban" (painel admin → Cargos).
// Espera um instante a conta e o cargo chegarem antes de mostrar o aviso, para não piscar.
export default function App() {
  const [match, setMatch] = useState(null)
  const liberado = useAcessoPick()
  const [esperou, setEsperou] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setEsperou(true), 1500)
    return () => clearTimeout(id)
  }, [])

  if (!liberado)
    return (
      <div className="app">
        <Layout pagina="pick">
          <main className="main">{esperou && <p className="pick-bloqueado">Esta página não está disponível.</p>}</main>
        </Layout>
      </div>
    )

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
