import { useEffect, useRef, useState } from 'react'
import { descreverPartida } from './novidades.js'
import { useT } from './i18n.js'
import { useConta } from './conta.js'
import { registrarNotificacao } from './notificacoes.js'

// Avisos de partida:
// - card no canto da tela (com o site aberto): o histórico é conferido a cada 30s; o cookie guarda a última
//   partida já vista (1 ano), e na primeira visita só grava, sem avisar.
const COOKIE_PARTIDA = 'np_partida'
const INTERVALO = 30000
const DURACAO = 15000

function lerCookie(nome) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function gravarCookie(nome, valor) {
  document.cookie = `${nome}=${encodeURIComponent(valor)}; max-age=31536000; path=/; SameSite=Lax`
}
function Aviso({ aviso, onFechar }) {
  const t = useT()
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
        <b>{t(aviso.titulo)}</b>
        {aviso.texto.split('\n').map((linha, i) => (
          <p key={i}>{t(linha)}</p>
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
                {t(rotulo)}
              </button>
            ))}
          </div>
        ) : (
          aviso.link && <a href={aviso.link}>{t(aviso.rotulo)} →</a>
        )}
      </div>
      <button type="button" className="nx-aviso-fechar" aria-label={t('Fechar aviso')} onClick={() => setSaindo(true)}>
        ×
      </button>
    </div>
  )
}

export default function Avisos() {
  const [avisos, setAvisos] = useState([])
  const conta = useConta()
  const contaId = useRef(null)
  contaId.current = conta?.id
  const mostrar = (aviso) => {
    setAvisos((a) => [...a.filter((x) => x.id !== aviso.id), aviso])
    // as partidas também ficam no sino (as perguntas de permissão não)
    if (aviso.tipo === 'partida') registrarNotificacao(contaId.current, { id: 'partida:' + aviso.id, titulo: aviso.titulo, texto: aviso.texto, link: aviso.link })
  }

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

  if (!avisos.length) return null
  return (
    <div className="nx-avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <Aviso key={a.id} aviso={a} onFechar={() => setAvisos((lista) => lista.filter((x) => x !== a))} />
      ))}
    </div>
  )
}
