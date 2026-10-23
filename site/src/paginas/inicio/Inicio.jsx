import { useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
import { lerJson } from '../../comum/dados.js'
import { Contador } from '../../comum/efeitos.jsx'
import Letreiro from '../../comum/Letreiro.jsx'
import { Icone, IconeDiscord } from '../../comum/Icones.jsx'
import { useT } from '../../comum/i18n.js'
import { useAcessoPick } from '../../comum/Moldura.jsx'
import LiveTwitch from './LiveTwitch.jsx'
import TimesCarrossel from './TimesCarrossel.jsx'

const SETA = (
  <Icone tamanho={14} traco={2.4}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Icone>
)

// Ícones dos projetos (os mesmos no painel do topo e nos cards)
const IC_PERFIL = (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>
)
const IC_TROFEU = (
  <>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
  </>
)
const IC_PICK = (
  <>
    <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" />
    <line x1="8" y1="3" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="21" />
  </>
)
const IC_PARTIDAS = (
  <>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 5-6" />
  </>
)
const IC_SERVIDOR = (
  <>
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </>
)
const IC_RELOGIO = (
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>
)
const IC_ESCUDO = <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
const IC_ALVO = (
  <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </>
)
const IC_PESSOAS = (
  <>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>
)

// Letreiro que passa sem parar embaixo do topo
const LETREIRO = [
  [IC_PESSOAS, 'Comunidade em primeiro lugar'],
  [IC_ALVO, 'Foco no competitivo'],
  [IC_RELOGIO, 'Atualizações constantes'],
  [IC_ESCUDO, 'Gratuito para a comunidade'],
  [IC_PICK, 'Pick & Ban de CS2'],
  [IC_PARTIDAS, 'Estatísticas de cada mapa'],
  [IC_SERVIDOR, 'Servidor competitivo'],
]

const PRINCIPIOS = [
  [
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />,
    'A comunidade decide junto',
    'Sugestões e problemas chegam pela comunidade no Discord e viram prioridade. A gente constrói o que os jogadores realmente usam.',
    'COMUNIDADE',
  ],
  [
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
    'Ferramenta boa resolve problema real',
    'Nada de recurso para enfeitar: cada sistema tira uma fricção de quem joga, do veto ao servidor.',
    'PRODUTO',
  ],
  [
    IC_ESCUDO,
    'Partida justa',
    'Lados definidos pelo veto, round faca, pausa com regra e demo de todo mapa: o resultado fica registrado para qualquer um conferir.',
    'COMPETITIVO',
  ],
  [IC_RELOGIO, 'Sempre evoluindo', 'Os projetos recebem atualizações frequentes — e o que muda aparece primeiro na comunidade.', 'CONTÍNUO'],
]

// Âncoras das seções do índice vertical do topo

const FICHA = [
  ['ESTÚDIO', 'Neura Project'],
  ['FORMATO', 'Independente'],
  ['FOCO', 'Jogos e competitivo'],
  ['BASE', 'Brasil'],
  ['COMUNIDADE', 'Discord'],
]

// Link da comunidade no Discord (some se não tiver comunidade configurada)
function LinkComunidade({ className, children }) {
  if (!CONFIG.comunidade) return null
  return (
    <a className={className} href={CONFIG.comunidade} target="_blank" rel="noopener">
      {children}
    </a>
  )
}

// Números do servidor (contam ao aparecer): mapas jogados, jogadores no ranking, kills
function useNumeros() {
  const [n, setN] = useState({ mapas: null, jogadores: null, kills: null })
  useEffect(() => {
    Promise.all([lerJson('/partidas/partidas.json'), lerJson('/ranking/ranking.json')]).then(([lista, ranking]) => {
      const jogadores = Array.isArray(ranking?.jogadores) ? ranking.jogadores : []
      setN({
        mapas: Array.isArray(lista) ? lista.length : 0,
        jogadores: jogadores.length,
        kills: jogadores.reduce((s, j) => s + (j.kills || 0), 0),
      })
    })
  }, [])
  return n
}

// Seção que está na tela (acende o número no índice do topo)

export default function Inicio() {
  const verPick = useAcessoPick()
  const t = useT()
  const numeros = useNumeros()

  return (
    <Layout pagina="inicio">
      <main className="inicio">
        {/* TOPO */}
        <section className="ix-hero">
          <div className="wrap">
          <div className="ix-hero-card">
            <img className="ix-fundo" src="/assets/banners/inicio.webp" alt="" width="1726" height="911" fetchpriority="high" decoding="async" />
            <div className="ix-fundo-vu" aria-hidden="true" />
            <div className="ix-hero-texto">
              <span className="kicker fx-entra" style={{ '--e': 1 }}>{t('SERVIDOR COMPETITIVO DE CS2')}</span>
              <h1 className="fx-entra" style={{ '--e': 2 }}>
                <span>{t('Jogue.')}</span>
                <span className="ix-destaque">{t('Compita.')}</span>
                <span>{t('Evolua.')}</span>
              </h1>
              <p className="ix-lead fx-entra" style={{ '--e': 3 }}>
                {t('Pick & Ban de CS2, servidor competitivo, estatísticas de cada mapa, ranking e níveis. Tudo feito por jogadores, para quem joga de verdade.')}
              </p>
              <div className="ix-acoes fx-entra" style={{ '--e': 4 }}>
                <LinkComunidade className="btn btn-primary btn-lg">
                  <IconeDiscord tamanho={18} /> {t('Entrar no Discord')}
                </LinkComunidade>
                <a className="btn btn-ghost btn-lg" href="/partidas/">
                  {t('Ver partidas')} {SETA}
                </a>
              </div>
            </div>
          </div>
          </div>
        </section>

        {/* FAIXA: números do servidor */}
        <section className="wrap ix-faixa-sec" aria-label={t('Números do servidor')}>
          <div className="ix-quadro fx-entra" style={{ '--e': 5 }}>
            <div className="ix-quadro-in">
              <div className="ix-faixa-titulo">
                <span className="kicker">{t('NO SERVIDOR')}</span>
                <b>{t('Jogue. Compita. Evolua.')}</b>
              </div>
              <dl className="ix-numeros">
                <div>
                  <dd>
                    <Contador valor={numeros.mapas} />
                  </dd>
                  <dt>{t('MAPAS JOGADOS')}</dt>
                </div>
                <div>
                  <dd>
                    <Contador valor={numeros.jogadores} />
                  </dd>
                  <dt>{t('JOGADORES')}</dt>
                </div>
                <div>
                  <dd>
                    <Contador valor={numeros.kills} />
                  </dd>
                  <dt>KILLS</dt>
                </div>
              </dl>
              <a className="btn btn-ghost ix-faixa-botao" href="/ranking/">
                {t('Ver ranking')}
              </a>
            </div>
          </div>
        </section>

        {/* EM DESTAQUE */}
        <section className="wrap ix-dest-sec" aria-label={t('Em destaque')}>
          <h2 className="ix-titulo-linha">
            {t('Em destaque')}
          </h2>
          <ul className="ix-destaques">
            {[
              ['/partidas/', '/neurapick/maps/mirage.jpg', 'Partidas', 'Placar, rounds e demo de cada mapa'],
              ['/ranking/', '/assets/insignia/web/arsenal-afiado-diamante.webp', 'Ranking', 'Níveis, XP e o top do servidor', 'azul'],
              ['/loja/', '/assets/caixas/web/caixa-anime-naruto.webp', 'Loja', 'Caixas de skins com Neura Pontos', 'ouro'],
              ...(verPick ? [['/neurapick/', '/neurapick/maps/inferno.jpg', 'NeuraPick', 'Veto de mapas no padrão dos campeonatos']] : []),
            ].map(([href, img, nome, texto, arte]) => (
              <li key={href}>
                <a href={href}>
                  <span className={`ix-thumb${arte ? ` ix-thumb-arte ix-thumb-${arte}` : ''}`}>
                    <img src={img} alt="" loading="lazy" decoding="async" />
                  </span>
                  <b>{t(nome)}</b>
                  <small>{t(texto)}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* LETREIRO */}
        <Letreiro itens={LETREIRO} />

        {/* AO VIVO (Twitch): canais em assets/data/twitch.json; sem canal, não aparece */}
        <LiveTwitch />

        {/* TIMES REGISTRADOS (assets/data/times.json): carrossel com os logos */}
        <TimesCarrossel />

        {/* PROJETOS */}
        <section className="secao" id="projetos">
          <div className="wrap">
            <div className="secao-head reveal">
              <span className="kicker">
                <b>01</b> {t('O QUE FAZEMOS')}
              </span>
              <h2>{t('Nossos projetos')}</h2>
              <p>{t('Cada projeto nasce de um problema real de quem joga: montar o veto de um campeonato, jogar uma partida justa, entender o que aconteceu nela e ver a sua evolução.')}</p>
            </div>

            <div className={`projetos${verPick ? '' : ' tres'}`}>
              {[
                {
                  href: '/neurapick/',
                  cor: 'var(--green)',
                  brilho: 'rgba(61,220,132,.16)',
                  icone: IC_PICK,
                  tag: ['ONLINE', 'verde'],
                  titulo: 'NeuraPick — Pick & Ban',
                  texto:
                    'Veto de mapas do CS2 no padrão dos campeonatos: MD1, MD3 e MD5, escolha de lado, decider, timer e logo dos times. No fim, um comando configura a série inteira no servidor.',
                  link: 'Fazer um veto',
                  grande: true,
                },
                {
                  href: '/partidas/',
                  cor: 'var(--orange)',
                  brilho: 'rgba(255,122,26,.14)',
                  icone: IC_PARTIDAS,
                  tag: ['ONLINE', 'verde'],
                  titulo: 'Partidas e estatísticas',
                  texto:
                    'Cada mapa jogado no servidor vira uma página: placar, rounds, rating, ADR, KAST, destaques e a demo para baixar — com as séries MD3/MD5 ao vivo.',
                  link: 'Ver partidas',
                },
                {
                  href: '/ranking/',
                  cor: 'var(--blue-2)',
                  brilho: 'rgba(26,115,232,.18)',
                  icone: IC_TROFEU,
                  tag: ['ONLINE', 'verde'],
                  titulo: 'Ranking, níveis e perfil',
                  texto:
                    'Cada partida no servidor dá XP: suba do nível 1 ao 10, entre no top 15 e personalize seu perfil com moldura de avatar e o seu time.',
                  link: 'Ver ranking',
                },
                {
                  comunidade: true,
                  cor: 'var(--yellow)',
                  brilho: 'rgba(245,197,66,.12)',
                  icone: IC_SERVIDOR,
                  tag: ['CS2', ''],
                  titulo: 'Servidor competitivo',
                  texto:
                    'Nosso servidor de CS2 com espera 5x5, round faca, séries do NeuraPick, pausa igual GC, demos gravadas automaticamente e chat com cargos.',
                  link: 'Jogar com a gente',
                  grande: true,
                },
              ]
                .filter((p) => p.href !== '/neurapick/' || verPick)
                .map((p, i) => {
                const conteudo = (
                  <>
                    <span className="projeto-num">0{i + 1}</span>
                    <div className="projeto-topo">
                      <span className="ico">
                        <Icone tamanho={22}>{p.icone}</Icone>
                      </span>
                      <span className={`tag ${p.tag[1]}`}>{p.tag[0]}</span>
                    </div>
                    <h3>{t(p.titulo)}</h3>
                    <p>{t(p.texto)}</p>
                    <span className="projeto-link">
                      {t(p.link)} {SETA}
                    </span>
                  </>
                )
                const props = {
                  className: `projeto spot reveal${p.grande ? ' grande' : ''}`,
                  style: { '--d': `${i * 0.07}s`, '--cor': p.cor, '--brilho': p.brilho },
                }
                if (p.comunidade)
                  return CONFIG.comunidade ? (
                    <a key={i} {...props} href={CONFIG.comunidade} target="_blank" rel="noopener">
                      {conteudo}
                    </a>
                  ) : (
                    <div key={i} {...props}>
                      {conteudo}
                    </div>
                  )
                return (
                  <a key={i} {...props} href={p.href}>
                    {conteudo}
                  </a>
                )
              })}
            </div>
          </div>
        </section>

        {/* SOBRE: banda com imagem e a ficha do estúdio */}
        <section className="ix-banda" id="sobre">
          <div className="wrap ix-banda-grade">
            <figure className="ix-banda-arte reveal">
              <img src="/assets/banners/inicio.webp" alt="" width="1726" height="911" loading="lazy" decoding="async" />
            </figure>
            <div className="ix-banda-texto reveal" style={{ '--d': '.08s' }}>
              <span className="kicker">{t('SOBRE A NEURA')}</span>
              <h2>{t('Um estúdio pequeno, feito por jogadores')}</h2>
              <p>{t('A Neura Project nasceu da vontade de ter ferramentas melhores para jogar: veto de mapas sem planilha, servidor com estatística de verdade e os jogos organizados num só lugar. Então começamos a construir as ferramentas que a gente queria usar.')}</p>
              <p>{t('Hoje somos um estúdio independente focado em jogos — pequeno de propósito. Isso deixa a gente perto de quem usa: ideia que chega na comunidade do Discord vira recurso, bug reportado vira correção.')}</p>
              <p>{t('O objetivo é simples: tornar o competitivo mais organizado, justo e divertido, para campeonatos de amigos e para a comunidade inteira.')}</p>
              <dl className="ix-ficha">
                {FICHA.map(([rotulo, valor]) => (
                  <div key={rotulo}>
                    <dt>{t(rotulo)}</dt>
                    <dd>{t(valor)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* COMO TRABALHAMOS: quatro colunas */}
        <section className="ix-banda ix-banda-colunas" id="principios">
          <div className="wrap">
            <h2 className="ix-titulo-linha">{t('O que guia cada projeto')}</h2>
            <ol className="ix-principios">
              {PRINCIPIOS.map(([icone, titulo, texto, tag], i) => (
                <li key={titulo} className="reveal" style={{ '--d': `${i * 0.07}s` }}>
                  <span className="ix-pico">
                    <Icone tamanho={26}>{icone}</Icone>
                  </span>
                  <small>{t(tag)}</small>
                  <h3>{t(titulo)}</h3>
                  <p>{t(texto)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COMUNIDADE: barra de cor cheia */}
        <section className="ix-barra" id="comunidade">
          <div className="wrap ix-barra-grade">
            <div className="ix-barra-texto">
              <h2>{t('Vem jogar com a Gente !')}</h2>
              <p>{t('Entre na nossa comunidade no Discord para jogar no servidor, participar dos campeonatos e acompanhar o que estamos criando.')}</p>
            </div>
            <div className="ix-barra-acoes">
              <LinkComunidade className="ix-barra-botao">
                <IconeDiscord tamanho={20} /> <span>{t('Entrar no Discord')}</span>
              </LinkComunidade>
              <a className="ix-barra-link" href="/partidas/">
                {t('Ver últimas partidas')} {SETA}
              </a>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
