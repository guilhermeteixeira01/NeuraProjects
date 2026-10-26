// Uma leitura compartilhada; eventos durante a leitura garantem outra consulta ao terminar.
// A resposta anterior a uma mudança nunca substitui o estado mais novo.
export function criarAtualizador({ ler, aplicar, aoErro = () => {} }) {
  let pendente = null
  let refazer = false
  let versao = 0
  function carregar() {
    if (pendente) return pendente
    pendente = (async () => {
      do {
        refazer = false
        const inicio = versao
        try {
          const dados = await ler()
          if (inicio === versao) aplicar(dados)
        } catch (erro) {
          if (inicio === versao) aoErro(erro)
        }
      } while (refazer)
    })().finally(() => { pendente = null })
    return pendente
  }
  return {
    carregar,
    atualizar() {
      versao++
      if (pendente) refazer = true
      return carregar()
    },
    descartar() { versao++; refazer = false },
  }
}
