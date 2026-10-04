import { Icone } from './Icones.jsx'

// Faixa de destaques passando sem parar (para quando o mouse fica em cima). Estilo em paginas.css (.letreiro).
// itens: [[ícone (conteúdo do <svg>), texto], ...]. O grupo vai duplicado para a volta ficar contínua.
export default function Letreiro({ itens }) {
  return (
    <div className="letreiro" aria-label="Destaques">
      <div className="letreiro-trilho">
        {[0, 1].map((copia) => (
          <div key={copia} className="letreiro-grupo" aria-hidden={copia === 1}>
            {itens.map(([icone, texto]) => (
              <span key={texto} className="faixa-item">
                <Icone tamanho={15}>{icone}</Icone>
                {texto}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
