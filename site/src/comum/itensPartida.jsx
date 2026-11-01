export const ITENS_PARTIDA = [
  { tipo: 'boost', tecla: '1', nome: 'BOOST', cor: '#f5a524', dica: 'Se vencer a próxima partida ranqueada, o XP ganho vale em dobro.', d: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z' },
  { tipo: 'freeze', tecla: '2', nome: 'FREEZE', cor: '#4fc3f7', dica: 'Na próxima partida ranqueada, você não perde XP na derrota e ganha XP normalmente na vitória.', d: 'M12 2v20M4.9 6.5l14.2 11M19.1 6.5 4.9 17.5M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5M3.2 9.6l3.7.6-1.3 3.5M20.8 9.6l-3.7.6 1.3 3.5M3.2 14.4l3.7-.6M20.8 14.4l-3.7-.6' },
]
export function IconeItemPartida({ tipo, tamanho = 24 }) {
 const item = ITENS_PARTIDA.find(i => i.tipo === tipo)
 if (!item) return null
 return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill={tipo === 'boost' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={tipo === 'boost' ? 0 : 1.5} aria-hidden="true"><path d={item.d}/></svg>
}
