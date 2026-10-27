import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento } from './ambiente.mjs'
import { chamarContas } from '../src/contas.js'
import { pedirAoJogador } from '../src/objetos.js'
import { concluirAfiliacao } from '../src/afiliado.js'
import { login, retorno } from '../src/auth.js'
import { lerUsuarios } from '../src/usuarios.js'
const { Loja } = await import('../src/loja.js')

const A='76561198000000811', B='76561198000000812', C='76561198000000813'
async function cadastrar(env, id, nick) {
 await chamarContas(env,{acao:'nick',steam:id,nick})
 await chamarContas(env,{acao:'senha',steam:id,senha:'SenhaSegura42'})
}
async function entrada(env,id,ref,novo=true) { return chamarContas(env,{acao:'afiliado-entrada',steam:id,ref,novo}) }
async function premio(env,id=A) {
 const saldo=await pedirAoJogador(env,id,{acao:'saldo'})
 const {inv}=await pedirAoJogador(env,id,{acao:'inv-ler'})
 return {saldo:saldo.saldo,caixas:Object.values(inv?.itens || {}).filter(i=>i.t==='caixa')}
}

test('cadastro concluído entrega 1 caixa de faca e 1000 NP; concorrência não duplica',async()=>{
 const {env,pedir}=ambiente({usuarios:{[A]:{nome:'Convidante'},[B]:{nome:'Convidado'}}})
 await cadastrar(env,A,'Convidante811')
 await entrada(env,B,A)
 await concluirAfiliacao(env,B)
 assert.equal((await premio(env)).saldo,0)
 await chamarContas(env,{acao:'nick',steam:B,nick:'Convidado812'})
 await concluirAfiliacao(env,B)
 assert.equal((await premio(env)).saldo,0)
 await chamarContas(env,{acao:'senha',steam:B,senha:'SenhaSegura42'})
 await Promise.all(Array.from({length:8},()=>concluirAfiliacao(env,B)))
 const p=await premio(env);assert.equal(p.saldo,1000);assert.equal(p.caixas.length,1)
 const caixas=(await pedir('GET','/loja/caixas')).dados
 assert.equal(p.caixas[0].d,caixas.find(c=>c.slug==='caixa-extras-facas').id)
 const lista=await pedir('GET','/afiliado',{quem:A})
 assert.equal(lista.status,200);assert.equal(lista.dados.cadastrados,1);assert.equal(lista.dados.premios,1)
 assert.equal(lista.dados.lista[0].nome,'Convidado')
 assert.ok(lista.dados.lista[0].entregue)
 assert.equal((await pedir('POST','/afiliado',{quem:A,corpo:{acao:'creditar',valor:999999}})).status,400)
 assert.equal((await pedir('GET','/afiliado')).status,401)
})

test('conta existente, autoindicação e segundo link não geram recompensa',async()=>{
 const {env}=ambiente();await cadastrar(env,A,'Conta811');await cadastrar(env,C,'Conta813')
 await entrada(env,A,A);await entrada(env,B,A,false);await entrada(env,B,C,true)
 await cadastrar(env,B,'Conta812');await concluirAfiliacao(env,B)
 assert.equal((await premio(env,A)).saldo,0);assert.equal((await premio(env,C)).saldo,0)
 const d=await chamarContas(env,{acao:'afiliado-lista',steam:A});assert.equal(d.cadastrados,0)
})

test('primeiro convite permanece e confirmação de email é exigida quando habilitada',async()=>{
 const {env}=ambiente();await cadastrar(env,A,'Amigo811');await cadastrar(env,C,'Amigo813')
 await entrada(env,B,A);await entrada(env,B,C);await cadastrar(env,B,'Amigo812')
 env.EMAIL_PRONTO='1';await concluirAfiliacao(env,B);assert.equal((await premio(env)).saldo,0)
 // O mesmo objeto responde ao estado do e-mail; não aceita bypass na API externa.
 assert.equal(await chamarContas(env,{acao:'afiliado-elegivel',steam:B}),null)
 env.EMAIL_PRONTO='0';await concluirAfiliacao(env,B)
 assert.equal((await premio(env,A)).saldo,1000);assert.equal((await premio(env,C)).saldo,0)
})

test('falha depois da entrega retoma pelo painel sem duplicar caixa ou saldo',async()=>{
 const {env,pedir}=ambiente({usuarios:{[A]:{nome:'Origem'},[B]:{nome:'Novo'}}})
 await cadastrar(env,A,'Origem811');await entrada(env,B,A);await cadastrar(env,B,'Novo812')
 await pedirAoJogador(env,A,{acao:'afiliado-recompensar',convidado:B})
 assert.equal((await chamarContas(env,{acao:'afiliado-lista',steam:A})).premios,0)
 assert.equal((await pedir('GET','/afiliado',{quem:A})).dados.premios,1)
 assert.equal((await premio(env)).saldo,1000);assert.equal((await premio(env)).caixas.length,1)
})

test('link de login transporta indicação no return_to confirmado pela Steam',async()=>{
 const {env}=ambiente();await cadastrar(env,A,'Origem811')
 const resposta=login(new URL(`https://worker.test/login?ref=${A}&volta=https://neuraproject.com.br/perfil/`),env,env.SITE)
 const steam=new URL(resposta.headers.get('Location')), returnTo=steam.searchParams.get('openid.return_to')
 assert.equal(new URL(returnTo).searchParams.get('ref'),A)
 const u=new URL(returnTo)
 u.searchParams.set('openid.return_to',returnTo)
 u.searchParams.set('openid.mode','id_res');u.searchParams.set('openid.op_endpoint','https://steamcommunity.com/openid/login')
 u.searchParams.set('openid.claimed_id',`https://steamcommunity.com/openid/id/${B}`);u.searchParams.set('openid.identity',`https://steamcommunity.com/openid/id/${B}`)
 u.searchParams.set('ref',C) // Parâmetro fora do return_to assinado não pode trocar o convidante.
 const antes=globalThis.fetch;globalThis.fetch=async()=>new Response('is_valid:true')
 try {assert.equal((await retorno(u,env,env.SITE)).status,302)} finally {globalThis.fetch=antes}
 const d=await chamarContas(env,{acao:'afiliado-lista',steam:A});assert.equal(d.cadastrados,1)
 assert.equal((await lerUsuarios(env))[B].indicacaoEntrada.ref,A)
})

test('rota de confirmação de email libera o prêmio ao concluir o cadastro',async()=>{
 const {env,pedir}=ambiente({usuarios:{[A]:{nome:'Origem'},[B]:{nome:'Novo'}}})
 env.EMAIL_PRONTO='1';env.RESEND_API_KEY='chave-falsa-do-teste'
 await cadastrar(env,A,'Pronto811');await entrada(env,B,A)
 assert.equal((await pedir('POST','/conta/nick',{quem:B,corpo:{nick:'Novo812'}})).status,200)
 assert.equal((await pedir('POST','/conta/senha',{quem:B,corpo:{senha:'SenhaSegura42'}})).status,200)
 assert.equal((await premio(env)).saldo,0)
 let codigo
 const antes=globalThis.fetch
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='https://api.resend.com/emails') {codigo=JSON.parse(init.body).html.match(/>(\d{6})<\/div>/)?.[1];return new Response('{}')}
  return antes(url,init)
 }
 try { assert.equal((await pedir('POST','/conta/email',{quem:B,corpo:{email:'novo@example.com'}})).status,200) } finally {globalThis.fetch=antes}
 assert.match(codigo,/^\d{6}$/)
 assert.equal((await pedir('POST','/conta/email/verificar',{quem:B,corpo:{codigo}})).status,200)
 assert.equal((await premio(env)).saldo,1000);assert.equal((await premio(env)).caixas.length,1)
 await pedir('GET','/conta/seguranca',{quem:B});assert.equal((await premio(env)).saldo,1000)
})

test('falha na gravação da recompensa preserva NP e inventário; nova tentativa entrega tudo',async()=>{
 const {env}=ambiente();await cadastrar(env,A,'Entrega811');await entrada(env,B,A);await cadastrar(env,B,'Entrega812')
 const storage=armazenamento(),originalPut=storage.put.bind(storage)
 let falhar=true
 storage.put=async(k,v)=>{if(typeof k==='object'&&k['afiliado-np']&&falhar){falhar=false;throw new Error('falha simulada antes de gravar')}return originalPut(k,v)}
 const loja=new Loja({storage},env),namespace=env.LOJA
 env.LOJA={idFromName:n=>n,get:id=>id===A?{fetch:(url,init)=>loja.fetch(new Request(url,init))}:namespace.get(id)}
 await assert.rejects(concluirAfiliacao(env,B))
 assert.equal((await premio(env)).saldo,0);assert.equal((await premio(env)).caixas.length,0)
 await concluirAfiliacao(env,B);assert.equal((await premio(env)).saldo,1000);assert.equal((await premio(env)).caixas.length,1)
})

test('amigos do perfil respeitam a privacidade e não expõem pedidos pendentes',async()=>{
 const usuarios=Object.fromEntries([A,B,C].map((id,i)=>[id,{nome:'Amigo '+i}]))
 const {pedir}=ambiente({usuarios})
 await pedir('POST','/amigos',{quem:A,corpo:{acao:'pedir',id:B}})
 await pedir('POST','/amigos',{quem:B,corpo:{acao:'aceitar',id:A}})
 await pedir('POST','/amigos',{quem:A,corpo:{acao:'pedir',id:C}})
 let r=await pedir('GET',`/perfil/amigos?id=${A}`,{quem:C})
 assert.equal(r.status,200);assert.deepEqual(r.dados.amigos.map(a=>a.id),[B]);assert.equal(r.dados.recebidos,undefined)
 assert.equal((await pedir('POST','/conta/dados',{quem:A,corpo:{privacidade:{amigos:'ninguem'}}})).status,200)
 r=await pedir('GET',`/perfil/amigos?id=${A}`,{quem:C});assert.equal(r.dados.permitido,false);assert.equal(r.dados.amigos.length,0)
 r=await pedir('GET',`/perfil/amigos?id=${A}`,{quem:A});assert.equal(r.dados.permitido,true);assert.equal(r.dados.amigos.length,1)
 assert.equal((await pedir('GET',`/perfil/amigos?id=${A}`)).status,401)
})
