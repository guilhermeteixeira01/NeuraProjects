import { useEffect, useState } from 'react'
import { lerJson } from './dados.js'
import { nomeMapa } from './mapas.js'

// Avisos no canto da tela: partida nova e Top 15 do ranking atualizado.
// Cookies guardam a última partida e o Top 15 que a pessoa já viu (1 ano). Na primeira visita só grava,
// sem avisar. Se mudou desde a última visita, mostra o aviso uma vez só.
const COOKIE_PARTIDA = 'np_partida'
const COOKIE_RANKING = 'np_top15'
const DURACAO = 12000

function lerCookie(nome) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function gravarCookie(nome, valor) {
  document.cookie = `${nome}=${encodeURIComponent(valor)}; max-age=31536000; path=/; SameSite=Lax`
}
// Hash curto (djb2) para o cookie do Top 15 não ficar enorme
function hash(texto) {
  let h = 5381
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

async function novidadePartida(pagina) {
  const lista = await lerJson('/partidas/partidas.json')
  if (!Array.isArray(lista) || !lista.length) return null
  const ultima = lista[0] // partidas.json vem da mais nova para a mais antiga
  const vista = lerCookie(COOKIE_PARTIDA)
  gravarCookie(COOKIE_PARTIDA, ultima.nome)
  if (vista === null || vista === ultima.nome || pagina === 'partidas') return null

  const idx = lista.findIndex((p) => p.nome === vista)
  const novas = idx > 0 ? idx : 1
  return {
    tipo: 'partida',
    titulo: novas === 1 ? 'Nova partida registrada' : `${novas} partidas novas registradas`,
    texto: `${ultima.timeA} ${ultima.placarA || 0} : ${ultima.placarB || 0} ${ultima.timeB}${ultima.mapa ? ` · ${nomeMapa(ultima.mapa)}` : ''}`,
    link: '/partidas/',
    rotulo: 'Ver partidas',
  }
}

async function novidadeRanking(pagina) {
  const dados = await lerJson('/ranking/ranking.json')
  if (!dados || !Array.isArray(dados.jogadores) || !dados.jogadores.length) return null
  // Mesmo Top 15 da página do ranking (o JSON já vem ordenado por rating)
  const top = dados.jogadores.slice(0, 15)
  const assinatura = hash(top.map((j) => `${j.steamId}:${j.rating}`).join('|'))
  const vista = lerCookie(COOKIE_RANKING)
  gravarCookie(COOKIE_RANKING, assinatura)
  if (vista === null || vista === assinatura || pagina === 'ranking') return null

  return {
    tipo: 'ranking',
    titulo: 'Ranking Top 15 atualizado',
    texto: `#1 agora: ${top[0].nome} · rating ${Number(top[0].rating || 0).toFixed(2)}`,
    link: '/ranking/',
    rotulo: 'Ver ranking',
  }
}

function Aviso({ aviso, onFechar }) {
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    if (!saindo) return
    const id = setTimeout(onFechar, 250)
    return () => clearTimeout(id)
  }, [saindo, onFechar])

  useEffect(() => {
    const id = setTimeout(() => setSaindo(true), DURACAO)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className={`nx-aviso nx-aviso-${aviso.tipo}${saindo ? ' is-saindo' : ''}`}>
      <span className="nx-aviso-ponto" />
      <div className="nx-aviso-corpo">
        <b>{aviso.titulo}</b>
        <p>{aviso.texto}</p>
        <a href={aviso.link}>{aviso.rotulo} →</a>
      </div>
      <button type="button" className="nx-aviso-fechar" aria-label="Fechar aviso" onClick={() => setSaindo(true)}>
        ×
      </button>
    </div>
  )
}

export default function Avisos({ pagina }) {
  const [avisos, setAvisos] = useState([])

  useEffect(() => {
    let ativo = true
    const mostrar = (aviso) => aviso && ativo && setAvisos((a) => [...a, aviso])
    novidadePartida(pagina).then(mostrar)
    novidadeRanking(pagina).then(mostrar)
    return () => {
      ativo = false
    }
  }, [pagina])

  if (!avisos.length) return null
  return (
    <div className="nx-avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <Aviso key={a.tipo} aviso={a} onFechar={() => setAvisos((lista) => lista.filter((x) => x !== a))} />
      ))}
    </div>
  )
}
