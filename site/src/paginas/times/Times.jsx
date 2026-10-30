import { useEffect, useMemo, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { carregarTimes } from '../../comum/times.js'
import { Contador } from '../../comum/efeitos.jsx'
import { useAvatar } from '../../comum/avatares.js'
import { linkPerfil } from '../../comum/conta.js'
import IconeUI from '../../comum/IconeUI.jsx'
import { useT } from '../../comum/i18n.js'

const chave = (nome) => nome.trim().toLowerCase()
const iniciais = (n) =>
  (n || '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'
const FILTROS = [
  ['todos', 'Todos'],
  ['abertos', 'Abertos'],
  ['logo', 'Com logo'],
]
const ORDENS = [
  ['membros', 'Mais membros'],
  ['novos', 'Mais novos'],
  ['nome', 'Nome'],
]
const ha = (ts, tr) => {
  const d = Math.floor((Date.now() - ts) / 86400000)
  return d < 1 ? tr('criado hoje') : d < 2 ? tr('criado ontem') : d < 30 ? tr('criado há {n} dias', { n: d }) : d < 60 ? tr('criado há 1 mês') : d < 365 ? tr('criado há {n} meses', { n: Math.floor(d / 30) }) : d < 730 ? tr('criado há 1 ano') : tr('criado há {n} anos', { n: Math.floor(d / 365) })
}

// Logo do time (ou as iniciais, se não tiver logo ou a imagem não abrir)
function Logo({ time, className = 'tm-logo' }) {
  const [erro, setErro] = useState(false)
  useEffect(() => setErro(false), [time.logo])
  return <span className={className}>{time.logo && !erro ? <img src={time.logo} alt="" loading="lazy" onError={() => setErro(true)} /> : <i>{iniciais(time.nome)}</i>}</span>
}

function Rosto({ id }) {
  const avatar = useAvatar(id)
  return (
    <a className="tm-rosto" href={linkPerfil(id)} aria-label="Perfil">
      {avatar ? <img src={avatar} alt="" loading="lazy" /> : <i />}
    </a>
  )
}

function CartaoTime({ time, n, tr }) {
  const membros = Number(time.n) || 0
  const extra = membros - (time.ids?.length || 0)
  return (
    <li className="tm-cartao fx-entra" style={{ '--e': Math.min(n, 12) * 0.5 }}>
      <div className="tm-capa" style={time.logo ? { '--capa': `url("${time.logo}")` } : undefined} aria-hidden="true" />
      <div className="tm-corpo">
        <Logo time={time} />
        <div className="tm-titulo">
          <b title={time.nome}>{time.nome}</b>
          {time.tag ? <span className="tm-tag">{time.tag}</span> : null}
        </div>
        <p className="tm-desc">{time.descricao || tr('Sem descrição.')}</p>
        <div className="tm-membros">
          <span className="tm-rostos">
            {(time.ids || []).map((id) => (
              <Rosto key={id} id={id} />
            ))}
            {extra > 0 && <span className="tm-rosto tm-rosto-mais">+{extra}</span>}
          </span>
          <span className="tm-qtd">
            <IconeUI tipo="grupo" tamanho={14} />
            {membros === 1 ? tr('1 membro') : tr('{n} membros', { n: membros })}
          </span>
        </div>
      </div>
      <footer className="tm-pe">
        <span className={`tm-estado${time.aberto ? ' is-aberto' : ''}`}>
          <i aria-hidden="true" />
          {time.aberto ? tr('Aberto para entrar') : tr('Só com convite')}
        </span>
        {time.criada > 0 && <small>{ha(time.criada, tr)}</small>}
      </footer>
    </li>
  )
}

// Lista (só leitura) dos times criados em /equipes/. O Pick & Ban, o carrossel da home e o servidor usam esta mesma lista.
export default function Times() {
  const tr = useT()
  const [times, setTimes] = useState([])
  const [carregou, setCarregou] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [ordem, setOrdem] = useState('membros')

  useEffect(() => {
    carregarTimes(true)
      .then((l) => setTimes(l.filter((t) => t?.nome)))
      .finally(() => setCarregou(true))
  }, [])

  const visiveis = useMemo(() => {
    const q = chave(busca)
    const l = times.filter((t) => (!q || chave(`${t.nome} ${t.tag || ''}`).includes(q)) && (filtro !== 'abertos' || t.aberto) && (filtro !== 'logo' || t.logo))
    return [...l].sort((a, b) => (ordem === 'nome' ? a.nome.localeCompare(b.nome) : ordem === 'novos' ? (b.criada || 0) - (a.criada || 0) : (b.n || 0) - (a.n || 0) || a.nome.localeCompare(b.nome)))
  }, [times, busca, filtro, ordem])
  const jogadores = times.reduce((s, t) => s + (Number(t.n) || 0), 0)
  const abertos = times.filter((t) => t.aberto).length

  return (
    <Layout pagina="times">
      <main className="times-page tm">
        <section className="tm-hero">
          <div className="tm-hero-txt">
            <span className="tm-chip fx-entra" style={{ '--e': 0 }}>
              <i aria-hidden="true" />
              {tr('TIMES DA COMUNIDADE')}
            </span>
            <h1 className="fx-entra" style={{ '--e': 1 }}>
              {tr('Encontre o seu')} <span>{tr('time')}</span>
            </h1>
            <p className="fx-entra" style={{ '--e': 2 }}>
              {tr('Aqui aparecem só os times criados no site. O Pick & Ban, o carrossel da página inicial e o servidor usam esta lista.')}
            </p>
            <a className="tm-cta fx-entra" style={{ '--e': 3 }} href="/equipes/">
              <IconeUI tipo="maisAdicionar" tamanho={16} />
              {tr('Criar ou gerenciar meu time')}
            </a>
          </div>
          <dl className="tm-numeros fx-entra" style={{ '--e': 3 }}>
            <div>
              <dt>{tr('Times')}</dt>
              <dd>
                <Contador valor={carregou ? times.length : null} />
              </dd>
            </div>
            <div>
              <dt>{tr('Jogadores em times')}</dt>
              <dd>
                <Contador valor={carregou ? jogadores : null} />
              </dd>
            </div>
            <div>
              <dt>{tr('Abertos')}</dt>
              <dd>
                <Contador valor={carregou ? abertos : null} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="tm-lista-sec" aria-label={tr('Times cadastrados')}>
          <div className="tm-barra">
            <h2>{tr('Times cadastrados')}</h2>
            <div className="tm-filtros" role="group" aria-label={tr('Filtrar')}>
              {FILTROS.map(([id, nome]) => (
                <button key={id} type="button" className={filtro === id ? 'is-ativo' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                  {tr(nome)}
                </button>
              ))}
            </div>
            <label className="tm-busca">
              <IconeUI tipo="busca" tamanho={16} />
              <input type="search" placeholder={tr('Buscar time ou tag...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            <select className="tm-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label={tr('Ordenar')}>
              {ORDENS.map(([id, nome]) => (
                <option key={id} value={id}>
                  {tr(nome)}
                </option>
              ))}
            </select>
          </div>
          {!carregou ? (
            <p className="tm-vazio">{tr('Carregando lista...')}</p>
          ) : visiveis.length === 0 ? (
            <p className="tm-vazio">{times.length ? tr('Nenhum time encontrado.') : tr('Nenhum time criado ainda.')}</p>
          ) : (
            <ul className="tm-grade">
              {visiveis.map((t, n) => (
                <CartaoTime key={t.nome} time={t} n={n} tr={tr} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </Layout>
  )
}
