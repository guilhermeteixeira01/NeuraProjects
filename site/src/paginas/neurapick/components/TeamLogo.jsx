import { useEffect, useState } from 'react'

// Logo do time por URL (opcional). Sem URL, ou se a imagem não carregar, mostra as iniciais do time.
export const MAX_LOGO_URL = 300

// Só http(s) e sem caracteres que quebram o comando no console do servidor
export const logoValido = (url) => {
  const u = (url || '').trim()
  return u.length > 0 && u.length <= MAX_LOGO_URL && /^https?:\/\/\S+$/i.test(u) && !/[;"\\]/.test(u)
}

const iniciais = (nome) =>
  (nome || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'

export default function TeamLogo({ url, name, team, size = 40 }) {
  const [erro, setErro] = useState(false)
  useEffect(() => setErro(false), [url])

  const mostrar = logoValido(url) && !erro
  return (
    <span className={`team-logo team-logo-${team}`} style={{ '--size': `${size}px` }} aria-hidden="true">
      {mostrar ? <img src={url.trim()} alt="" onError={() => setErro(true)} /> : <span>{iniciais(name)}</span>}
    </span>
  )
}
