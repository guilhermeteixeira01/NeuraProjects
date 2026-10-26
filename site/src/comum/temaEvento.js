// Uma identidade por evento. O amarelo das ações principais permanece o da Neura.
export const TEMAS_EVENTOS = {
  verao: { cor: '#48d9ce', secundario: '#f5c542', efeito: 'sol' },
  outono: { cor: '#dd9b63', secundario: '#eac576', efeito: 'folhas' },
  inverno: { cor: '#83cffa', secundario: '#bce9ff', efeito: 'neve' },
  primavera: { cor: '#88d1a6', secundario: '#eea8c3', efeito: 'flores' },
  carnaval: { cor: '#e9a3d0', secundario: '#5bd8d0', efeito: 'confete' },
  pascoa: { cor: '#a7cf8e', secundario: '#efc39e', efeito: 'flores' },
  festaJunina: { cor: '#ecad6b', secundario: '#f0cf83', efeito: 'confete' },
  halloween: { cor: '#f39a4c', secundario: '#a6c5ed', efeito: 'morcegos' },
  natal: { cor: '#8bc7b1', secundario: '#e7b989', efeito: 'neve' },
  anoNovo: { cor: '#eacb7a', secundario: '#d4e2ec', efeito: 'estrelas' },
  namorados: { cor: '#e8a0b3', secundario: '#f3c6aa', efeito: 'coracoes' },
  independencia: { cor: '#8ecb80', secundario: '#ecd16d', efeito: 'estrelas' },
  maes: { cor: '#e4aac3', secundario: '#eec4a4', efeito: 'flores' },
  pais: { cor: '#8cb9d8', secundario: '#d2b27e', efeito: 'estrelas' },
  criancas: { cor: '#88d4dd', secundario: '#e9b17d', efeito: 'confete' },
  blackFriday: { cor: '#d5bd86', secundario: '#a4abb8', efeito: 'circuito' },
  aniversario: { cor: '#eac665', secundario: '#8ccfe5', efeito: 'estrelas' },
}
export const temaDoEvento = (evento) => TEMAS_EVENTOS[evento] || TEMAS_EVENTOS.verao
