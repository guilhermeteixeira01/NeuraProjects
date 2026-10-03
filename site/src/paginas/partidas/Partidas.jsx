import { useEffect, useState } from 'react'
import CarregandoPontos from '../../comum/Carregando.jsx'
import Layout from '../../comum/Layout.jsx'
import { useAoVivo } from '../../comum/aoVivo.js'
import { urlOk } from '../../comum/dados.js'
import { fundoMapa, getMap, idMapa, mapIcon } from '../../comum/mapas.js'

const NOMES_CAT = { md1: 'MD1', md3: 'MD3', md5: 'MD5', normal: 'Normais' }

const dataBr = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(d || '')
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : String(d || '')
}
const link = (p) => `/partidas/${(p.caminho || p.nome).split('/').map(encodeURIComponent).join('/')}/`
const categoria = (p) => p.categoria || 'normal'
// Filtro = pasta da organização ("dga/md3/<partida>" -> "dga"); partidas antigas sem pasta caem em "geral"
const pasta = (p) => {
  const partes = String(p.caminho || '').split('/').filter(Boolean)
  return partes.length >= 3 ? partes[0].toLowerCase() : 'geral'
}
const nomePasta = (id) => id.toUpperCase()
const daPasta = (lista, id) => (id === 'todas' ? lista : lista.filter((p) => pasta(p) === id))

// Mapas da mesma série num bloco só
function blocos(lista) {
  const saida = []
  const series = {}
  for (const p of lista) {
    if (!p.serieId) {
      saida.push({ unico: p })
      continue
    }
    if (!series[p.serieId]) {
      series[p.serieId] = { mapas: [] }
      saida.push(series[p.serieId])
    }
    series[p.serieId].mapas.push(p)
  }
  return saida
}

function MiniLogo({ url }) {
  const [erro, setErro] = useState(false)
  return urlOk(url) && !erro ? <img className="mini-logo" src={url} alt="" onError={() => setErro(true)} /> : null
}

function IconeMapaCard({ mapa }) {
  return getMap(mapa) ? <img className="summary-icon" src={mapIcon(mapa)} alt="" /> : null
}

function Card({ p, i }) {
  const venc = p.placarA > p.placarB ? 'A' : p.placarB > p.placarA ? 'B' : ''
  return (
    <a className="summary-item partida" href={link(p)} style={{ ...fundoMapa(p.mapa), '--i': i }}>
      <span className="summary-num">{dataBr(p.data)}</span>
      <span className="summary-map">
        <IconeMapaCard mapa={p.mapa} />
        {getMap(p.mapa)?.name ?? idMapa(p.mapa)}
      </span>
      <span className="placar-linha">
        <MiniLogo url={p.logoA} />
        <span className={`t-A${venc === 'A' ? ' venc' : ''}`}>{p.timeA}</span>
        <b>
          {Number(p.placarA) || 0} : {Number(p.placarB) || 0}
        </b>
        <span className={`t-B${venc === 'B' ? ' venc' : ''}`}>{p.timeB}</span>
        <MiniLogo url={p.logoB} />
      </span>
      <span className={`summary-side cat-${categoria(p)}`}>{p.serie || 'PARTIDA'}</span>
    </a>
  )
}

// Mapa da série que não foi jogado (série decidida ou cancelada) ou que ainda vai ser jogado
function CardPendente({ mapa, n, total, cat, acabou, cancelada, i }) {
  const nome = getMap(mapa)?.name ?? (idMapa(mapa) || `Mapa ${n}`)
  return (
    <div className={`summary-item partida pendente${acabou ? '' : ' aguardando'}`} style={{ ...fundoMapa(mapa), '--i': i }}>
      <span className="summary-num">—</span>
      <span className="summary-map">
        <IconeMapaCard mapa={mapa} />
        {nome}
      </span>
      <span className="placar-linha">
        {!acabou && <CarregandoPontos />}
        {cancelada ? 'CANCELADO' : acabou ? 'NÃO JOGADO' : 'A JOGAR'}
      </span>
      <span className={`summary-side cat-${cat}`}>{`${NOMES_CAT[cat] || 'SÉRIE'} · mapa ${n}/${total}`}</span>
    </div>
  )
}

function BlocoSerie({ b, i }) {
  const ult = b.mapas[0]
  const mapas = [...b.mapas].reverse() // mapa 1 primeiro
  const cat = categoria(ult)
  // Placar da série contado pelos mapas (quem fez mais rounds em cada um)
  const vA = mapas.filter((p) => p.placarA > p.placarB).length
  const vB = mapas.filter((p) => p.placarB > p.placarA).length
  // MD3 acaba com 2 vitórias (ou com os 3 mapas jogados); MD5 com 3; MD1 com 1
  const total = parseInt((cat.match(/^md(\d)$/) || [])[1], 10) || mapas.length
  const paraVencer = Math.floor(total / 2) + 1
  // Série cancelada no meio (css_seriecancelar): o plugin marca os mapas dela
  const cancelada = b.mapas.some((p) => p.serieCancelada)
  const acabou = cancelada || vA >= paraVencer || vB >= paraVencer || mapas.length >= total
  // Mapas que faltam na série, apagados (nomes vêm do plugin; partidas antigas não têm a lista)
  const ordem = b.mapas.find((p) => Array.isArray(p.serieMapas))?.serieMapas || []
  const faltam = []
  for (let n = mapas.length + 1; n <= total; n++) faltam.push(n)

  return (
    <div className={`serie-bloco${cancelada ? ' cancelada' : acabou ? ' acabou' : ''}`} style={{ '--i': i }}>
      <div className="serie-head">
        <span className="serie-tag org">{nomePasta(pasta(ult))}</span>
        <span className="serie-tag">{NOMES_CAT[cat] || 'SÉRIE'}</span>
        {cancelada ? (
          <span className="serie-status cancelada">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            CANCELADA
          </span>
        ) : acabou ? (
          <span className="serie-status fim">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            FINALIZADO
          </span>
        ) : (
          <span className="serie-status andamento">
            <i />
            EM ANDAMENTO · MAPA {mapas.length + 1}/{total}
          </span>
        )}
        <span className="serie-placar">
          <MiniLogo url={ult.logoA} />
          <span className={`t-A${vA > vB ? ' venc' : ''}`}>{ult.serieTimeA || ult.timeA}</span>
          <b>
            {vA} : {vB}
          </b>
          <span className={`t-B${vB > vA ? ' venc' : ''}`}>{ult.serieTimeB || ult.timeB}</span>
          <MiniLogo url={ult.logoB} />
        </span>
        <span className="mono-label">{dataBr(mapas[0].data)}</span>
      </div>
      <div className="serie-mapas">
        {mapas.map((p, k) => (
          <Card key={p.nome} p={p} i={i + 1 + k} />
        ))}
        {faltam.map((n) => (
          <CardPendente key={n} mapa={ordem[n - 1]} n={n} total={total} cat={cat} acabou={acabou} cancelada={cancelada} i={i + n} />
        ))}
      </div>
    </div>
  )
}

function Resumo({ lista }) {
  const carregando = !lista
  const l = lista || []
  const contagem = {}
  l.forEach((p) => {
    const id = idMapa(p.mapa)
    contagem[id] = (contagem[id] || 0) + 1
  })
  const top = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]
  const cls = carregando ? 'carregando' : undefined
  return (
    <div className="hud-frame">
      <div className="stats">
        <div className="stat">
          <span className="mono-label">PARTIDAS</span>
          <b className={cls}>{carregando ? '—' : l.length}</b>
        </div>
        <div className="stat">
          <span className="mono-label">SÉRIES</span>
          <b className={cls}>{carregando ? '—' : new Set(l.filter((p) => p.serieId).map((p) => p.serieId)).size}</b>
        </div>
        <div className="stat stat-mapa" style={top && getMap(top[0]) ? fundoMapa(top[0]) : undefined}>
          <span className="mono-label">MAPA MAIS JOGADO</span>
          <b className={cls}>{carregando ? '—' : top ? (getMap(top[0])?.name ?? top[0]) : '—'}</b>
          <em>{top ? `${top[1]} ${top[1] === 1 ? 'partida' : 'partidas'}` : ''}</em>
        </div>
        <div className="stat">
          <span className="mono-label">ÚLTIMA PARTIDA</span>
          <b className={cls}>{carregando ? '—' : l[0] ? dataBr(l[0].data).split(' ')[0] : '—'}</b>
        </div>
      </div>
    </div>
  )
}

// dados: partidas.json (vem junto com a página gerada no deploy; no `npm run dev` é buscado aqui)
export default function Partidas({ dados: inicial }) {
  const [lista, setLista] = useState(Array.isArray(inicial) ? inicial : null)
  const [filtro, setFiltro] = useState('todas')

  // Ao vivo: partida nova (ou mapa novo de uma série) recarrega a página sozinha
  useAoVivo('/partidas/partidas.json', (l) => setLista(Array.isArray(l) ? l : []))

  // Filtro do link (#dga) depois que a lista chega
  useEffect(() => {
    if (!lista) return
    const daUrl = location.hash.slice(1)
    if (daUrl && lista.some((p) => pasta(p) === daUrl)) setFiltro(daUrl)
  }, [lista])

  const escolher = (id) => {
    history.replaceState(null, '', id === 'todas' ? location.pathname : `#${id}`)
    setFiltro(id)
  }

  const pastas = lista ? [...new Set(lista.map(pasta))].sort() : []
  const filtrada = lista ? daPasta(lista, filtro) : []
  // Conta por bloco: uma série inteira (MD3/MD5) vale 1, partida avulsa vale 1
  const qtd = lista ? blocos(lista).length : 0

  let i = 0
  const itens = blocos(filtrada).map((b) => {
    if (b.unico) return <Card key={b.unico.nome} p={b.unico} i={i++} />
    const el = <BlocoSerie key={b.mapas[0].serieId} b={b} i={i} />
    i += b.mapas.length + 1
    return el
  })

  return (
    <Layout pagina="partidas">
      <section className="hero">
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />
        <div className="wrap hero-inner hero-hist">
          <div className="hist-texto">
            <span className="hero-status">
              <span className="dot-live" />
              <span>{lista ? `${qtd} PARTIDA${qtd === 1 ? '' : 'S'} NO HISTÓRICO` : 'CARREGANDO…'}</span>
            </span>
            <h1 className="titulo">
              Partidas do <span className="destaque">servidor</span>
            </h1>
            <p className="lead">
              Cada mapa jogado vira uma página: placar, rounds, rating, ADR, KAST, destaques e a demo para baixar. Filtre por
              organização.
            </p>
          </div>
          <Resumo lista={lista} />
        </div>
      </section>
      <main className="wrap">
        <section className="section">
          <div className="filtros" role="tablist" aria-label="Filtrar partidas">
            {['todas', ...pastas].map((id) => (
              <button key={id} type="button" className={filtro === id ? 'active' : ''} onClick={() => escolher(id)}>
                {id === 'todas' ? 'Todas' : nomePasta(id)} <i>{lista ? blocos(daPasta(lista, id)).length : ''}</i>
              </button>
            ))}
          </div>
          {/* key: trocar de filtro remonta a lista e a animação toca de novo */}
          <div key={filtro} className={`lista${lista ? ' animar' : ''}`}>
            {lista ? (
              itens
            ) : (
              <>
                <div className="esqueleto" />
                <div className="esqueleto" />
                <div className="esqueleto" />
                <div className="esqueleto" />
              </>
            )}
          </div>
          {lista && filtrada.length === 0 && (
            <p className="vazio">
              {lista.length === 0
                ? 'Nenhuma partida por enquanto. Assim que um mapa terminar no servidor, ele aparece aqui.'
                : `Nenhuma partida em ${nomePasta(filtro)} por enquanto.`}
            </p>
          )}
        </section>
      </main>
    </Layout>
  )
}
