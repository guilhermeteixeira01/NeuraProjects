// Três pontinhos pulando (estilo em site.css): "A jogar" das séries em andamento
export default function CarregandoPontos() {
  return (
    <span className="carregando-pontos" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

// Carregamento da página: o logo da NP no centro e bolinhas girando em volta, até o conteúdo aparecer (some quando o conteúdo entra no lugar dele).
// tela: cobre a área inteira (usado ao trocar de página); sem tela: ocupa o lugar do conteúdo que ainda não chegou. pequeno: versão menor, para listas e janelas.
export function CarregandoNP({ tela = false, pequeno = false }) {
  return (
    <div className={`cnp${tela ? ' cnp-tela' : ''}${pequeno ? ' cnp-pq' : ''}`} role="status" aria-live="polite" aria-label="Carregando">
      <div className="cnp-anel" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ '--i': i }} />
        ))}
        <img src="/assets/logos/logo-np-64.png" alt="" width="48" height="48" draggable="false" />
      </div>
    </div>
  )
}
