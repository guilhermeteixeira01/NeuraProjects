// Aba "Pontos" do painel (só o dono): um lugar só para mexer nos Neura Pontos. Escolhe quem (um jogador ou todos), a ação (adicionar, remover
// ou definir o saldo), o valor, e vê o saldo do jogador atualizando sozinho. O worker (src/loja.js, /admin/loja-pontos e /admin/loja-saldo) valida de novo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { localeAtual, useT } from '../../comum/i18n.js'
import { confirmar } from '../../comum/Dialogos.jsx'

const num = (n) => Number(n || 0).toLocaleString(localeAtual())
const erroTexto = (e) => ({ login: 'Seu login venceu. Entre de novo com a Steam.', dono: 'Só o dono mexe nos pontos.', id: 'SteamID64 inválido.', valor: 'Valor inválido.' })[e.message] || 'Não deu para aplicar. Tente de novo.'
const AGORA_MS = 3000 // de quanto em quanto tempo o saldo é conferido enquanto um jogador está escolhido

export default function AdminPontos({ usuarios }) {
  const t = useT()
  const [alvo, setAlvo] = useState('jogador') // 'jogador' | 'todos'
  const [busca, setBusca] = useState('')
  const [acao, setAcao] = useState('adicionar') // adicionar | remover | definir
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saldo, setSaldo] = useState(null) // { saldo, ganhos, gastos, movimentos }
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)
  const vivo = useRef(true)

  // jogador escolhido: nome exato, SteamID64 ou clique na sugestão (só vale com texto digitado)
  const termo = busca.trim().toLowerCase()
  const jogador = !termo ? null : usuarios.find((u) => u.id === termo || (u.nome || '').toLowerCase() === termo) || (/^\d{17}$/.test(termo) ? { id: termo, nome: '' } : null)
  const id = alvo === 'jogador' ? jogador?.id : null

  const ler = useCallback(async () => {
    if (!id) return
    try {
      const r = await chamar(`/admin/loja-saldo?id=${id}`)
      if (vivo.current) setSaldo(r)
    } catch {
      // sem resposta agora: tenta de novo no próximo ciclo
    }
  }, [id])
  useEffect(() => {
    vivo.current = true
    setSaldo(null)
    if (!id) return
    ler()
    const i = setInterval(ler, AGORA_MS)
    return () => {
      vivo.current = false
      clearInterval(i)
    }
  }, [id, ler])
  useEffect(() => {
    if (alvo === 'todos' && acao === 'definir') setAcao('adicionar') // "definir" só faz sentido para um jogador
  }, [alvo, acao])

  const v = Math.max(0, Math.round(Number(valor) || 0))
  const depois = saldo ? (acao === 'adicionar' ? saldo.saldo + v : acao === 'remover' ? saldo.saldo - v : v) : null
  const podeAplicar = !ocupado && (alvo === 'todos' ? v > 0 : !!id && (acao === 'definir' ? valor !== '' : v > 0))

  const aplicar = async () => {
    const quem = alvo === 'todos' ? t('TODOS os jogadores') : jogador.nome || jogador.id
    const verbo = acao === 'adicionar' ? t('Dar') : acao === 'remover' ? t('Tirar') : t('Definir o saldo em')
    if (!(await confirmar(`${verbo} ${num(v)} NP — ${quem}?${alvo === 'todos' ? '\n' + t('Cada jogador recebe na próxima vez que abrir o site.') : ''}`, { ok: t('Aplicar'), perigo: acao === 'remover' }))) return
    setOcupado(true)
    setEstado({ texto: '', ok: true })
    try {
      const r = await chamar('/admin/loja-pontos', { alvo: alvo === 'todos' ? 'todos' : id, acao, valor: v, motivo })
      setEstado({ texto: alvo === 'todos' ? t('Pronto: vale para todos (cada um recebe ao abrir o site).') : t('Pronto: o saldo agora é {n} NP.', { n: num(r.saldo) }), ok: true })
      setValor('')
      setMotivo('')
      ler()
    } catch (e) {
      setEstado({ texto: t(erroTexto(e)), ok: false })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="caixa adm-pt">
      <p className="adm-dar-dica">{t('Neura Pontos da loja: escolha quem, o que fazer e o valor. Os pontos ganhos nas partidas continuam valendo; aqui você só soma ou tira em cima deles.')}</p>

      <div className="adm-pt-grupo" role="group" aria-label={t('Quem')}>
        <b>{t('1. Quem')}</b>
        <div className="adm-pt-seg">
          <button type="button" className={alvo === 'jogador' ? 'active' : ''} onClick={() => setAlvo('jogador')}>
            {t('Um jogador')}
          </button>
          <button type="button" className={alvo === 'todos' ? 'active' : ''} onClick={() => setAlvo('todos')}>
            {t('Todos os jogadores')}
          </button>
        </div>
        {alvo === 'jogador' && (
          <>
            <input list="adm-pt-usuarios" type="text" placeholder={t('Nome exato ou SteamID64')} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label={t('Jogador')} />
            <datalist id="adm-pt-usuarios">
              {usuarios
                .filter((u) => u.nome)
                .slice(0, 400)
                .map((u) => (
                  <option key={u.id} value={u.nome} />
                ))}
            </datalist>
          </>
        )}
      </div>

      {alvo === 'jogador' && (
        <div className="adm-pt-saldo" aria-live="polite">
          {id ? (
            <>
              <small>{jogador.nome || jogador.id}</small>
              <b>{saldo ? `${num(saldo.saldo)} NP` : '…'}</b>
              {saldo && (
                <em>
                  {t('ganhos nas partidas')} {num(saldo.ganhos)} · {t('gastos/ajustes')} {num(saldo.gastos)} · <i className="adm-pt-vivo" /> {t('atualiza sozinho')}
                </em>
              )}
            </>
          ) : (
            <small>{t('Escolha um jogador para ver o saldo dele.')}</small>
          )}
        </div>
      )}
      {alvo === 'todos' && <p className="adm-pt-aviso">{t('Vale para todos os jogadores do site. Cada um recebe uma vez, ao abrir o site ou a loja (inclusive quem entrar depois).')}</p>}

      <div className="adm-pt-grupo">
        <b>{t('2. O que fazer')}</b>
        <div className="adm-pt-seg">
          <button type="button" className={acao === 'adicionar' ? 'active' : ''} onClick={() => setAcao('adicionar')}>
            + {t('Adicionar')}
          </button>
          <button type="button" className={acao === 'remover' ? 'active' : ''} onClick={() => setAcao('remover')}>
            − {t('Remover')}
          </button>
          <button type="button" className={acao === 'definir' ? 'active' : ''} disabled={alvo === 'todos'} title={alvo === 'todos' ? t('Só para um jogador') : undefined} onClick={() => setAcao('definir')}>
            = {t('Definir saldo')}
          </button>
        </div>
      </div>

      <div className="adm-pt-grupo">
        <b>{t('3. Valor')}</b>
        <div className="adm-pt-linha">
          <input type="number" min="0" step="1" inputMode="numeric" placeholder={acao === 'definir' ? t('Novo saldo') : t('Quantidade de NP')} value={valor} onChange={(e) => setValor(e.target.value)} aria-label={t('Valor')} />
          <input type="text" maxLength={60} placeholder={t('Motivo (opcional)')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        {depois !== null && (valor !== '') && (
          <small className="adm-pt-previa">
            {t('Saldo atual')} {num(saldo.saldo)} → <b>{num(depois)} NP</b>
          </small>
        )}
      </div>

      <button type="button" className="btn btn-primary adm-pt-aplicar" disabled={!podeAplicar} onClick={aplicar}>
        {acao === 'adicionar' ? t('Adicionar') : acao === 'remover' ? t('Remover') : t('Definir saldo')} {v || acao === 'definir' ? `· ${num(v)} NP` : ''} {alvo === 'todos' ? t('para todos') : ''}
      </button>
      {estado.texto && <p className={estado.ok ? 'adm-dar-estado' : 'adm-pt-erro'}>{estado.texto}</p>}

      {alvo === 'jogador' && saldo?.movimentos?.length > 0 && (
        <div className="adm-pt-hist">
          <b>{t('Últimas movimentações')}</b>
          <ul>
            {saldo.movimentos.map((m, k) => (
              <li key={k}>
                <span className={m.delta >= 0 ? 'mais' : 'menos'}>
                  {m.delta >= 0 ? '+' : ''}
                  {num(m.delta)}
                </span>
                <em>{m.motivo}</em>
                <small>{new Date(m.ts).toLocaleString(localeAtual(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
