export const PONTOS_DIARIOS = [20, 30, 40, 60, 80, 100, 200]
const DIA = 86400000, FUSO = 3 * 3600000
export function estadoDiario(s = {}, agora = Date.now()) {
  const dia = Math.floor((agora - FUSO) / DIA)
  const resgatado = s.pontosDia === dia
  const sequencia = resgatado ? s.sequencia : s.pontosDia === dia - 1 ? s.sequencia % 7 + 1 : 1
  return { dia, sequencia, pontos: PONTOS_DIARIOS[sequencia - 1], pontosResgatados: resgatado, caixaResgatada: s.caixaDia === dia, viraEm: (dia + 1) * DIA + FUSO, agora, recompensas: PONTOS_DIARIOS }
}

