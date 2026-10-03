import { useEffect, useRef, useState } from 'react'
import { nomeMapa } from './mapas.js'

// Avisos de partida: quando um mapa termina no servidor, mostra um card no canto da tela com o resultado e o
// status da série e, se a pessoa permitiu, uma notificação do navegador (do sistema).
// O cookie guarda a última partida que a pessoa já viu (1 ano): na primeira visita só grava, sem avisar.
// A página confere o histórico a cada 30s (também com a aba em segundo plano), então o aviso chega com o site
// aberto em qualquer aba. Com o navegador fechado não dá: o site não tem servidor para mandar "push".
const COOKIE_PARTIDA = 'np_partida'
const CHAVE_PERGUNTA = 'np_notif_pergunta' // "nao" = não perguntar mais
const INTERVALO = 30000
const DURACAO = 15000
const ICONE = '/assets/logos/android-chrome-192x192.png'
const NOMES_CAT = { md1: 'MD1', md3: 'MD3', md5: 'MD5' }

function lerCookie(nome) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function gravarCookie(nome, valor) {
  document.cookie = `${nome}=${encodeURIComponent(valor)}; max-age=31536000; path=/; SameSite=Lax`
}
const lerLocal = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const gravarLocal = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sem localStorage */
  }
}

const temNotificacao = () => typeof window !== 'undefined' && 'Notification' in window
const linkPartida = (p) => `/partidas/${(p.caminho || p.nome).split('/').map(encodeURIComponent).join('/')}/`

// Texto do aviso de uma partida: resultado do mapa + status da série (com o histórico inteiro para contar)
export function descreverPartida(p, lista) {
  const org = String(p.caminho || '').split('/')[0].toUpperCase()
  const resultado = `${p.timeA} ${p.placarA ?? 0} x ${p.placarB ?? 0} ${p.timeB} · ${nomeMapa(p.mapa)}`
  if (!p.serieId) return { titulo: `${org ? `${org} · ` : ''}Partida encerrada`, texto: resultado, link: linkPartida(p) }

  const daSerie = lista.filter((x) => x.serieId === p.serieId)
  const vA = daSerie.filter((x) => x.placarA > x.placarB).length
  const vB = daSerie.filter((x) => x.placarB > x.placarA).length
  const total = Number((p.categoria || '').match(/^md(\d)$/)?.[1]) || daSerie.length
  const paraVencer = Math.floor(total / 2) + 1
  const numero = Number(/mapa (\d+)\//.exec(p.serie || '')?.[1]) || daSerie.length
  const timeA = p.serieTimeA || p.timeA
  const timeB = p.serieTimeB || p.timeB
  let status
  if (daSerie.some((x) => x.serieCancelada)) status = 'Série CANCELADA'
  else if (vA >= paraVencer || vB >= paraVencer || daSerie.length >= total)
    status = `Série FINALIZADA — ${vA > vB ? timeA : vB > vA ? timeB : 'empate'}${vA === vB ? '' : ' venceu'}`
  else {
    const proximo = p.serieMapas?.[numero]
    status = `Série EM ANDAMENTO${proximo ? ` · próximo: ${nomeMapa(proximo)}` : ''}`
  }
  return {
    titulo: `${org ? `${org} · ` : ''}${NOMES_CAT[p.categoria] || 'Série'} · mapa ${numero}/${total} encerrado`,
    texto: `${resultado}\n${timeA} ${vA} x ${vB} ${timeB} · ${status}`,
    link: linkPartida(p),
  }
}

// Service worker (public/sw.js) só para notificações: o Chrome do Android exige ele para mostrar notificação
let registro = null
function registrarSw() {
  if (registro || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return registro
  // ready: espera o service worker ficar ativo (antes disso ele não mostra notificação)
  registro = navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
  return registro
}

// Notificação do sistema (só com permissão); clicar abre a página da partida.
// "tag" = link: com o site aberto em várias abas, a mesma partida vira uma notificação só.
async function notificar(aviso) {
  if (!temNotificacao() || Notification.permission !== 'granted') return
  const opcoes = { body: aviso.texto, icon: ICONE, badge: ICONE, tag: aviso.link, data: { url: aviso.link } }
  const reg = await registrarSw()
  if (reg?.showNotification) return reg.showNotification(aviso.titulo, opcoes).catch(() => {})
  try {
    const n = new Notification(aviso.titulo, opcoes)
    n.onclick = () => {
      window.focus()
      location.href = aviso.link
      n.close()
    }
  } catch {
    /* sem suporte */
  }
}

function Aviso({ aviso, onFechar }) {
  const [saindo, setSaindo] = useState(false)
  const fechar = useRef(onFechar)
  fechar.current = onFechar

  useEffect(() => {
    if (!saindo) return
    const id = setTimeout(() => fechar.current(), 250)
    return () => clearTimeout(id)
  }, [saindo])

  useEffect(() => {
    if (aviso.fixo) return
    const id = setTimeout(() => setSaindo(true), DURACAO)
    return () => clearTimeout(id)
  }, [aviso.fixo])

  return (
    <div className={`nx-aviso nx-aviso-${aviso.tipo}${saindo ? ' is-saindo' : ''}`}>
      <span className="nx-aviso-ponto" />
      <div className="nx-aviso-corpo">
        <b>{aviso.titulo}</b>
        {aviso.texto.split('\n').map((linha, i) => (
          <p key={i}>{linha}</p>
        ))}
        {aviso.acoes ? (
          <div className="nx-aviso-acoes">
            {aviso.acoes.map(([rotulo, acao, principal]) => (
              <button
                key={rotulo}
                type="button"
                className={principal ? 'principal' : ''}
                onClick={() => {
                  acao()
                  setSaindo(true)
                }}
              >
                {rotulo}
              </button>
            ))}
          </div>
        ) : (
          <a href={aviso.link}>{aviso.rotulo} →</a>
        )}
      </div>
      <button type="button" className="nx-aviso-fechar" aria-label="Fechar aviso" onClick={() => setSaindo(true)}>
        ×
      </button>
    </div>
  )
}

export default function Avisos() {
  const [avisos, setAvisos] = useState([])
  const mostrar = (aviso) => setAvisos((a) => [...a.filter((x) => x.id !== aviso.id), aviso])

  // Partida nova: confere o histórico ao abrir e a cada 30s
  useEffect(() => {
    if (temNotificacao() && Notification.permission === 'granted') registrarSw()
    let vivo = true
    const conferir = async () => {
      const lista = await fetch(`/partidas/partidas.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      if (!vivo || !Array.isArray(lista) || !lista.length) return
      const ultima = lista[0] // partidas.json vem da mais nova para a mais antiga
      const vista = lerCookie(COOKIE_PARTIDA)
      if (vista === ultima.nome) return
      gravarCookie(COOKIE_PARTIDA, ultima.nome)
      if (vista === null) return // primeira visita: só guarda

      // Todas as novas desde a última vista (no máximo 3 avisos; se não achar a vista, só a mais nova)
      const idx = lista.findIndex((p) => p.nome === vista)
      const novas = lista.slice(0, idx > 0 ? Math.min(idx, 3) : 1).reverse()
      for (const p of novas) {
        const d = descreverPartida(p, lista)
        const aviso = { id: p.nome, tipo: 'partida', ...d, rotulo: 'Ver partida' }
        mostrar(aviso)
        notificar(aviso)
      }
    }
    conferir()
    const id = setInterval(conferir, INTERVALO)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])

  // Primeira visita: pede a permissão de notificação na hora. Chrome/Edge mostram o pedido do navegador direto;
  // Firefox e Safari só aceitam pedir depois de um clique, então se o pedido não sair aparece o card com o botão.
  // Depois que a pessoa responde (ou fecha o card), não pergunta mais.
  useEffect(() => {
    if (!temNotificacao() || Notification.permission !== 'default' || lerLocal(CHAVE_PERGUNTA) === 'nao') return
    const resposta = (r) => {
      if (r === 'default') return false // fechou sem responder ou o navegador não mostrou
      gravarLocal(CHAVE_PERGUNTA, 'nao')
      setAvisos((lista) => lista.filter((x) => x.id !== 'pergunta')) // respondeu: o card (se apareceu) some
      if (r === 'granted')
        notificar({ titulo: 'Notificações ativadas', texto: 'Você vai ser avisado quando uma partida terminar.', link: '/partidas/' })
      return true
    }
    const card = () =>
      mostrar({
        id: 'pergunta',
        tipo: 'pergunta',
        fixo: true,
        titulo: 'Avisar quando uma partida terminar?',
        texto: 'Receba uma notificação do navegador com o resultado de cada mapa e o status da série.',
        acoes: [
          ['Ativar notificações', () => Notification.requestPermission().then(resposta), true],
          ['Agora não', () => gravarLocal(CHAVE_PERGUNTA, 'nao')],
        ],
      })
    let feito = false
    Promise.resolve(Notification.requestPermission())
      .then((r) => {
        feito = true
        if (!resposta(r)) card()
      })
      .catch(() => card())
    // Navegador que segura o pedido sem mostrar nada (sem clique): o card aparece logo
    const id = setTimeout(() => !feito && Notification.permission === 'default' && card(), 1500)
    return () => clearTimeout(id)
  }, [])

  if (!avisos.length) return null
  return (
    <div className="nx-avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <Aviso key={a.id} aviso={a} onFechar={() => setAvisos((lista) => lista.filter((x) => x !== a))} />
      ))}
    </div>
  )
}
