import { useEffect, useState } from 'react'
import IconeUI from '../../comum/IconeUI.jsx'
import { FUNDOS, PERSONAGENS } from '../../comum/assetsV2.js'
import { entrar, linkPerfil, loginAtivo, useConta } from '../../comum/conta.js'
import { mapImage, nomeMapa } from '../../comum/mapas.js'
import { usePerfis } from '../../comum/Moldura.jsx'
import { useSeguranca } from '../../comum/seguranca.js'
import { posicaoNoRanking, useMapaMaisJogado } from '../../comum/temporada.js'
import { faltamParaRanking } from '../../comum/ranking.js'
import { useT } from '../../comum/i18n.js'

// Topo do Início: saudação, chamada para jogar e o resumo da temporada de quem está logado (dados do ranking.json e do
// histórico do jogador). Cenário (Mirage) e a dupla de agentes são decorativos e ficam atrás do véu do texto.
export default function HeroInicio({ ranking }) {
  const t = useT()
  const conta = useConta()
  const seg = useSeguranca()
  const perfis = usePerfis()
  // hora só no navegador: o HTML gerado no deploy é o mesmo para todo mundo (sem "Boa tarde" errado)
  const [hora, setHora] = useState(null)
  useEffect(() => setHora(new Date().getHours()), [])
  const nome = seg?.nick || conta?.nome
  const saudacao = hora === null ? null : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <section className="v2-hero-inicio v2-cena" aria-labelledby="v2-hero-titulo">
      <img className="v2-cena-fundo" src={FUNDOS.inicio.src} width={FUNDOS.inicio.w} height={FUNDOS.inicio.h} alt="" fetchPriority="high" decoding="async" />
      <img className="v2-hero-dupla" src={PERSONAGENS.heroDupla.src} width={PERSONAGENS.heroDupla.w} height={PERSONAGENS.heroDupla.h} alt="" decoding="async" />
      <div className="v2-hero-texto">
        <p className="v2-hero-ola" title={conta && nome ? nome : undefined}>
          {conta && nome && saudacao ? (
            <>
              {t(saudacao)}, <b>{nome}</b>
            </>
          ) : (
            t('Bem-vindo à Neura Project')
          )}
        </p>
        <p className="v2-hero-sub">{t('Seu próximo nível começa aqui.')}</p>
        <p className="v2-hero-kicker">Counter-Strike 2</p>
        <h1 id="v2-hero-titulo">
          {t('Entre no jogo.')}
          <br />
          <em>{t('Evolua')}</em> {t('com a Neura.')}
        </h1>
        <p className="v2-hero-lead">{t('Partidas competitivas, ranking, inventário, caixas')}<br />{t('e uma comunidade feita por jogadores, para jogadores.')}</p>
        <div className="v2-hero-acoes">
          <a className="v2-btn v2-btn-primario" href="/lobby/">
            <IconeUI tipo="play" tamanho={18} fill="currentColor" />
            {t('Jogar agora')}
            <IconeUI tipo="seta" tamanho={18} />
          </a>
          <a className="v2-btn v2-btn-secundario" href="/ranking/">
            <IconeUI tipo="trofeu" tamanho={18} />
            {t('Ver ranking')}
          </a>
        </div>
      </div>
      <SuaTemporada ranking={ranking} perfis={perfis} conta={conta} />
    </section>
  )
}

// Louro dourado em volta da colocação (desenho, sem texto): dois ramos de folhas que se encontram embaixo
function Louro() {
  return <img className="v2-louro" src="/assets/neura-v2/laurel-ranking.svg" width="120" height="120" alt="" aria-hidden="true" />
}
function SuaTemporada({ ranking, perfis, conta }) {
  const t = useT()
  const maisJogado = useMapaMaisJogado(conta?.id)
  const { jogador, posicao } = posicaoNoRanking(ranking, perfis, conta?.id)
  const oculto = conta && perfis[conta.id]?.ocultoRanking
  const numero = (v, casas = 2) => Number(v || 0).toLocaleString(t.idioma || 'pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

  return (
    <aside className="v2-temporada v2-painel" aria-labelledby="v2-temporada-titulo">
      <header className="v2-painel-cab">
        <h2 id="v2-temporada-titulo">
          <IconeUI tipo="estatisticas" tamanho={20} />
          {t('Sua temporada')}
        </h2>
        <span className="v2-temporada-chip">{t('Temporada atual')}</span>
      </header>
      {jogador ? (
        <>
          <div className="v2-temporada-grade">
            <div className="v2-temporada-pos">
              <Louro />
              <b className="v2-num">{oculto ? '—' : posicao > 0 ? `#${posicao}` : '—'}</b>
              <span>{oculto ? t('Oculto do ranking') : posicao > 0 ? t('no ranking') : faltamParaRanking(jogador) > 0 ? t('Faltam {n} partidas para o ranking', { n: faltamParaRanking(jogador) }) : t('no ranking')}</span>
            </div>
            <dl className="v2-temporada-numeros">
              <div className="v2-temporada-rating">
                <dt>Rating</dt>
                <dd className="v2-num">{numero(jogador.rating)}</dd>
              </div>
              <div>
                <dt>K/D</dt>
                <dd className="v2-num">{numero(jogador.kd)}</dd>
              </div>
              <div>
                <dt>{t('Mapas jogados')}</dt>
                <dd className="v2-num">{Number(jogador.mapas || 0).toLocaleString(t.idioma || 'pt-BR')}</dd>
              </div>
            </dl>
          </div>
          {maisJogado && (
            <a className="v2-temporada-mapa" href={linkPerfil(conta.id)}>
              <img src={mapImage(maisJogado.id)} alt="" width="136" height="76" loading="lazy" decoding="async" />
              <span>
                <small>{t('Mapa mais jogado')}</small>
                <b>
                  {nomeMapa(maisJogado.id)} <span className="v2-num">({maisJogado.vezes}×)</span>
                </b>
              </span>
              <IconeUI tipo="direita" tamanho={18} />
            </a>
          )}
        </>
      ) : (
        <div className="v2-vazio">
          <IconeUI tipo="trofeu" tamanho={28} />
          {conta ? (
            <>
              <b>{t('Sem partidas nesta temporada')}</b>
              <span>{t('Jogue um mapa no servidor para aparecer aqui.')}</span>
              <a className="v2-btn v2-btn-secundario" href="/lobby/">{t('Montar grupo')}</a>
            </>
          ) : (
            <>
              <b>{t('Acompanhe sua temporada')}</b>
              <span>{t('Entre com a Steam para ver sua posição, rating e mapas jogados.')}</span>
              {loginAtivo() && (
                <button type="button" className="v2-btn v2-btn-primario" onClick={entrar}>
                  {t('Entrar com Steam')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  )
}
