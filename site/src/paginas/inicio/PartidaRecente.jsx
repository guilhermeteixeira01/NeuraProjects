import { useEffect, useState } from 'react'
import AvatarInicio from './AvatarInicio.jsx'
import { tempoDesde } from '../../comum/amigos.js'
import { mapImage, nomeMapa, getMap } from '../../comum/mapas.js'
import { useT } from '../../comum/i18n.js'
import { usePerfis, apelidoDe } from '../../comum/Moldura.jsx'

const detalhes = new Map()
export default function PartidaRecente({ partida: p, ativo }) {
  const t = useT(), perfis = usePerfis(), [mvp, setMvp] = useState(null)
  const caminho = String(p.caminho || p.nome).split('/').map(encodeURIComponent).join('/')
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    if (!detalhes.has(caminho)) detalhes.set(caminho, fetch(`/partidas/${caminho}/partida.json`).then(r => r.ok ? r.json() : null).then(d => [...(d?.jogadores || [])].sort((a,b) => (b.rating || 0) - (a.rating || 0) || (b.kills || 0) - (a.kills || 0))[0] || null).catch(() => null))
    detalhes.get(caminho).then(j => { if (vivo) setMvp(j) })
    return () => { vivo = false }
  }, [caminho, ativo])
  const quando = Date.parse(String(p.data || '').replace(' ', 'T') + '-03:00')
  const time = nome => String(nome || '').replace(/^time_/i, '').replaceAll('_', ' ')
  return <a className="np-partida-card" href={`/partidas/${caminho}/`}>
    {getMap(p.mapa) && <img className="np-partida-mapa" src={mapImage(p.mapa)} alt="" loading="lazy" width="480" height="270"/>}
    <header><b>{nomeMapa(p.mapa)}</b><time dateTime={Number.isFinite(quando) ? new Date(quando).toISOString() : undefined} title={p.data}>{Number.isFinite(quando) ? tempoDesde(quando,t) : p.data}</time></header>
    <div className="np-partida-placar"><span title={p.timeA}>{time(p.timeA)}</span><strong className={p.placarA>p.placarB?'venceu':''}>{p.placarA}</strong><i>×</i><strong className={p.placarB>p.placarA?'venceu':''}>{p.placarB}</strong><span title={p.timeB}>{time(p.timeB)}</span></div>
    <footer>{mvp ? <><AvatarInicio id={mvp.steamId || mvp.id} foto={mvp.avatar} tamanho={26}/><div><small>MVP</small><b>{apelidoDe(perfis,mvp.steamId,mvp.nome)}</b></div><span>{Number(mvp.rating||0).toFixed(2)} · {mvp.kills}K</span></> : <span>{p.serie || 'CS2 · 5v5'}</span>}</footer>
  </a>
}
