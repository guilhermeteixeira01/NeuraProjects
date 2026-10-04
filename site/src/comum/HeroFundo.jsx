import { Fragment } from 'react'

// Partículas: posição, tamanho e tempo fixos (iguais no HTML gerado e no navegador)
const particulas = (n) =>
  Array.from({ length: n }, (_, i) => ({
    '--x': `${(i * 53) % 100}%`,
    '--y': `${(i * 37) % 100}%`,
    '--t': `${7 + ((i * 3) % 9)}s`,
    '--d': `${-((i * 1.7) % 9).toFixed(1)}s`,
    '--s': `${2 + (i % 3)}px`,
  }))

// Fundo do topo das páginas: brilhos azul/verde, chão de grade em perspectiva andando e partículas subindo.
// Vai como primeiro filho da <section className="hero"> (que já é position: relative + overflow: hidden).
export function FundoHero({ quantidade = 14, chao = true }) {
  return (
    <>
      <div className="hero-glow hero-glow-1" />
      <div className="hero-glow hero-glow-2" />
      <div className="fx-fundo" aria-hidden="true">
        {chao && <div className="fx-chao" />}
        <div className="fx-particulas">
          {particulas(quantidade).map((s, i) => (
            <i key={i} style={s} />
          ))}
        </div>
      </div>
    </>
  )
}

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
