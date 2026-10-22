// Planos de venda da assinatura Premium (aba Assinaturas): quantos meses e quanto custa cada plano. O jogador paga por Pix/cartão (Asaas) e a
// assinatura liga sozinha. Worker: GET/POST /admin/assinatura-planos (src/pagamentos.js). O valor mínimo de cobrança do Asaas é R$ 5,00.
import { useEffect, useState } from 'react'
import { chamar } from '../../comum/Moldura.jsx'
import { localeAtual, useT } from '../../comum/i18n.js'

export default function AdminPlanos() {
  const t = useT()
  const [planos, setPlanos] = useState(null) // [{ meses, reais }] (reais como texto digitado)
  const [estado, setEstado] = useState({ texto: '', ok: true })
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    chamar('/admin/assinatura-planos').then(
      (d) => setPlanos(d.planos.map((p) => ({ meses: p.meses, reais: String(p.centavos / 100) }))),
      () => setEstado({ texto: t('Não consegui ler os planos.'), ok: false }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!planos) return <div className="adm-bloco">{estado.texto && <p className="adm-pt-erro">{estado.texto}</p>}</div>

  const mudar = (i, campo, valor) => setPlanos((l) => l.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)))
  const moeda = (n) => Number(n || 0).toLocaleString(localeAtual(), { style: 'currency', currency: 'BRL' })
  const salvar = async () => {
    setOcupado(true)
    setEstado({ texto: '', ok: true })
    try {
      const d = await chamar('/admin/assinatura-planos', { planos: planos.map((p) => ({ meses: Number(p.meses), centavos: Math.round(Number(String(p.reais).replace(',', '.')) * 100) })) })
      setPlanos(d.planos.map((p) => ({ meses: p.meses, reais: String(p.centavos / 100) })))
      setEstado({ texto: t('Salvo! Já vale no site.'), ok: true })
    } catch {
      setEstado({ texto: t('Planos inválidos: meses de 1 a 60 e valor de pelo menos R$ 5 (limite do Asaas).'), ok: false })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="adm-bloco adm-planos">
      <h3>{t('Venda da assinatura Premium')}</h3>
      <p className="adm-dar-dica">{t('Planos que o jogador vê em "Assinar Premium" (menu da conta). Pix e cartão pelo Asaas; ao confirmar, os meses são somados na assinatura dele e o emblema aparece na hora. Não renova sozinha.')}</p>
      <ul className="adm-planos-lista">
        {planos.map((p, i) => (
          <li key={i}>
            <label>
              {t('Meses')}
              <input type="number" min="1" max="60" value={p.meses} onChange={(e) => mudar(i, 'meses', e.target.value)} />
            </label>
            <label>
              {t('Preço (R$)')}
              <input type="number" min="5" step="0.5" value={p.reais} onChange={(e) => mudar(i, 'reais', e.target.value)} />
            </label>
            <small>{Number(p.meses) > 0 ? `${moeda(Number(String(p.reais).replace(',', '.')) / Number(p.meses))} / ${t('mês')}` : ''}</small>
            <button type="button" className="btn btn-ghost adm-perigo" onClick={() => setPlanos((l) => l.filter((_, k) => k !== i))} aria-label={t('Tirar plano')}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="adm-planos-acoes">
        <button type="button" className="btn btn-ghost" disabled={planos.length >= 8} onClick={() => setPlanos((l) => [...l, { meses: 1, reais: '15' }])}>
          + {t('Adicionar plano')}
        </button>
        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={salvar}>
          {ocupado ? t('Salvando…') : t('Salvar planos')}
        </button>
      </div>
      {estado.texto && <p className={estado.ok ? 'adm-dar-estado' : 'adm-pt-erro'}>{estado.texto}</p>}
    </div>
  )
}
