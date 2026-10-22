// Aba "Pontos" do painel (só o dono): um lugar só para mexer nos Neura Pontos. Escolhe quem (um jogador ou todos), a ação (adicionar, remover
// ou definir o saldo), o valor, e vê o saldo do jogador atualizando sozinho. O worker (src/loja.js, /admin/loja-pontos e /admin/loja-saldo) valida de novo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { localeAtual, useT } from '../../comum/i18n.js'
import { confirmar } from '../../comum/Dialogos.jsx'
import { bonusDoPagamento, npDoPagamento } from '../../../worker/steam-login/src/loja-core.js'

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
    <>
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
      <ConfigDepositos />
    </>
  )
}

// Depósitos com dinheiro real (Asaas): quanto vale 1 real em NP, mínimo, máximo, pacotes e bônus. Vale na hora para o site e para o servidor.
function ConfigDepositos() {
  const t = useT()
  const [cfg, setCfg] = useState(null)
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    chamar('/admin/pagamento-config').then(
      (d) => setCfg(d.cfg),
      () => setEstado({ texto: t('Não consegui ler a configuração dos depósitos.'), ok: false }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!cfg) return <div className="adm-bloco adm-pontos">{estado.texto && <p className="adm-pt-erro">{estado.texto}</p>}</div>

  const mudar = (campo, valor) => setCfg((c) => ({ ...c, [campo]: valor }))
  const numeroOuVazio = (v) => (v === '' ? '' : Number(v))
  const textoPacotes = typeof cfg.pacotesTexto === 'string' ? cfg.pacotesTexto : cfg.pacotes.join(', ')
  const pacotes = textoPacotes
    .split(/[ ,;]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0)
  const minReais = cfg.minReais ?? cfg.minCentavos / 100
  const maxReais = cfg.maxReais ?? cfg.maxCentavos / 100
  const previa = { npPorReal: Number(cfg.npPorReal) || 0, bonus: cfg.bonus }
  const salvar = async () => {
    setOcupado(true)
    setEstado({ texto: '', ok: true })
    try {
      const d = await chamar('/admin/pagamento-config', { minCentavos: Math.round(Number(minReais) * 100), maxCentavos: Math.round(Number(maxReais) * 100), npPorReal: Number(cfg.npPorReal), pacotes, bonus: cfg.bonus })
      setCfg(d.cfg)
      setEstado({ texto: t('Salvo! Já vale no site e no servidor.'), ok: true })
    } catch (e) {
      setEstado({
        texto:
          e.message === 'valores'
            ? t('Valores inválidos: o mínimo é R$ 5 (limite do Asaas) e o máximo não pode ser menor que o mínimo.')
            : e.message === 'pacotes'
              ? t('Coloque pelo menos um valor de pacote entre o mínimo e o máximo.')
              : t('Não deu para salvar. Tente de novo.'),
        ok: false,
      })
    } finally {
      setOcupado(false)
    }
  }
  const reais = (r) => Number(r).toLocaleString(localeAtual(), { style: 'currency', currency: 'BRL' })

  return (
    <div className="adm-bloco adm-pontos adm-depositos">
      <h3>{t('Depósitos com dinheiro real')}</h3>
      <p className="adm-dar-dica">{t('Pix e cartão pelo Asaas. Aqui você define quantos NP o jogador recebe por real, o valor mínimo e máximo, os pacotes que aparecem e o bônus por faixa. Vale na hora.')}</p>

      <div className="adm-pt-linha adm-dep-campos">
        <label className="adm-dep-campo">
          {t('NP por R$ 1,00')}
          <input type="number" min="1" step="1" value={cfg.npPorReal} onChange={(e) => mudar('npPorReal', numeroOuVazio(e.target.value))} />
        </label>
        <label className="adm-dep-campo">
          {t('Mínimo (R$)')}
          <input type="number" min="5" step="1" value={minReais} onChange={(e) => mudar('minReais', e.target.value)} />
        </label>
        <label className="adm-dep-campo">
          {t('Máximo (R$)')}
          <input type="number" min="5" step="1" value={maxReais} onChange={(e) => mudar('maxReais', e.target.value)} />
        </label>
      </div>

      <label className="adm-dep-campo">
        {t('Pacotes (valores em R$, separados por vírgula)')}
        <input type="text" value={textoPacotes} onChange={(e) => mudar('pacotesTexto', e.target.value)} />
      </label>

      <div className="adm-pt-grupo">
        <b>{t('Bônus por faixa')}</b>
        {cfg.bonus.map((b, i) => (
          <div key={i} className="adm-dep-bonus">
            <span>{t('A partir de R$')}</span>
            <input type="number" min="1" value={b[0]} onChange={(e) => mudar('bonus', cfg.bonus.map((x, k) => (k === i ? [numeroOuVazio(e.target.value), x[1]] : x)))} />
            <span>{t('ganha')}</span>
            <input type="number" min="0" max="500" value={b[1]} onChange={(e) => mudar('bonus', cfg.bonus.map((x, k) => (k === i ? [x[0], numeroOuVazio(e.target.value)] : x)))} />
            <span>% {t('a mais')}</span>
            <button type="button" className="btn btn-ghost adm-perigo" onClick={() => mudar('bonus', cfg.bonus.filter((_, k) => k !== i))} aria-label={t('Tirar faixa')}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" disabled={cfg.bonus.length >= 10} onClick={() => mudar('bonus', [...cfg.bonus, [100, 10]])}>
          + {t('Adicionar faixa')}
        </button>
      </div>

      <div className="adm-pt-grupo">
        <b>{t('Prévia (o que o jogador vê)')}</b>
        <ul className="adm-dep-previa">
          {pacotes.map((r) => (
            <li key={r}>
              <b>{reais(r)}</b>
              <span>{Number(npDoPagamento(r * 100, previa)).toLocaleString(localeAtual())} NP</span>
              {bonusDoPagamento(r * 100, previa) > 0 && <em>+{bonusDoPagamento(r * 100, previa)}%</em>}
            </li>
          ))}
        </ul>
      </div>

      <button type="button" className="btn btn-primary adm-pt-aplicar" disabled={ocupado} onClick={salvar}>
        {ocupado ? t('Salvando…') : t('Salvar depósitos')}
      </button>
      {estado.texto && <p className={estado.ok ? 'adm-dar-estado' : 'adm-pt-erro'}>{estado.texto}</p>}
    </div>
  )
}
