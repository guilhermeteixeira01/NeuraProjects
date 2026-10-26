import { Fragment } from 'react'

// O novo visual deixa o palco para as artes e dispensa o canvas contínuo dos cabeçalhos.
// Mantém a API para as páginas existentes sem criar animações fora da tela.
export function FundoHero() { return null }

// Título que entra palavra por palavra. O espaço fica fora do <span>: dentro de inline-block ele sumiria.
export function Palavras({ texto, inicio = 0 }) {
  return texto.split(' ').map((p, i) => (
    <Fragment key={i}>
      <span className="fx-palavra" style={{ '--w': inicio + i }}>
        {p}
      </span>{' '}
    </Fragment>
  ))
}