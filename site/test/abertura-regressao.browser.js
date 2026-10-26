// Regressao real no navegador: resposta lenta, faca, luva e abertura normal.
// Intercepta somente a API de demonstracao local; nao abre caixas em contas reais.
async page => {
 const casos=[{w:390,tipo:'luva',rapida:false,atraso:1400},{w:1440,tipo:'faca',rapida:false,atraso:1000},{w:320,tipo:'normal',rapida:true,atraso:1700},{w:768,tipo:'luva',rapida:true,atraso:700}];
 const todos=await Promise.all(casos.map(async(caso)=>{
  const contexto=await page.context().browser().newContext({viewport:{width:caso.w,height:900}});const p=await contexto.newPage();const erros=[];p.on('pageerror',e=>erros.push(e.message));await p.setViewportSize({width:caso.w,height:900});
  const slug=caso.tipo==='faca'?'caixa-originais-enfermeira':'caixa-originais-ghostface-vermelho';await p.goto('http://127.0.0.1:5174/loja/?caixa='+slug);
  await p.evaluate(({caso,slug})=>localStorage.setItem('np_loja_rapida',caso.rapida?'1':'0'),{caso,slug});await p.reload();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);
  await p.evaluate(async({caso,slug})=>{
   const core=await import('/worker/steam-login/src/loja-core.js');const cat=await(await fetch('/__preview-local/loja')).json();const c=cat.caixas.find(c=>c.slug===slug);
   const indice=caso.tipo==='normal'?0:c.facas.findIndex(i=>(i.t||'faca')===caso.tipo);const base=caso.tipo==='normal'?c.itens[indice]:c.facas[indice];const g={raridade:caso.tipo==='normal'?base.r:5,indice,item:{t:base.t||'arma',d:base.d,p:base.p,f:.08,s:123,l:0}};const f=core.gerarFaixa(c,core.CONFIG_PADRAO,g,()=>.4);
   const resposta={saldo:200000,restantes:0,resultados:[{id:'regressao-'+caso.tipo,raridade:g.raridade,indice:g.indice,item:g.item,faixa:f.itens,alvo:f.alvo,v:5000,facas:g.raridade===5?core.gerarFaixaFacas(c,g,()=>.4):null}]};const anterior=window.fetch;window.fetch=async(input,init)=>String(input).endsWith('/loja/abrir')?(await new Promise(r=>setTimeout(r,caso.atraso)),Response.json(resposta)):anterior(input,init);
   window.__medidas=[];window.__medir=true;const medir=()=>{const e=document.querySelector('.lj-cx-roletas');if(e){const r=e.getBoundingClientRect();window.__medidas.push({y:r.y+scrollY,h:r.height})}if(window.__medir)requestAnimationFrame(medir)};requestAnimationFrame(medir);
  },{caso,slug});
  const botao=p.getByRole('button',{name:/^Abrir por/});await botao.scrollIntoViewIfNeeded();await p.waitForTimeout(100);await botao.click();
  if(caso.tipo!=='normal'){
   await p.locator('.lj-reel').waitFor({timeout:18000});await p.waitForTimeout(400);
   const reel=await p.locator('.lj-reel').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.lj-roleta').getBoundingClientRect();return {visivel:r.x<p.right&&r.right>p.x&&r.height>0,centro:Math.abs(r.x+r.width/2-p.x-p.width/2),fotos:e.querySelectorAll('img[src]').length}});
   if(!reel.visivel||reel.centro>1||!reel.fotos)throw Error('Raro invisivel '+JSON.stringify({caso,reel}));
   await p.screenshot({path:'.playwright-cli/revisao/corrigido-raro-girando-'+caso.w+'.png'});
  }
  await p.locator('.lj-cx-pos').waitFor({timeout:24000});await p.waitForTimeout(1000);
  const final=await p.evaluate(()=>{window.__medir=false;const card=document.querySelector('.lj-trilho > .lj-venceu'),r=card.getBoundingClientRect(),p=card.closest('.lj-roleta').getBoundingClientRect(),img=card.querySelector('.lj-cartao-arte img'),ms=window.__medidas;return {saltoAltura:Math.max(...ms.map(m=>m.h))-Math.min(...ms.map(m=>m.h)),saltoPosicao:Math.max(...ms.map(m=>m.y))-Math.min(...ms.map(m=>m.y)),centro:Math.abs(r.x+r.width/2-p.x-p.width/2),imagem:!!img?.getAttribute('src'),carregada:img?.complete&&img?.naturalWidth>0,nome:card.querySelector('b')?.textContent,desgaste:!!card.querySelector('.lj-venceu-desgaste'),bordas:document.querySelectorAll('.np-carrossel-borda').length,overflow:document.documentElement.scrollWidth>innerWidth}});
  if(final.saltoAltura>1||final.saltoPosicao>2||final.centro>1||!final.imagem||!final.carregada||!final.desgaste||final.bordas!==2||final.overflow||erros.length)throw Error(JSON.stringify({caso,final,erros}));
  await p.screenshot({path:'.playwright-cli/revisao/corrigido-resultado-'+caso.w+'.png'});await contexto.close();return {caso,...final,erros};
 }));return todos;
}


