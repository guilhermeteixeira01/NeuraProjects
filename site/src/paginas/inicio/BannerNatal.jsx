// Banner de Natal do Início: aparece só durante a divulgação do Natal na Neura 2026 (da data de divulgação configurada no painel até o
// fim do prazo de resgate) e leva para /eventos/natal-2026/. Sem evento configurado/ativo, não aparece.
import { useEffect, useState } from 'react'
import { ErroApi, lerApi } from '../../comum/api.js'
import { useT } from '../../comum/i18n.js'
import { nomeMapa } from '../../comum/mapas.js'
import { ARTES_NATAL, LINK_EVENTO_NATAL } from '../../../worker/steam-login/src/natal-2026-core.js'
import './bannerNatal.css'

const data = (t, local) => new Date(t).toLocaleDateString(local, { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

export default function BannerNatal() {
  const t = useT()
  const [dados, setDados] = useState(null)
  useEffect(() => {
    let vivo = true
    lerApi('/eventos/natal-2026').then((d) => vivo && setDados(d)).catch((e) => { if (!(e instanceof ErroApi)) throw e })
    return () => { vivo = false }
  }, [])
  if (!dados?.divulgacao) return null
  const { estado, config: cfg } = dados
  const linha = estado === 'futuro' ? t('Começa em {data}. Junte Estrelas de Natal e troque por recompensas.', { data: data(Date.parse(cfg.inicio), t.local) })
    : estado === 'ativo' ? (dados.mapaDoDia ? t('Acontecendo agora · mapa do dia: {mapa}', { mapa: nomeMapa(dados.mapaDoDia) }) : t('Acontecendo agora'))
    : t('Partidas encerradas · resgate até {data}', { data: data(Date.parse(cfg.resgateAte), t.local) })
  return (
    <a className="bn-natal" href={LINK_EVENTO_NATAL} aria-label={`${t('Natal na Neura 2026 — Operação Presente')}. ${linha}`}>
      <picture>
        <source media="(max-width: 860px)" srcSet={ARTES_NATAL.bannerPequeno} />
        <img src={ARTES_NATAL.banner} alt="" width="2290" height="260" decoding="async" />
      </picture>
      <span className="bn-natal-texto">
        <img src={ARTES_NATAL.estrela} alt="" width="28" height="28" decoding="async" />
        <span>
          <b>{t('Natal na Neura 2026')} · {t('Operação Presente')}</b>
          <small>{linha}</small>
        </span>
        <span className="bn-natal-cta">{t('Ver evento')} →</span>
      </span>
    </a>
  )
}
