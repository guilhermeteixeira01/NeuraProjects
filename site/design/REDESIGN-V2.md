# Redesign Neura Project v2: plano e estado

Referências: `design/reference/01-inicio.png` … `08-times.png` (1586×992; o lobby, 02, tem 1513×1039).
Pacote de artes: `public/assets/neura-v2/backgrounds/*` (16 fundos) e `characters/*` (7 PNGs transparentes). Guia de prompts:
`public/assets/neura-v2/Neura_Project_Prompts_Redesign.md`.

## Como está montado
- Stack mantida: React 19 + Vite, uma entrada por página (`src/entradas/`), SSR no deploy.
- Camada nova por último em todas as entradas: `src/comum/neura-v2.css` (cores, menu, barra de cima, peças comuns). Os nomes de cor
  antigos (`--bg`, `--ui-accent`…) apontam para as cores novas. Cada página tem `src/paginas/<página>/v2.css`.
- **Artes: um módulo só**, `src/comum/assetsV2.js` (fundos, personagens, `fundoDoResultado(mapa)` pelo id real do mapa). Derivados WebP
  de 20–280 KB em `neura-v2/web/v2/`, gerados por `node scripts/gerar-miniaturas.mjs` (PNG original de ~2 MB, mesma proporção).
  Cada rota define só o seu `--np-fundo`: o navegador baixa só a arte da página atual.
- O pacote não trazia `manifest.json`; os nomes e dimensões foram lidos dos arquivos. `sidebar-agent-v2.png` veio com a extensão
  duplicada (`sidebar-agent-v2.png.png`): o derivado sai como `sidebar-agent.webp`.
- **Efeito de personagem saindo do card** (ranking, loja, capa do time): wrapper `isolation + overflow visível`; cenário (recorte e borda
  arredondada); PNG irmão do cenário por cima (`clip-path` só embaixo, porque os PNGs vêm cortados reto na cintura); faixa de
  informações à frente. Escala e posição de cada personagem em variáveis (`--pj-w/-x/-t`). O personagem nunca captura clique.
- Menu (`Nav.jsx`): 178 px, marca empilhada, recolhível (escolha salva), Configurações e som no pé, agente do pacote fixo atrás dos
  links (some recolhido e no celular); barra de cima de 54 px com caminho da página, busca, painéis, conta e nível.

## Estado por página (comparado lado a lado com a referência no mesmo viewport)
- Início: hero com dupla (`home-duo`) e Sua temporada real; faixa do login diário; últimas partidas em lista; comunidade com o
  campeão dourado; caixas e banner do evento embaixo; projetos, Twitch e demais seções preservados.
- Lobby: cenário bg-lobby preenchendo a tela; cartões menores; faixa horizontal (abas e tipo de partida à esquerda; Boost · JOGAR ·
  Freeze à direita). Cabe em 1366×768. As regras de cada modo viram popover ao passar o mouse (texto mantido).
- Ranking: pódio prata/ouro/bronze com os PNGs novos saindo do card; abas; tabela com forma recente; celular com rolagem só da tabela.
- Inventário: topo com contagem, barra, abas, grade de cards com selo de raridade, painel de inspeção fixo (computador) ou gaveta
  acessível (celular: foco no fechar, Esc fecha e devolve o foco).
- Loja: hero com o arlequim saindo pela borda; abas e saldo acima. Perfil: capa e cabeçalho novos, métricas, progressão, insígnias, time.
- Partida: hero largo com a arte real do mapa (cache, dust2, nuke, mirage; outros mantêm a arte que já tinham), linha do tempo,
  tabelas (~2/3) e MVP + pontos (~1/3).
- Times: capa com `team-squad`, contadores, membros, cargo, chat real e convites. `/times/` (diretório) com bg-diretorio-times.
- Admin, Partidas (lista), Pick & Ban, 404: fundos do pacote nos cabeçalhos; demais telas herdam cores e menu.

## Pendências (concretas)
- Cartões do lobby: na prévia local os avatares são a logo NP (dados de teste); conferir com jogadores reais.
- Perfil: a referência mostra variação "nos últimos 30 dias" nas métricas; o backend não fornece, então não foi inventada.
- Times: sem coluna "Status/online" na tabela de membros (o serviço do time não expõe presença); sem "Notícias/Eventos" no menu.
- Faltam as artes de troféus, insígnias novas, molduras glacial/imperial e miniaturas de mapa do guia (a loja não ganhou itens novos).
- Telas internas (configurações, amigos, notificações, missões, insígnias, afiliado, formulários do admin) só herdam o sistema; não
  tiveram revisão individual lado a lado.
- Validação feita só na prévia local (login simulado); nada foi publicado, comprado, aberto ou enviado.

## Revisão do Início — 31/10/2026
- Retirada a camada V3 que afastava o Início da referência: hero deixa de ser card com margem, menu local178px/topbar54px, hero411px.
- Dupla ancorada dentro do hero, temporada à direita; diário horizontal e painéis inferiores nas posições da imagem01 (desktop1586×992: hero y54–465; diário y465–599; painéis y616–955).
- Regras locais preservam o layout das outras páginas. Menu recolhível, ações do diário, carrossel e dados reais preservados. Valores das recompensas continuam sendo os do backend.
- Conferidos no navegador desktop1586, intermediário1280 e celular390/320; sem overflow horizontal. Prévia demo em http://127.0.0.1:5180/.
- Capturas: .playwright-cli/inicio-referencia-corrigido.png e inicio-referencia-mobile.png (na raiz do repositório).

## Partidas pessoais e fundo contínuo — 31/10/2026
- Últimas partidas agora lê perfil/historico/<id>.json, limitado às três mais recentes da conta; não usa mais partidas gerais nem rating do MVP. Placar usuário/adversário, Vitória/Derrota/Empate e K/D pessoal. Ver todas leva ao perfil. Estados sem login, carregando, vazio (404) e erro separados.
- Linhas com divisórias, resultado colorido e indicador de detalhes conforme recorte enviado. Os pontos são decorativos dentro do link que abre a partida.
- Fundo do Início movido do hero para a página: mesma imagem atrás do topo e dos painéis, com desvanecimento vertical até o fundo escuro. Sem emenda ao terminar o hero.
- Verificação: três resultados renderizados com18kills/12mortes=1.50 e sem time vencedor/ratingMVP; navegador desktop/celular390 semoverflow e semimagensquebradas.

## Acabamento solicitado — 31/10/2026
- Retirados CaixasDestaque e BannerEvento do Início (componentes continuam disponíveis no projeto).
- Correção do fundo: arte novamente restrita ao hero411px, com recorte anterior; base #01070f no Início e degradê inferior até essa mesma cor. A imagem não é mais ampliada para1050px.
- Conta do topo: indicador online removido; avatar centralizado em espaço próprio, moldura44px inteiramente dentro da barra54px (mobile34px). Barra de progresso usa corNivel do nível atual, cinza sem classificação.
- Build cliente/SSR aprovado; menu da conta abre/fecha; desktop1586 e mobile390 conferidos sem overflow. Capturas inicio-sem-caixas-eventos.png e conta-avatar-nivel-corrigidos.png em .playwright-cli na raiz.

## Navegação, transição e louros — 31/10/2026
- Corrigida causa real da emenda: superficies.css tornava main transparente, revelando body#080a0f. Início e body agora usam a mesma base#010b16, igual ao ponto final do degradê do hero, mantendo recorte411px.
- Menu lateral com marca compacta, espaçamentos regulares, seleção sem contorno brilhante e agente mais visível na base. Botão recolher/expandir conferido; seletor de demo deslocado para fora do menu porque cobria esse botão.
- Comunidade com recorte arredondado no wrapper, cenário sem borda duplicada e acabamento acima das artes. Personagem contido no card.
- Louros redesenhados em public/assets/neura-v2/laurel-ranking.svg, folhas finas simétricas com ouro em gradiente; posição segue texto dinâmico em HeroInicio.
- Build cliente/SSR aprovado. Browser1586×992 e390×844: mesma cor calculada fundo/body, recortehidden no card, SVGcarregado e semoverflow; recolher/expandir funcionando.

## Pesquisa e navegação ampla — 31/10/2026
- Menu desktop224px, conteúdo deslocado pela mesma variável; todos os itens cabem sem rolagem, conferidos em1586x768 e1366x600 (scrollHeight igual clientHeight, controle final dentro da tela).
- Pesquisa abre junto ao botão do topo em painel próprio; filtra resultados sem alterar ou expandir a lateral. Foco inicial no campo, Escape/fechar/clique externo fecham e devolvem foco ao acionador.
- Som e Configurações transferidos da lateral para o topo; no celular permanecem na barra superior existente. Configurações conferidas abrindo pelo novo local.
- Build cliente/SSR aprovado; captura .playwright-cli/nav-pesquisa-topo-corrigida.png.

## Lobby — 01/11/2026
- Nova faixa horizontal: MD1/MD3, três miniaturas do pool (ou indicação Pick & Ban sem pool escolhido), servidor Brasil com bandeira SVG, Jogar e Boost/Freeze com ativar/cancelar. Detalhes de regras, pool e servidor abrem abaixo. Quantidades e permissões reais; nenhum ping inventado.
- Rodapé omitido no Layout apenas para lobby. Steam apenas ícone, com nome acessível (topo, mobile e aviso login).
- Cards ocupados na proporção282/395, backgroundcontain preserva desenho integral. Avatar em área112px; envelope da moldura/emblema medido e centralizado com escala limitada à área para nunca invadir nome/dados. Vagas90px alinhadas à base, com convite visível.
- Topo compacto90px e palco ajustado para controles caberem no1366x768: painel termina y742.6 e cinco slots alinhados na mesma base. Sem footer/overflow horizontal; moldura termina antes do nome.
- Testado demo5jogadores e comvagas; mapas10opções, servidor, MD3bloqueadosempremium, Boostativar/cancelarcomestoquerestaurado. Semlogin confirma botõesSteamsemtexto. BuildclienteSSR aprovado. Captura .playwright-cli/lobby-referencia-controles-cards.png.

### Lobby e sala de Pick & Ban — 01/11/2026
Barra compacta centralizada, comparação de modos, bloqueios Premium, modais de pool/servidor com fundo desfocado, identidade ampliada e nível na base do card. Simulação no modo demo: Jogar → aceitar → veto com adversário automático. Na sala, ambos os cabeçalhos usam o avatar do líder e os dez cards exibem o nível individual; moldura, nome e selo têm espaços próprios. Build cliente e SSR aprovado; fluxo conferido na prévia local.

### Vídeos do pódio — 01/11/2026
Os três personagens usam ranking/1-lugar.webm, 2-lugar.webm e 3-lugar.webm, em loop mudo e com transparência. Camada independente ultrapassa a borda superior, com sombra e faixa de identidade à frente. Respiro superior evita cobrir o resumo. Vídeos pausam fora da tela, em aba oculta e com redução de movimento/desempenho; erro de mídia usa a imagem anterior. Conferidos desktop e mobile390 sem overflow.
