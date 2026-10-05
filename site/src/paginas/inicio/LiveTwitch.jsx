import { useEffect, useRef, useState } from 'react'
import { lerJson } from '../../comum/dados.js'
import { desempenhoAtivo } from '../../comum/desempenho.js'
import { useT } from '../../comum/i18n.js'
import { temaAtual } from '../../comum/tema.js'

// Área "Ao vivo" da página inicial: transmissão da Twitch dos canais em assets/data/twitch.json
// ({ "canais": ["nome"], "chat": true }). Quem diz se o canal está ao vivo é o próprio player da Twitch
// (eventos ONLINE/OFFLINE, sem chave de API). Com vários canais, mostra o primeiro ao vivo e, enquanto ninguém
// está, confere a lista de novo de tempos em tempos. Lista vazia: a área nem aparece.

const SCRIPT = 'https://player.twitch.tv/js/embed/v1.js'
const ESPERA_CANAL = 8000 // sem resposta do player nesse tempo: passa para o próximo canal
const NOVA_VOLTA = 90000 // todos offline: confere a lista de novo depois disso
const ID_PLAYER = 'twitch-live'

// "https://www.twitch.tv/Canal/" ou "@Canal" -> "canal"
const nomeCanal = (c) =>
  String(c || '')
    .trim()
    .replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase()
const valido = (c) => /^[a-z0-9_]{3,25}$/.test(c)
const linkCanal = (c) => `https://www.twitch.tv/${c}`

let carregando = null
function carregarTwitch() {
  carregando ??= new Promise((ok, falha) => {
    if (window.Twitch?.Player) return ok(window.Twitch)
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.Twitch?.Player ? ok(window.Twitch) : falha(new Error('twitch')))
    s.onerror = () => falha(new Error('twitch'))
    document.head.appendChild(s)
  }).catch((e) => {
    carregando = null // tenta de novo na próxima vez que a página abrir
    throw e
  })
  return carregando
}

function IconeTwitch({ tamanho = 18 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.3 2 3 5.4v13.8h4.7V22h2.7l2.6-2.8h3.8l5.2-5.2V2H4.3Zm15.6 11.2-3 3h-4.7l-2.6 2.6v-2.6H5.6V3.7h14.3v9.5ZM16.2 6.8h-1.7v5.1h1.7V6.8Zm-4.7 0H9.8v5.1h1.7V6.8Z" />
    </svg>
  )
}

export default function LiveTwitch() {
  const t = useT()
  const [config, setConfig] = useState(null) // { canais, chat }
  const [estado, setEstado] = useState('procurando') // 'procurando' | 'aovivo' | 'offline'
  const [canal, setCanal] = useState('') // canal ao vivo agora
  const caixa = useRef(null)
  const player = useRef(null)

  useEffect(() => {
    lerJson('/assets/data/twitch.json').then((d) => {
      const canais = [...new Set((Array.isArray(d?.canais) ? d.canais : []).map(nomeCanal).filter(valido))]
      setConfig({ canais, chat: d?.chat !== false })
    })
  }, [])

  // Player da Twitch: troca de canal até achar um ao vivo
  useEffect(() => {
    const canais = config?.canais
    if (!canais?.length || !caixa.current) return
    let vivo = true
    let i = 0
    let relogio
    const tentar = (n) => {
      i = n
      player.current.setChannel(canais[i])
      clearTimeout(relogio)
      relogio = setTimeout(proximo, ESPERA_CANAL)
    }
    const proximo = () => {
      clearTimeout(relogio)
      if (!vivo) return
      if (i + 1 < canais.length) return tentar(i + 1)
      setEstado('offline')
      relogio = setTimeout(() => vivo && tentar(0), NOVA_VOLTA)
    }

    carregarTwitch()
      .then((Twitch) => {
        if (!vivo) return
        caixa.current.replaceChildren()
        player.current = new Twitch.Player(ID_PLAYER, {
          channel: canais[0],
          parent: [location.hostname],
          width: '100%',
          height: '100%',
          muted: true,
          // Sem autoplay: o player nasce coberto pela capa "Procurando…" e a Twitch recusaria (aviso no console).
          // Quem dá o play é o efeito de baixo, com a capa fora e o vídeo visível na tela.
          autoplay: false,
        })
        relogio = setTimeout(proximo, ESPERA_CANAL)
        player.current.addEventListener(Twitch.Player.ONLINE, () => {
          if (!vivo) return
          clearTimeout(relogio)
          setCanal(nomeCanal(player.current.getChannel()) || canais[i])
          setEstado('aovivo')
        })
        // Canal offline (ou a live acabou): passa para o próximo da lista
        player.current.addEventListener(Twitch.Player.OFFLINE, proximo)
      })
      .catch(() => vivo && setEstado('offline')) // bloqueador de anúncios/sem internet: mostra os links

    return () => {
      vivo = false
      clearTimeout(relogio)
    }
  }, [config])

  // Ao vivo e o vídeo aparece na tela: dá o play sozinho, sem som (uma vez por live: se a pessoa pausar, fica pausado).
  // Antes disso (área lá embaixo ou capa por cima) a Twitch recusa o play e só deixa um aviso no console.
  // "Melhorar desempenho": não toca sozinho, a pessoa dá o play.
  useEffect(() => {
    if (estado !== 'aovivo' || desempenhoAtivo() || !caixa.current || !('IntersectionObserver' in window)) return
    const tempos = []
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        obs.disconnect()
        // O player da Twitch demora um pouco para perceber que ficou visível: confere e tenta de novo
        // (antes do primeiro play o isPaused() da Twitch diz "não pausado": a primeira tentativa é sempre um play)
        tempos.push(
          setTimeout(() => player.current?.play(), 900),
          setTimeout(() => player.current?.isPaused?.() && player.current.play(), 2500),
        )
      },
      { threshold: 0.6 },
    )
    obs.observe(caixa.current)
    return () => {
      obs.disconnect()
      tempos.forEach(clearTimeout)
    }
  }, [estado, canal])

  if (!config?.canais.length) return null
  const host = typeof location === 'undefined' ? '' : location.hostname
  const chat = config.chat && estado === 'aovivo' && canal
  const principal = canal || config.canais[0]

  return (
    <section className={`secao live live-${estado}`} id="live" aria-live="polite">
      <div className="wrap">
        <div className="live-cab">
          <div className="secao-head">
            <span className="kicker">
              <b>
                <IconeTwitch tamanho={13} />
              </b>{' '}
              {t('TRANSMISSÃO')}
            </span>
            <h2>{estado === 'aovivo' ? t('Ao vivo agora') : t('Lives da comunidade')}</h2>
            <p>
              {estado === 'aovivo'
                ? t('Acompanhe a transmissão direto daqui, com o chat ao lado.')
                : estado === 'offline'
                  ? t('Nenhuma transmissão ao vivo agora. Siga o canal para ser avisado na próxima.')
                  : t('Procurando transmissão ao vivo…')}
            </p>
          </div>
          <div className="live-acoes">
            {/* Fora do vídeo: em cima dele ficaria por baixo do título que o player da Twitch já mostra */}
            {estado === 'aovivo' && (
              <span className="live-selo">
                <i /> {t('AO VIVO')} · {canal}
              </span>
            )}
            <a className="btn btn-ghost live-abrir" href={linkCanal(principal)} target="_blank" rel="noopener">
              <IconeTwitch /> {estado === 'aovivo' ? t('Abrir na Twitch') : t('Seguir na Twitch')}
            </a>
          </div>
        </div>

        <div className={`live-palco${chat ? ' com-chat' : ''}`}>
          <div className="live-video">
            {/* O player fica sempre montado (escondido quando offline) para avisar quando o canal entrar ao vivo */}
            <div ref={caixa} id={ID_PLAYER} className="live-player" />
            {estado !== 'aovivo' && (
              <div className="live-capa">
                <span className="live-capa-icone">
                  <IconeTwitch tamanho={34} />
                </span>
                {estado === 'procurando' ? (
                  <>
                    <b>{t('Procurando transmissão ao vivo…')}</b>
                    <span className="live-pontos" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </>
                ) : (
                  <>
                    <b>{t('Offline no momento')}</b>
                    <div className="live-canais">
                      {config.canais.map((c) => (
                        <a key={c} href={linkCanal(c)} target="_blank" rel="noopener">
                          <IconeTwitch tamanho={14} /> {c}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {chat && (
            <div className="live-chat">
              <iframe
                key={canal}
                title={t('Chat da transmissão')}
                src={`https://www.twitch.tv/embed/${canal}/chat?parent=${host}${temaAtual() === 'claro' ? '' : '&darkpopout'}`}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
