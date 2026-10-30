import { usePainelMobile } from './usePainelMobile.js'
// Painel "Partidas" (botão VS na barra da direita): os mapas que o jogador já jogou, do mais novo para o mais antigo, como o da FACEIT.
// Dados: perfil/historico/<SteamID>.json (gerado no deploy: scripts/ranking.mjs). Cada cartão leva para a página da partida.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConta } from './conta.js'
import { lerJson } from './dados.js'
import { localeAtual, useT } from './i18n.js'
import { mapImage, nomeMapa } from './mapas.js'
import './painelPartidas.css'
import { useBonusPartidas } from './bonusPartidas.js'

const linkPartida = (caminho) => `/partidas/${String(caminho).split('/').map(encodeURIComponent).join('/')}/`

// "QUI., 30 JUL. 2026, 21:57"
function dataCurta(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(texto || ''))
  if (!m) return String(texto || '')
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const loc = localeAtual()
  const ponto = (s) => (s.endsWith('.') ? s : `${s}.`)
  const dia = ponto(d.toLocaleDateString(loc, { weekday: 'short' }))
  const mes = ponto(d.toLocaleDateString(loc, { month: 'short' }))
  return `${dia}, ${m[3]} ${mes} ${m[1]}, ${m[4]}:${m[5]}`.toUpperCase()
}

function Cartao({ p, bonus = 0 }) {
  const t = useT()
  const [meu, deles] = p.placar || [0, 0]
  const mapa = String(p.mapa || '')
  return (
    <a className={`pp-card ${p.venceu ? 'v' : 'd'}`} href={linkPartida(p.caminho)} style={{ '--mapa': `url("${mapImage(mapa)}")` }}>
      <span className="pp-card-topo">
        <span className="pp-data">{dataCurta(p.data)}</span>
        {p.pontos > 0 && (
          <span className="pp-pontos" title={t('Neura Pontos ganhos neste mapa')}>+{p.pontos + bonus} NP</span>
        )}
      </span>
      <b className="pp-time">{p.adversario || p.time}</b>
      <span className="pp-mapa">
        {nomeMapa(mapa)} • 5v5
      </span>
      {bonus > 0 && <span className="pp-bonus">{p.pontos} NP + <b>{bonus} NP Premium</b></span>}
      <span className="pp-placar">
        <span className="pp-resultado">
        <i className="pp-selo" title={p.venceu ? t('Vitória') : t('Derrota')}>
          {p.venceu ? t('V') : t('D')}
        </i>
        <span>{p.venceu ? t('Vitória') : t('Derrota')}</span>
        </span>
        <span className="pp-resultado-numeros">
          <b className={p.venceu ? 'v' : 'd'}>{meu}</b> : {deles}
        </span>
      </span>
    </a>
  )
}

// celular: botão VS na barra de cima e lista em tela cheia (como o painel de amigos)
export default function PainelPartidas({ celular = false }) {
  const t = useT()
  const conta = useConta()
  const [aberto, setAberto] = useState(false)
  const bonus = useBonusPartidas(aberto)
  usePainelMobile(aberto && celular && !!conta)
  const [lista, setLista] = useState(null)

  useEffect(() => {
    if (!aberto || !conta?.id) return
    let vivo = true
    lerJson(`/perfil/historico/${conta.id}.json`).then((h) => vivo && setLista(Array.isArray(h) ? h : []))
    return () => {
      vivo = false
    }
  }, [aberto, conta?.id])

  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !celular && !e.target.closest?.('.pp-painel, .nx-partidas-btn') && setAberto(false)
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  if (!conta) return null
  const naTela = (el) => (celular ? createPortal(el, document.body) : el)
  return (
    <>
      <button type="button" className={`nx-config-btn nx-amigos-btn nx-partidas-btn${aberto ? ' ativo' : ''}`} aria-expanded={aberto} aria-label={t('Partidas')} onClick={() => setAberto((a) => !a)}>
        <span className="nx-vs">VS</span>
        <span className="nx-dica" aria-hidden="true">
          {t('Partidas')}
        </span>
      </button>
      {aberto &&
        naTela(
        <aside className={`am-painel pp-painel${celular ? ' am-celular' : ''}`} aria-label={t('Partidas')}>
          <div className="am-cab">
            <b>{t('Partidas')}</b>
            <button type="button" className="am-fechar" onClick={() => setAberto(false)} aria-label={t('Fechar')}>
              ×
            </button>
          </div>
          <div className="pp-corpo">
            {lista === null && <p className="pp-vazio">{t('Carregando…')}</p>}
            {lista && !lista.length && <p className="pp-vazio">{t('Você ainda não jogou nenhuma partida.')}</p>}
            {lista && lista.length > 0 && (
              <>
                <h4 className="pp-grupo">{t('Passado')}</h4>
                {lista.map((p) => (
                  <Cartao key={p.caminho} p={p} bonus={bonus[p.caminho] || 0} />
                ))}
              </>
            )}
          </div>
        </aside>,
        )}
    </>
  )
}
