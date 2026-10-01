import { useId, useRef, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'

// Campo do nome do time com as sugestões da lista do site (/times/), no visual do NeuraPick
// (no lugar do <datalist> do navegador, que não dá para estilizar).
const MAX_SUGESTOES = 8

// Destaca o trecho digitado dentro do nome
function Destaque({ texto, busca }) {
  const i = busca ? texto.toLowerCase().indexOf(busca.toLowerCase()) : -1
  if (i < 0) return texto
  return (
    <>
      {texto.slice(0, i)}
      <mark>{texto.slice(i, i + busca.length)}</mark>
      {texto.slice(i + busca.length)}
    </>
  )
}

// excluir = nome do time do outro lado (não aparece nas sugestões: o mesmo time não joga contra ele mesmo)
export default function TeamCombo({ value, onChange, times, team, placeholder, excluir = '' }) {
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const idLista = useId()
  const fechar = useRef(null)

  const busca = value.trim()
  const outro = excluir.trim().toLowerCase()
  const sugestoes = times
    .filter((t) => t.nome.trim().toLowerCase() !== outro)
    .filter((t) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase()))
    // Começa com o que foi digitado primeiro
    .sort((a, b) => {
      const pa = a.nome.toLowerCase().startsWith(busca.toLowerCase()) ? 0 : 1
      const pb = b.nome.toLowerCase().startsWith(busca.toLowerCase()) ? 0 : 1
      return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    })
    .slice(0, MAX_SUGESTOES)
  // Não mostra a lista quando o nome já é exatamente o único time encontrado
  const exato = sugestoes.length === 1 && sugestoes[0].nome.toLowerCase() === busca.toLowerCase()
  const mostrar = aberto && sugestoes.length > 0 && !exato

  const escolher = (nome) => {
    onChange(nome)
    setAberto(false)
  }

  const teclado = (e) => {
    if (!mostrar) {
      if (e.key === 'ArrowDown' && sugestoes.length) setAberto(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo((i) => (i + 1) % sugestoes.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((i) => (i - 1 + sugestoes.length) % sugestoes.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      escolher(sugestoes[Math.min(ativo, sugestoes.length - 1)].nome)
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  return (
    <span className="combo">
      <input
        className="nome-lista"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setAberto(true)
          setAtivo(0)
        }}
        onFocus={() => {
          clearTimeout(fechar.current)
          setAberto(true)
        }}
        onBlur={() => {
          fechar.current = setTimeout(() => setAberto(false), 120)
        }}
        onKeyDown={teclado}
        placeholder={placeholder}
        maxLength={24}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
      />
      {mostrar && (
        <ul className={`sugestoes team-${team}`} id={idLista} role="listbox">
          <li className="sugestoes-head" aria-hidden="true">
            LISTA DE TIMES
          </li>
          {sugestoes.map((t, i) => (
            <li
              key={t.nome}
              role="option"
              aria-selected={i === ativo}
              className={`sug ${i === ativo ? 'ativo' : ''}`}
              onMouseEnter={() => setAtivo(i)}
              // mousedown: escolhe antes de o campo perder o foco
              onMouseDown={(e) => {
                e.preventDefault()
                escolher(t.nome)
              }}
            >
              <TeamLogo url={t.logo} name={t.nome} team={team} size={28} />
              <span className="sug-nome">
                <Destaque texto={t.nome} busca={busca} />
              </span>
              {!t.logo && <span className="sug-sem">sem logo</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
