import { useState } from 'react'
import recortes from './recortesInventario.json'

// Enquadra a arte visível sem alterar a fonte nem distorcer sua proporção.
export default function ImagemItemInventario({ src, tipo, def, pintura = 0 }) {
  const [erro, setErro] = useState(false)
  if (!src || erro) return <span className="inv-sem-img inv-arma-img" aria-hidden="true" />
  const recorte = recortes[tipo === 'caixa' ? `caixa:${src}` : `${tipo}:${def}:${tipo === 'grafite' ? pintura || 0 : 0}`]
  if (!recorte) return <img src={src} className="inv-arma-img" alt="" loading="lazy" onError={() => setErro(true)} />
  const [largura, altura, x, y, w, h] = recorte
  return (
    <svg className="inv-arma-img inv-arte-normalizada" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <image href={src} width={largura} height={altura} onError={() => setErro(true)} />
    </svg>
  )
}
