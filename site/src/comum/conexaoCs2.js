// Link do botão "Entrar na partida" + comando equivalente para o console do CS2.
// Usa steam://connect: a Steam repassa o connect para o CS2 já aberto (o caso normal no lobby) ou abre o jogo se estiver fechado.
// steam://run/730//+connect … NÃO serve: com o CS2 aberto a Steam ignora os argumentos e o clique não faz nada.
export function montarConexaoCs2(endereco, senha = '') {
  const ip = String(endereco || '').trim()
  if (!ip || !/^[a-z0-9._:[\]-]+$/i.test(ip)) return null
  const segredo = String(senha || '')
  const entreAspas = JSON.stringify(segredo)
  return {
    url: `steam://connect/${ip}${segredo ? `/${encodeURIComponent(segredo)}` : ''}`,
    comando: `${segredo ? `password ${entreAspas}; ` : ''}connect ${ip}`,
  }
}
