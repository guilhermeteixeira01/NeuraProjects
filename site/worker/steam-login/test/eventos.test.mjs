import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BANNERS_EVENTOS, bannerDoEvento, domingoDePascoa, eventoDaData } from '../../../src/comum/eventos.js'

const evento = (dia) => eventoDaData(new Date(`${dia}T15:00:00Z`))
test('calendário anual alterna todos os eventos e respeita prioridades', () => {
  for (const [dia, esperado] of Object.entries({
    '2026-01-01': 'anoNovo', '2026-01-15': 'verao', '2026-02-17': 'carnaval',
    '2026-04-05': 'pascoa', '2026-06-08': 'festaJunina', '2026-06-12': 'namorados',
    '2026-07-15': 'inverno', '2026-09-09': 'aniversario', '2026-10-12': 'criancas',
    '2026-10-25': 'halloween', '2026-11-27': 'blackFriday', '2026-12-25': 'natal',
    '2026-12-31': 'anoNovo', '2027-02-09': 'carnaval', '2027-03-28': 'pascoa',
    '2026-04-20': 'outono', '2026-10-01': 'primavera', '2026-09-07': 'independencia',
    '2026-05-10': 'maes', '2026-08-09': 'pais', '2027-05-09': 'maes', '2027-08-08': 'pais',
  })) assert.equal(evento(dia), esperado, dia)
})
test('datas móveis e virada de data usam Brasília, não o fuso da máquina', () => {
  assert.equal(new Date(domingoDePascoa(2026)).toISOString().slice(0, 10), '2026-04-05')
  assert.equal(new Date(domingoDePascoa(2038)).toISOString().slice(0, 10), '2038-04-25')
  assert.equal(eventoDaData(new Date('2026-10-15T02:59:59Z')), 'primavera')
  assert.equal(eventoDaData(new Date('2026-10-15T03:00:00Z')), 'halloween')
})
test('todos os eventos têm imagem desktop e mobile; referências antigas não são necessárias', () => {
  for (const id of Object.keys(BANNERS_EVENTOS)) {
    const banner = bannerDoEvento(id)
    for (const img of [banner.grande, banner.pequeno]) assert.ok(fs.existsSync(new URL(`../../../public${img}`, import.meta.url)), img)
  }
})
