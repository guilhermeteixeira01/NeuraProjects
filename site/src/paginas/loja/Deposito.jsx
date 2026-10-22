// Depositar saldo: Pix (QR code + copia e cola, confirmação sozinha) ou cartão (página segura do Asaas). Mínimo R$ 5,00 = 2.000 NP.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PAGAMENTO, bonusDoPagamento, npDoPagamento } from '../../../worker/steam-login/src/loja-core.js'
import { useT } from '../../comum/i18n.js'
import { avisarSaldo } from '../../comum/loja.js'
import { MENSAGENS_PAGAMENTO, criarPagamento, estadoPagamento, formatarCpf, lerConfigPagamento, lerPlanosSub } from '../../comum/pagamentos.js'
import './deposito.css'

const numero = (n) => Number(n).toLocaleString('pt-BR')
const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Uma moeda só; o tamanho cresce com o pacote (nada de logo repetido)
function Moedas({ nivel }) {
  const tam = 28 + nivel * 5
  return (
    <span className="dep-moedas" aria-hidden="true">
      <img src="/assets/logos/logo-np-64.png" alt="" width={tam} height={tam} />
    </span>
  )
}

// modo 'deposito': compra de Neura Pontos · modo 'sub': compra de meses de assinatura Premium (mesmo Pix/cartão, mesmo fluxo)
export default function Deposito({ nomeInicial = '', modo = 'deposito', aoFechar, aoPagar }) {
  const t = useT()
  const sub = modo === 'sub'
  const [planos, setPlanos] = useState([])
  const [plano, setPlano] = useState(null)
  useEffect(() => {
    if (!sub) return
    lerPlanosSub().then((l) => {
      setPlanos(l)
      setPlano(l.find((x) => x.meses === 3) || l[0] || null)
    }, () => {})
  }, [sub])
  const [metodo, setMetodo] = useState('pix')
  const [cfg, setCfg] = useState(PAGAMENTO) // valores de fábrica até o servidor responder (o dono pode ter mudado)
  const [centavos, setCentavos] = useState(PAGAMENTO.pacotes[1] * 100)
  useEffect(() => {
    lerConfigPagamento().then((c) => {
      setCfg(c)
      setCentavos((atual) => (c.pacotes.includes(atual / 100) ? atual : (c.pacotes[Math.min(1, c.pacotes.length - 1)] || c.pacotes[0]) * 100))
    }, () => {})
  }, [])
  const [livre, setLivre] = useState('')
  const [nome, setNome] = useState(nomeInicial)
  const [cpf, setCpf] = useState('')
  const [aceito, setAceito] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [cobranca, setCobranca] = useState(null) // { id, metodo, np, pix? , url? }
  const [pago, setPago] = useState(null) // { np }
  const [copiado, setCopiado] = useState(false)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    document.documentElement.classList.add('dlg-aberto')
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => {
      vivo.current = false
      document.documentElement.classList.remove('dlg-aberto')
      document.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])

  // esperando o pagamento: pergunta ao servidor a cada 4 s (ele confere no Asaas e credita)
  useEffect(() => {
    if (!cobranca || pago) return
    let parar = false
    const ver = async () => {
      try {
        const r = await estadoPagamento(cobranca.id)
        if (parar || !vivo.current) return
        if (r.estado === 'pago') {
          if (r.saldo != null) avisarSaldo(r.saldo)
          setPago({ np: cobranca.np, sub: r.tipo === 'sub' })
          aoPagar?.()
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }
    const i = setInterval(ver, 4000)
    return () => {
      parar = true
      clearInterval(i)
    }
  }, [cobranca, pago, aoPagar])

  const pacoteLivre = livre !== '' ? Math.round(Number(String(livre).replace(',', '.')) * 100) : null
  const valor = sub ? plano?.centavos ?? 0 : pacoteLivre ?? centavos
  const valorOk = sub ? !!plano : Number.isFinite(valor) && valor >= cfg.minCentavos && valor <= cfg.maxCentavos
  const np = valorOk && !sub ? npDoPagamento(valor, cfg) : 0
  const bonus = valorOk && !sub ? bonusDoPagamento(valor, cfg) : 0
  const podePagar = valorOk && nome.trim().split(/\s+/).length >= 2 && cpf.replace(/\D/g, '').length === 11 && aceito && !criando

  const pagar = async () => {
    setCriando(true)
    setErro('')
    try {
      const c = await criarPagamento(metodo, valor, nome.trim(), cpf, sub ? { tipo: 'sub', meses: plano.meses } : undefined)
      setCobranca(c)
      if (c.metodo === 'cartao' && c.url) window.open(c.url, '_blank', 'noopener')
    } catch (e) {
      setErro(MENSAGENS_PAGAMENTO[e.message] || 'Não deu para criar o pagamento agora. Tente de novo.')
    } finally {
      setCriando(false)
    }
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cobranca.pix.payload)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // sem permissão de área de transferência: o código está visível para copiar à mão
    }
  }
  const grade = useMemo(() => cfg.pacotes.map((r) => ({ r, c: r * 100, np: npDoPagamento(r * 100, cfg), b: bonusDoPagamento(r * 100, cfg) })), [cfg])

  let corpo
  if (pago) {
    corpo = (
      <div className="dep-final">
        <span className="dep-ok" aria-hidden="true">✓</span>
        <h3>{pago.sub ? t('Assinatura Premium ativada!') : t('Pagamento confirmado!')}</h3>
        {pago.sub ? (
          <p>{t('Obrigado por apoiar a Neura! O seu emblema Premium já está no perfil.')}</p>
        ) : (
          <p>
            <b>+{numero(pago.np)} NP</b> {t('já estão na sua conta.')}
          </p>
        )}
        <button type="button" className="dep-btn dep-btn-p" onClick={aoFechar}>
          {t('Concluir')}
        </button>
      </div>
    )
  } else if (cobranca) {
    corpo = (
      <div className="dep-final">
        <h3>{cobranca.metodo === 'pix' ? t('Pague com Pix') : t('Pagamento com cartão')}</h3>
        <p className="dep-resumo">
          {reais(cobranca.centavos)} → {cobranca.tipo === 'sub' ? <b>{t('Assinatura Premium')}</b> : <b>{numero(cobranca.np)} NP</b>}
        </p>
        {cobranca.metodo === 'pix' ? (
          <>
            <img className="dep-qr" src={`data:image/png;base64,${cobranca.pix.imagem}`} alt={t('QR code do Pix')} width="220" height="220" />
            <p className="dep-dica">{t('Abra o app do seu banco, escolha Pix e leia o QR code, ou use o Pix copia e cola:')}</p>
            <textarea className="dep-codigo" readOnly rows={3} value={cobranca.pix.payload} onFocus={(e) => e.target.select()} />
            <button type="button" className="dep-btn dep-btn-p" onClick={copiar}>
              {copiado ? t('Copiado!') : t('Copiar código Pix')}
            </button>
          </>
        ) : (
          <>
            <p className="dep-dica">{t('Abrimos a página segura do Asaas para você digitar o cartão. Se ela não abriu, clique abaixo. Seus dados do cartão não passam pelo nosso site.')}</p>
            <a className="dep-btn dep-btn-p" href={cobranca.url} target="_blank" rel="noopener noreferrer">
              {t('Abrir página de pagamento')}
            </a>
          </>
        )}
        <p className="dep-espera">
          <i className="dep-pulsa" aria-hidden="true" /> {cobranca.tipo === 'sub' ? t('Esperando o pagamento… a assinatura liga sozinha assim que confirmar.') : t('Esperando o pagamento… os NP entram sozinhos assim que confirmar.')}
        </p>
        <button type="button" className="dep-link" onClick={() => setCobranca(null)}>
          {t('Voltar')}
        </button>
      </div>
    )
  } else {
    corpo = (
      <div className="dep-grade">
        <div className="dep-metodos" role="tablist" aria-label={t('Forma de pagamento')}>
          <button type="button" role="tab" aria-selected={metodo === 'pix'} className={`dep-metodo${metodo === 'pix' ? ' is-ativo' : ''}`} onClick={() => setMetodo('pix')}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3 3.2 3.2a2 2 0 0 0 1.4.6H18l3 3-3 3h-1.4a2 2 0 0 0-1.4.6L12 16.6l-3.2-3.2a2 2 0 0 0-1.4-.6H6l-3-3 3-3h1.4a2 2 0 0 0 1.4-.6Z" />
              <path d="m9 21 3-3 3 3" />
            </svg>
            <b>Pix</b>
            <small>{t('Cai na hora')}</small>
          </button>
          <button type="button" role="tab" aria-selected={metodo === 'cartao'} className={`dep-metodo${metodo === 'cartao' ? ' is-ativo' : ''}`} onClick={() => setMetodo('cartao')}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
              <path d="M2.5 10h19M6 15h4" />
            </svg>
            <b>{t('Cartão')}</b>
            <small>{t('Crédito')}</small>
          </button>
        </div>

        <div className="dep-direita">
          {sub && (
            <ul className="dep-pacotes dep-planos">
              {planos.map((pl) => {
                const mensal = planos.find((x) => x.meses === 1)
                const economia = mensal && pl.meses > 1 ? Math.round(100 - (pl.centavos / (mensal.centavos * pl.meses)) * 100) : 0
                return (
                  <li key={pl.meses}>
                    <button type="button" className={`dep-pacote${plano?.meses === pl.meses ? ' is-ativo' : ''}`} onClick={() => setPlano(pl)}>
                      <span className="dep-plano-meses">{pl.meses}</span>
                      <small>{pl.meses === 1 ? t('mês') : t('meses')}</small>
                      <b>{reais(pl.centavos)}</b>
                      <span>{reais(pl.centavos / pl.meses)} / {t('mês')}</span>
                      {economia > 0 ? <em>{t('{n}% de desconto', { n: economia })}</em> : <em className="dep-sem">&nbsp;</em>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <ul className="dep-pacotes" hidden={sub}>
            {grade.map((g) => (
              <li key={g.r}>
                <button type="button" className={`dep-pacote${livre === '' && centavos === g.c ? ' is-ativo' : ''}`} onClick={() => { setCentavos(g.c); setLivre('') }}>
                  <Moedas nivel={grade.indexOf(g)} />
                  <b>{reais(g.c)}</b>
                  <span>{numero(g.np)} NP</span>
                  {g.b ? <em>+{g.b}% {t('bônus')}</em> : <em className="dep-sem">&nbsp;</em>}
                </button>
              </li>
            ))}
          </ul>

          <label className="dep-campo" hidden={sub}>
            {t('Ou digite o valor (mínimo {min})', { min: reais(cfg.minCentavos) })}
            <input inputMode="decimal" placeholder="R$ 0,00" value={livre} onChange={(e) => setLivre(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))} />
          </label>

          <fieldset className="dep-pagador">
            <legend>{t('Dados do pagador (Brasil)')}</legend>
            <label className="dep-campo">
              {t('Nome completo')}
              <input autoComplete="name" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label className="dep-campo">
              CPF
              <input inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} />
              <small>{t('O CPF é exigido pelo Pix e vai direto para o Asaas (nosso banco de pagamentos). Nós não guardamos o seu CPF.')}</small>
            </label>
          </fieldset>

          <label className="dep-aceite">
            <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
            <span>{sub ? t('Entendo que a assinatura Premium é um benefício virtual, não renova sozinha, não pode ser reembolsada (salvo quando a lei garantir) e que o site pode mudar ou fechar. Li os Termos de Uso.') : t('Entendo que Neura Pontos são virtuais, não valem dinheiro, não podem ser reembolsados (salvo quando a lei garantir) e que o site pode mudar ou fechar. Li os Termos de Uso.')}</span>
          </label>

          {erro && <p className="dep-erro" role="alert">{t(erro)}</p>}
          {!valorOk && livre !== '' && <p className="dep-erro">{t('O valor precisa estar entre {a} e {b}.', { a: reais(cfg.minCentavos), b: reais(cfg.maxCentavos) })}</p>}

          <button type="button" className="dep-btn dep-btn-p dep-pagar" disabled={!podePagar} onClick={pagar}>
            {criando ? t('Gerando…') : valorOk ? (sub ? t('Pagar {valor} e ativar o Premium', { valor: reais(valor) }) : t('Pagar {valor} e receber {np} NP', { valor: reais(valor), np: numero(np) })) : t('Escolha um valor')}
          </button>
          {bonus > 0 && valorOk && <p className="dep-bonus">{t('Inclui {n}% de bônus!', { n: bonus })}</p>}
        </div>
      </div>
    )
  }

  return createPortal(
    <div className="dep-fundo" onClick={aoFechar}>
      <div className="dep" role="dialog" aria-modal="true" aria-label={t('Depositar saldo')} onClick={(e) => e.stopPropagation()}>
        <header className="dep-cab">
          <div>
            <h2>{sub ? t('ASSINAR PREMIUM') : t('DEPOSITAR SALDO')}</h2>
            <p>{sub ? t('Escolha o plano e como pagar. O emblema Premium aparece no perfil assim que o pagamento confirmar.') : t('Escolha como pagar e recarregue seus Neura Pontos. {valor} = {np} NP.', { valor: reais(cfg.minCentavos), np: numero(npDoPagamento(cfg.minCentavos, cfg)) })}</p>
          </div>
          <button type="button" className="dep-x" onClick={aoFechar} aria-label={t('Fechar')}>
            ×
          </button>
        </header>
        <div className="dep-corpo">{corpo}</div>
      </div>
    </div>,
    document.body,
  )
}
