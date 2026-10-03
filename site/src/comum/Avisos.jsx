import { useEffect, useRef, useState } from 'react'
import { descreverPartida } from './novidades.js'

// Avisos de partida:
// - card no canto da tela (com o site aberto): o histórico é conferido a cada 30s; o cookie guarda a última
//   partida já vista (1 ano), e na primeira visita só grava, sem avisar;
// - notificação do sistema (push), mesmo com o site fechado: quem permitir fica inscrito no OneSignal, e o
//   deploy do site manda o push quando entra partida nova (scripts/notificar.mjs + .github/workflows/deploy.yml).
const COOKIE_PARTIDA = 'np_partida'
const CHAVE_PERGUNTA = 'np_notif_pergunta' // "nao" = não perguntar mais
const INTERVALO = 30000
const DURACAO = 15000
const ONESIGNAL_APP_ID = 'e2d061b1-3a8e-41fb-9b5c-6e0e8751ab96'
const SITE = 'neuraproject.com.br' // o app do OneSignal só aceita este endereço

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

// SDK do OneSignal (carregado uma vez por página, depois que ela abre). Service worker: /OneSignalSDKWorker.js
let oneSignal = null
function carregarOneSignal() {
  if (oneSignal) return oneSignal
  if (location.hostname !== SITE) return (oneSignal = Promise.resolve(null)) // npm run dev / outro endereço: sem push
  oneSignal = new Promise((pronto) => {
    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({ appId: ONESIGNAL_APP_ID })
        pronto(OneSignal)
      } catch {
        pronto(null)
      }
    })
    const script = document.createElement('script')
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
    script.defer = true
    script.onerror = () => pronto(null)
    document.head.appendChild(script)
  })
  return oneSignal
}

// Pede a permissão: pelo OneSignal (inscreve no push) ou, sem ele, só pelo navegador
async function pedirPermissao() {
  const os = await carregarOneSignal()
  if (os) await os.Notifications.requestPermission().catch(() => {})
  else await Notification.requestPermission().catch(() => {})
  return Notification.permission
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
          aviso.link && <a href={aviso.link}>{aviso.rotulo} →</a>
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

  // Partida nova com o site aberto: confere o histórico ao abrir e a cada 30s
  useEffect(() => {
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

      // Todas as novas desde a última vista (no máximo 3; se não achar a vista, só a mais nova)
      const idx = lista.findIndex((p) => p.nome === vista)
      for (const p of lista.slice(0, idx > 0 ? Math.min(idx, 3) : 1).reverse())
        mostrar({ id: p.nome, tipo: 'partida', ...descreverPartida(p, lista), rotulo: 'Ver partida' })
    }
    conferir()
    const id = setInterval(conferir, INTERVALO)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])

  // Notificações (push): carrega o OneSignal e, na primeira visita, pede a permissão na hora.
  // Chrome/Edge mostram o pedido do navegador direto; Firefox e Safari só aceitam depois de um clique,
  // então se o pedido não sair aparece o card com o botão. Depois que a pessoa responde, não pergunta mais.
  useEffect(() => {
    if (!temNotificacao()) return
    carregarOneSignal()
    if (Notification.permission !== 'default' || lerLocal(CHAVE_PERGUNTA) === 'nao') return

    let vivo = true
    const respondeu = (r) => {
      if (r === 'default') return false // fechou sem responder ou o navegador não mostrou
      gravarLocal(CHAVE_PERGUNTA, 'nao')
      setAvisos((lista) => lista.filter((x) => x.id !== 'pergunta')) // o card (se apareceu) some
      if (r === 'granted')
        mostrar({
          id: 'ativadas',
          tipo: 'pergunta',
          titulo: 'Notificações ativadas',
          texto: 'Você vai ser avisado quando uma partida terminar, mesmo com o site fechado.',
        })
      return true
    }
    const card = () =>
      vivo &&
      Notification.permission === 'default' &&
      mostrar({
        id: 'pergunta',
        tipo: 'pergunta',
        fixo: true,
        titulo: 'Avisar quando uma partida terminar?',
        texto: 'Receba uma notificação com o resultado de cada mapa e o status da série, mesmo com o site fechado.',
        acoes: [
          ['Ativar notificações', () => pedirPermissao().then(respondeu), true],
          ['Agora não', () => gravarLocal(CHAVE_PERGUNTA, 'nao')],
        ],
      })

    pedirPermissao().then((r) => !respondeu(r) && card())
    // Navegador que segura o pedido sem mostrar nada (sem clique): o card aparece logo
    const id = setTimeout(card, 2500)
    return () => {
      vivo = false
      clearTimeout(id)
    }
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
