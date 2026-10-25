// Datas civis no horário de Brasília. Eventos móveis são recalculados em cada ano.
const DIA = 86400000
const utc = (ano, mes, dia) => Date.UTC(ano, mes - 1, dia)
export const ANIVERSARIO_NEURA = { mes: 9, dia: 9 }

export const BANNERS_EVENTOS = {
  natal: '01-natal', anoNovo: '02-ano-novo', halloween: '03-halloween', carnaval: '04-carnaval',
  pascoa: '05-pascoa', festaJunina: '06-festa-junina', namorados: '07-dia-dos-namorados',
  criancas: '08-dia-das-criancas', blackFriday: '09-black-friday', verao: '10-verao',
  inverno: '11-inverno', aniversario: '12-aniversario-neura',
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
      if (entre(festa - 3 * DIA, festa + 3 * DIA)) return 'aniversario'
    }
  }
  if ((mes === 12 && dia >= 27) || (mes === 1 && dia <= 6)) return 'anoNovo'
  if (mes === 12 && dia <= 26) return 'natal'
  if (entre(utc(ano, 10, 15), utc(ano, 11, 2))) return 'halloween'
  if (mes === 10 && dia >= 5 && dia <= 13) return 'criancas'
  if (mes === 6 && dia >= 10 && dia <= 13) return 'namorados'
  if (mes === 6) return 'festaJunina'
  const pascoa = domingoDePascoa(ano)
  if (entre(pascoa - 52 * DIA, pascoa - 46 * DIA)) return 'carnaval'
  if (entre(pascoa - 14 * DIA, pascoa + DIA)) return 'pascoa'
  const fimNovembro = utc(ano, 11, 30)
  const blackFriday = fimNovembro - ((new Date(fimNovembro).getUTCDay() + 2) % 7) * DIA
  if (entre(blackFriday - 7 * DIA, blackFriday + 3 * DIA)) return 'blackFriday'
  // Fora das festas, alterna a arte de clima quente/frio sem deixar o banner vazio.
  return mes >= 4 && mes <= 9 ? 'inverno' : 'verao'
}

export function bannerDoEvento(evento) {
  const nome = BANNERS_EVENTOS[evento] || BANNERS_EVENTOS.verao
  return { evento, grande: `/assets/banners/${nome}.webp`, pequeno: `/assets/banners/${nome}-860.webp` }
}
