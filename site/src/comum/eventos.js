// Datas civis no horário de Brasília. Eventos móveis são recalculados em cada ano.
const DIA = 86400000
const utc = (ano, mes, dia) => Date.UTC(ano, mes - 1, dia)
export const ANIVERSARIO_NEURA = { mes: 9, dia: 9 }

export const BANNERS_EVENTOS = {
  verao: '01-verao', outono: '02-outono', inverno: '03-inverno', primavera: '04-primavera',
  carnaval: '05-carnaval', pascoa: '06-pascoa', festaJunina: '07-festa-junina', halloween: '08-halloween',
  natal: '09-natal', anoNovo: '10-ano-novo', namorados: '11-dia-dos-namorados', independencia: '12-independencia',
  maes: '13-dia-das-maes', pais: '14-dia-dos-pais', criancas: '15-dia-das-criancas', blackFriday: '16-black-friday',
  // A nova coleção não contém arte de aniversário. Mantém a data com uma arte existente.
  aniversario: '04-primavera',
}

export function domingoDePascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return utc(ano, Math.floor(n / 31), n % 31 + 1)
}

export function eventoDaData(data = new Date(), aniversario = ANIVERSARIO_NEURA) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(data).map((p) => [p.type, Number(p.value)]))
  const { year: ano, month: mes, day: dia } = partes
  const hoje = utc(ano, mes, dia)
  const entre = (inicio, fim) => hoje >= inicio && hoje <= fim
  if (aniversario) {
    for (const a of [ano - 1, ano, ano + 1]) {
      const festa = utc(a, aniversario.mes, aniversario.dia)
      if (entre(festa - DIA, festa + DIA)) return 'aniversario'
    }
  }
  if ((mes === 12 && dia >= 27) || (mes === 1 && dia <= 6)) return 'anoNovo'
  if (mes === 12 && dia <= 26) return 'natal'
  if (entre(utc(ano, 10, 15), utc(ano, 11, 2))) return 'halloween'
  if (mes === 10 && dia >= 5 && dia <= 13) return 'criancas'
  if (mes === 6 && dia >= 10 && dia <= 13) return 'namorados'
  if (mes === 6) return 'festaJunina'
  if (mes === 9 && dia >= 4 && dia <= 7) return 'independencia'
  const segundoDomingo = (m) => {
    const primeiro = new Date(utc(ano, m, 1)).getUTCDay()
    return utc(ano, m, 8 + (7 - primeiro) % 7)
  }
  if (entre(segundoDomingo(5) - 6 * DIA, segundoDomingo(5))) return 'maes'
  if (entre(segundoDomingo(8) - 6 * DIA, segundoDomingo(8))) return 'pais'
  const pascoa = domingoDePascoa(ano)
  if (entre(pascoa - 52 * DIA, pascoa - 46 * DIA)) return 'carnaval'
  if (entre(pascoa - 14 * DIA, pascoa + DIA)) return 'pascoa'
  const fimNovembro = utc(ano, 11, 30)
  const blackFriday = fimNovembro - ((new Date(fimNovembro).getUTCDay() + 2) % 7) * DIA
  if (entre(blackFriday - 7 * DIA, blackFriday + 3 * DIA)) return 'blackFriday'
  // Estações do hemisfério sul, com transições civis aproximadas.
  if (hoje < utc(ano, 3, 20) || hoje >= utc(ano, 12, 21)) return 'verao'
  if (hoje < utc(ano, 6, 21)) return 'outono'
  if (hoje < utc(ano, 9, 22)) return 'inverno'
  return 'primavera'
}

export function bannerDoEvento(evento) {
  const nome = BANNERS_EVENTOS[evento] || BANNERS_EVENTOS.verao
  return { evento, grande: `/assets/banners/${nome}.webp`, pequeno: `/assets/banners/${nome}-860.webp` }
}

// Edições com encerramento explícito, usando as mesmas janelas civis do tema acima.
// Eventos sem janela configurada aqui precisam ser definidos pelo administrador.
export function calendarioEventosInsignias(ano) {
  const calendario = {}, horaBrasilia = 3 * 3600000
  const periodo = (id,inicio,fim) => { calendario[`evento-${id}`]={ano,inicio:new Date(inicio+horaBrasilia).toISOString(),fim:new Date(fim+horaBrasilia-1).toISOString()} }
  periodo('ano-novo',utc(ano,12,27),utc(ano+1,1,7));periodo('natal',utc(ano,12,1),utc(ano,12,27))
  periodo('halloween',utc(ano,10,15),utc(ano,11,3));periodo('dia-das-criancas',utc(ano,10,5),utc(ano,10,14))
  periodo('dia-dos-namorados',utc(ano,6,10),utc(ano,6,14));periodo('festa-junina',utc(ano,6,1),utc(ano,7,1))
  periodo('independencia',utc(ano,9,4),utc(ano,9,8))
  const domingo=m=>utc(ano,m,8+(7-new Date(utc(ano,m,1)).getUTCDay())%7)
  periodo('dia-das-maes',domingo(5)-6*DIA,domingo(5)+DIA);periodo('dia-dos-pais',domingo(8)-6*DIA,domingo(8)+DIA)
  const pascoa=domingoDePascoa(ano)
  periodo('carnaval',pascoa-52*DIA,pascoa-45*DIA);periodo('pascoa',pascoa-14*DIA,pascoa+2*DIA)
  const fimNovembro=utc(ano,11,30),sexta=fimNovembro-((new Date(fimNovembro).getUTCDay()+2)%7)*DIA
  periodo('black-friday',sexta-7*DIA,sexta+4*DIA)
  periodo('verao',utc(ano,12,21),utc(ano+1,3,20));periodo('outono',utc(ano,3,20),utc(ano,6,21))
  periodo('inverno',utc(ano,6,21),utc(ano,9,22));periodo('primavera',utc(ano,9,22),utc(ano,12,21))
  return calendario
}
