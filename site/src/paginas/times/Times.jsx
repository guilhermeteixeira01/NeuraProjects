import { useEffect, useState } from 'react'
import Layout from '../../comum/Layout.jsx'
import { carregarTimes } from '../../comum/times.js'
import { Contador } from '../../comum/efeitos.jsx'
import { FundoHero, Palavras } from '../../comum/HeroFundo.jsx'
import { useT } from '../../comum/i18n.js'

const chave = (nome) => nome.trim().toLowerCase()
const iniciais = (n) =>
  (n || '')
    .replace(/[^p{L}p{N}s]/gu, '')
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'

// Logo do time (ou as iniciais, se não tiver logo ou a imagem não abrir)
function Logo({ time, className = 'logo' }) {
  const [erro, setErro] = useState(false)
  useEffect(() => setErro(false), [time.logo])
  return (
    <span className={className}>
      {time.logo && !erro ? <img src={time.logo} alt="" onError={() => setErro(true)} /> : iniciais(time.nome)}
    </span>
  )
}

// Lista (só leitura) dos times criados em /equipes/. O Pick & Ban, o carrossel da home e o servidor usam esta mesma lista.
export default function Times() {
  const tr = useT()
  const [times, setTimes] = useState([])
  const [carregou, setCarregou] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregarTimes(true)
      .then((l) => setTimes(l.filter((t) => t?.nome)))
      .finally(() => setCarregou(true))
  }, [])

  const filtro = chave(busca)
  const visiveis = times.filter((t) => !filtro || chave(t.nome).includes(filtro))

  return (
    <Layout pagina="times">
      <main className="times-page">
        <section className="hero">
          <FundoHero />
          <div className="wrap hero-inner">
            <div>
              <span className="chip fx-entra" style={{ '--e': 0 }}>
                <span className="ponto" />
                {tr('TIMES CRIADOS NO SITE')}
              </span>
              <h1>
                <Palavras texto={tr('Lista de')} />
                <span className="fx-gradiente">
                  <Palavras texto={tr('times')} inicio={2} />
                </span>
              </h1>
              <p className="lead fx-entra" style={{ '--e': 3 }}>
                {tr('Aqui aparecem só os times criados no site. O Pick & Ban, o carrossel da página inicial e o servidor usam esta lista.')}
              </p>
              <a className="btn btn-primary fx-entra" style={{ '--e': 4, marginTop: 18 }} href="/equipes/">
                {tr('Criar ou gerenciar meu time')}
              </a>
            </div>
            <div className="resumo fx-entra" style={{ '--e': 4 }}>
              <div className="caixa">
                <span className="mono">{tr('TIMES')}</span>
                <b>
                  <Contador valor={carregou ? times.length : null} />
                </b>
              </div>
              <div className="caixa">
                <span className="mono">{tr('COM LOGO')}</span>
                <b>
                  <Contador valor={carregou ? times.filter((t) => t.logo).length : null} />
                </b>
              </div>
            </div>
          </div>
        </section>

        <section className="secao" style={{ paddingTop: 44 }}>
          <div className="wrap">
            <div className="card">
              <div className="card-head">
                <h2>{tr('Times cadastrados')}</h2>
                <input
                  className="busca"
                  type="search"
                  placeholder={tr('Buscar time...')}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{
                    background: 'var(--bg-soft)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    font: 'inherit',
                    fontSize: 13,
                    maxWidth: 240,
                  }}
                />
              </div>
              <div className="lista">
                {!carregou ? (
                  <div className="vazio">{tr('Carregando lista...')}</div>
                ) : visiveis.length === 0 ? (
                  <div className="vazio">{times.length ? tr('Nenhum time encontrado.') : tr('Nenhum time criado ainda.')}</div>
                ) : (
                  visiveis.map((t, n) => (
                    <div key={t.nome} className="time" style={{ animationDelay: `${Math.min(n, 12) * 30}ms` }}>
                      <Logo time={t} />
                      <div>
                        <b>{t.nome}</b>
                        {t.tag ? <small>[{t.tag}]</small> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
