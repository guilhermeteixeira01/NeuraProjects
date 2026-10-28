import IconeUI from './IconeUI.jsx'
// Trocas entre jogadores, no estilo das propostas de troca da Steam (worker: src/trocas.js, rotas /trocas).
//  - useTrocas + AvisoTroca: quantidade pendente, atualização ao vivo e a notificação no sino quando chega uma proposta.
//  - BotaoTrocas: o botão; as janelas (proposta, escolher jogador, lista) ficam em TrocasJanelas.jsx e só baixam no clique.
import { Suspense, lazy, useEffect, useState } from 'react'
import './trocas.css'
import { criarAtualizador } from './atualizador.js'
import { chamarApi, seForErroApi, enderecoApi } from './api.js'
import { useConta } from './conta.js'
import { useT } from './i18n.js'
import { registrarNotificacao } from './notificacoes.js'

const JanelaTroca = lazy(() => import('./TrocasJanelas.jsx').then((m) => ({ default: m.JanelaTroca })))
const EscolherJogador = lazy(() => import('./TrocasJanelas.jsx').then((m) => ({ default: m.EscolherJogador })))
const PainelTrocas = lazy(() => import('./TrocasJanelas.jsx').then((m) => ({ default: m.PainelTrocas })))

export const lerTrocas = () => chamarApi('/trocas')

// Leitura e eventos compartilhados: barra, sino e inventário usam o mesmo estado.
let donoTrocas = null, estadoTrocas = null, ouvintesTrocas = 0, pararTrocas = null
const EVENTO_TROCAS = 'np-trocas-estado'
const consultaTrocas = criarAtualizador({
  ler: async () => { const id = donoTrocas; return { id, dados: await lerTrocas() } },
  aplicar: ({ id, dados }) => {
    if (id !== donoTrocas) return
    estadoTrocas = dados
    window.dispatchEvent(new Event(EVENTO_TROCAS))
  },
  aoErro: seForErroApi(),
})
const atualizarTrocas = () => donoTrocas && consultaTrocas.atualizar()
export function useTrocas() {
  const conta = useConta()
  const [, atualizar] = useState(0)
  useEffect(() => {
    const ouvir = () => atualizar((n) => n + 1)
    window.addEventListener(EVENTO_TROCAS, ouvir)
    return () => window.removeEventListener(EVENTO_TROCAS, ouvir)
  }, [])
  useEffect(() => {
    const id = conta?.id
    if (!id || !enderecoApi()) {
      if (donoTrocas) { consultaTrocas.descartar(); donoTrocas = null; estadoTrocas = null }
      return
    }
    const mudou = donoTrocas !== id
    if (mudou) { consultaTrocas.descartar(); donoTrocas = id; estadoTrocas = null }
    if (!ouvintesTrocas++) {
      if (mudou) atualizarTrocas()
      else consultaTrocas.carregar()
      window.addEventListener('np-troca', atualizarTrocas)
      window.addEventListener('np-reconectou', atualizarTrocas)
      const relogio = setInterval(() => document.visibilityState === 'visible' && consultaTrocas.carregar(), 60000)
      pararTrocas = () => {
        window.removeEventListener('np-troca', atualizarTrocas)
        window.removeEventListener('np-reconectou', atualizarTrocas)
        clearInterval(relogio)
      }
    }
    return () => { if (!--ouvintesTrocas) pararTrocas?.() }
  }, [conta?.id])
  const dados = conta?.id === donoTrocas ? estadoTrocas : null
  return { dados, recarregar: atualizarTrocas, pendentes: dados?.recebidas?.length || 0 }
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
        <IconeUI tipo="trocar" tamanho={16}/>
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
