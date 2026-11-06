// Usado no formulário, no worker e na apresentação: links sempre apontam
// para a página de jogador, sem parâmetros de rastreio ou credenciais.
export function linkFaceitPerfil(valor) {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > 240) return ''
  try {
    const u = new URL(valor.trim())
    if (u.protocol !== 'https:' || !['faceit.com', 'www.faceit.com'].includes(u.hostname) || u.username || u.password || u.port) return ''
    const perfil = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?players\/([a-z0-9_-]+)(?:\/.*)?$/i.exec(u.pathname)
    if (!perfil) return ''
    return `https://www.faceit.com/players/${perfil[1]}`
  } catch { return '' }
}

export const linkSteamPerfil = id => /^\d{17}$/.test(String(id)) ? `https://steamcommunity.com/profiles/${id}` : ''
