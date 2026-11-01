import { useState } from 'react'
import { ComMoldura } from '../../comum/Moldura.jsx'
import { useAvatar } from '../../comum/avatares.js'
import { urlOk } from '../../comum/dados.js'
const iniciais = nome => (String(nome || '?').match(/[\p{L}\p{N}]/gu) || []).slice(0,2).join('').toUpperCase() || '?'

// Foto da Steam ou as iniciais
function Avatar({ e, classe }) {
  const src = useAvatar(e?.steamId, e?.avatar) // foto atual da Steam (a do partida.json é a do dia do jogo)
  const [erro, setErro] = useState('')
  return urlOk(src) && erro !== src ? (
    <img className={classe} src={src} alt="" loading="lazy" onError={() => setErro(src)} />
  ) : (
    <span className={`${classe} av-fb`}>{iniciais(e?.nome)}</span>
  )
}

// A área é sempre quadrada; o contorno e o emblema continuam sendo os escolhidos no perfil.
export default function FotoJogador({ e, tamanho = 32 }) {
  return <span className="resultado-avatar" style={{ width: tamanho, height: tamanho }}><span className="resultado-avatar-miolo"><ComMoldura steamId={e?.steamId} emblema><Avatar e={e} classe="resultado-avatar-imagem"/></ComMoldura></span></span>
}

