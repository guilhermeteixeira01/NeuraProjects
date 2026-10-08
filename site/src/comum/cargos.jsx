// Ícones do selo dos cargos (Premium, VIP...): o admin escolhe um por cargo (aba Cargos). Estilo geométrico/futurista:
// cantos retos, recortes vazados (par: evenodd) e alguns detalhes em traço (l). 24x24, na cor do cargo.
// A lista de nomes também está no worker (ICONES_CARGO), que só aceita estes.
export const ICONES_CARGO = {
  coroa: { nome: 'Coroa', d: 'M2.5 7.5 7 11l5-8 5 8 4.5-3.5-1.8 10.5H4.3z M12 9.6l1.7 2.9L12 15.4l-1.7-2.9z M4.5 19.5h15V22h-15z', par: true },
  cifrao: { nome: 'Cifrão', d: 'M10.6 2h2.8v2.2h4.1v2.9H9.7l-.9.9v1.4l.9.9h5.6l2.7 2.7v2.9L15.3 18.6h-1.9V22h-2.8v-3.4H6.5v-2.9h7.8l.9-.9v-1.4l-.9-.9H8.7L6 9.8V7l2.7-2.8h1.9z' },
  estrela: { nome: 'Estrela', d: 'M12 1.5l2.9 6.6 7.1.8-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 8.9l7.1-.8z M12 7.6l-1.2 2.8-3 .3 2.3 2 -.7 3 2.6-1.6 2.6 1.6-.7-3 2.3-2-3-.3z', par: true },
  diamante: { nome: 'Diamante', d: 'M6.5 3h11L22 9 12 21.5 2 9z M7.6 5 5.4 8h3.9l1-3z M13.7 5l1 3h3.9l-2.2-3z M6 10.2l4.6 6.1-1.4-6.1z M14.8 10.2l-1.4 6.1 4.6-6.1z M11.1 10.2 12 14l.9-3.8z', par: true },
  raio: { nome: 'Raio', d: 'M14.5 1.5 4.5 13.4h6.3L8.6 22.5l11-12.3h-6.6z M12.4 6.6l-.8 4.6h4.2l-4.5 5 .7-3.2H8.2z', par: true },
  escudo: { nome: 'Escudo', d: 'M12 1.5 20.5 4.8v6.4c0 5.1-3.5 9.3-8.5 11.3-5-2-8.5-6.2-8.5-11.3V4.8z M12 5v13.9c3.1-1.6 5-4.4 5-7.7V7z', par: true },
  fogo: { nome: 'Fogo', d: 'M12.5 1.5c.4 3.1-1 4.9-2.6 6.6l-1.3-2.3C5.7 8.6 4 11.4 4 14.6 4 19 7.6 22.5 12 22.5s8-3.5 8-7.9c0-2.4-1-4.4-2.6-6l-.9 2.5c-.6-4.2-1.6-7.6-4-9.6z M12 12.5l-2.6 3.6c0 1.7 1.1 3 2.6 3s2.6-1.3 2.6-3z', par: true },
  caveira: { nome: 'Caveira', d: 'M7 2h10l3.5 3.5v7L18.5 15v4.5l-2 2.5h-9l-2-2.5V15l-2-2.5v-7z M7.4 9h3.8v3.6H8.6L7.4 11.4z M12.8 9h3.8v2.4l-1.2 1.2h-2.6z M11 14.6h2l.8 2.4h-3.6z M9 19v1.5h1.4V19z M13.6 19v1.5H15V19z', par: true },
  trofeu: { nome: 'Troféu', d: 'M6.5 2h11v2.2h4V8c0 2.4-1.7 4.2-4.1 4.6-.9 1.9-2.5 3.1-4.1 3.4v2.3h3.2l1 1.7v2.5H6.5V20l1-1.7h3.2V16c-1.6-.3-3.2-1.5-4.1-3.4C4.2 12.2 2.5 10.4 2.5 8V4.2h4z M4.6 6.3v1.7c0 1 .6 1.9 1.8 2.3l-.1-4z M19.4 6.3h-1.7l-.1 4c1.2-.4 1.8-1.3 1.8-2.3z M12 4.6l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 10.6l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z', par: true },
  coracao: { nome: 'Coração', d: 'M12 21.5 2.5 12V6l3.5-3.5h3.7L12 4.8l2.3-2.3H18L21.5 6v6z M12 16.6 18.6 10V7.3l-1.8-1.8h-1.3L12 9 8.5 5.5H7.2L5.4 7.3V10z', par: true },
  verificado: { nome: 'Verificado', d: 'M12 1 21.5 6.4v11.2L12 23l-9.5-5.4V6.4z M10.4 16.7l-4-4 1.7-1.7 2.3 2.3 5.5-5.5 1.7 1.7z', par: true },
  mira: { nome: 'Mira', d: 'M10.9 1.5h2.2v6h-2.2z M10.9 16.5h2.2v6h-2.2z M1.5 10.9h6v2.2h-6z M16.5 10.9h6v2.2h-6z M12 9.8l2.2 2.2-2.2 2.2L9.8 12z', l: 'M5 9V5h4 M15 5h4v4 M19 15v4h-4 M9 19H5v-4' },
  microfone: { nome: 'Microfone', d: 'M9 1.5h6l1 1v9.5L13.8 14h-3.6L8 12V2.5z M10.6 4v1.4h2.8V4z M10.6 7v1.4h2.8V7z', l: 'M5 10v3.2L8.8 17h6.4l3.8-3.8V10 M12 17v4.5 M8 21.5h8', par: true },
  controle: { nome: 'Controle', d: 'M6.5 5h11l4.5 5.5v6.2L19.3 19.5h-2.6l-3-3h-3.4l-3 3H4.7L2 16.7v-6.2z M7 8.8v1.6H5.4v2.2H7v1.6h2.2v-1.6h1.6v-2.2H9.2V8.8z M15.6 9.2h2v2h-2z M17.6 11.4h2v2h-2z', par: true },
}

// Desenho do ícone do cargo (sem ícone salvo ou ícone desconhecido: coroa, o de antes)
export function IconeCargo({ icone, tamanho = 12, className, style }) {
  const i = ICONES_CARGO[icone] || ICONES_CARGO.coroa
  return (
    <svg className={className} style={style} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={i.d} fillRule={i.par ? 'evenodd' : undefined} />
      {i.l && <path d={i.l} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />}
    </svg>
  )
}
