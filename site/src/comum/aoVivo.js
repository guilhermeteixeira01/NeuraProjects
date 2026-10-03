import { useEffect, useRef } from 'react'

// Confere um JSON do site de tempos em tempos (e quando a pessoa volta para a aba) e chama `aoMudar`
// só quando o conteúdo mudou. O "?t=" fura o cache do GitHub Pages (ele guarda os arquivos por ~10 min).
// Partida nova aparece assim que o deploy dela termina (~2 min depois do mapa acabar).
export function useAoVivo(caminho, aoMudar, { intervalo = 30000, ativo = true } = {}) {
  const ultimo = useRef(null)
  const callback = useRef(aoMudar)
  callback.current = aoMudar

  useEffect(() => {
    if (!ativo) return
    let vivo = true
    const conferir = () =>
      fetch(`${caminho}?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : null))
        .then((texto) => {
          if (!vivo || texto === null || texto === ultimo.current) return
          ultimo.current = texto
          callback.current(JSON.parse(texto))
        })
        .catch(() => {})

    conferir()
    const id = setInterval(() => document.visibilityState === 'visible' && conferir(), intervalo)
    const voltou = () => document.visibilityState === 'visible' && conferir()
    document.addEventListener('visibilitychange', voltou)
    return () => {
      vivo = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', voltou)
    }
  }, [caminho, intervalo, ativo])
}
