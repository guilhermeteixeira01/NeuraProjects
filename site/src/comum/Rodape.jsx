import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { linkPerfil, useConta } from './conta.js'
import { salvarPerfil } from './Moldura.jsx'
import { EVENTO_TEMA, TEMAS, aplicarTema, temaAtual } from './tema.js'

// Rodapé no estilo do Discord: degradê do escuro para o azul do site, logo + seletor de tema + redes à esquerda,
// colunas de links à direita (no celular viram sanfonas) e a palavra NEURA gigante embaixo.
// Cores próprias (iguais em qualquer tema), como um bloco da marca.

const REDES = [
  [CONFIG.comunidadeNome, CONFIG.comunidade, 'kivo'],
  ['YouTube', CONFIG.youtube, 'youtube'],
  ['Instagram', CONFIG.instagram, 'instagram'],
  ['Twitch', CONFIG.twitch, 'twitch'],
].filter((r) => r[1])

const externo = { target: '_blank', rel: 'noopener' }

// Ano fixo no build: o HTML gerado e o React no navegador mostram o mesmo número
const ANO = new Date().getFullYear()

function colunas(conta) {
  return [
    {
      titulo: 'Projetos',
      links: [
        ['Pick & Ban', '/neurapick/'],
        ['Partidas', '/partidas/'],
        ['Ranking', '/ranking/'],
        ['Inventário', 'https://inventory.cstrike.app', true],
      ],
    },
    {
      titulo: 'Jogador',
      links: [
        ['Seu perfil', conta ? linkPerfil(conta.id) : '/perfil/'],
        ['Níveis e XP', '/ranking/#xp'],
        ['Lista de times', '/times/'],
      ],
    },
    {
      titulo: 'Neura',
      links: [
        ['Sobre', '/#sobre'],
        ['O que fazemos', '/#projetos'],
        ['Servidor competitivo', '/#projetos'],
      ],
    },
    {
      titulo: 'Comunidade',
      links: CONFIG.comunidade ? [[`${CONFIG.comunidadeNome}`, CONFIG.comunidade, true]] : [],
    },
  ].filter((c) => c.links.length)
}

function Seta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// Coluna de links: no computador sempre aberta; no celular abre/fecha pelo título
function Coluna({ titulo, links }) {
  const [aberta, setAberta] = useState(false)
  return (
    <div className={`nx-fcol${aberta ? ' aberta' : ''}`}>
      <button type="button" className="nx-fcol-tit" aria-expanded={aberta} onClick={() => setAberta((a) => !a)}>
        {titulo}
        <Seta />
      </button>
      <div className="nx-fcol-links">
        {links.map(([rotulo, href, fora]) => (
          <a key={rotulo} href={href} {...(fora ? externo : {})}>
            {rotulo}
          </a>
        ))}
      </div>
    </div>
  )
}

// Seletor de tema (o mesmo do Personalizar): vale para todas as páginas; com login, vai para o perfil também
function SeletorTema({ conta }) {
  const [tema, setTema] = useState('padrao') // igual ao HTML gerado; o efeito lê o de verdade
  useEffect(() => {
    const ler = () => setTema(temaAtual())
    ler()
    window.addEventListener(EVENTO_TEMA, ler)
    return () => window.removeEventListener(EVENTO_TEMA, ler)
  }, [])
  const trocar = (id) => {
    aplicarTema(id)
    if (conta) salvarPerfil({ tema: id }).catch(() => {}) // sem login ou fora do ar: fica só neste navegador
  }
  return (
    <label className="nx-ftema">
      <span className="nx-frotulo">Tema</span>
      <span className="nx-ftema-caixa">
        <select value={tema} onChange={(e) => trocar(e.target.value)}>
          {TEMAS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <Seta />
      </span>
    </label>
  )
}

export default function Rodape() {
  const conta = useConta()
  return (
    <footer data-site-footer="" className="nx-footer">
      <div className="nx-wrap">
        <div className="nx-ftopo">
          <div className="nx-fesq">
            <a className="nx-flogo" href="/" aria-label="Neura Project — início">
              <img src="/assets/logos/logo-np-64.png" alt="" width="52" height="52" />
            </a>
            <SeletorTema conta={conta} />
            {REDES.length > 0 && (
              <div className="nx-fsocial">
                <span className="nx-frotulo">Social</span>
                <div className="nx-redes">
                  {REDES.map(([nome, link, icone]) => (
                    <a key={icone} href={link} {...externo} title={nome} aria-label={nome}>
                      <img src={`/assets/redes%20social/${icone}.png`} alt="" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <nav className="nx-fcols" aria-label="Rodapé">
            <span className="nx-frotulo nx-fmenu">Menu</span>
            {colunas(conta).map((c) => (
              <Coluna key={c.titulo} {...c} />
            ))}
          </nav>
        </div>
        <div className="nx-footer-legal">
          <span>© {ANO} Neura Project. Estúdio independente feito no Brasil.</span>
          <span>Não afiliado à Valve Corporation. Counter-Strike é marca da Valve.</span>
        </div>
        {/* Palavra gigante: o SVG estica o texto para ocupar a largura toda em qualquer tela */}
        <svg className="nx-fgigante" viewBox="0 0 1000 205" aria-hidden="true" focusable="false">
          <text x="0" y="198" textLength="1000" lengthAdjust="spacingAndGlyphs">
            NEURA
          </text>
        </svg>
      </div>
    </footer>
  )
}
