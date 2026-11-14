// Aviso em faixa: letreiro amarelo no topo de todas as páginas com o texto escrito no painel admin (Admin → Jogadores → Aviso em faixa).
// O worker guarda o texto (worker/steam-login/src/aviso-faixa.js); aqui lê ao abrir, ao voltar para a aba e a cada 2 minutos.
// O texto vai repetido em duas cópias iguais: a animação anda metade do trilho e a volta fica contínua.
// Com "Melhorar desempenho" ou movimento reduzido, a faixa fica parada e o texto quebra linha.
import { useEffect, useState } from 'react'
import { ErroApi, lerApi } from './api.js'
import { useT } from './i18n.js'
import './avisoFaixa.css'

const INTERVALO = 120_000
const REPETICOES = 3 // cópias do texto em cada metade do trilho, para cobrir telas largas com texto curto

export default function AvisoFaixa() {
  const t = useT()
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    let vivo = true
    const ler = () =>
      lerApi('/aviso-faixa')
        .then((d) => vivo && setAviso(d?.ativo && d.texto ? d : null))
        .catch((e) => { if (!(e instanceof ErroApi)) throw e })
    ler()
    const timer = setInterval(() => document.visibilityState === 'visible' && ler(), INTERVALO)
    const aoVoltar = () => document.visibilityState === 'visible' && ler()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])

  if (!aviso) return null
  // Velocidade constante (~70 px/s): quanto maior o texto, mais longa a volta
  const duracao = Math.max(14, Math.round((aviso.texto.length * REPETICOES * 9) / 70))
  const grupo = (copia) => (
    <div key={copia} className="af-grupo" aria-hidden={copia === 1 || undefined}>
      {Array.from({ length: REPETICOES }, (_, i) => (
        <span key={i} className="af-item">
          <i className="af-marca" aria-hidden="true" />
          {aviso.texto}
        </span>
      ))}
    </div>
  )
  return (
    <div className="af-faixa" role="region" aria-label={t('Aviso')}>
      <p className="af-leitor">{aviso.texto}</p>
      <div className="af-trilho" style={{ '--af-duracao': `${duracao}s` }} aria-hidden="true">
        {[0, 1].map(grupo)}
      </div>
    </div>
  )
}
