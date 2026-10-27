// Botão ⚙ Configurações do topo: idioma, tema e "Melhorar desempenho". Vale para todas as páginas e fica
// guardado no navegador e, com login, na conta (vale nos outros aparelhos; preferencias.js).
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { EVENTO_DESEMPENHO, desempenhoAtivo } from './desempenho.js'
import { IDIOMAS, useT } from './i18n.js'
import { escolherDesempenho, escolherIdioma, escolherTema } from './preferencias.js'
import { EVENTO_TEMA, TEMAS, temaAtual } from './tema.js'
import { useSeguranca } from './seguranca.js'

const TrocarNick = lazy(() => import('./BoasVindas.jsx').then((m) => ({ default: m.TrocarNick }))) // só baixa no clique
const TrocarSenha = lazy(() => import('./BoasVindas.jsx').then((m) => ({ default: m.TrocarSenha })))
const VerificarEmail = lazy(() => import('./BoasVindas.jsx').then((m) => ({ default: m.VerificarEmail })))
const RecuperarSenha = lazy(() => import('./BoasVindas.jsx').then((m) => ({ default: m.RecuperarSenha })))

function IconeEngrenagem() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

// Conta: apelido (Premium troca a cada 15 dias) e senha de segurança (trocas e mercado). As janelas ficam em BoasVindas.jsx.
export function ContaSeguranca() {
  const t = useT()
  const seg = useSeguranca()
  const [janela, setJanela] = useState(null) // 'nick' | 'senha' | 'email' | 'recuperar'
  if (!seg?.nick) return null // sem login (ou ainda escolhendo o apelido na janela de boas-vindas)
  // Premium esperando os 15 dias: o botão mostra quanto falta (dias; no último dia, horas)
  const falta = seg.premium && !seg.podeTrocarNick && seg.proximaTroca ? Math.max(0, seg.proximaTroca - Date.now()) : 0
  const rotuloNick = !falta ? t('Trocar apelido') : falta > 864e5 ? t('Trocar em {n} dias', { n: Math.ceil(falta / 864e5) }) : t('Trocar em {n} h', { n: Math.max(1, Math.ceil(falta / 36e5)) })
  return (
    <div className="nx-config-campo nx-config-conta">
      <span>{t('Conta')}</span>
      <div className="nx-conta-linha">
        <b title={t('Apelido')}>{seg.nick}</b>
        <button type="button" className="nx-conta-acao" disabled={!seg.podeTrocarNick} onClick={() => setJanela('nick')} title={seg.podeTrocarNick ? '' : seg.premium ? t('Próxima troca em {data}', { data: new Date(seg.proximaTroca).toLocaleDateString() }) : t('Só assinantes Premium trocam de apelido (a cada 15 dias).')}>
          {rotuloNick}
        </button>
      </div>
      <div className="nx-conta-linha">
        <small>{seg.temSenha ? t('Senha de segurança criada') : t('Senha de segurança: ainda não criada')}</small>
        <span className="nx-conta-acoes">
          {seg.temSenha && (
            <button type="button" className="nx-conta-acao" onClick={() => setJanela('senha')}>
              {t('Trocar senha')}
            </button>
          )}
          {seg.temSenha && seg.email && (
            <button type="button" className="nx-conta-acao" onClick={() => setJanela('recuperar')}>
              {t('Esqueci minha senha')}
            </button>
          )}
        </span>
      </div>
      {(seg.email || seg.emailDisponivel) && (
        <div className="nx-conta-linha">
          <small>{seg.email ? t('E-mail confirmado: {email}', { email: seg.email }) : t('E-mail: ainda não confirmado')}</small>
          <button type="button" className="nx-conta-acao" onClick={() => setJanela('email')}>
            {seg.email ? t('Trocar e-mail') : t('Confirmar e-mail')}
          </button>
        </div>
      )}
      <Suspense fallback={null}>
        {janela === 'nick' && <TrocarNick atual={seg.nick} aoFechar={() => setJanela(null)} />}
        {janela === 'senha' && <TrocarSenha aoFechar={() => setJanela(null)} />}
        {janela === 'email' && <VerificarEmail aoFechar={() => setJanela(null)} />}
        {janela === 'recuperar' && <RecuperarSenha aoFechar={() => setJanela(null)} />}
      </Suspense>
    </div>
  )
}

export default function Configuracoes() {
  const t = useT()
  const [aberto, setAberto] = useState(false)
  const [tema, setTema] = useState('padrao') // igual ao HTML gerado; o efeito lê o de verdade
  const [desempenho, setDesempenho] = useState(false)
  const caixa = useRef(null)

  useEffect(() => {
    const ler = () => {
      setTema(temaAtual())
      setDesempenho(desempenhoAtivo())
    }
    ler()
    window.addEventListener(EVENTO_TEMA, ler)
    window.addEventListener(EVENTO_DESEMPENHO, ler)
    return () => {
      window.removeEventListener(EVENTO_TEMA, ler)
      window.removeEventListener(EVENTO_DESEMPENHO, ler)
    }
  }, [])

  // Fecha clicando fora ou com Esc
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !caixa.current?.contains(e.target) && !e.target.closest?.('.bv-fundo') && setAberto(false) // clique nas janelas de trocar apelido/senha não fecha o painel
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div className="nx-config" ref={caixa}>
      <button type="button" className="nx-config-btn" aria-label={t('Configurações')} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <IconeEngrenagem />
        <span className="nx-dica" aria-hidden="true">{t('Configurações')}</span>
      </button>
      {aberto && (
        <div className="nx-config-painel" role="dialog" aria-label={t('Configurações')}>
          <div className="nx-config-cab"><span>{t('Configurações')}</span><button type="button" className="nx-config-fechar" aria-label={t('Fechar')} onClick={() => setAberto(false)}>×</button></div>

          <label className="nx-config-campo">
            <span>{t('Idioma')}</span>
            <select value={t.idioma} onChange={(e) => escolherIdioma(e.target.value)}>
              {IDIOMAS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>

          <div className="nx-config-campo">
            <span>{t('Tema')}</span>
            <div className="nx-config-temas" role="radiogroup" aria-label={t('Tema')}>
              {TEMAS.map((tm) => (
                <button key={tm.id} type="button" role="radio" aria-checked={tema === tm.id} className={`nx-config-tema tema-${tm.id}${tema === tm.id ? ' sel' : ''}`} onClick={() => escolherTema(tm.id)}>
                  <i aria-hidden="true" />
                  {t(tm.nome)}
                </button>
              ))}
            </div>
          </div>

          <ContaSeguranca />

          <label className="nx-config-switch">
            <input type="checkbox" checked={desempenho} onChange={(e) => escolherDesempenho(e.target.checked)} />
            <span className="nx-config-chave" aria-hidden="true" />
            <span>
              <b>{t('Melhorar desempenho')}</b>
              <small>{t('Desliga animações, transições e efeitos visuais. Ideal para computador ou celular mais fraco.')}</small>
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
