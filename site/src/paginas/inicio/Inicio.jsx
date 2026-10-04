import { useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
import { lerJson } from '../../comum/dados.js'
import { Contador, useInclinar } from '../../comum/efeitos.jsx'
import { FundoHero, Palavras } from '../../comum/HeroFundo.jsx'
import Letreiro from '../../comum/Letreiro.jsx'
import { Icone } from '../../comum/Icones.jsx'

const SETA = (
  <Icone tamanho={14} traco={2.4}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Icone>
)

// Ícones dos projetos (os mesmos no painel do topo e nos cards)
const IC_LAUNCHER = (
  <>
    <rect x="2" y="4" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 18v3" />
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
    'Sugestões e problemas chegam pelo Discord e viram prioridade. A gente constrói o que os jogadores realmente usam.',
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

const FICHA = [
  ['ESTÚDIO', 'Neura Project'],
  ['FORMATO', 'Independente'],
  ['FOCO', 'Jogos e competitivo'],
  ['BASE', 'Brasil'],
  ['COMUNIDADE', 'Discord'],
]

// Link do Discord (some se não tiver Discord configurado)
function LinkDiscord({ className, children }) {
  if (!CONFIG.discord) return null
  return (
    <a className={className} href={CONFIG.discord} target="_blank" rel="noopener">
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

export default function Inicio() {
  const launcher = CONFIG.launcherAtivo
  const painel = useInclinar(7)
  const numeros = useNumeros()

  return (
    <Layout pagina="inicio">
      <main className="inicio">
        {/* TOPO */}
        <section className="hero hx">
          <FundoHero quantidade={18} />

          <div className="wrap hero-inner">
            <div className="hx-texto">
              <span className="chip fx-entra" style={{ '--e': 0 }}>
                <span className="ponto" />
                ESTÚDIO INDEPENDENTE · BRASIL
              </span>
              <h1 className="hx-titulo">
                <Palavras texto="Jogos e ferramentas feitos por" />
                <span className="fx-gradiente">
                  <Palavras texto="quem joga." inicio={5} />
                </span>
              </h1>
              <p className="lead fx-entra" style={{ '--e': 4 }}>
                A Neura Project é um pequeno estúdio focado em jogos. Criamos ferramentas para a comunidade competitiva — do
                launcher que organiza seus jogos ao Pick &amp; Ban e às estatísticas das partidas do nosso servidor.
              </p>
              <div className="hero-acoes fx-entra" style={{ '--e': 5 }}>
                <a className="btn btn-primary btn-lg btn-brilho" href="#projetos">
                  <Icone tamanho={15} traco={2.4}>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </Icone>
                  Ver projetos
                </a>
                <LinkDiscord className="btn btn-ghost btn-lg btn-borda">Entrar na comunidade</LinkDiscord>
              </div>
              <dl className="hx-numeros fx-entra" style={{ '--e': 6 }}>
                <div>
                  <dt>MAPAS JOGADOS</dt>
                  <dd>
                    <Contador valor={numeros.mapas} />
                  </dd>
                </div>
                <div>
                  <dt>JOGADORES</dt>
                  <dd>
                    <Contador valor={numeros.jogadores} />
                  </dd>
                </div>
                <div>
                  <dt>KILLS</dt>
                  <dd>
                    <Contador valor={numeros.kills} />
                  </dd>
                </div>
              </dl>
            </div>

            {/* Painel com inclinação 3D e borda luminosa girando */}
            <div className="hx-cena fx-entra" style={{ '--e': 3 }}>
              <div className="hx-radar" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="hx-painel" ref={painel}>
                <div className="painel">
                  <div className="painel-head">
                    <span className="mono">
                      <span className="hx-pisca">▮</span> PROJETOS NEURA
                    </span>
                    <span className="luzes" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <a className="painel-linha spot" href="/launcher/">
                    <span className="ico">
                      <Icone>{IC_LAUNCHER}</Icone>
                    </span>
                    <span>
                      <b>Neura Launcher</b>
                      <small>Seus jogos num só lugar</small>
                    </span>
                    <span className={`estado${launcher ? '' : ' breve'}`}>{launcher ? 'DISPONÍVEL' : 'EM BREVE'}</span>
                  </a>
                  <a className="painel-linha spot" href="/neurapick/">
                    <span className="ico">
                      <Icone>{IC_PICK}</Icone>
                    </span>
                    <span>
                      <b>NeuraPick</b>
                      <small>Pick &amp; Ban de mapas do CS2</small>
                    </span>
                    <span className="estado">ONLINE</span>
                  </a>
                  <a className="painel-linha spot" href="/partidas/">
                    <span className="ico">
                      <Icone>{IC_PARTIDAS}</Icone>
                    </span>
                    <span>
                      <b>Partidas</b>
                      <small>Estatísticas de cada mapa jogado</small>
                    </span>
                    <span className="estado">ONLINE</span>
                  </a>
                  <a className="painel-linha spot" href="/ranking/">
                    <span className="ico">
                      <Icone>
                        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
                        <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
                      </Icone>
                    </span>
                    <span>
                      <b>Ranking</b>
                      <small>Top 15 jogadores do servidor</small>
                    </span>
                    <span className="estado">ONLINE</span>
                  </a>
                  <div className="painel-rodape">
                    <span className="mono">FEITO NO BRASIL</span>
                    <span className="mono hx-sys">
                      <i /> SISTEMAS OPERANDO
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <a className="hx-rolar" href="#projetos" aria-label="Ir para os projetos">
            <span />
          </a>
        </section>

        {/* LETREIRO */}
        <Letreiro itens={LETREIRO} />

        {/* PROJETOS */}
        <section className="secao" id="projetos">
          <div className="wrap">
            <div className="secao-head reveal">
              <span className="kicker">
                <b>01</b> O QUE FAZEMOS
              </span>
              <h2>Nossos projetos</h2>
              <p>
                Cada projeto nasce de um problema real de quem joga: organizar os jogos, montar o veto de um campeonato,
                jogar uma partida justa e entender o que aconteceu nela.
              </p>
            </div>

            <div className="projetos">
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
                  href: '/launcher/',
                  cor: 'var(--blue-2)',
                  brilho: 'rgba(26,115,232,.18)',
                  icone: IC_LAUNCHER,
                  tag: launcher ? ['DISPONÍVEL', 'verde'] : ['EM BREVE', 'amarelo'],
                  titulo: 'Neura Launcher',
                  texto:
                    'Um launcher para vários jogos: encontra suas instalações, mantém tudo atualizado e reúne amigos, chat, servidores e notícias num só lugar.',
                  link: 'Conhecer o launcher',
                },
                {
                  discord: true,
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
              ].map((p, i) => {
                const conteudo = (
                  <>
                    <span className="projeto-num">0{i + 1}</span>
                    <div className="projeto-topo">
                      <span className="ico">
                        <Icone tamanho={22}>{p.icone}</Icone>
                      </span>
                      <span className={`tag ${p.tag[1]}`}>{p.tag[0]}</span>
                    </div>
                    <h3>{p.titulo}</h3>
                    <p>{p.texto}</p>
                    <span className="projeto-link">
                      {p.link} {SETA}
                    </span>
                  </>
                )
                const props = {
                  className: `projeto spot reveal${p.grande ? ' grande' : ''}`,
                  style: { '--d': `${i * 0.07}s`, '--cor': p.cor, '--brilho': p.brilho },
                }
                if (p.discord)
                  return CONFIG.discord ? (
                    <a key={i} {...props} href={CONFIG.discord} target="_blank" rel="noopener">
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

        {/* SOBRE */}
        <section className="secao" id="sobre">
          <div className="wrap sobre">
            <div className="sobre-texto reveal">
              <div className="secao-head" style={{ marginBottom: 22 }}>
                <span className="kicker">
                  <b>02</b> SOBRE A NEURA
                </span>
                <h2>Um estúdio pequeno, feito por jogadores</h2>
              </div>
              <p>
                A <strong>Neura Project</strong> nasceu da vontade de ter ferramentas melhores para jogar: veto de mapas sem
                planilha, servidor com estatística de verdade e os jogos organizados num só lugar. Então começamos a construir
                as ferramentas que a gente queria usar.
              </p>
              <p>
                Hoje somos um <strong>estúdio independente</strong> focado em jogos — pequeno de propósito. Isso deixa a gente
                perto de quem usa: ideia que chega no Discord vira recurso, bug reportado vira correção.
              </p>
              <p>
                O objetivo é simples: tornar o competitivo mais organizado, justo e divertido, para campeonatos de amigos e
                para a comunidade inteira.
              </p>
            </div>
            <div className="hud-frame reveal" style={{ '--d': '.1s' }}>
              <div className="ficha">
                <div className="ficha-scan" aria-hidden="true" />
                {FICHA.map(([rotulo, valor]) => (
                  <div key={rotulo} className="ficha-linha">
                    <span className="mono">{rotulo}</span>
                    <span>{valor}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* COMO TRABALHAMOS */}
        <section className="secao">
          <div className="wrap">
            <div className="secao-head reveal">
              <span className="kicker">
                <b>03</b> COMO TRABALHAMOS
              </span>
              <h2>O que guia cada projeto</h2>
            </div>
            <ol className="trilha">
              {PRINCIPIOS.map(([icone, titulo, texto, tag], i) => (
                <li key={titulo} className="trilha-item spot reveal" style={{ '--d': `${i * 0.08}s`, '--n': i }}>
                  <span className="trilha-no">
                    <Icone>{icone}</Icone>
                  </span>
                  <div className="trilha-corpo">
                    <span className="mono">
                      {String(i + 1).padStart(2, '0')} · {tag}
                    </span>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COMUNIDADE */}
        <section className="cta cta-painel">
          <div className="wrap">
            <div className="cta-x spot reveal">
              <div className="cta-inner">
                <span className="kicker">
                  <b>04</b> COMUNIDADE
                </span>
                <h2>Joga com a gente?</h2>
                <p className="lead">
                  Entre no Discord para jogar no servidor, participar dos campeonatos e acompanhar o que estamos criando.
                </p>
                <div className="cta-acoes">
                  <LinkDiscord className="btn btn-discord btn-lg btn-brilho">Entrar no Discord</LinkDiscord>
                  <a className="btn btn-ghost btn-lg btn-borda" href="/partidas/">
                    Ver últimas partidas
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
