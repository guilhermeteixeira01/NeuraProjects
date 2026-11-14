// Painel admin → Natal na Neura 2026 (Operação Presente): datas, prazo de resgate, divulgação, mapas do dia. A caixa “Presente da Neura” é fixa no código (só facas e luvas).
// O worker valida tudo (worker/steam-login/src/natal-2026-core.js): início e fim à meia-noite de Brasília, 7 dias exatos.
import { useEffect, useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { ALL_MAPS } from '../../comum/mapas.js'
import { DIAS_NATAL, LINK_EVENTO_NATAL } from '../../../worker/steam-login/src/natal-2026-core.js'
import '../../comum/missoes.css'

const DIA = 86400000
// Data/hora de Brasília (UTC-3, sem horário de verão) <-> ISO
const paraLocal = (s) => (Number.isFinite(Date.parse(s)) ? new Date(Date.parse(s) - 3 * 3600000).toISOString().slice(0, 16) : '')
const deLocal = (s) => (s ? `${s.length === 16 ? `${s}:00` : s}-03:00` : '')
const diaDe = (s) => paraLocal(s).slice(0, 10)
const somarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10)
const ERROS = {
  inicio: 'O início precisa ser um dia (meia-noite de Brasília).',
  fim: 'O fim precisa ser exatamente 7 dias depois do início.',
  resgateAte: 'O prazo de resgate precisa ser depois do fim (até 90 dias).',
  divulgacao: 'A divulgação começa antes do início (até 60 dias).',
  mapas: 'Escolha um mapa para cada um dos 7 dias.',
}
const ESTADOS = { desativado: 'Desativado', futuro: 'Agendado', ativo: 'Acontecendo', resgate: 'Período de resgate', encerrado: 'Encerrado' }

export default function AdminNatal() {
  const [dados, setDados] = useState(null)
  const [form, setForm] = useState(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)

  const aplicar = (d) => {
    setDados(d)
    const s = d.salva || {}
    setForm({
      ativo: s.ativo === true,
      inicio: s.inicio ? diaDe(s.inicio) : '',
      resgateAte: s.resgateAte ? paraLocal(s.resgateAte) : '',
      divulgacao: s.divulgacao ? diaDe(s.divulgacao) : '',
      mapas: Array.isArray(s.mapas) && s.mapas.length === DIAS_NATAL ? s.mapas : Array(DIAS_NATAL).fill(''),
    })
  }
  const carregar = () => chamarApi('/admin/natal-2026').then(aplicar).catch(() => setErro('Não foi possível carregar a configuração do evento.'))
  useEffect(() => { carregar() }, [])

  const salvar = async (e) => {
    e.preventDefault()
    setErro(''); setOk(''); setSalvando(true)
    try {
      const corpo = {
        ativo: form.ativo,
        inicio: deLocal(`${form.inicio}T00:00`),
        fim: deLocal(`${somarDias(form.inicio, DIAS_NATAL)}T00:00`),
        resgateAte: deLocal(form.resgateAte),
        divulgacao: form.divulgacao ? deLocal(`${form.divulgacao}T00:00`) : '',
        mapas: form.mapas,
      }
      aplicar(await chamarApi('/admin/natal-2026', corpo))
      setOk('Configuração salva.')
    } catch (e2) {
      setErro(ERROS[e2?.dados?.campo] || 'Não foi possível salvar. Confira as datas e os mapas.')
    } finally {
      setSalvando(false)
    }
  }

  const mudar = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const fim = form?.inicio ? somarDias(form.inicio, DIAS_NATAL) : ''
  const caixa = dados?.recompensas?.find((r) => r.id === 'caixa')
  const moldura = dados?.recompensas?.find((r) => r.id === 'moldura')

  return (
    <details className="ms-config">
      <summary>Natal na Neura 2026 · Operação Presente</summary>
      {!form ? <p>Carregando configuração…</p> : (
        <form onSubmit={salvar}>
          <p>
            Estado: <b>{ESTADOS[dados?.estado] || dados?.estado}</b> · Meta coletiva: <b>{dados?.meta?.atual ?? 0}/{dados?.meta?.alvo ?? 100}</b> · <a href={LINK_EVENTO_NATAL}>abrir a página</a>
          </p>
          <p>Horários de Brasília. São 7 dias com virada à meia-noite; o último dia de partidas é o anterior ao fim. Depois do fim, só o resgate fica aberto até o prazo.</p>
          <label>Evento
            <select value={form.ativo ? 'sim' : 'nao'} onChange={(e) => mudar('ativo', e.target.value === 'sim')}>
              <option value="nao">Desativado</option>
              <option value="sim">Ativo (segue as datas abaixo)</option>
            </select>
          </label>
          <div className="ms-config-linha">
            <label>Primeiro dia<input type="date" required value={form.inicio} onChange={(e) => mudar('inicio', e.target.value)} /></label>
            <label>Fim (00:00, exclusivo)<input type="date" value={fim} readOnly aria-readonly="true" /></label>
            <label>Resgate até<input type="datetime-local" required value={form.resgateAte} onChange={(e) => mudar('resgateAte', e.target.value)} /></label>
            <label>Banner na home desde<input type="date" value={form.divulgacao} placeholder="7 dias antes" onChange={(e) => mudar('divulgacao', e.target.value)} /></label>
          </div>
          <h3>Mapa do dia</h3>
          <div className="ms-config-linha">
            {form.mapas.map((m, i) => (
              <label key={i}>
                Dia {i + 1}{form.inicio ? ` · ${somarDias(form.inicio, i).split('-').reverse().slice(0, 2).join('/')}` : ''}
                <select required value={m} onChange={(e) => mudar('mapas', form.mapas.map((x, j) => (j === i ? e.target.value : x)))}>
                  <option value="">Escolha</option>
                  {ALL_MAPS.map((x) => <option key={x.id} value={`de_${x.id}`}>{x.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <h3>Recompensas</h3>
          <ul className="ms-config-pendencias">
            <li>Caixa “Presente da Neura”: {caixa?.disponivel ? 'pronta para resgate (somente facas e luvas).' : 'indisponível.'}</li>
            <li>Moldura: {moldura?.disponivel ? 'pronta para resgate.' : 'resgate desabilitado até a arte da moldura natalina ser adicionada ao catálogo de molduras.'}</li>
          </ul>
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar evento'}</button>
        </form>
      )}
      {erro && <p role="alert">{erro}</p>}
      {ok && <p role="status">{ok}</p>}
    </details>
  )
}
