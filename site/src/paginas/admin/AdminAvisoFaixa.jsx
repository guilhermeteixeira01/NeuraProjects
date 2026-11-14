// Painel admin → Aviso em faixa: texto do letreiro amarelo que passa no topo de todas as páginas (comum/AvisoFaixa.jsx).
// O worker guarda e valida (worker/steam-login/src/aviso-faixa.js). O site lê a cada 2 minutos: quem está com a página aberta vê a mudança em até ~2 min.
import { useEffect, useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import '../../comum/missoes.css'
import '../../comum/avisoFaixa.css'

const ERROS = { 'texto-vazio': 'Escreva o aviso antes de ligar a faixa.', 'texto-longo': 'O aviso passou do limite de caracteres.' }

export default function AdminAvisoFaixa() {
  const [form, setForm] = useState(null)
  const [max, setMax] = useState(280)
  const [salvo, setSalvo] = useState(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)

  const aplicar = (d) => {
    setSalvo(d.aviso)
    setForm({ ativo: d.aviso.ativo, texto: d.aviso.texto })
    if (d.max) setMax(d.max)
  }
  useEffect(() => {
    chamarApi('/admin/aviso-faixa').then(aplicar).catch(() => setErro('Não foi possível carregar o aviso.'))
  }, [])

  const enviar = async (corpo, msg) => {
    setErro(''); setOk(''); setSalvando(true)
    try {
      aplicar(await chamarApi('/admin/aviso-faixa', corpo))
      setOk(msg)
    } catch (e) {
      setErro(ERROS[e?.dados?.campo] || 'Não foi possível salvar o aviso.')
    } finally {
      setSalvando(false)
    }
  }
  const salvar = (e) => {
    e.preventDefault()
    enviar(form, form.ativo ? 'Aviso no ar. Quem está com o site aberto vê em até 2 minutos.' : 'Aviso salvo (faixa desligada).')
  }

  const texto = form?.texto.replace(/\s+/g, ' ').trim() || ''
  return (
    <details className="ms-config">
      <summary>Aviso em faixa no topo do site{salvo?.ativo ? ' · no ar' : ''}</summary>
      {!form ? <p>Carregando…</p> : (
        <form onSubmit={salvar}>
          <p>Letreiro amarelo que passa no topo de todas as páginas. Uma linha só; quebras de linha viram espaço.</p>
          <label>Texto do aviso
            <textarea rows="2" maxLength={max} value={form.texto} placeholder="Ex.: Servidor em manutenção hoje das 14h às 15h." onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))} />
            <small>{form.texto.length}/{max}</small>
          </label>
          <label>Faixa
            <select value={form.ativo ? 'sim' : 'nao'} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value === 'sim' }))}>
              <option value="nao">Desligada</option>
              <option value="sim">Ligada (aparece para todo mundo)</option>
            </select>
          </label>
          {texto && (
            <>
              <h3>Prévia</h3>
              <div className="af-faixa" aria-hidden="true">
                <div className="af-trilho" style={{ '--af-duracao': `${Math.max(14, Math.round((texto.length * 27) / 70))}s` }}>
                  {[0, 1].map((c) => (
                    <div key={c} className="af-grupo">
                      {[0, 1, 2].map((i) => <span key={i} className="af-item"><i className="af-marca" />{texto}</span>)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <p>
            <button type="submit" className="btn btn-primary" disabled={salvando || (form.ativo && !texto)}>{salvando ? 'Salvando…' : 'Salvar aviso'}</button>
            {salvo?.ativo && (
              <> <button type="button" className="btn btn-ghost" disabled={salvando} onClick={() => enviar({ ativo: false, texto: form.texto }, 'Faixa desligada.')}>Tirar do ar</button></>
            )}
          </p>
        </form>
      )}
      {erro && <p role="alert">{erro}</p>}
      {ok && <p role="status">{ok}</p>}
    </details>
  )
}
