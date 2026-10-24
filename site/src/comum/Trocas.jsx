// Trocas entre jogadores, no estilo das propostas de troca da Steam (worker: src/trocas.js, rotas /trocas).
//  - useTrocas + AvisoTroca: quantidade pendente, atualização ao vivo e a notificação no sino quando chega uma proposta.
//  - BotaoTrocas: o botão; as janelas (proposta, escolher jogador, lista) ficam em TrocasJanelas.jsx e só baixam no clique.
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import './trocas.css'
import { chamarApi, seForErroApi, enderecoApi } from './api.js'
import { useConta } from './conta.js'
import { useT } from './i18n.js'
import { registrarNotificacao } from './notificacoes.js'

const JanelaTroca = lazy(() => import('./TrocasJanelas.jsx').then((m) => ({ default: m.JanelaTroca })))
const EscolherJogador = lazy(() => import('./TrocasJanelas.jsx').then((m) => ({ default: m.EscolherJogador })))
const PainelTrocas = lazy(() => import('./TrocasJanelas.jsx').then((m) => ({ default: m.PainelTrocas })))

export const lerTrocas = () => chamarApi('/trocas')

// Quantas propostas esperam a sua resposta (e atualiza sozinho)
export function useTrocas() {
  const conta = useConta()
  const [dados, setDados] = useState(null)
  const carregar = useCallback(() => {
    if (conta?.id && enderecoApi()) lerTrocas().then(setDados, seForErroApi())
  }, [conta?.id])
  useEffect(() => {
    carregar()
    window.addEventListener('np-troca', carregar)
    const i = setInterval(() => document.visibilityState === 'visible' && carregar(), 60000)
    return () => {
      window.removeEventListener('np-troca', carregar)
      clearInterval(i)
    }
  }, [carregar])
  return { dados, recarregar: carregar, pendentes: dados?.recebidas?.length || 0 }
}

// No Layout (com login): proposta nova vira notificação no sino (uma vez por proposta)
export function AvisoTroca() {
  const conta = useConta()
  const { dados } = useTrocas()
  useEffect(() => {
    if (!conta?.id || !dados) return
    for (const p of dados.recebidas || []) {
      registrarNotificacao(conta.id, {
        id: `troca:${p.id}`,
        titulo: `${p.deNome || 'Alguém'} quer trocar com você`,
        texto: `${p.dar.length} item(ns) dele(a) por ${p.pedir.length} seu(s)`,
        imagem: p.deAvatar || '',
        link: '/inventario/?trocas=1',
      })
    }
  }, [dados, conta?.id])
  return null
}

// Botão + janelas. Sem "para": abre a lista de propostas (e dali "Nova proposta"). Com "para": abre direto a proposta para esse jogador.
export function BotaoTrocas({ para, classe = 'inv-btn', aoMudouInventario }) {
  const t = useT()
  const { pendentes, recarregar } = useTrocas()
  const [tela, setTela] = useState(() => (!para && new URLSearchParams(location.search).has('trocas') ? 'lista' : null)) // lista | escolher | janela
  const [alvo, setAlvo] = useState(para || null)
  return (
    <>
      <button type="button" className={`${classe} tr-botao`} onClick={() => setTela(para ? 'janela' : 'lista')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
        {para ? t('Propor troca') : t('Trocas')}
        {!para && pendentes > 0 && <b className="tr-contagem">{pendentes}</b>}
      </button>
      <Suspense fallback={null}>
        {tela === 'lista' && (
          <PainelTrocas
            aoFechar={() => setTela(null)}
            aoNova={() => setTela('escolher')}
            aoMudouInventario={() => {
              recarregar()
              aoMudouInventario?.()
            }}
          />
        )}
        {tela === 'escolher' && (
          <EscolherJogador
            aoFechar={() => setTela('lista')}
            aoEscolher={(j) => {
              setAlvo({ id: j.id, nome: j.nome })
              setTela('janela')
            }}
          />
        )}
        {tela === 'janela' && alvo && (
          <JanelaTroca
            para={alvo}
            aoFechar={() => setTela(para ? null : 'lista')}
            aoEnviada={recarregar}
          />
        )}
      </Suspense>
    </>
  )
}
