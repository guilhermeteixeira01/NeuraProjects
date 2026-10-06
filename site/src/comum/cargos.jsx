// Ícones do selo dos cargos (Premium, VIP...): o admin escolhe um por cargo (aba Cargos). Todos preenchidos, no mesmo
// estilo da coroa (24x24, cor do cargo). A lista de nomes também está no worker (ICONES_CARGO), que só aceita estes.
export const ICONES_CARGO = {
  coroa: { nome: 'Coroa', d: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z' },
  cifrao: {
    nome: 'Cifrão',
    d: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  },
  estrela: { nome: 'Estrela', d: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' },
  diamante: { nome: 'Diamante', d: 'M6 3h12l4 6-10 12L2 9l4-6zm1.2 2L5 8.4h4.2L10.5 5H7.2zm5.3 0l1.3 3.4H19L16.8 5h-4.3z', par: true },
  raio: { nome: 'Raio', d: 'M7 2v11h3v9l7-12h-4l4-8z' },
  escudo: { nome: 'Escudo', d: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z' },
  fogo: {
    nome: 'Fogo',
    d: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z',
  },
  caveira: {
    nome: 'Caveira',
    d: 'M12 2C7 2 3 5.6 3 10.2c0 2.6 1.3 4.9 3.4 6.4V20a1 1 0 0 0 1 1h2v-2h1.6v2h2v-2h1.6v2h2a1 1 0 0 0 1-1v-3.4c2.1-1.5 3.4-3.8 3.4-6.4C21 5.6 17 2 12 2zM8.5 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
    par: true,
  },
  trofeu: {
    nome: 'Troféu',
    d: 'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
    par: true,
  },
  coracao: {
    nome: 'Coração',
    d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  },
  verificado: {
    nome: 'Verificado',
    d: 'M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z',
    par: true,
  },
  mira: {
    nome: 'Mira',
    d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17.93V17h-2v2.93A8 8 0 0 1 4.07 13H7v-2H4.07A8 8 0 0 1 11 4.07V7h2V4.07A8 8 0 0 1 19.93 11H17v2h2.93A8 8 0 0 1 13 19.93zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    par: true,
  },
  microfone: {
    nome: 'Microfone',
    d: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
  },
  controle: {
    nome: 'Controle',
    d: 'M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
    par: true,
  },
}

// Desenho do ícone do cargo (sem ícone salvo ou ícone desconhecido: coroa, o de antes)
export function IconeCargo({ icone, tamanho = 12, className, style }) {
  const i = ICONES_CARGO[icone] || ICONES_CARGO.coroa
  return (
    <svg className={className} style={style} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={i.d} fillRule={i.par ? 'evenodd' : undefined} />
    </svg>
  )
}
