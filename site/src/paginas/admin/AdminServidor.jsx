// Aba "Servidor" do painel (só o dono): liga, desliga e reinicia o servidor de CS2 da VPS e mostra o console.
// Dados: worker /admin/servidor/* (src/servidor-cs2.js), que repassa para o agente da VPS (public/vps/painel.js). O token da VPS fica só no worker.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { useT } from '../../comum/i18n.js'
import { confirmar } from '../../comum/Dialogos.jsx'
import { ansiParaLinhas } from './ansi.js'

const INTERVALO_MS = 2000
const MAX_LINHAS = 1000
const ESTADOS = {
  rodando: ['Rodando', 'ok'],
  parado: ['Parado', 'parado'],
  atualizando: ['Atualizando', 'aviso'],
  parando: ['Parando', 'aviso'],
}
const ERROS = {
  login: 'Seu login venceu. Entre de novo com a Steam.',
  dono: 'Só o dono mexe no servidor.',
  configuracao: 'O worker ainda não tem CS2_AGENTE_URL e CS2_AGENTE_TOKEN (veja PAINEL-SERVIDOR.md).',
  timeout: 'A VPS não respondeu em 10 segundos.',
  'vps-fora': 'Não consegui falar com a VPS. Ela está ligada e o agente rodando?',
  'agente-antigo': 'O agente da VPS está desatualizado. Envie o painel.js novo para /home/steam/painel/ e rode: systemctl restart painel-cs2',
  'token-agente': 'A VPS recusou o token. Confira CS2_AGENTE_TOKEN no worker e PAINEL_TOKEN na VPS.',
}
const erroTexto = (e) => ERROS[e?.message] || e?.dados?.erro || 'Não deu certo. Tente de novo.' // 409 e outros trazem a frase do próprio agente

export default function AdminServidor() {
  const t = useT()
  const [estado, setEstado] = useState(null) // null = ainda não respondeu
  const [linhas, setLinhas] = useState([])
  const [erro, setErro] = useState('') // falha de conexão (some quando volta)
  const [aviso, setAviso] = useState('') // resposta de uma ação (409 etc.)
  const [validar, setValidar] = useState(false)
  const [cmd, setCmd] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const vistas = useMemo(() => ansiParaLinhas(linhas).filter((l) => l.partes.length), [linhas]) // cores do terminal; linhas só com código de cor somem
  const proximo = useRef(0) // índice global da próxima linha que falta (?desde=)
  const consolePre = useRef(null)
  const noFim = useRef(true)

  const atualizar = useCallback(async () => {
    try {
      const d = await chamar(`/admin/servidor/status?desde=${proximo.current}`)
      setErro('')
      setEstado(d.estado)
      if (d.total < proximo.current) {
        // o agente reiniciou (o contador voltou a zero): recomeça do começo
        setLinhas(d.logs || [])
      } else if (d.logs?.length) {
        setLinhas((l) => [...l, ...d.logs].slice(-MAX_LINHAS))
      }
      proximo.current = d.total
    } catch (e) {
      setErro(erroTexto(e))
    }
  }, [])

  useEffect(() => {
    atualizar()
    const id = setInterval(() => document.visibilityState === 'visible' && atualizar(), INTERVALO_MS)
    return () => clearInterval(id)
  }, [atualizar])

  // rola até o fim só se a pessoa já estava no fim
  useEffect(() => {
    const el = consolePre.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }, [linhas])
  const aoRolar = () => {
    const el = consolePre.current
    noFim.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
  }

  const agir = async (acao, corpo, confirma) => {
    if (confirma && !(await confirmar(confirma, { perigo: true, ok: t('Continuar') }))) return false
    setOcupado(true)
    setAviso('')
    try {
      await chamar(`/admin/servidor/${acao}`, corpo)
      await atualizar()
      return true
    } catch (e) {
      setAviso(erroTexto(e))
      return false
    } finally {
      setOcupado(false)
    }
  }
  const corrigirPlugins = async () => {
    setOcupado(true)
    setAviso('')
    try {
      const r = await chamar('/admin/servidor/gameinfo', {})
      setAviso(r?.mensagem || t('Pronto.'))
      await atualizar()
    } catch (e) {
      setAviso(erroTexto(e))
    } finally {
      setOcupado(false)
    }
  }
  const enviar = async (e) => {
    e.preventDefault()
    const c = cmd.trim()
    if (!c) return
    if (await agir('comando', { cmd: c })) setCmd('')
  }

  const [rotulo, cor] = ESTADOS[estado] || ['…', 'aviso']
  const parado = estado === 'parado'
  const rodando = estado === 'rodando'
  return (
    <div className="caixa adm-srv">
      <div className="adm-srv-topo">
        <span className={`adm-srv-estado adm-srv-${cor}`} role="status">
          <i /> {estado ? t(rotulo) : t('Conectando…')}
        </span>
        <div className="adm-srv-botoes">
          <button type="button" className="btn btn-primary" disabled={!parado || ocupado} onClick={() => agir('iniciar', { validar })}>
            {t('Iniciar')}
          </button>
          <button type="button" className="btn btn-ghost adm-perigo" disabled={!rodando || ocupado} onClick={() => agir('parar', {}, t('Parar o servidor? Todos os jogadores serão desconectados.'))}>
            {t('Parar')}
          </button>
          <button type="button" className="btn btn-ghost adm-perigo" disabled={!(parado || rodando) || ocupado} onClick={() => agir('reiniciar', { validar }, t('Reiniciar o servidor? Todos os jogadores serão desconectados.'))}>
            {t('Reiniciar')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={ocupado || estado === 'atualizando'} onClick={corrigirPlugins} title={t('Confere o gameinfo.gi e recoloca o Metamod (plugins) se a atualização do CS2 o apagou. Vale na próxima vez que o servidor abrir.')}>
            {t('Corrigir plugins')}
          </button>
          <label className="adm-srv-validar">
            <input type="checkbox" checked={validar} onChange={(e) => setValidar(e.target.checked)} /> {t('Validar arquivos')}
          </label>
        </div>
      </div>
      {erro && (
        <p className="adm-srv-msg" role="alert">
          {t(erro)}
        </p>
      )}
      {aviso && (
        <p className="adm-srv-msg" role="alert">
          {t(aviso)}
        </p>
      )}
      <pre className="adm-srv-console" ref={consolePre} onScroll={aoRolar} aria-label={t('Console do servidor')}>
        {vistas.length
          ? vistas.map((l, i) => (
              <div key={i} className={`adm-srv-l${l.marca ? ` adm-srv-l-${l.marca}` : ''}`}>
                {l.hora && <span className="adm-srv-h">{l.hora} </span>}
                {l.partes.map((p, k) => (
                  <span key={k} style={p.estilo || undefined}>
                    {p.texto}
                  </span>
                ))}
              </div>
            ))
          : t('Sem mensagens ainda.')}
      </pre>
      <form className="adm-srv-cmd" onSubmit={enviar}>
        <input type="text" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder={t('Comando do console (ex.: changelevel de_mirage)')} autoComplete="off" spellCheck="false" maxLength={500} disabled={!rodando} />
        <button type="submit" className="btn btn-primary" disabled={!rodando || ocupado || !cmd.trim()}>
          {t('Enviar')}
        </button>
      </form>
    </div>
  )
}
