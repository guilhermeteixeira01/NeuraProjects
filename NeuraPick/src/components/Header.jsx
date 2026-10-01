import { memo, useEffect } from 'react'

// Menu do site inteiro: quem monta é /assets/js/site.js (o mesmo das outras páginas da Neura).
// memo: o React nunca redesenha este elemento, então não apaga o menu que o script colocou.
function Header() {
  useEffect(() => {
    window.NEURA?.montar()
  }, [])

  return <header data-site-nav />
}

export default memo(Header)
