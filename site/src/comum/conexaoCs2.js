// Seleciona explicitamente o CS2, em vez da consulta genérica steam://connect.
export function montarConexaoCs2(endereco, senha = '') {
  const ip = String(endereco || '').trim()
  if (!ip || !/^[a-z0-9._:[\]-]+$/i.test(ip)) return null
  const segredo = String(senha || '')
  const entreAspas = JSON.stringify(segredo)
  const argumentos = `${segredo ? `+password ${entreAspas} ` : ''}+connect ${ip}`
  return {
    url: `steam://run/730//${encodeURIComponent(argumentos)}/`,
    comando: `${segredo ? `password ${entreAspas}; ` : ''}connect ${ip}`,
  }
}
