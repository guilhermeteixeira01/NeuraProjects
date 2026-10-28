import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarPerfil } from '../src/rotas-conta.js'
import { FUNDOS_PERFIL } from '../src/fundos-perfil.js'
test('fundo de perfil aceita apenas mapas do catálogo e pode ser removido', () => {
 for (const fundoPerfil of FUNDOS_PERFIL) assert.deepEqual(validarPerfil({fundoPerfil}), {fundoPerfil})
 assert.deepEqual(validarPerfil({fundoPerfil:null}), {fundoPerfil:null})
 for (const fundoPerfil of ['https://outro.site/foto.jpg','../../arquivo','anime/card.webp',{},false]) assert.throws(()=>validarPerfil({fundoPerfil}))
})
