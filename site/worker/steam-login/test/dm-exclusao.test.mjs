import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, armazenamento } from './ambiente.mjs'
import { Presenca } from '../src/amigos.js'
const a = '76561198000000011', b = '76561198000000012'
function preparar() {
  const storage = armazenamento()
  storage.transaction = async (fn) => fn(storage)
  const objeto = Object.create(Presenca.prototype)
  Object.assign(objeto, { state: { storage }, env: ambiente().env, ultimoDm: new Map() })
  objeto.enviar = () => {}
  objeto.listaAmigos = async () => ({ [a]: { amigos: [b] }, [b]: { amigos: [a] } })
  objeto.statusVisivel = () => 'offline'
  return { objeto, storage }
}
const pedir = (o, eu, corpo, com = '') => o.dm(new Request(`https://presenca/dm${com ? '?com='+com : ''}`, { method: corpo ? 'POST' : 'GET', headers: { 'X-Id': eu }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) }))
test('apagar conversa preserva histórico do amigo e só mostra mensagens novas depois', async () => {
  const { objeto, storage } = preparar()
  const chave = `dm:${objeto.dmParChave(a,b)}`
  await storage.put(chave, [{ id:'1', de:a, texto:'antiga', ts:1 }])
  await storage.put(`dmLista:${a}`, { [b]:{ ts:1 } })
  await storage.put(`dmLista:${b}`, { [a]:{ ts:1 } })
  await pedir(objeto,a,{ com:b, acao:'apagar-conversa' })
  assert.equal((await pedir(objeto,a,null,b)).mensagens.length,0)
  assert.equal((await pedir(objeto,b,null,a)).mensagens.length,1)
  assert.ok((await storage.get(`dmLista:${b}`))[a])
  await pedir(objeto,b,{ com:a, texto:'nova' })
  assert.deepEqual((await pedir(objeto,a,null,b)).mensagens.map(m=>m.texto),['nova'])
  assert.equal((await pedir(objeto,b,null,a)).mensagens.length,2)
})
test('só o autor apaga mensagem, atualizando a prévia dos dois', async () => {
  const { objeto, storage } = preparar()
  const chave = `dm:${objeto.dmParChave(a,b)}`
  await storage.put(chave,[{ id:'1', de:b, texto:'primeira', ts:1 },{ id:'2', de:a, texto:'erro', ts:2 }])
  for (const [eu,outro] of [[a,b],[b,a]]) await storage.put(`dmLista:${eu}`,{ [outro]:{ texto:'erro', ts:2 } })
  await assert.rejects(pedir(objeto,b,{ com:a, acao:'apagar-mensagem', mensagem:'2' }))
  assert.equal((await storage.get(chave)).length,2)
  await pedir(objeto,a,{ com:b, acao:'apagar-mensagem', mensagem:'2' })
  assert.equal((await storage.get(chave)).length,1)
  for (const [eu,outro] of [[a,b],[b,a]]) assert.equal((await storage.get(`dmLista:${eu}`))[outro].texto,'primeira')
})

test('excluir mensagem não restaura conversa apagada nem remove mensagens de outro autor', async () => {
  const { objeto, storage } = preparar()
  const chave = `dm:${objeto.dmParChave(a,b)}`
  await storage.put(chave,[{id:'1',de:a,texto:'erro',ts:1},{id:'2',de:b,texto:'resposta',ts:2}])
  for (const [eu,outro] of [[a,b],[b,a]]) await storage.put(`dmLista:${eu}`,{[outro]:{ts:2,naoLidas:1}})
  await pedir(objeto,b,{com:a,acao:'apagar-conversa'})
  const eventos=[]
  objeto.enviar=(id,m)=>eventos.push({id,...m})
  await pedir(objeto,a,{com:b,acao:'apagar-mensagem',mensagem:'1'})
  assert.equal((await storage.get(`dmLista:${b}`))[a],undefined)
  assert.equal((await pedir(objeto,b,null,a)).mensagens.length,0)
  assert.deepEqual((await storage.get(chave)).map(m=>m.id),['2'])
  assert.deepEqual(eventos.map(e=>e.id),[a,b])
})

test('apagar a última mensagem remove as duas prévias e apagar conversa avisa só o dono', async () => {
  const { objeto, storage } = preparar()
  const chave = `dm:${objeto.dmParChave(a,b)}`
  await storage.put(chave,[{id:'1',de:a,texto:'única',ts:1}])
  for (const [eu,outro] of [[a,b],[b,a]]) await storage.put(`dmLista:${eu}`,{[outro]:{ts:1}})
  await pedir(objeto,a,{com:b,acao:'apagar-mensagem',mensagem:'1'})
  for (const [eu,outro] of [[a,b],[b,a]]) assert.equal((await storage.get(`dmLista:${eu}`))[outro],undefined)
  const eventos=[];objeto.enviar=(id)=>eventos.push(id)
  await pedir(objeto,a,{com:b,acao:'apagar-conversa'})
  assert.deepEqual(eventos,[a])
})
