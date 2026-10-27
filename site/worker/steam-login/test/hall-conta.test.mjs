import test from 'node:test'
import assert from 'node:assert/strict'
import {ambiente,DONO} from './ambiente.mjs'
const A='76561198000000011',B='76561198000000012'
const foto='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXe8AAAAASUVORK5CYII='
test('Hall: original privado, revisão administrativa e publicação aprovada',async()=>{
 const {pedir,env}=ambiente()
 env.OPENAI_API_KEY='chave-falsa-teste'
 assert.equal((await pedir('POST','/hall',{corpo:{foto,camisa:'escura'}})).status,401)
 assert.equal((await pedir('POST','/hall',{quem:A,corpo:{foto,camisa:'escura'}})).status,200)
 assert.equal((await pedir('GET','/hall/publico?id='+A)).dados.foto,null)
 assert.equal((await pedir('GET','/hall/revisao',{quem:B})).status,403)
 const fila=await pedir('GET','/hall/revisao',{quem:DONO});assert.equal(fila.dados.pedidos.length,1)
 const pedido=fila.dados.pedidos[0].pedido
 assert.equal((await pedir('POST','/hall/revisao',{quem:DONO,corpo:{id:A,pedido,acao:'aprovar'}})).status,200)
 assert.equal((await pedir('GET','/hall/publico?id='+A)).dados.foto,null)
 const anterior=globalThis.fetch
 globalThis.fetch=async(url,init)=>String(url)==='https://api.openai.com/v1/images/edits'?Response.json({data:[{b64_json:foto.split(',')[1]}]}):String(url).includes('/assets/hall/')?new Response(new Uint8Array([1,2,3])):anterior(url,init)
 try{await env.HALL_RETRATOS.instancia(A).alarm()}finally{globalThis.fetch=anterior}
 const publicado=(await pedir('GET','/hall/publico?id='+A)).dados
 assert.match(publicado.foto,/\/hall\/imagem\?/);assert.equal(publicado.montada,true);assert.equal(publicado.original,undefined)
 assert.equal((await pedir('POST','/hall',{quem:A,corpo:{foto:'data:image/svg+xml;base64,PHN2Zz4=',camisa:'clara'}})).status,400)
})
test('Conta: valida CPF/data, mantém dados civis privados e bloqueia perfil/inventário',async()=>{
 const {pedir}=ambiente()
 const corpo={nome:'Teste',sobrenome:'Privado',cpf:'52998224725',nascimento:'2000-01-02',discord:'teste',descricao:'Bio pública',faceit:'https://www.faceit.com/pt/players/teste',privacidade:{inventario:'ninguem',perfil:'todos'}}
 assert.equal((await pedir('POST','/conta/dados',{quem:A,corpo})).status,200)
 const publico=(await pedir('GET','/perfil/publico?id='+A,{quem:B})).dados
 assert.equal(publico.descricao,corpo.descricao);assert.equal(publico.cpf,undefined);assert.equal(publico.nascimento,undefined)
 assert.equal((await pedir('GET','/skins/inventario?id='+A,{quem:B})).status,403)
 assert.equal((await pedir('GET','/skins/inventario?id='+A,{quem:A})).status,200)
 assert.equal((await pedir('POST','/conta/dados',{quem:A,corpo:{...corpo,cpf:'11111111111'}})).status,400)
 assert.equal((await pedir('POST','/conta/dados',{quem:A,corpo:{...corpo,nascimento:'2000-02-31'}})).status,400)
 await pedir('POST','/conta/dados',{quem:A,corpo:{...corpo,privacidade:{perfil:'ninguem'}}})
 assert.equal((await pedir('GET','/perfil/publico?id='+A,{quem:B})).dados.permitido,false)
 assert.equal((await pedir('GET','/hall/publico?id='+A)).status,403)
})
