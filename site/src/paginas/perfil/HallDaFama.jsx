import { urlTrofeu } from '../../comum/trofeus.js'
import { ComMoldura, useCardDe, CargosDe } from '../../comum/Moldura.jsx'
import { fundoCard } from '../../comum/cardsPerfil.js'
import { useT } from '../../comum/i18n.js'
import './hall.css'

export default function HallDaFama({ j, pos, total, nivel, avatar }) {
  const t = useT()
  const card = useCardDe(j.steamId)
  const podio = pos >= 1 && pos <= 3
  const dados = [
    ['RAT', j.mapas ? Number(j.rating || 0).toFixed(2) : '—'],
    ['ADR', j.mapas ? Math.round(j.adr || 0) : '—'],
    ['WIN', j.mapas ? Math.round((j.vitorias || 0) / j.mapas * 100) + '%' : '—'],
    ['MAPAS', j.mapas || 0],
  ]
  return <div className="hf-area">
    <article className={`hf-jogador-card${card ? ' com-card' : ''}${podio ? ` hf-top-${pos}` : ''}`} style={card ? { backgroundImage: fundoCard(card) } : undefined} aria-label={t('Card do jogador')}>
      <header className="hf-jogador-topo">
        <span><b>{pos > 0 ? `#${pos}` : '—'}</b><small>{t(pos > 0 ? 'Posição' : 'Sem rank')}</small></span>
        {podio && <img className="hf-jogador-trofeu" src={urlTrofeu(pos)} alt={t(pos === 1 ? 'Ouro' : pos === 2 ? 'Prata' : 'Bronze')} width="56" height="56" />}
        <span className="hf-jogador-nivel">LVL {nivel?.nivel ?? 0}</span>
      </header>
      <div className="hf-jogador-avatar"><ComMoldura steamId={j.steamId} emblema>{avatar || <img src={j.avatar} alt={j.nome} className="hf-avatar-imagem" />}</ComMoldura></div>
      <h2>{j.nome}</h2>
      <CargosDe steamId={j.steamId} max={3} classe="hf-jogador-cargos" />
      <p>{pos > 0 ? `${pos}º ${t('de')} ${total} ${t('jogadores')}` : t('Seu próximo capítulo começa aqui')}</p>
      <dl>{dados.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}</dl>
      <a href="/ranking/">{t('Ver ranking')} →</a>
    </article>
  </div>
}
