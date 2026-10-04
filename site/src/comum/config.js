/*
 * Configuração do site inteiro (menu, rodapé, launcher, redes sociais).
 *
 * ┌──────────────────────────── CONFIGURAÇÃO ────────────────────────────┐
 * │ launcherAtivo: true = download liberado | false = "Em breve"          │
 * └───────────────────────────────────────────────────────────────────────┘
 */
export const CONFIG = {
  launcherAtivo: false,

  // Download e informações da versão (tamanho/versão aparecem sozinhos na página do launcher)
  launcherDownload: 'https://webhook.neuraproject.com.br/download/latest',
  launcherInfo: 'https://webhook.neuraproject.com.br/download/latest/info',

  // Jogos do launcher (aparecem na página do launcher)
  launcherJogos: [
    { nome: 'Counter-Strike 1.6', status: 'Suportado' },
    { nome: 'Mais jogos', status: 'Em breve' },
  ],

  // Lista de times (nome + logo) usada pelo Pick & Ban; editada na página /times/.
  // O plugin do servidor também lê esse arquivo (UrlListaTimes no BaseComp.json): não mude o caminho.
  repositorio: 'guilhermeteixeira01/NeuraProjects',
  branch: 'main',
  arquivoTimes: 'assets/data/times.json',

  // Login pela Steam: endereço do worker (site/worker/steam-login). '' = sem botão de login
  // (a página de perfil continua abrindo pelos links do ranking)
  loginSteam: 'https://neura-steam-login.steam-login.workers.dev',

  // Redes sociais (deixe '' para esconder)
  discord: 'https://discord.gg/GJSMDJEQsn',
  youtube: '',
  instagram: '',
  twitch: '',
}

// Itens do menu do topo (o "id" marca a página atual)
export const MENU = [
  { id: 'inicio', rotulo: 'Início', href: '/' },
  { id: 'launcher', rotulo: 'Launcher', href: '/launcher/', selo: CONFIG.launcherAtivo ? '' : 'EM BREVE' },
  { id: 'pick', rotulo: 'Pick & Ban', href: '/neurapick/' },
  { id: 'partidas', rotulo: 'Partidas', href: '/partidas/' },
  { id: 'ranking', rotulo: 'Ranking', href: '/ranking/' },
  // Site de fora: abre em outra aba
  { id: 'inventario', rotulo: 'Inventário', href: 'https://inventory.cstrike.app', externo: true, icone: 'mochila' },
]
