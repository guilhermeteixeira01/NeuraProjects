// Medidas de uma moldura animada (APNG) para decidir se serve e com que escala ela encaixa na foto:
//   vazio    = metade do lado do maior quadrado vazio no meio (fração do raio). É onde começa o desenho,
//              contando os cantos (moldura só com enfeite nos cantos também mede certo).
//   escala   = tamanho da moldura em relação à foto para a borda de dentro ficar ~4% por cima da beirada da foto.
//   miolo    = quanto o meio da foto (20% a 80%) fica tapado, em média (névoa, fumaça...).
//   fps, quadros, movimento (quanto muda de um quadro para o outro; ~0 = praticamente parada).
import { lerQuadros } from './comum.mjs'

export const SOBREPOE = 0.96 // borda de dentro 4% para dentro da foto: fica por cima dela, sem vão
export const escalaPara = (vazio) => Math.min(1.32, Math.max(1.04, SOBREPOE / vazio))

export function medir(buf) {
  const { largura: w, altura: h, quadros, atrasos } = lerQuadros(buf)
  const n = quadros.length
  const media = new Float32Array(w * h)
  for (const q of quadros) for (let i = 0; i < w * h; i++) media[i] += q[i * 4 + 3] / n

  // miolo tapado
  let soma = 0, cont = 0
  for (let y = Math.round(h * 0.2); y < h * 0.8; y++)
    for (let x = Math.round(w * 0.2); x < w * 0.8; x++) {
      soma += media[y * w + x]
      cont++
    }
  const miolo = soma / cont / 255

  // Onde começa o desenho, saindo do centro (fração do raio, na medida "de tabuleiro" máx(|dx|,|dy|)):
  // pelos lados (várias linhas) e pelas diagonais (rumo aos cantos). Moldura com borda nos lados usa os lados;
  // moldura só com enfeite nos cantos (lados vazios) usa as diagonais.
  const ate = (ang) => {
    const dx = Math.cos(ang), dy = Math.sin(ang)
    for (let r = 0; r < w; r++) {
      const x = Math.round(w / 2 + dx * r), y = Math.round(h / 2 + dy * r)
      if (x < 0 || y < 0 || x >= w || y >= h) return 1
      if (media[y * w + x] >= 150) return Math.max(Math.abs(x + 0.5 - w / 2), Math.abs(y + 0.5 - h / 2)) / (w / 2)
    }
    return 1
  }
  const mediana = (l) => l.sort((a, b) => a - b)[Math.floor(l.length / 2)]
  const lados = [], diagonais = []
  for (let k = 0; k < 4; k++) {
    for (const d of [-0.35, -0.2, 0, 0.2, 0.35]) lados.push(ate((k * Math.PI) / 2 + d))
    for (const d of [-0.12, 0, 0.12]) diagonais.push(ate((k * Math.PI) / 2 + Math.PI / 4 + d))
  }
  const vLados = mediana(lados), vDiag = mediana(diagonais)
  const vazio = vLados <= 0.93 ? vLados : vDiag

  // movimento: diferença média de alfa entre quadros vizinhos
  let mov = 0
  for (let f = 1; f < n; f++) {
    let d = 0
    for (let i = 3; i < quadros[f].length; i += 16) d += Math.abs(quadros[f][i] - quadros[f - 1][i])
    mov += d / (quadros[f].length / 16) / 255
  }
  const dur = atrasos.reduce((s, a) => s + a, 0)
  return {
    largura: w,
    quadros: n,
    fps: n > 1 ? n / (dur / 1000) : 0,
    miolo,
    vazio,
    escala: escalaPara(vazio),
    movimento: n > 1 ? mov / (n - 1) : 0,
    kb: Math.round(buf.length / 1024),
  }
}
