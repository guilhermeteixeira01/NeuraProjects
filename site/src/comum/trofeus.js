const ARQUIVOS = {
  1: 'Troféu dourado de circo com emblema NP.png',
  2: 'Troféu NP de circo prateado.png',
  3: 'Troféu circense de bronze com emblema NP.png',
}
export const urlTrofeu = pos => ARQUIVOS[pos] ? `/assets/Trofeus/${encodeURIComponent(ARQUIVOS[pos])}` : null
