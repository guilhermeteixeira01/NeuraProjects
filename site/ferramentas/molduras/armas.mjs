// Imagens das armas do CS2 para o perfil ("Armas mais usadas"): baixa a imagem base de cada arma (CDN da Steam,
// lista do CSGO-API) e grava public/assets/armas/<nome>.webp, cortada e com 256 px de largura.
// O <nome> é o mesmo que o plugin grava no partida.json (arma do evento sem "weapon_"; facas = "faca").
//   node armas.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sharp } from './comum.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const PASTA = path.resolve(aqui, '../../public/assets/armas')
fs.mkdirSync(PASTA, { recursive: true })

// nome no partida.json -> id da arma na lista
const ARMAS = {
  ak47: 'weapon_ak47', m4a1: 'weapon_m4a1', m4a1_silencer: 'weapon_m4a1_silencer', awp: 'weapon_awp',
  famas: 'weapon_famas', galilar: 'weapon_galilar', aug: 'weapon_aug', sg556: 'weapon_sg556',
  ssg08: 'weapon_ssg08', scar20: 'weapon_scar20', g3sg1: 'weapon_g3sg1',
  deagle: 'weapon_deagle', glock: 'weapon_glock', usp_silencer: 'weapon_usp_silencer', hkp2000: 'weapon_hkp2000',
  p250: 'weapon_p250', elite: 'weapon_elite', fiveseven: 'weapon_fiveseven', tec9: 'weapon_tec9',
  cz75a: 'weapon_cz75a', revolver: 'weapon_revolver',
  mac10: 'weapon_mac10', mp9: 'weapon_mp9', mp7: 'weapon_mp7', mp5sd: 'weapon_mp5sd', ump45: 'weapon_ump45',
  p90: 'weapon_p90', bizon: 'weapon_bizon',
  nova: 'weapon_nova', xm1014: 'weapon_xm1014', mag7: 'weapon_mag7', sawedoff: 'weapon_sawedoff',
  m249: 'weapon_m249', negev: 'weapon_negev', taser: 'weapon_taser', faca: 'weapon_knife',
  he: 'weapon_hegrenade', molotov: 'weapon_molotov', flashbang: 'weapon_flashbang',
  smokegrenade: 'weapon_smokegrenade', decoy: 'weapon_decoy',
}

const lista = await (await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/base_weapons.json')).json()
const porId = new Map(lista.map((x) => [String(x.id).replace(/^base_weapon-/, ''), x]))
for (const [nome, id] of Object.entries(ARMAS)) {
  const item = porId.get(id)
  if (!item?.image) {
    console.log('SEM IMAGEM', nome)
    continue
  }
  const r = await fetch(item.image)
  if (!r.ok) {
    console.log('FALHOU', r.status, nome)
    continue
  }
  const destino = path.join(PASTA, `${nome}.webp`)
  await sharp(Buffer.from(await r.arrayBuffer())).trim().resize({ width: 256, withoutEnlargement: true }).webp({ quality: 88 }).toFile(destino)
  console.log(nome.padEnd(16), item.name)
}
