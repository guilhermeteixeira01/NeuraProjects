import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiente, DONO, ranking } from './ambiente.mjs'

test('configuração antiga não permite reativar múltiplas caixas por abertura', async () => {
  const id='76561198000000099'
  ranking.jogadores=[{steamId:id,pontos:50000,mapas:20,xp:0,rating:1.2,kills:100}]
  const {pedir}=ambiente()
  const alterada=await pedir('POST','/admin/loja-config',{quem:DONO,corpo:{maxQtd:10}})
  assert.equal(alterada.status,200)
  assert.equal(alterada.dados.maxQtd,1)
  const loja=await pedir('GET','/loja',{quem:id})
  assert.equal(loja.dados.cfg.maxQtd,1)
  const caixa=loja.dados.caixas.find(c=>c.preco<1000)
  const r=await pedir('POST','/loja/abrir',{quem:id,corpo:{caixa:caixa.id,qtd:3,origem:'direto'}})
  assert.equal(r.status,200)
  assert.equal(r.dados.resultados.length,1)
})
