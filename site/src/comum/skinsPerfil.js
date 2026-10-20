// Skins equipadas de um jogador (worker: GET /skins/publico?id=), para o perfil mostrar cada arma com a skin que ele usa.
// A skin do TR vale primeiro (a maioria das armas de rifle é de TR); sem ela, a do CT. A imagem vem do catálogo (public/assets/skins/armas.json).
import { createContext, useContext, useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { DEF_ARMA } from './armas.js'
import { urlImgArma } from './skins.js'

const cache = {}
let catalogo = null
const lerCatalogo = () => (catalogo ??= fetch('/assets/skins/armas.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))

export const SkinsDoJogador = createContext(null)
export const useSkinDaArma = () => useContext(SkinsDoJogador)

// Devolve { imagem(idArma) -> url da arma com a skin, ou null } (null enquanto carrega ou se não tem nada equipado)
export function useSkinsEquipadas(steamId) {
  const [estado, setEstado] = useState(null)
  useEffect(() => {
    if (!steamId || !CONFIG.loginSteam) return setEstado(null)
    let vivo = true
    const base = CONFIG.loginSteam.replace(/\/$/, '')
    cache[steamId] ??= fetch(`${base}/skins/publico?id=${encodeURIComponent(steamId)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    Promise.all([cache[steamId], lerCatalogo()]).then(([equip, cat]) => {
      if (!vivo || !equip || !cat) return
      const porDef = new Map(cat.armas.map((a) => [a.d, a]))
      const achar = (def, paint) => {
        const s = porDef.get(def)?.s.find((x) => x[0] === paint)
        return s ? urlImgArma(s[6], 384) : null
      }
      setEstado({
        imagem(id) {
          if (id === 'faca') {
            const f = equip.facas?.tr || equip.facas?.ct
            return f ? achar(f.d, f.p) : null
          }
          const def = DEF_ARMA[id]
          if (!def) return null
          const paint = equip.armas?.tr?.[def] ?? equip.armas?.ct?.[def]
          return paint ? achar(def, paint) : null
        },
      })
    })
    return () => {
      vivo = false
    }
  }, [steamId])
  return estado
}
