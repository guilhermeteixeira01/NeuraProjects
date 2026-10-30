import { useEffect, useState } from 'react'
import { chamarApi } from '../../comum/api.js'
import { useAmigos } from '../../comum/amigos.js'
import { useT } from '../../comum/i18n.js'
import { BotaoAmizade, StatusAmigo } from './Amizade.jsx'
import { ComMoldura } from '../../comum/Moldura.jsx'
import { CarregandoNP } from '../../comum/Carregando.jsx'
import './social.css'

export function AmigosDoPerfil({ id, eu }) {
  const t = useT(), { lista } = useAmigos()
  const [publico, setPublico] = useState(null), [erro, setErro] = useState(false)
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    if (eu) return
    let ativo = true
    setPublico(null); setErro(false)
    chamarApi(`/perfil/amigos?id=${encodeURIComponent(id)}`).then(d => ativo && setPublico(d)).catch(() => ativo && setErro(true))
    return () => { ativo = false }
  }, [id, eu, versao])
  const amigos = eu ? lista?.amigos : publico?.amigos
  return <section className="pf-social-panel" aria-labelledby="pf-amigos-titulo">
    <div className="pf-social-title"><h2 id="pf-amigos-titulo">{t('Amigos')} <small>{amigos?.length ?? '—'}</small></h2>{eu && <button type="button" onClick={() => { const b = [...document.querySelectorAll('.nx-amigos-btn')].find(e => e.getClientRects().length); if (b?.getAttribute('aria-expanded') !== 'true') b?.click() }}>{t('Achar jogadores')}</button>}</div>
    {erro ? <div className="pf-social-empty" role="alert">{t('Não foi possível carregar os amigos.')} <button type="button" onClick={() => setVersao(v => v + 1)}>{t('Tentar novamente')}</button></div> : !eu && publico?.permitido === false ? <p className="pf-social-empty">{t('Este jogador mantém sua lista de amigos privada.')}</p> : !amigos ? <CarregandoNP pequeno /> : amigos.length === 0 ? <p className="pf-social-empty">{t('Nenhum amigo para mostrar por enquanto.')}</p> : <div className="pf-friends-grid">{amigos.map(a => <article className="pf-friend-card" key={a.id}>
      <a className="pf-friend-identity" href={`/perfil/?id=${a.id}`}><ComMoldura steamId={a.id} emblema><img src={a.avatar || '/assets/logos/logo-np-64.png'} alt="" width="48" height="48" loading="lazy" /></ComMoldura><span><b>{a.nome || a.id}</b><StatusAmigo id={a.id} /></span></a>
      <BotaoAmizade id={a.id} rotuloAmigo={t('Desfazer amizade')} />
    </article>)}</div>}
  </section>
}

export function AfiliadoDoPerfil({ id }) {
  const t = useT(), [dados, setDados] = useState(null), [erro, setErro] = useState(''), [copiado, setCopiado] = useState(false), [versao, setVersao] = useState(0)
  const [link, setLink] = useState('')
  useEffect(() => { const u = new URL('/', location.origin); u.searchParams.set('ref', id); setLink(u.href) }, [id])
  useEffect(() => {
    let ativo = true
    setErro('')
    chamarApi('/afiliado').then(d => ativo && setDados(d)).catch(() => ativo && setErro(t('Não foi possível carregar as indicações.')))
    return () => { ativo = false }
  }, [id, versao, t.idioma])
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); setCopiado(true) }
    catch { setErro(t('Não foi possível copiar. Selecione o link e copie manualmente.')) }
  }
  return <div className="pf-affiliate">
    <section className="pf-social-panel pf-affiliate-intro">
      <div className="pf-affiliate-copy"><span className="pf-affiliate-eyebrow">{t('Programa de afiliados')}</span><h2>{t('Convide amigos. Ganhe')} <em>{t('1 caixa de faca + 1.000 NP')}</em> {t('por cadastro.')}</h2><p>{t('Compartilhe seu link com quem ainda não tem conta na Neura. Quando seu amigo concluir o cadastro, a recompensa será entregue automaticamente para você.')}</p></div>
      <div className="pf-affiliate-ticket"><label htmlFor="pf-link-convite">{t('Seu link de convite')}</label><div><input id="pf-link-convite" value={link} readOnly onFocus={e => e.target.select()} /><button type="button" onClick={copiar}>{copiado ? t('Copiado') : t('Copiar')}</button></div><span className="pf-affiliate-barcode" aria-hidden="true" /></div>
      <ol className="pf-affiliate-steps">{[
        ['01', 'Compartilhe seu link', 'Envie no Discord, no grupo ou diretamente para um amigo.'],
        ['02', 'O amigo cria a conta', 'Ele entra pela Steam e conclui apelido, senha e confirmação de e-mail.'],
        ['03', 'Você recebe o prêmio', 'Uma Caixa Facas no inventário e 1.000 NP no saldo, uma vez por conta nova.'],
      ].map(([n, titulo, texto]) => <li key={n}><span>{n}</span><b>{t(titulo)}</b><p>{t(texto)}</p></li>)}</ol>
      <p className="pf-affiliate-note">{t('O primeiro convite vale por 30 dias neste navegador. Contas já cadastradas e convites para si mesmo não geram recompensa.')}</p>
    </section>
    {erro && <div className="pf-social-empty" role="alert">{erro} <button type="button" onClick={() => setVersao(v => v + 1)}>{t('Tentar novamente')}</button></div>}
    <div className="pf-affiliate-totals">{[['Cadastrados', dados?.cadastrados], ['Prêmios recebidos', dados?.premios], ['NP recebidos', dados ? dados.premios * 1000 : null]].map(([rotulo, valor]) => <div key={rotulo}><span>{t(rotulo)}</span><b>{valor == null ? '—' : Number(valor).toLocaleString(t.local)}</b></div>)}</div>
    <section className="pf-social-panel"><div className="pf-social-title"><h2>{t('Quem entrou')} <small>{dados?.cadastrados ?? '—'}</small></h2><button type="button" onClick={() => setVersao(v => v + 1)}>{t('Atualizar')}</button></div>{!dados && !erro ? <CarregandoNP pequeno /> : dados?.lista?.length ? <ul className="pf-affiliate-list">{dados.lista.map(p => <li key={p.id}><a href={`/perfil/?id=${p.id}`}><img src={p.avatar || '/assets/logos/logo-np-64.png'} alt="" width="36" height="36" /><b>{p.nome || p.id}</b></a><span>{p.entregue ? t('Recompensa entregue') : t('Cadastro em andamento')}</span></li>)}</ul> : <p className="pf-social-empty">{t('Ninguém entrou pelo seu link ainda. Convide seus amigos para a comunidade.')}</p>}</section>
    <p className="pf-affiliate-note">{t('A lista mostra os 100 convites mais recentes. Os totais incluem todas as indicações.')}</p>
    <span className="pf-social-feedback" role="status">{copiado ? t('Link de convite copiado') : ''}</span>
  </div>
}
