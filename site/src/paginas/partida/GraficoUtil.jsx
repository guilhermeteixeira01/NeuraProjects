import { useState } from 'react'
import { ComMoldura } from '../../comum/Moldura.jsx'
import { linkPerfil } from '../../comum/conta.js'
import { useT } from '../../comum/i18n.js'
import { useAvatar } from '../../comum/avatares.js'

// Detalhe do uso de utilitários: por time, total + barra de proporção por tipo + barras empilhadas por jogador.
// Cores no estilo do CS (smoke azul-acinzentada, flash amarela, HE vermelha, molotov laranja, decoy verde),
// validadas com a skill dataviz (validate_palette.js no fundo #121317). A ordem é a da pilha (de baixo para
// cima) e da legenda, e separa as vizinhas parecidas: vermelho longe do verde e do laranja.
export const TIPOS = [
  { id: 'decoy', nome: 'Decoys', cor: '#259a74' },
  { id: 'flash', nome: 'Flashes', cor: '#ac8c00' },
  { id: 'he', nome: 'HEs', cor: '#df4050' },
  { id: 'smoke', nome: 'Smokes', cor: '#6283c4' },
  { id: 'molotov', nome: 'Molotovs', cor: '#d26a1c' },
]

// Valores do jogador no modo escolhido (lançados ou comprados e não usados)
const valores = (e, modo) => {
  const u = e.util || {}
  const fonte = modo === 'nao' ? u.naoUsadosTipo || {} : u
  return Object.fromEntries(TIPOS.map((t) => [t.id, fonte[t.id] || 0]))
}
const soma = (v) => TIPOS.reduce((s, t) => s + v[t.id], 0)

// Linhas de grade "redondas" (0, passo, 2*passo...) até passar do maior valor
function escala(maximo) {
  const bruto = Math.max(1, maximo) / 3
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || mag * 10
  const topo = Math.ceil(Math.max(1, maximo) / passo) * passo
  const linhas = []
  for (let v = 0; v <= topo; v += passo) linhas.push(v)
  return { topo, linhas }
}

function Avatar({ e }) {
  const src = useAvatar(e.steamId, e.avatar)
  const [erro, setErro] = useState('')
  const ini = (String(e.nome || '?').match(/[\p{L}\p{N}]/gu) || []).slice(0, 2).join('').toUpperCase() || '?'
  return src && erro !== src ? (
    <img className="gu-av" src={src} alt="" loading="lazy" onError={() => setErro(src)} />
  ) : (
    <span className="gu-av gu-av-fb">{ini}</span>
  )
}

function CardTime({ nome, t, jogadores, modo, mvp }) {
  const tr = useT()
  const [foco, setFoco] = useState(null)
  const porJogador = jogadores.map((e) => ({ e, v: valores(e, modo) }))
  const totais = Object.fromEntries(TIPOS.map((tp) => [tp.id, porJogador.reduce((s, x) => s + x.v[tp.id], 0)]))
  const total = soma(totais)
  const { topo, linhas } = escala(Math.max(0, ...porJogador.map((x) => soma(x.v))))

  return (
    <div className={`gu-card gu-${t}`}>
      <div className="gu-topo">
        <b className={`t-${t}`}>{nome}</b>
        <div className="gu-total">
          <span>{modo === 'nao' ? tr('Não utilizados') : tr('Total de utilitários')}</span>
          <b>{total}</b>
        </div>
      </div>

      {/* Proporção de cada tipo no time */}
      <div className="gu-prop" role="img" aria-label={TIPOS.map((tp) => `${tp.nome}: ${totais[tp.id]}`).join(', ')}>
        {total > 0 ? (
          TIPOS.filter((tp) => totais[tp.id] > 0).map((tp) => (
            <i key={tp.id} style={{ flexGrow: totais[tp.id], background: tp.cor }} title={`${tp.nome}: ${totais[tp.id]}`} />
          ))
        ) : (
          <i className="gu-vazio" />
        )}
      </div>
      <ul className="gu-legenda">
        {TIPOS.map((tp) => (
          <li key={tp.id}>
            <span className="gu-sw" style={{ background: tp.cor }} />
            <b>{totais[tp.id]}</b>
            <span>{tp.nome}</span>
          </li>
        ))}
      </ul>

      {/* Barras empilhadas por jogador */}
      <div className="gu-grafico">
        <div className="gu-grade" aria-hidden="true">
          {linhas.map((v) => (
            <div key={v} className="gu-linha" style={{ bottom: `${(v / topo) * 100}%` }}>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="gu-colunas">
          {porJogador.map(({ e, v }, i) => {
            const tot = soma(v)
            return (
              <div
                key={e.steamId}
                className={`gu-col${foco === i ? ' foco' : ''}`}
                onPointerEnter={() => setFoco(i)}
                onPointerLeave={() => setFoco(null)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                tabIndex={0}
                aria-label={`${e.nome}: ${TIPOS.map((tp) => `${v[tp.id]} ${tp.nome}`).join(', ')}`}
              >
                <div className="gu-pilha" style={{ height: `${(tot / topo) * 100}%` }}>
                  {TIPOS.filter((tp) => v[tp.id] > 0).map((tp) => (
                    <i key={tp.id} style={{ flexGrow: v[tp.id], background: tp.cor }} />
                  ))}
                </div>
                {foco === i && (
                  <div className={`gu-tip${i >= porJogador.length - 2 ? ' esq' : ''}`} role="tooltip">
                    <b>{e.nome}</b>
                    {[...TIPOS].reverse().map((tp) => (
                      <span key={tp.id}>
                        <i className="gu-sw" style={{ background: tp.cor }} />
                        <b>{v[tp.id]}</b> {tp.nome}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="gu-nomes">
        {porJogador.map(({ e, v }) => (
          <a key={e.steamId} className="gu-nome" href={linkPerfil(e.steamId)} title={tr('Perfil de {nome}', { nome: e.nome })}>
            <span className="gu-num">{soma(v)}</span>
            <ComMoldura steamId={e.steamId}>
              <Avatar e={e} />
            </ComMoldura>
            <span className={`gu-nick${e === mvp ? ` t-${t}` : ''}`}>{e.nome}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default function GraficoUtil({ jogadores, ordem, nomeTime, mvp }) {
  const tr = useT()
  const [modo, setModo] = useState('usado')
  return (
    <div className="gu">
      <div className="gu-cabeca">
        <h3>{tr('Detalhe do uso de utilitários')}</h3>
        <div className="gu-modo" role="tablist" aria-label={tr('Mostrar')}>
          {[
            ['usado', 'Utilizado'],
            ['nao', 'Não utilizado'],
          ].map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={modo === id} className={modo === id ? 'active' : ''} onClick={() => setModo(id)}>
              {tr(rotulo)}
            </button>
          ))}
        </div>
      </div>
      <div className="gu-times">
        {ordem.map((t) => {
          const doTime = jogadores.filter((e) => e.time === t).sort((a, b) => b.rating - a.rating)
          return doTime.length ? <CardTime key={t} t={t} nome={nomeTime(t)} jogadores={doTime} modo={modo} mvp={mvp} /> : null
        })}
      </div>
    </div>
  )
}
