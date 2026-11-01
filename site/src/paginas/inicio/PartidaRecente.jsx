import { mapImage, nomeMapa, getMap } from '../../comum/mapas.js'
import { useT } from '../../comum/i18n.js'

// O histórico já entrega o placar na ordem jogador/adversário e as estatísticas pessoais.
export default function PartidaRecente({ partida: p }) {
  const t = useT()
  const caminho = String(p.caminho || p.nome).split('/').map(encodeURIComponent).join('/')
  const quando = Date.parse(String(p.data || '').replace(' ', 'T') + '-03:00')
  const [meu, adversario] = p.placar || []
  const empate = Number(meu) === Number(adversario)
  const venceu = !empate && Number(meu) > Number(adversario)
  const resultado = empate ? 'Empate' : venceu ? 'Vitória' : 'Derrota'
  const kd = Number(p.kills || 0) / Math.max(1, Number(p.mortes || 0))
  return <a className={`np-partida-linha ${venceu ? 'np-resultado-vitoria' : empate ? 'np-resultado-empate' : 'np-resultado-derrota'}`} href={`/partidas/${caminho}/`} aria-label={`${nomeMapa(p.mapa)} · ${t(resultado)} · ${meu} a ${adversario}`}>
    <span className="np-partida-thumb">{getMap(p.mapa) ? <img src={mapImage(p.mapa)} alt="" loading="lazy" width="134" height="72"/> : null}</span>
    <span className="np-partida-mapa-nome"><b>{nomeMapa(p.mapa)}</b><small>{t('Competitivo')} · 5v5</small></span>
    <span className="np-partida-placar2">
      <strong className="v2-num"><span className="np-placar-pessoal">{meu}</span><span className="np-placar-separador">:</span><span>{adversario}</span></strong>
      <em className="v2-selo">{t(resultado)}</em>
    </span>
    <span className="np-partida-num"><b className="v2-num">{kd.toFixed(2)}</b><small>K/D</small></span>
    <time className="np-partida-quando" dateTime={Number.isFinite(quando) ? new Date(quando).toISOString() : undefined} title={p.data}>{quandoCurto(quando, t, p.data)}</time>
    <span className="np-partida-seta" aria-hidden="true"><svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor"><circle cx="8" cy="5" r="1.4"/><circle cx="8" cy="10" r="1.4"/><circle cx="8" cy="15" r="1.4"/></svg></span>
  </a>
}

function quandoCurto(ts, t, bruto) {
  if (!Number.isFinite(ts)) return bruto || ''
  const tz = 'America/Sao_Paulo'
  const dia = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(ts)
  const hoje = dia(Date.now()), ontem = dia(Date.now() - 86400000), esse = dia(ts)
  if (esse === hoje) return <>{t('Hoje')}<br/>{hora}</>
  if (esse === ontem) return <>{t('Ontem')}<br/>{hora}</>
  return <>{new Intl.DateTimeFormat(t.local || 'pt-BR', { timeZone: tz, day: 'numeric', month: 'short' }).format(ts).replace('.', '')}<br/>{hora}</>
}
