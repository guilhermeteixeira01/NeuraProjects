import { useEffect, useRef } from 'react'

// Confere um JSON do site de tempos em tempos (e quando a pessoa volta para a aba).
// A primeira leitura é a referência (e já atualiza a tela com `aoCarregar`); se depois disso o conteúdo
// mudar, a página RECARREGA sozinha. Comparar com a primeira leitura (e não com o HTML da página)
// evita loop de recarga quando o navegador ainda está com uma versão guardada da página.
// O "?t=" fura o cache do GitHub Pages (ele guarda os arquivos por ~10 min).
// Partida nova aparece assim que o deploy dela termina (~2 min depois do mapa acabar).
// selecionar: compara só uma parte do JSON (ex.: só os mapas de uma série), para não recarregar à toa
export function useAoVivo(caminho, aoCarregar, { intervalo = 20000, ativo = true, selecionar } = {}) {
  const referencia = useRef(null)
  const callback = useRef(aoCarregar)
  callback.current = aoCarregar
  const seletor = useRef(selecionar)
  seletor.current = selecionar

  useEffect(() => {
    if (!ativo) return
    let vivo = true
    const conferir = () =>
      fetch(`${caminho}?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : null))
        .then((texto) => {
          if (!vivo || texto === null) return
          const dados = JSON.parse(texto)
          const chave = seletor.current ? JSON.stringify(seletor.current(dados)) : texto
          if (referencia.current === null) {
            referencia.current = chave
            callback.current?.(dados)
          } else if (chave !== referencia.current) {
            vivo = false
            location.reload()
          }
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
