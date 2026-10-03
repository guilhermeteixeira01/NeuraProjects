import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
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

const FAIXA = [
  [
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
    'Comunidade em primeiro lugar',
  ],
  [
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>,
    'Foco no competitivo',
  ],
  [IC_RELOGIO, 'Atualizações constantes'],
  [IC_ESCUDO, 'Gratuito para a comunidade'],
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
  [
    IC_RELOGIO,
    'Sempre evoluindo',
    'Os projetos recebem atualizações frequentes — e o que muda aparece primeiro na comunidade.',
    'CONTÍNUO',
    'verde',
  ],
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

export default function Inicio() {
  const launcher = CONFIG.launcherAtivo
  return (
    <Layout pagina="inicio">
      <main>
        {/* TOPO */}
        <section className="hero">
          <div className="hero-glow hero-glow-1" />
          <div className="hero-glow hero-glow-2" />
          <div className="wrap hero-inner">
            <div className="reveal">
              <span className="chip">
                <span className="ponto" />
                ESTÚDIO INDEPENDENTE · BRASIL
              </span>
              <h1>
                Jogos e ferramentas feitos por <span className="destaque">quem joga.</span>
              </h1>
              <p className="lead">
                A Neura Project é um pequeno estúdio focado em jogos. Criamos ferramentas para a comunidade competitiva — do
                launcher que organiza seus jogos ao Pick &amp; Ban e às estatísticas das partidas do nosso servidor.
              </p>
              <div className="hero-acoes">
                <a className="btn btn-primary btn-lg" href="#projetos">
                  <Icone tamanho={15} traco={2.4}>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </Icone>
                  Ver projetos
                </a>
                <LinkDiscord className="btn btn-ghost btn-lg">Entrar na comunidade</LinkDiscord>
              </div>
              <div className="hero-meta">
                <span>LAUNCHER</span>
                <span className="sep">/</span>
                <span>PICK &amp; BAN</span>
                <span className="sep">/</span>
                <span>SERVIDOR CS2</span>
                <span className="sep">/</span>
                <span>ESTATÍSTICAS</span>
              </div>
            </div>

            <div className="hud-frame reveal" style={{ '--d': '.12s' }}>
              <div className="painel">
                <div className="painel-head">
                  <span className="mono">// PROJETOS NEURA</span>
                  <span className="luzes" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <a className="painel-linha" href="/launcher/">
                  <span className="ico">
                    <Icone>{IC_LAUNCHER}</Icone>
                  </span>
                  <span>
                    <b>Neura Launcher</b>
                    <small>Seus jogos num só lugar</small>
                  </span>
                  <span className={`estado${launcher ? '' : ' breve'}`}>{launcher ? 'DISPONÍVEL' : 'EM BREVE'}</span>
                </a>
                <a className="painel-linha" href="/neurapick/">
                  <span className="ico">
                    <Icone>{IC_PICK}</Icone>
                  </span>
                  <span>
                    <b>NeuraPick</b>
                    <small>Pick &amp; Ban de mapas do CS2</small>
                  </span>
                  <span className="estado">ONLINE</span>
                </a>
                <a className="painel-linha" href="/partidas/">
                  <span className="ico">
                    <Icone>{IC_PARTIDAS}</Icone>
                  </span>
                  <span>
                    <b>Partidas</b>
                    <small>Estatísticas de cada mapa jogado</small>
                  </span>
                  <span className="estado">ONLINE</span>
                </a>
                <div className="painel-rodape">
                  <span className="mono">FEITO NO BRASIL</span>
                  <span className="mono">EM DESENVOLVIMENTO ATIVO</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAIXA */}
        <div className="faixa">
          <div className="wrap">
            {FAIXA.map(([icone, texto]) => (
              <span key={texto} className="faixa-item">
                <Icone tamanho={15}>{icone}</Icone>
                {texto}
              </span>
            ))}
          </div>
        </div>

        {/* PROJETOS */}
        <section className="secao" id="projetos">
          <div className="wrap">
            <div className="secao-head reveal">
              <span className="mono">// O QUE FAZEMOS</span>
              <h2>Nossos projetos</h2>
              <p>
                Cada projeto nasce de um problema real de quem joga: organizar os jogos, montar o veto de um campeonato,
                jogar uma partida justa e entender o que aconteceu nela.
              </p>
            </div>

            <div className="projetos">
              <a className="projeto reveal" href="/launcher/" style={{ '--cor': 'var(--blue-2)', '--brilho': 'rgba(26,115,232,.14)' }}>
                <div className="projeto-topo">
                  <span className="ico">
                    <Icone tamanho={20}>{IC_LAUNCHER}</Icone>
                  </span>
                  <span className={`tag ${launcher ? 'verde' : 'amarelo'}`}>{launcher ? 'DISPONÍVEL' : 'EM BREVE'}</span>
                </div>
                <h3>Neura Launcher</h3>
                <p>
                  Um launcher para vários jogos: encontra suas instalações, mantém tudo atualizado e reúne amigos, chat,
                  servidores e notícias num só lugar.
                </p>
                <span className="projeto-link">Conhecer o launcher {SETA}</span>
              </a>

              <a className="projeto reveal" href="/neurapick/" style={{ '--d': '.06s', '--cor': 'var(--green)', '--brilho': 'rgba(61,220,132,.10)' }}>
                <div className="projeto-topo">
                  <span className="ico">
                    <Icone tamanho={20}>{IC_PICK}</Icone>
                  </span>
                  <span className="tag verde">ONLINE</span>
                </div>
                <h3>NeuraPick — Pick &amp; Ban</h3>
                <p>
                  Veto de mapas do CS2 no padrão dos campeonatos: MD1, MD3 e MD5, escolha de lado, decider, timer e logo dos
                  times. No fim, um comando configura a série inteira no servidor.
                </p>
                <span className="projeto-link">Fazer um veto {SETA}</span>
              </a>

              <a className="projeto reveal" href="/partidas/" style={{ '--d': '.12s', '--cor': 'var(--orange)', '--brilho': 'rgba(255,122,26,.10)' }}>
                <div className="projeto-topo">
                  <span className="ico">
                    <Icone tamanho={20}>{IC_PARTIDAS}</Icone>
                  </span>
                  <span className="tag verde">ONLINE</span>
                </div>
                <h3>Partidas e estatísticas</h3>
                <p>
                  Cada mapa jogado no nosso servidor vira uma página: placar, rounds, rating, ADR, KAST, destaques e a demo para
                  baixar — separados por MD1, MD3, MD5 e partidas normais.
                </p>
                <span className="projeto-link">Ver partidas {SETA}</span>
              </a>

              <div className="projeto reveal" style={{ '--d': '.18s', '--cor': 'var(--yellow)', '--brilho': 'rgba(245,197,66,.08)' }}>
                <div className="projeto-topo">
                  <span className="ico">
                    <Icone tamanho={20}>{IC_SERVIDOR}</Icone>
                  </span>
                  <span className="tag">CS2</span>
                </div>
                <h3>Servidor competitivo</h3>
                <p>
                  Nosso servidor de CS2 com espera 5x5, round faca, séries do NeuraPick, pausa igual GC, demos gravadas
                  automaticamente e chat com cargos.
                </p>
                <LinkDiscord className="projeto-link">Jogar com a gente {SETA}</LinkDiscord>
              </div>
            </div>
          </div>
        </section>

        {/* SOBRE */}
        <section className="secao" id="sobre">
          <div className="wrap sobre">
            <div className="sobre-texto reveal">
              <span className="mono">// SOBRE A NEURA</span>
              <div className="secao-head" style={{ marginBottom: 22 }}>
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
              <span className="mono">// COMO TRABALHAMOS</span>
              <h2>O que guia cada projeto</h2>
            </div>
            <div className="spec-list">
              {PRINCIPIOS.map(([icone, titulo, texto, tag, corTag], i) => (
                <div key={titulo} className="spec-row reveal" style={i ? { '--d': `${i * 0.05}s` } : undefined}>
                  <div className="spec-icon">
                    <Icone>{icone}</Icone>
                  </div>
                  <div className="spec-body">
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                  <div className={`tag${corTag ? ` ${corTag}` : ''}`}>{tag}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMUNIDADE */}
        <section className="cta">
          <div className="wrap cta-inner reveal">
            <span className="mono">// COMUNIDADE</span>
            <h2 style={{ marginTop: 8 }}>Joga com a gente?</h2>
            <p className="lead">
              Entre no Discord para jogar no servidor, participar dos campeonatos e acompanhar o que estamos criando.
            </p>
            <div className="cta-acoes">
              <LinkDiscord className="btn btn-discord btn-lg">Entrar no Discord</LinkDiscord>
              <a className="btn btn-ghost btn-lg" href="/partidas/">
                Ver últimas partidas
              </a>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
