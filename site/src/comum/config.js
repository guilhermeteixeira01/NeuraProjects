// Configuração do site inteiro (menu, rodapé, login, redes sociais).
export const CONFIG = {
  // Lista de times (nome + logo) usada pelo Pick & Ban; editada na página /times/.
  // O plugin do servidor também lê esse arquivo (UrlListaTimes no BaseComp.json): não mude o caminho.
  repositorio: 'guilhermeteixeira01/NeuraProjects',
  branch: 'main',
  arquivoTimes: 'assets/data/times.json',

  // Login pela Steam: endereço do worker (site/worker/steam-login). '' = sem botão de login
  // (a página de perfil continua abrindo pelos links do ranking)
  loginSteam: 'https://neura-steam-login.steam-login.workers.dev',

  // Redes sociais (deixe '' para esconder)
  // Comunidade (Kivo: plataforma gamer de voz, chat e comunidades). '' esconde os botões e links
  comunidade: 'https://kivogamer.com/invite/bKbyhRATHR',
  comunidadeNome: 'Kivo',
  youtube: '',
  instagram: '',
  twitch: '',
}

// Itens do menu do topo (o "id" marca a página atual)
export const MENU = [
  { id: 'inicio', rotulo: 'Início', href: '/' },
  { id: 'pick', rotulo: 'Pick & Ban', href: '/neurapick/' },
  { id: 'partidas', rotulo: 'Partidas', href: '/partidas/' },
  { id: 'ranking', rotulo: 'Ranking', href: '/ranking/' },
  // Site de fora: abre em outra aba
  { id: 'inventario', rotulo: 'Inventário', href: 'https://inventory.cstrike.app', externo: true, icone: 'mochila' },
]
