import { useState } from 'react'
import { CONFIG } from './config.js'
import { linkPerfil, useConta } from './conta.js'
import { IDIOMAS, useT } from './i18n.js'
import { escolherIdioma } from './preferencias.js'

// Rodapé no estilo do Discord: degradê do escuro para o azul do site, logo + seletor de idioma + redes à esquerda,
// colunas de links à direita (no celular viram sanfonas) e a palavra NEURA gigante embaixo.
// Cores próprias (iguais em qualquer tema), como um bloco da marca. Tema e desempenho ficam no ⚙ do topo.

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
      links: CONFIG.comunidade ? [[CONFIG.comunidadeNome, CONFIG.comunidade, true]] : [],
    },
  ].filter((c) => c.links.length)
}

function IconeGithub() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

function Seta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// Coluna de links: no computador sempre aberta; no celular abre/fecha pelo título
function Coluna({ titulo, links, t }) {
  const [aberta, setAberta] = useState(false)
  return (
    <div className={`nx-fcol${aberta ? ' aberta' : ''}`}>
      <button type="button" className="nx-fcol-tit" aria-expanded={aberta} onClick={() => setAberta((a) => !a)}>
        {t(titulo)}
        <Seta />
      </button>
      <div className="nx-fcol-links">
        {links.map(([rotulo, href, fora]) => (
          <a key={rotulo} href={href} {...(fora ? externo : {})}>
            {t(rotulo)}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function Rodape() {
  const conta = useConta()
  const t = useT()
  return (
    <footer data-site-footer="" className="nx-footer">
      <div className="nx-wrap">
        <div className="nx-ftopo">
          <div className="nx-fesq">
            <a className="nx-flogo" href="/" aria-label={t('Neura Project — início')}>
              <img src="/assets/logos/logo-np-64.png" alt="" width="52" height="52" />
            </a>
            <label className="nx-ftema">
              <span className="nx-frotulo">{t('Idioma')}</span>
              <span className="nx-ftema-caixa">
                <select value={t.idioma} onChange={(e) => escolherIdioma(e.target.value)}>
                  {IDIOMAS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome}
                    </option>
                  ))}
                </select>
                <Seta />
              </span>
            </label>
            {REDES.length > 0 && (
              <div className="nx-fsocial">
                <span className="nx-frotulo">{t('Social')}</span>
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
          <nav className="nx-fcols" aria-label={t('Rodapé')}>
            <span className="nx-frotulo nx-fmenu">{t('Menu')}</span>
            {colunas(conta).map((c) => (
              <Coluna key={c.titulo} {...c} t={t} />
            ))}
          </nav>
        </div>
        <div className="nx-footer-legal">
          <span>{t('© {ano} Neura Project. Estúdio independente feito no Brasil.', { ano: ANO })}</span>
          {CONFIG.autorLink && (
            <span className="nx-fcredito">
              {t('Site feito por')}
              <a href={CONFIG.autorLink} {...externo}>
                <IconeGithub />
                {CONFIG.autorNome}
              </a>
            </span>
          )}
          <span>{t('Não afiliado à Valve Corporation. Counter-Strike é marca da Valve.')}</span>
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
