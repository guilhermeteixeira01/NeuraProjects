import { useEffect, useRef } from 'react'
import { somMudo, useSomMudo } from '../../comum/som.js'

const FAIXA = '/assets/Ranking/esdeekid-century.mp3'

export function useSomRanking() {
  const mudo = useSomMudo()
  const faixa = useRef(null)

  useEffect(() => {
    if (mudo || somMudo()) return

    const audio = faixa.current ??= new Audio(FAIXA)
    audio.loop = true
    audio.volume = 0.5

    function removerTentativa() {
      document.removeEventListener('click', tocar, true)
      document.removeEventListener('keydown', tocar, true)
    }

    function tocar() {
      if (somMudo()) return
      audio.play().then(removerTentativa, () => {})
    }

    // Se o navegador bloquear o autoplay, tenta de novo em uma interação.
    document.addEventListener('click', tocar, true)
    document.addEventListener('keydown', tocar, true)
    tocar()

    return () => {
      removerTentativa()
      audio.pause()
    }
  }, [mudo])
}
