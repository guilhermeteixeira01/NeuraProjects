// Valor das facas (NP, desgaste Factory New): modelo x acabamento. Usado pelo worker (facas-valor.json) e pela caixa de facas.
// Karambit e Butterfly valem mais; Doppler, Fade, Marble Fade, Tiger Tooth, Case Hardened etc. valem mais que Boreal Forest, Safari Mesh...
export const MODELO = { 500: 0.6, 503: 0.3, 505: 0.5, 506: 0.35, 507: 1, 508: 0.85, 509: 0.4, 512: 0.3, 514: 0.3, 515: 1, 516: 0.3, 517: 0.25, 518: 0.25, 519: 0.3, 520: 0.25, 521: 0.25, 522: 0.3, 523: 0.55, 525: 0.45, 526: 0.3 }
const TOP = /(doppler|fade|marble|tiger tooth|case hardened|slaughter|lore|gamma|autotronic|black laminate|freehand|damascus|emerald|ruby|sapphire|crimson web)/i
const COMUM = /(boreal|forest ddpat|safari mesh|scorched|urban masked|night stripe|rust coat|stained)/i
export const valorBaseDaFaca = (d, nomeSkin) => Math.round(500 + (MODELO[d] ?? 0.3) * (TOP.test(nomeSkin) ? 1 : COMUM.test(nomeSkin) ? 0.25 : 0.5) * 5200)
