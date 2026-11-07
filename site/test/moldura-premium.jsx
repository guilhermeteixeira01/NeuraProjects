import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/comum/site.css'
import '../src/comum/superficies.css'
import '../src/paginas/admin/admin.css'
import '../src/entradas/perfil.css'
import { CamadaMoldura, folgaMoldura } from '../src/comum/Moldura.jsx'
import { classeForma, estiloFotoMoldura } from '../src/comum/molduras.js'

const premium = 'premium/neura-premium'
const avatar = new URLSearchParams(location.search).get('avatar') || '/icones/logo-np-64.png'
function Foto({ classe, tamanho }) {
  return <span ref={folgaMoldura} className={`moldura-box${classeForma(premium)}`} style={estiloFotoMoldura(premium)}>
    <img className={classe} src={avatar} alt="Avatar de teste" style={tamanho ? { width: tamanho, height: tamanho } : undefined} />
    <CamadaMoldura id={premium} parada />
  </span>
}
const caixa = { padding: 35, minWidth: 170, minHeight: 230, border: '1px solid #345', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 35 }
createRoot(document.getElementById('root')).render(<main style={{ padding: 30, color: '#fff', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
  {[24, 32, 40, 48, 64, 80, 108, 140].map(t => <section style={caixa} key={t} data-caso={`avatar-${t}`}><Foto tamanho={t}/><b>{t}px</b></section>)}
  <section style={caixa} data-caso="perfil"><div className="pf-header-portrait"><Foto classe="pf-header-avatar"/></div><b>Cabeçalho do perfil</b></section>
  <section style={caixa} data-caso="hall"><div className="pf-lado"><div className="hf-jogador-avatar"><Foto classe="hf-avatar-imagem"/></div></div><b>Card do jogador</b></section>
  <section style={caixa} data-caso="personalizar"><div className="sm-previa-card"><span ref={folgaMoldura} className={`moldura-box sm-av${classeForma(premium)}`} style={estiloFotoMoldura(premium)}><img src={avatar} alt="Prévia do avatar"/><CamadaMoldura id={premium} parada /></span></div><b>Personalização</b></section>
  <section style={caixa} data-caso="menu"><button className="nx-conta-btn" style={{position:'static'}}><span className="nx-conta-avatar"><Foto/></span></button><b>Menu da conta</b></section>
  <section style={caixa} data-caso="admin"><span className={`moldura-box adm-ed-av${classeForma(premium)}`} style={estiloFotoMoldura(premium)}><img className="adm-ed-img" src={avatar} alt="Avatar no admin"/><CamadaMoldura id={premium} parada /></span><b>Prévia do admin</b></section>
</main>)
