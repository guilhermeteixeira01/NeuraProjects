import { CONFIG, MENU } from './config.js'

const REDES = [
  [CONFIG.comunidadeNome, CONFIG.comunidade, 'kivo'],
  ['YouTube', CONFIG.youtube, 'youtube'],
  ['Instagram', CONFIG.instagram, 'instagram'],
  ['Twitch', CONFIG.twitch, 'twitch'],
].filter((r) => r[1])

const externo = { target: '_blank', rel: 'noopener' }

// Ano fixo no build: o HTML gerado e o React no navegador mostram o mesmo número
const ANO = new Date().getFullYear()

export default function Rodape() {
  return (
    <footer data-site-footer="" className="nx-footer">
      <div className="nx-wrap">
        <div className="nx-footer-top">
          <div className="nx-footer-marca">
            <div className="nx-brand">
              <img src="/assets/logos/logo-np-64.png" alt="" width="28" height="28" />
              <span>
                NEURA <span className="nx-outline">PROJECT</span>
              </span>
            </div>
            <p>Estúdio independente de jogos e ferramentas para a comunidade competitiva. Feito no Brasil.</p>
            <div className="nx-redes">
              {REDES.map(([nome, link, icone]) => (
                <a key={icone} href={link} {...externo} title={nome} aria-label={nome}>
                  <img src={`/assets/redes%20social/${icone}.png`} alt="" />
                </a>
              ))}
            </div>
          </div>
          <div className="nx-footer-col">
            <span className="nx-mono">PROJETOS</span>
            {MENU.slice(1).map((m) => (
              <a key={m.id} href={m.href} {...(m.externo ? externo : {})}>
                {m.rotulo}
              </a>
            ))}
          </div>
          <div className="nx-footer-col">
            <span className="nx-mono">NEURA</span>
            <a href="/#sobre">Sobre</a>
            <a href="/#projetos">O que fazemos</a>
            <a href="/times/">Lista de times</a>
            {CONFIG.comunidade && (
              <a href={CONFIG.comunidade} {...externo}>
                Comunidade
              </a>
            )}
          </div>
        </div>
        <div className="nx-footer-legal">
          <span>© {ANO} Neura Project. Todos os direitos reservados.</span>
          <span>Não afiliado à Valve Corporation. Counter-Strike é marca da Valve.</span>
        </div>
      </div>
    </footer>
  )
}
