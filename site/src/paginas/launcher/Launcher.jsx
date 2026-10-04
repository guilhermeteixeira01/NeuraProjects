import { useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { CONFIG } from '../../comum/config.js'
import { Icone } from '../../comum/Icones.jsx'
import { FundoHero, Palavras } from '../../comum/HeroFundo.jsx'
import Letreiro from '../../comum/Letreiro.jsx'
import { useInclinar } from '../../comum/efeitos.jsx'

const IC_ONDA = <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
const IC_GRADE = (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>
)
const IC_RELOGIO = (
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
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

const FAIXA = [
  [IC_ONDA, 'Detecção automática'],
  [IC_GRADE, 'Vários jogos'],
  [IC_RELOGIO, 'Atualizações automáticas'],
  [IC_PESSOAS, 'Amigos e squads'],
  [IC_RELOGIO, 'Notícias na tela inicial'],
  [IC_ONDA, 'Servidores ao vivo'],
]

const RECURSOS = [
  [IC_ONDA, 'Detecção automática dos jogos', 'O launcher encontra suas instalações pela Steam. Se não achar, procura nas pastas comuns do disco antes de pedir para você apontar manualmente.', 'SISTEMA'],
  [IC_RELOGIO, 'Atualizações automáticas', 'Novas versões chegam sozinhas, sem reinstalar nada — você abre e já está na versão mais recente.', 'MANUTENÇÃO'],
  [IC_PESSOAS, 'Amigos e presença no Discord', 'Veja quem está online, entre no servidor de um amigo com um clique e deixe o Discord mostrar o que você está jogando.', 'SOCIAL'],
  [
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />,
    'Chat global',
    'Converse com toda a comunidade em tempo real, com foto, moldura e nível de cada um aparecendo na conversa.',
    'NOVO',
    'verde',
  ],
  [
    <>
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </>,
    'Servidores ao vivo',
    'Mapa, jogadores e status de cada servidor em tempo real, com entrada num clique — inclusive salas privadas com senha.',
    'NOVO',
    'verde',
  ],
  [
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>,
    'Loja de perfil',
    'Banners, molduras animadas e insígnias para deixar seu perfil com a sua cara.',
    'CUSTOMIZAÇÃO',
  ],
  [
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>,
    'Central de notícias',
    'Novidades, promoções e avisos importantes aparecem direto na tela inicial.',
    'COMUNICAÇÃO',
  ],
]

const IC_BAIXAR = (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>
)

// Botão de baixar: com o launcher desativado leva para o Discord ("Avise-me")
function BotaoBaixar({ texto, tamanhoIcone, onCelular }) {
  if (!CONFIG.launcherAtivo) {
    return CONFIG.discord ? (
      <a className="btn btn-discord btn-lg btn-brilho" href={CONFIG.discord} target="_blank" rel="noopener">
        Avise-me no Discord
      </a>
    ) : (
      <a className="btn btn-primary btn-lg" href="#" aria-disabled="true">
        Em breve
      </a>
    )
  }
  return (
    <a
      className="btn btn-primary btn-lg btn-brilho"
      href={CONFIG.launcherDownload}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        // No celular, avisa que é app de PC em vez de baixar
        if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent)) {
          e.preventDefault()
          onCelular()
        }
      }}
    >
      <Icone tamanho={tamanhoIcone} traco={2.4}>
        {IC_BAIXAR}
      </Icone>
      <span>{texto}</span>
    </a>
  )
}

export default function Launcher() {
  const ativo = CONFIG.launcherAtivo
  const [versao, setVersao] = useState('1.4.0')
  const [tamanho, setTamanho] = useState('~140 MB')
  const [aviso, setAviso] = useState(false)
  const previa = useInclinar(6)

  // Versão e tamanho do último release (se a API falhar, fica o texto padrão)
  useEffect(() => {
    if (!ativo) return
    fetch(CONFIG.launcherInfo)
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (!info?.version) return
        setVersao(info.version)
        if (info.size) setTamanho(`~${Math.round(info.size / (1024 * 1024))} MB`)
      })
      .catch(() => {})
  }, [ativo])

  useEffect(() => {
    if (!aviso) return
    const tecla = (e) => e.key === 'Escape' && setAviso(false)
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aviso])

  const abrirAviso = () => setAviso(true)

  return (
    <Layout pagina="launcher">
      <main id="pagina" className={ativo ? '' : 'em-breve'}>
        {/* TOPO */}
        <section className="hero">
          <FundoHero />
          <div className="wrap hero-inner">
            <div>
              <span className={`chip fx-entra${ativo ? '' : ' amarelo'}`} style={{ '--e': 0 }}>
                <span className="ponto" />
                <span>{ativo ? 'DISPONÍVEL PARA DOWNLOAD' : 'EM BREVE · DOWNLOAD TEMPORARIAMENTE DESATIVADO'}</span>
              </span>
              <h1>
                <Palavras texto="Um launcher para" />
                <span className="fx-gradiente">
                  <Palavras texto="todos os seus jogos." inicio={3} />
                </span>
              </h1>
              <p className="lead fx-entra" style={{ '--e': 3 }}>
                O Neura Launcher encontra suas instalações, cuida das atualizações e junta amigos, chat, servidores, notícias e
                customização num só lugar — começando pelo Counter-Strike 1.6 e com mais jogos a caminho.
              </p>
              <div className="hero-acoes fx-entra" style={{ '--e': 4 }}>
                <BotaoBaixar texto="Baixar launcher" tamanhoIcone={15} onCelular={abrirAviso} />
                <a className="btn btn-ghost btn-lg btn-borda" href="#recursos">
                  Ver recursos
                </a>
              </div>
              <div className="hero-meta fx-entra" style={{ '--e': 5 }}>
                {ativo ? (
                  <>
                    <span>v{versao}</span>
                    <span className="sep">·</span>
                    <span>Windows 10/11</span>
                    <span className="sep">·</span>
                    <span>{tamanho}</span>
                    <span className="sep">·</span>
                    <span>Gratuito</span>
                  </>
                ) : (
                  <>
                    <span>Windows 10/11</span>
                    <span className="sep">·</span>
                    <span>Gratuito</span>
                    <span className="sep">·</span>
                    <span>Lançamento em breve</span>
                  </>
                )}
              </div>
            </div>
            <div className="preview fx-entra" style={{ '--e': 2 }}>
              {/* Prévia inclina seguindo o mouse */}
              <div className="hud-frame preview-3d" ref={previa}>
                <img src="/assets/launcher-preview.png" alt="Tela inicial do Neura Launcher com o jogo detectado" />
                <div className="faixa-breve">
                  <span>EM BREVE</span>
                </div>
              </div>
              <div className="preview-tag">
                <strong>●</strong> Jogo detectado pela Steam
              </div>
            </div>
          </div>
        </section>

        {/* LETREIRO */}
        <Letreiro itens={FAIXA} />

        {/* JOGOS */}
        <section className="secao">
          <div className="wrap">
            <div className="secao-head reveal">
              <span className="kicker">
                <b>01</b> JOGOS
              </span>
              <h2>Um launcher, vários jogos</h2>
              <p>O launcher foi feito para crescer: cada jogo novo ganha detecção, atualização e integração com amigos e servidores.</p>
            </div>
            <div className="jogos reveal">
              {CONFIG.launcherJogos.map((j) => {
                const breve = /breve/i.test(j.status)
                return (
                  <div key={j.nome} className={`jogo fx-card spot${breve ? ' breve' : ''}`} style={{ '--cor': breve ? 'var(--yellow)' : 'var(--green)' }}>
                    <b>{j.nome}</b>
                    <span className={`tag ${breve ? 'amarelo' : 'verde'}`}>{j.status.toUpperCase()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* RECURSOS */}
        <section className="secao" id="recursos">
          <div className="wrap">
            <div className="secao-head reveal">
              <span className="kicker">
                <b>02</b> RECURSOS
              </span>
              <h2>O que vem equipado</h2>
              <p>
                Cada sistema resolve uma fricção real de quem joga: encontrar o jogo, manter tudo atualizado e ficar por dentro
                do que acontece na comunidade.
              </p>
            </div>
            <div className="spec-list">
              {RECURSOS.map(([icone, titulo, texto, tag, corTag], i) => (
                <div key={titulo} className="spec-row reveal" style={i ? { '--d': `${i * 0.04}s` } : undefined}>
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

        {/* DOWNLOAD */}
        <section className="cta cta-painel">
          <div className="wrap">
          <div className="cta-x spot reveal">
          <div className="cta-inner">
            <h2>{ativo ? 'Pronto para entrar em campo?' : 'O launcher está chegando'}</h2>
            <p className="lead">
              {ativo
                ? 'Baixe o launcher, faça login e o resto o Neura Launcher resolve — dos jogos às atualizações.'
                : 'O download está desativado no momento. Entre no Discord para ser avisado assim que ele for liberado.'}
            </p>
            <div className="cta-acoes">
              <BotaoBaixar texto="Baixar para Windows" tamanhoIcone={16} onCelular={abrirAviso} />
            </div>
            <div className="cta-nota">
              {ativo ? `NEURA LAUNCHER · V${versao} · WINDOWS 10/11 · ${tamanho}` : 'NEURA LAUNCHER · WINDOWS 10/11 · EM BREVE'}
            </div>
            <div className="cta-nota">
              <a href="/admin.html">Painel de anúncios</a>
            </div>
          </div>
          </div>
          </div>
        </section>
      </main>

      {/* Aviso "só PC" */}
      <div
        className={`aviso-fundo${aviso ? ' aberto' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-titulo"
        onClick={(e) => e.target === e.currentTarget && setAviso(false)}
      >
        <div className="aviso">
          <button type="button" className="aviso-fechar" aria-label="Fechar" onClick={() => setAviso(false)}>
            ✕
          </button>
          <span className="chip amarelo" style={{ margin: 0 }}>
            <span className="ponto" />
            APP PARA PC
          </span>
          <h3 id="aviso-titulo">Isso é um app de computador</h3>
          <p>
            O <strong>Neura Launcher</strong> é feito para Windows e não funciona no celular. Abra este link no seu PC para
            baixar:
          </p>
          <div className="aviso-link">{CONFIG.launcherDownload.replace(/^https?:\/\//, '')}</div>
          <button type="button" className="btn btn-ghost" onClick={() => setAviso(false)}>
            Entendi
          </button>
        </div>
      </div>
    </Layout>
  )
}
