// Troque os links abaixo pelos perfis reais
const SOCIALS = [
  { name: 'Discord', icon: `${import.meta.env.BASE_URL}social/discord.png`, href: '#', cls: 'discord' },
  { name: 'YouTube', icon: `${import.meta.env.BASE_URL}social/youtube.png`, href: '#', cls: 'youtube' },
  { name: 'Instagram', icon: `${import.meta.env.BASE_URL}social/instagram.png`, href: '#', cls: 'instagram' },
  { name: 'Twitch', icon: `${import.meta.env.BASE_URL}social/twitch.png`, href: '#', cls: 'twitch' },
  { name: 'Steam', icon: `${import.meta.env.BASE_URL}social/steam.png`, href: '#', cls: 'steam' },
]

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-inner">
          <div className="footer-brand">
            NEURA<span>PICK</span>
          </div>
          <div className="footer-social">
            {SOCIALS.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noreferrer" title={s.name} aria-label={s.name}>
                <img className={`social ${s.cls}`} src={s.icon} alt="" />
              </a>
            ))}
          </div>
        </div>
        <div className="footer-legal">
          <span>© {new Date().getFullYear()} NeuraPick. Todos os direitos reservados.</span>
          <span>Não afiliado à Valve Corporation. Counter-Strike é marca da Valve.</span>
        </div>
      </div>
    </footer>
  )
}
