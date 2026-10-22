// Aba "Logs" do painel: o registro de tudo que acontece de importante (ações de admin, pagamentos, assinaturas, trocas, mercado, vendas e erros do servidor).
// Dados: worker GET /admin/logs?tipo=&q=&antes= (src/registro.js). Guarda as últimas 20 mil linhas.
import { useCallback, useEffect, useRef, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { localeAtual, useT } from '../../comum/i18n.js'

const TIPOS = [
  ['', 'Tudo'],
  ['admin', 'Admin'],
  ['pagamento', 'Pagamentos'],
  ['assinatura', 'Assinaturas'],
  ['troca', 'Trocas'],
  ['mercado', 'Mercado'],
  ['venda', 'Vendas'],
  ['erro', 'Erros'],
]
const ROTULO = Object.fromEntries(TIPOS)

export default function AdminLogs({ usuarios }) {
  const t = useT()
  const [tipo, setTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('') // busca já "assentada" (espera parar de digitar)
  const [logs, setLogs] = useState(null)
  const [mais, setMais] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [vivo, setVivo] = useState(true) // atualizar sozinho
  const [erro, setErro] = useState('')
  const nomes = useRef(new Map())
  nomes.current = new Map((usuarios || []).map((u) => [u.id, u.nome || u.id]))

  useEffect(() => {
    const i = setTimeout(() => setTermo(busca.trim()), 350)
    return () => clearTimeout(i)
  }, [busca])

  const consulta = useCallback((antes) => `/admin/logs?limite=80${tipo ? `&tipo=${tipo}` : ''}${termo ? `&q=${encodeURIComponent(termo)}` : ''}${antes ? `&antes=${antes}` : ''}`, [tipo, termo])

  // (t é uma função nova a cada render: fora das dependências, senão a lista recarregava sem parar e ficava piscando)
  const recarregar = useCallback(async () => {
    try {
      const d = await chamar(consulta())
      setLogs(d.logs || [])
      setMais(!!d.mais)
      setErro('')
    } catch {
      setErro('Não consegui ler o registro agora.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta])
  useEffect(() => {
    setLogs(null)
    recarregar()
  }, [recarregar])
  useEffect(() => {
    if (!vivo) return
    const i = setInterval(() => document.visibilityState === 'visible' && recarregar(), 8000)
    return () => clearInterval(i)
  }, [vivo, recarregar])

  const carregarMais = async () => {
    if (!logs?.length) return
    setCarregando(true)
    try {
      const d = await chamar(consulta(logs[logs.length - 1].id))
      setLogs((l) => [...l, ...(d.logs || [])])
      setMais(!!d.mais)
    } catch {
      setErro(t('Não consegui carregar mais.'))
    } finally {
      setCarregando(false)
    }
  }

  const quem = (id) => (id ? nomes.current.get(id) || `…${id.slice(-5)}` : t('Sistema'))
  const quando = (ts) => new Date(ts).toLocaleString(localeAtual(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="adm-bloco adm-logs">
      <div className="adm-logs-topo">
        <div className="adm-logs-tipos" role="tablist" aria-label={t('Tipo de registro')}>
          {TIPOS.map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={tipo === id} className={tipo === id ? 'active' : ''} onClick={() => setTipo(id)}>
              {t(rotulo)}
            </button>
          ))}
        </div>
        <input type="search" className="adm-logs-busca" placeholder={t('Buscar por texto, nome ou SteamID…')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="adm-check">
          <input type="checkbox" checked={vivo} onChange={(e) => setVivo(e.target.checked)} />
          <span>{t('Atualizar sozinho')}</span>
        </label>
      </div>

      {erro && <p className="adm-pt-erro">{t(erro)}</p>}
      {logs === null ? (
        <p className="adm-dar-dica">{t('Carregando…')}</p>
      ) : !logs.length ? (
        <p className="adm-dar-dica">{t('Nada registrado com esse filtro ainda.')}</p>
      ) : (
        <ul className="adm-logs-lista">
          {logs.map((l) => (
            <li key={l.id} className={`adm-log tipo-${l.tipo}`}>
              <time>{quando(l.ts)}</time>
              <span className="adm-log-tipo">{t(ROTULO[l.tipo] || l.tipo)}</span>
              <span className="adm-log-texto">
                <b>{quem(l.quem)}</b> {l.texto}
                {l.alvo && (
                  <>
                    {' '}
                    → <b>{quem(l.alvo)}</b>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {mais && (
        <button type="button" className="btn btn-ghost adm-logs-mais" disabled={carregando} onClick={carregarMais}>
          {carregando ? t('Carregando…') : t('Carregar mais')}
        </button>
      )}
    </div>
  )
}
