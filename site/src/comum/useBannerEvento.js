import { useEffect, useState } from 'react'
import { bannerDoEvento, eventoDaData } from './eventos.js'

export function useBannerEvento() {
  // O HTML é estático: assume primeiro o banner do deploy e troca após hidratar.
  // Assim uma visita meses depois não causa divergência entre o HTML e o React.
  const [evento, setEvento] = useState(() =>
    (typeof document !== 'undefined' && document.querySelector('.inicio[data-evento]')?.getAttribute('data-evento')) || eventoDaData(),
  )
  useEffect(() => {
    const atualizar = () => setEvento(eventoDaData())
    atualizar()
    const timer = setInterval(atualizar, 60000)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [])
  return bannerDoEvento(evento)
}
