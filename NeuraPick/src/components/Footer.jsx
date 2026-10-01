import { memo, useEffect } from 'react'

// Rodapé do site inteiro: quem monta é /assets/js/site.js (o mesmo das outras páginas da Neura)
function Footer() {
  useEffect(() => {
    window.NEURA?.montar()
  }, [])

  return <footer data-site-footer />
}

export default memo(Footer)
