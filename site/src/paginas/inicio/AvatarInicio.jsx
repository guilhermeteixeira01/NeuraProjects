import { ComMoldura } from '../../comum/Moldura.jsx'
import { useAvatar } from '../../comum/avatares.js'

// Mesma identidade atualizada usada no perfil e no lobby, sem a foto histórica da partida.
export default function AvatarInicio({ id, foto, tamanho = 48 }) {
  const atual = useAvatar(id, foto || '/assets/logos/logo-np-64.png')
  return <span className="np-avatar-inicio" style={{ '--avatar-inicio': `${tamanho}px` }}>
    <ComMoldura steamId={id}><img src={atual} alt="" width={tamanho} height={tamanho} loading="lazy" /></ComMoldura>
  </span>
}
