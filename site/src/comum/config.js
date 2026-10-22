// Configuração do site inteiro (menu, rodapé, login, redes sociais).
export const CONFIG = {
  // Lista de times (nome + logo) usada pelo Pick & Ban; editada na página /times/.
  // O plugin do servidor também lê esse arquivo (UrlListaTimes no BaseComp.json): não mude o caminho.
  repositorio: 'guilhermeteixeira01/NeuraProjects',
  branch: 'main',
  arquivoTimes: 'assets/data/times.json',

  // Login pela Steam: endereço do worker (site/worker/steam-login). '' = sem botão de login
  // (a página de perfil continua abrindo pelos links do ranking)
  // (npm run dev:local usa o worker local: ver worker/steam-login/dev/README.md)
  loginSteam: import.meta.env?.VITE_LOGIN_STEAM || 'https://neura-steam-login.steam-login.workers.dev',

  // Página onde a pessoa vira Premium (botão SEJA PREMIUM da janela do emblema de assinatura). '' = botão desligado ("Em breve")
  premium: '',

  // Redes sociais (deixe '' para esconder)
  // Comunidade (servidor do Discord). '' esconde os botões e links
  comunidade: 'https://discord.gg/kBHskkJFc',
  comunidadeNome: 'Discord',
  // Crédito do rodapé ('Site feito por ...'). '' esconde
  autorNome: 'guilhermeteixeira01',
  autorLink: 'https://github.com/guilhermeteixeira01',
  youtube: '',
  instagram: '',
  twitch: '',
}

// Itens do menu do topo (o "id" marca a página atual)
export const MENU = [
  { id: 'inicio', rotulo: 'Início', href: '/', icone: 'casa' },
  // Botão ▶ "Jogar": abre o Lobby (grupo para jogar junto). Só no computador: no celular/tablet o botão não aparece (soComputador)
  { id: 'lobby', rotulo: 'Jogar', href: '/lobby/', icone: 'play', soComputador: true },
  { id: 'pick', rotulo: 'Pick & Ban', href: '/neurapick/', icone: 'mapa' },
  { id: 'partidas', rotulo: 'Partidas', href: '/partidas/', icone: 'partidas' },
  { id: 'ranking', rotulo: 'Ranking', href: '/ranking/', icone: 'trofeu' },
  // Skins do jogador (o plugin aplica no servidor)
  { id: 'inventario', rotulo: 'Inventário', href: '/inventario/', icone: 'mochila' },
  // Loja de caixas (gasta os Neura Pontos)
  { id: 'loja', rotulo: 'Loja', href: '/loja/', icone: 'caixa' },
  // Times de jogadores: criar (com NP), convidar, cargos e chat do time
  { id: 'equipes', rotulo: 'Times', href: '/equipes/', icone: 'grupo' },
]
