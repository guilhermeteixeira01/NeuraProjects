// Artes do visual novo (Neura Project v2). Uma lista só: as páginas pegam daqui, nunca escrevem o caminho na mão.
// Originais em public/assets/neura-v2/{backgrounds,characters}/*.png; o site usa os derivados leves em neura-v2/web/v2/
// (gerados por  node scripts/gerar-miniaturas.mjs ; PNG de ~2 MB vira WebP de 20–280 KB, mesma proporção).
// Cada arte tem largura e altura (o navegador reserva o espaço, sem pulo). Cenário e personagem são camadas separadas e decorativas
// (alt vazio): textos, números e logo ficam sempre em HTML, nunca dentro da imagem.
// Só a arte da rota atual é pedida pelo navegador (cada página importa o que usa; nada é pré-carregado).
//
// Observações dos arquivos (medidas feitas na entrega):
//  - Os *-popout são recortes de meio corpo, cortados reto embaixo: ficam atrás da faixa de informações e saem pela borda de cima.
//  - O sidebar-agent veio com a extensão duplicada (sidebar-agent-v2.png.png): o derivado já sai como sidebar-agent.webp.
//  - Não havia manifest.json no pacote: nomes e dimensões abaixo foram lidos dos próprios arquivos.

const W = '/assets/neura-v2/web/v2/'
const bg = (nome, w = 1600, h = 900) => ({ src: `${W}bg-${nome}.webp`, w, h })

export const FUNDOS = {
  inicio: bg('inicio'),
  lobby: bg('lobby'),
  ranking: bg('ranking'),
  inventario: { src: '/assets/neura-v2/inventario/inventory-night-v3.webp', w: 2172, h: 724 },
  loja: bg('loja'),
  perfil: bg('perfil'),
  time: bg('time'),
  partidas: bg('partidas'),
  admin: bg('admin'),
  diretorioTimes: bg('diretorio-times'),
  pickBan: bg('pick-ban'),
  global: bg('global'), // login, configurações, amigos, notificações, missões, insígnias e telas auxiliares
}

// Fundo do resultado de uma partida, pelo identificador real do mapa (de_cache, de_dust2...). Mapa sem arte aqui: null, e a página
// usa a arte do mapa que já existia (ou o fundo global neutro). Nunca um mapa errado.
export const RESULTADOS = {
  de_cache: bg('resultado-cache', 1920, 720),
  de_dust2: bg('resultado-dust2', 1920, 720),
  de_nuke: bg('resultado-nuke', 1920, 720),
  de_mirage: bg('resultado-mirage', 1774, 887),
  de_overpass: bg('resultado-overpass', 2048, 768),
  de_vertigo: bg('resultado-vertigo', 2048, 768),
  de_ancient: bg('resultado-ancient', 2048, 768),
  de_anubis: bg('resultado-anubis', 2048, 768),
  de_inferno: bg('resultado-inferno', 2048, 768),
  de_train: bg('resultado-train', 2048, 768),
}
export const fundoDoResultado = (mapa) => RESULTADOS[String(mapa || '').toLowerCase().replace(/^(?!de_)/, 'de_')] || null

export const PERSONAGENS = {
  heroDupla: { src: W + 'home-duo.webp', w: 1100, h: 917 }, // home e cabeçalho do inventário
  inventarioDupla: { src: '/assets/neura-v2/inventario/inventory-duo-v3.webp', w: 1536, h: 1024 },
  podio: [
      { src: W + 'podium-gold.webp', video: '/assets/neura-v2/ranking/1-lugar.webm', w: 900, h: 900 }, // 1º
      { src: W + 'podium-silver.webp', video: '/assets/neura-v2/ranking/2-lugar.webm', w: 900, h: 900 }, // 2º
      { src: W + 'podium-bronze.webp', video: '/assets/neura-v2/ranking/3-lugar.webm', w: 900, h: 900 }, // 3º
  ],
  lojaArlequim: { src: W + 'shop-jester.webp', w: 900, h: 900 },
  equipe: { src: W + 'team-squad.webp', w: 1400, h: 700 }, // capa do time
  menu: { src: W + 'sidebar-agent.webp', w: 480, h: 720 }, // decoração do menu da esquerda
}

// Home V3 (originais em neura-v2/backgrounds, characters e Inicio): card Comunidade (cenário de circo + palhaço sentado com troféu, camadas
// independentes) e a pilha de caixas azuis do login diário. Substituem o busto dourado (podium-gold) e a caixa dourada antiga.
export const COMUNIDADE_V3 = {
  cenario: { src: W + 'community-circus-background-v3.webp', w: 1280, h: 684 },
  campeao: { src: W + 'community-champion-seated-v3.webp', w: 760, h: 886 },
}
export const CAIXA_DIARIA_V3 = { src: W + 'daily-case-blue-v3.webp', w: 360, h: 360 }

// Fundo de um bloco como variável CSS (--np-fundo): sem a arte, o CSS fica com o gradiente liso de reserva
export const fundoCss = (chave) => (FUNDOS[chave] ? { '--np-fundo': `url("${FUNDOS[chave].src}")` } : undefined)

// Ramos do top 3 (PNG transparente 1254×1254 com o número dentro; derivados de 320 px): ouro, prata e bronze.
// Pódio e tabela do ranking. Original em neura-v2/ranking/top-N-ramos-*.png.
export const RAMOS = [
  { src: W + 'ramo-1.webp', w: 320, h: 320, nome: 'ouro' },
  { src: W + 'ramo-2.webp', w: 320, h: 320, nome: 'prata' },
  { src: W + 'ramo-3.webp', w: 320, h: 320, nome: 'bronze' },
]
