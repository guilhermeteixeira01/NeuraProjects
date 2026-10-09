import { useEffect, useState } from 'react'
import { SincronizarPreferencias } from '../../comum/preferencias.js'
import { MostrarAposIdioma, useT } from '../../comum/i18n.js'
import { FundoHero } from '../../comum/HeroFundo.jsx'

// Página 404: o GitHub Pages mostra o 404.html da raiz para qualquer endereço que não existe no site.
// O endereço digitado só é lido no navegador (o HTML gerado é o mesmo para todos), depois de montar.
// Sem o Layout: só o bloco do 404 no meio da tela (sem menu, barras laterais nem rodapé). Ficam só o tema/idioma da
// conta (SincronizarPreferencias) e o MostrarAposIdioma (a página fica escondida até traduzir).
export default function NaoEncontrada() {
  const t = useT()
  const [caminho, setCaminho] = useState('')
  useEffect(() => {
    let c = location.pathname + location.search
    try {
      c = decodeURIComponent(c)
    } catch {
      // endereço com % quebrado: mostra como veio
    }
    setCaminho(c)
    document.title = `${t('Página não encontrada')} — Neura Project`
  }, [t.idioma]) // eslint-disable-line react-hooks/exhaustive-deps

  // Partida que não existe mais: quase sempre é de uma série cancelada (sai do site depois de 5 min)
  const partida = /^\/partidas\/.+/.test(caminho)
  const perfil = /^\/perfil\b/.test(caminho)
  return (
    <>
      <main className="nf-tela">
        <section className="hero nf-hero">
          <FundoHero quantidade={14} />
          <div className="wrap nf-wrap">
            <div className="nf-codigo" aria-hidden="true">
              <span>4</span>
              <span className="nf-zero">0</span>
              <span>4</span>
            </div>
            <span className="kicker">
              <b>ERRO 404</b> {t('PÁGINA NÃO ENCONTRADA')}
            </span>
            <h1>{t('Essa página saiu do mapa')}</h1>
            <p className="nf-texto">
              {partida
                ? t('Essa partida não existe mais. Partidas de séries canceladas saem do site alguns minutos depois do cancelamento.')
                : perfil
                  ? t('Esse perfil não foi encontrado. Confira o link ou procure o jogador no ranking.')
                  : t('O link pode estar errado ou a página foi removida. Escolha um destino abaixo.')}
            </p>
            <div className="nf-acoes">
              <a className="btn btn-primary" href="/">
                {t('Voltar ao início')}
              </a>
              <a className="btn btn-ghost" href={partida ? '/partidas/' : '/ranking/'}>
                {partida ? t('Ver partidas') : t('Ver ranking')}
              </a>
              <a className="btn btn-ghost" href={partida ? '/ranking/' : '/partidas/'}>
                {partida ? t('Ver ranking') : t('Ver partidas')}
              </a>
            </div>
          </div>
        </section>
      </main>
      <SincronizarPreferencias />
      <MostrarAposIdioma />
    </>
  )
}
