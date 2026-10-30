// Aba "Pontos" do painel (só o dono): um lugar só para mexer nos Neura Pontos. Escolhe quem (um jogador ou todos), a ação (adicionar, remover
// ou definir o saldo), o valor, e vê o saldo do jogador atualizando sozinho. O worker (src/loja.js, /admin/loja-pontos e /admin/loja-saldo) valida de novo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { localeAtual, useT } from '../../comum/i18n.js'
import { confirmar } from '../../comum/Dialogos.jsx'
import { bonusDoPagamento, npDoPagamento } from '../../../worker/steam-login/src/loja-core.js'
import { lerCaixasPublicas } from '../../comum/loja.js'
import { CATEGORIAS_CAIXA, categoriaDaCaixa } from '../../comum/temasCaixa.js'

const num = (n) => Number(n || 0).toLocaleString(localeAtual())
const erroTexto = (e) => ({ login: 'Seu login venceu. Entre de novo com a Steam.', dono: 'Só o dono mexe nos pontos.', id: 'SteamID64 inválido.', valor: 'Valor inválido.' })[e.message] || 'Não deu para aplicar. Tente de novo.'
const QTD_MAX_BONUS = 2000 // bônus de caixa para todos: até o limite de itens do inventário (ITENS_MAX no worker)
const AGORA_MS = 3000 // de quanto em quanto tempo o saldo é conferido enquanto um jogador está escolhido

// fixo: SteamID64 do jogador (janela do jogador: sem escolher quem); modo 'todos': só o bônus para todos e a lista dos salvos
export default function AdminPontos({ usuarios, fixo = null, modo = 'tudo' }) {
  const t = useT()
  const [alvo, setAlvo] = useState(modo === 'todos' ? 'todos' : 'jogador') // 'jogador' | 'todos'
  const [busca, setBusca] = useState(fixo || '')
  const [acao, setAcao] = useState('adicionar') // adicionar | remover | definir
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saldo, setSaldo] = useState(null) // { saldo, ganhos, gastos, movimentos }
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)
  const [bonusVersao, setBonusVersao] = useState(0) // sobe quando um bônus para todos é lançado (a lista de salvos recarrega)
  const [tipo, setTipo] = useState('np') // modo 'todos': bônus de 'np' ou de 'caixa' fechada
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
      if (alvo === 'todos') setBonusVersao((n) => n + 1)
      ler()
    } catch (e) {
      setEstado({ texto: t(erroTexto(e)), ok: false })
    } finally {
      setOcupado(false)
    }
  }

  const seletorTipo = modo === 'todos' && (
    <div className="adm-pt-seg adm-pt-tipo" role="group" aria-label={t('Tipo de bônus')}>
      <button type="button" className={tipo === 'np' ? 'active' : ''} onClick={() => setTipo('np')}>
        {t('Neura Pontos')}
      </button>
      <button type="button" className={tipo === 'caixa' ? 'active' : ''} onClick={() => setTipo('caixa')}>
        {t('Caixa fechada')}
      </button>
    </div>
  )

  if (modo === 'todos' && tipo === 'caixa')
    return (
      <>
        <div className="caixa adm-pt">
          {seletorTipo}
          <BonusCaixa aoLancar={() => setBonusVersao((n) => n + 1)} />
        </div>
        <BonusSalvos versao={bonusVersao} />
      </>
    )

  return (
    <>
    <div className="caixa adm-pt">
      {seletorTipo}
      <p className="adm-dar-dica">{fixo ? t('Neura Pontos da loja deste jogador. Os pontos ganhos nas partidas continuam valendo; aqui você só soma ou tira em cima deles.') : modo === 'todos' ? t('Bônus de Neura Pontos para todos os jogadores do site (cada um recebe uma vez, inclusive quem entrar depois).') : t('Neura Pontos da loja: escolha quem, o que fazer e o valor. Os pontos ganhos nas partidas continuam valendo; aqui você só soma ou tira em cima deles.')}</p>

      {!fixo && modo !== 'todos' && (
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
      )}

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
        <b>{fixo || modo === 'todos' ? t('O que fazer') : t('2. O que fazer')}</b>
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
        <b>{fixo || modo === 'todos' ? t('Valor') : t('3. Valor')}</b>
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
      {alvo === 'jogador' && id && modo !== 'todos' && <ItensPartidaAdmin id={id} />}
      {modo !== 'jogador' && <BonusSalvos versao={bonusVersao} />}
      {modo === 'tudo' && <ConfigDepositos />}
    </>
  )
}

// Itens de partida do lobby (Boost / Freeze) de um jogador: quantos tem, qual está ativado, e dar ou tirar (o worker avisa o jogador no sino)
function ItensPartidaAdmin({ id }) {
  const t = useT()
  const [itens, setItens] = useState(null)
  const [qtd, setQtd] = useState(1)
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    let vivo = true
    setItens(null)
    chamar(`/admin/consumiveis?id=${id}`).then((r) => vivo && setItens(r), () => vivo && setEstado({ texto: t('Não deu para ler os itens.'), ok: false }))
    return () => {
      vivo = false
    }
  }, [id, t])
  const mudar = async (tipo, sinal) => {
    const n = Math.max(1, Math.min(99, Math.round(Number(qtd) || 1)))
    setOcupado(true)
    setEstado({ texto: '', ok: true })
    try {
      setItens(await chamar('/admin/consumiveis', { alvo: id, tipo, qtd: sinal * n }))
      setEstado({ texto: t('Pronto.'), ok: true })
    } catch (e) {
      setEstado({ texto: t(erroTexto(e)), ok: false })
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="caixa adm-pt adm-itens-partida">
      <p className="adm-dar-dica">{t('Itens de partida do lobby. Boost: vitória na próxima partida vale XP em dobro. Freeze: a próxima partida não ganha nem perde XP.')}</p>
      <div className="adm-pt-linha">
        <input type="number" min="1" max="99" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label={t('Quantidade')} />
      </div>
      {[['boost', 'Boost'], ['freeze', 'Freeze']].map(([tipo, nome]) => (
        <div key={tipo} className="adm-pt-grupo">
          <b>
            {nome}: {itens ? itens[tipo] : '…'}
            {itens?.ativo?.tipo === tipo && <em> · {t('ativado para a próxima partida')}</em>}
          </b>
          <div className="adm-pt-seg">
            <button type="button" disabled={ocupado || !itens} onClick={() => mudar(tipo, 1)}>
              + {t('Dar')}
            </button>
            <button type="button" disabled={ocupado || !itens || !itens[tipo]} onClick={() => mudar(tipo, -1)}>
              − {t('Tirar')}
            </button>
          </div>
        </div>
      ))}
      {estado.texto && <p className={estado.ok ? 'adm-dar-estado' : 'adm-pt-erro'}>{estado.texto}</p>}
    </div>
  )
}

// Depósitos com dinheiro real (Asaas): quanto vale 1 real em NP, mínimo, máximo, pacotes e bônus. Vale na hora para o site e para o servidor.
export function ConfigDepositos() {
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

// Bônus de caixa fechada para todos: escolhe a caixa (agrupada por tema, como na loja), a quantidade e o motivo. Cada jogador recebe uma vez no inventário.
function BonusCaixa({ aoLancar }) {
  const t = useT()
  const [caixas, setCaixas] = useState(null)
  const [caixa, setCaixa] = useState('')
  const [qtd, setQtd] = useState('1')
  const [motivo, setMotivo] = useState('')
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    lerCaixasPublicas().then((l) => setCaixas((l || []).filter((c) => !c.arquivada)))
  }, [])

  const grupos = CATEGORIAS_CAIXA.map(([id, nome]) => [id, nome, (caixas || []).filter((c) => categoriaDaCaixa(c) === id)]).filter((g) => g[2].length)
  const escolhida = (caixas || []).find((c) => String(c.id) === caixa)
  const n = Math.max(0, Math.min(QTD_MAX_BONUS, Math.round(Number(qtd) || 0)))
  const podeAplicar = !ocupado && !!escolhida && n > 0

  const aplicar = async () => {
    if (!(await confirmar(`${t('Dar {n}× {caixa} para TODOS os jogadores?', { n, caixa: escolhida.nome })}\n${t('Cada jogador recebe na próxima vez que abrir o site.')}`, { ok: t('Aplicar') }))) return
    setOcupado(true)
    setEstado({ texto: '', ok: true })
    try {
      await chamar('/admin/loja-bonus-caixa', { caixa: escolhida.id, qtd: n, motivo })
      setEstado({ texto: t('Pronto: vale para todos (cada um recebe ao abrir o site).'), ok: true })
      setMotivo('')
      aoLancar()
    } catch (e) {
      setEstado({ texto: e.message === 'caixa' ? t('Essa caixa não existe mais.') : t(erroTexto(e)), ok: false })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <p className="adm-dar-dica">{t('Caixa fechada para todos os jogadores do site: vai direto para o inventário (cada um recebe uma vez, inclusive quem entrar depois).')}</p>
      <div className="adm-pt-grupo">
        <b>{t('Caixa')}</b>
        <select value={caixa} onChange={(e) => setCaixa(e.target.value)} disabled={!caixas} aria-label={t('Caixa')}>
          <option value="">{caixas ? t('Escolha a caixa') : t('Carregando…')}</option>
          {grupos.map(([id, nome, lista]) => (
            <optgroup key={id} label={t(nome)}>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {num(c.preco)} NP
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="adm-pt-grupo">
        <b>{t('Quantidade')}</b>
        <div className="adm-pt-linha">
          <input type="number" min="1" max={QTD_MAX_BONUS} step="1" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label={t('Quantidade')} />
          <input type="text" maxLength={60} placeholder={t('Motivo (opcional)')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn-primary adm-pt-aplicar" disabled={!podeAplicar} onClick={aplicar}>
        {t('Dar caixa para todos')} {escolhida && n ? `· ${n}× ${escolhida.nome}` : ''}
      </button>
      {estado.texto && <p className={estado.ok ? 'adm-dar-estado' : 'adm-pt-erro'}>{estado.texto}</p>}
    </>
  )
}

// Bônus "para todos" que estão salvos: cada jogador recebe cada um uma vez (quem entrar depois também). Dá para apagar: quem já recebeu fica com os pontos,
// quem ainda não recebeu (e os novos jogadores) deixa de receber.
function BonusSalvos({ versao }) {
  const t = useT()
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [apagando, setApagando] = useState(null)

  const carregar = useCallback(() => {
    chamar('/admin/loja-bonus').then(
      (d) => {
        setLista(d.bonus || [])
        setErro('')
      },
      () => setErro('Não consegui ler os bônus salvos.'),
    )
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar, versao])

  const apagar = async (b) => {
    const nome = `${b.caixa ? `${b.qtd}× ${b.nome}` : `${b.valor > 0 ? '+' : ''}${num(b.valor)} NP`}${b.motivo ? ` (${b.motivo})` : ''}`
    const texto = b.caixa ? 'Apagar o bônus {nome}? Quem já recebeu fica com a caixa; quem ainda não recebeu, e os jogadores novos, não recebem mais.' : 'Apagar o bônus {nome}? Quem já recebeu fica com os pontos; quem ainda não recebeu, e os jogadores novos, não recebem mais.'
    if (!(await confirmar(t(texto, { nome }), { perigo: true, ok: t('Apagar') }))) return
    setApagando(b.id)
    try {
      await chamar('/admin/loja-bonus', { apagar: b.id })
      carregar()
    } catch {
      setErro('Não deu para apagar agora. Tente de novo.')
    } finally {
      setApagando(null)
    }
  }

  return (
    <div className="adm-bloco adm-pontos adm-bonus">
      <h3>{t('Bônus para todos (salvos)')}</h3>
      <p className="adm-dar-dica">{t('Todo jogador recebe cada bônus uma vez, inclusive quem criar a conta depois. Ao receber, aparece no sino da pessoa com o motivo.')}</p>
      {erro && <p className="adm-pt-erro">{t(erro)}</p>}
      {lista === null ? (
        <p className="adm-dar-dica">{t('Carregando…')}</p>
      ) : !lista.length ? (
        <p className="adm-dar-dica">{t('Nenhum bônus salvo. Use "Todos os jogadores" acima para lançar um.')}</p>
      ) : (
        <ul className="adm-bonus-lista">
          {[...lista].reverse().map((b) => (
            <li key={b.id}>
              {b.caixa ? (
                <b className="mais">
                  {b.qtd}× {b.nome}
                </b>
              ) : (
                <b className={b.valor >= 0 ? 'mais' : 'menos'}>
                  {b.valor > 0 ? '+' : ''}
                  {num(b.valor)} NP
                </b>
              )}
              <span>{b.motivo || t('sem motivo')}</span>
              <small>{new Date(b.ts).toLocaleString(localeAtual(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
              <button type="button" className="btn btn-ghost adm-perigo" disabled={apagando === b.id} onClick={() => apagar(b)}>
                {t('Apagar')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
