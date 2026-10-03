import { useEffect, useId, useRef, useState } from 'react'
import TeamLogo from './TeamLogo.jsx'

// Campo do nome do time com as sugestões da lista do site (/times/), no visual do NeuraPick
// (no lugar do <datalist> do navegador, que não dá para estilizar).

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
  const lista = useRef(null)

  const digitado = value.trim()
  const outro = excluir.trim().toLowerCase()
  const disponiveis = times.filter((t) => t.nome.trim().toLowerCase() !== outro)

  // Se o campo já tem um time da lista escolhido, abre a lista inteira (não só ele)
  const escolhido = disponiveis.find((t) => t.nome.trim().toLowerCase() === digitado.toLowerCase())
  const busca = escolhido ? '' : digitado

  const sugestoes = disponiveis
    .filter((t) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase()))
    // Começa com o que foi digitado primeiro
    .sort((a, b) => {
      const pa = a.nome.toLowerCase().startsWith(busca.toLowerCase()) ? 0 : 1
      const pb = b.nome.toLowerCase().startsWith(busca.toLowerCase()) ? 0 : 1
      return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    })
  const mostrar = aberto && sugestoes.length > 0

  // Mantém o item ativo visível na rolagem (teclado ou lista aberta no time escolhido)
  useEffect(() => {
    if (!mostrar || !lista.current) return
    const el = lista.current.querySelector('.sug.ativo')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [ativo, mostrar])

  const escolher = (nome) => {
    onChange(nome)
    setAberto(false)
  }

  const abrir = () => {
    const i = escolhido ? sugestoes.findIndex((t) => t.nome === escolhido.nome) : 0
    setAtivo(Math.max(i, 0))
    setAberto(true)
  }

  const teclado = (e) => {
    if (!mostrar) {
      if (e.key === 'ArrowDown' && sugestoes.length) {
        e.preventDefault()
        abrir()
      }
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
          abrir()
        }}
        onClick={() => {
          if (!aberto) abrir()
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
        <ul ref={lista} className={`sugestoes team-${team}`} id={idLista} role="listbox">
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
