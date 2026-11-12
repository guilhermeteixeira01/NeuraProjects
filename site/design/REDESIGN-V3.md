# Redesign Neura Project v3: central competitiva

O relatório `design/auditoria-visual/README.md` citado no pedido não existia (as pastas `desktop/`, `estados/` e `mobile/` estavam vazias).
A direção foi definida a partir do próprio código, do `REDESIGN-V2.md` e das capturas do estado anterior.

## Direção
- Base grafite neutra (`#08090c` → superfícies `#0f1217` / `#14181f` / `#1b2029`), bordas brancas finas (7–20 %).
- Um único acento quente, **Neura Gold** `#ffb22e`, com texto escuro `#1a1206`: próxima ação (JOGAR, CTAs) e item ativo.
- Ciano-aço `#5cc8ff` só para foco e informação; verde `#3ddc97` e vermelho `#ff5c6c` só para resultado, sempre com texto.
- Ouro, prata e bronze (`#ffcf5a`, `#cfd6e3`, `#e0915a`) só no pódio e em conquistas.
- Títulos, números, placares e abas em **Barlow Condensed** (já carregada em todas as páginas); texto corrido na fonte do sistema.
  `--font-display` continua sendo a fonte do sistema para as camadas antigas; a condensada entra só por `--x-display`.

## Como está montado
- `src/comum/neura-v3.css`: última camada compartilhada. Tokens `--x-*`, remapeamento dos nomes antigos (`--v2-*`, `--blue`,
  `--ui-accent`, `--np-*`), menu (232 px, marca em linha, ativo com traço âmbar), barra de cima (64 px), barra de baixo no celular,
  botões, abas, painéis, selos, campos e tabelas.
- `src/paginas/<rota>/v3.css`: uma por entrada, importada logo depois de `neura-v3.css` nas 15 entradas de `src/entradas/`.
- Especificidade: `html:not(#v3)` empata com `html:not(#v2)` e ganha por vir depois; onde a v2 usa `#root … :not(#_)`, a v3 usa
  `html:not(#v3) #root … :not(#_)`.
- `Nav.jsx`: atalho **JOGAR** na barra de cima em todas as rotas, menos no lobby; trilha do evento de Natal (`eventos`).
- `HeroInicio.jsx`: espaço antes do `<br>` do subtítulo (no celular o texto colava: "caixase").
- Traduções: `Jogar` em `en.js` e `es.js`.

## Por rota
- **Início**: kicker, título condensado de 80 px, saudação como linha de status, CTA âmbar, "Sua temporada" como placar de HUD;
  faixa diária, últimas partidas com barra de resultado e comunidade no mesmo sistema.
- **Lobby**: cenário com véu grafite, cartões de jogador (você em âmbar, líder em ouro), vagas tracejadas, faixa de partida única
  com JOGAR âmbar de 58 px, Boost/Freeze e janelas em grafite; aviso de celular e de sem login no mesmo padrão.
- **Ranking**: título condensado, resumo em placas, pódio com metal por posição, métricas em controle segmentado (uma linha),
  tabela com cabeçalho em display, linhas de 66 px, linha "você" com traço âmbar.
- **Inventário**: cartões grafite com a raridade só na borda, seleção e seleção múltipla em âmbar, painel de inspeção estável.
- **Loja**: abas segmentadas, banner, CTA âmbar, filtros, catálogo, página da caixa (modo normal em âmbar), Caixa Premium em ouro.
- **Upgrade**: variáveis `--upg-*` na paleta nova; medidor, multiplicadores, setas e botão em âmbar.
- **Perfil**: nome em display, CTA âmbar, abas, painéis sem vidro azul, gráfico de rating em âmbar (sobreposto por CSS).
- **Partida**: placar como foco (76 px, vencedor em verde), medidas do layout iguais às outras rotas, nomes com reticências no celular.
- **Meu time**: capa, abas, contadores e blocos. **Admin, Times registrados, Pick & Ban, Natal**: acabamento leve (já usavam âmbar).
- **404**: `404.html` estático com arte própria (alterado fora desta etapa); não recebeu regras novas.

## Dependências e pendências
- Artes: durante o trabalho, o pacote `public/assets/neura-tatico/` substituiu as artes da v2 (`assetsV2.js`), os vídeos do pódio, o
  arlequim da Loja e os personagens do Lobby (o componente `PersonagemSlot` foi removido). As telas foram compostas em volta disso;
  o palco do Lobby hoje mostra só os cartões sobre o cenário.
- Perfil: variação "nos últimos 30 dias" nas métricas continua dependendo de dado que o backend não fornece.
- Validação feita só no modo demo local; nada foi publicado, comprado ou enviado.

## Capturas e validação
- Antes: `design/auditoria-visual/antes/` · Depois: `design/auditoria-visual/depois/` (19 rotas/estados × 1440, 1024, 390, 320).
- Estados interativos: `design/auditoria-visual/estados/` (abas de Perfil, Loja, Meu time e Admin; busca, filtro e seleção no
  Inventário; busca de skins, página da caixa e confirmação de compra na Loja; seleção no Upgrade; gaveta do Inventário em 390).
- Todas sem rolagem horizontal, sem imagem quebrada e sem erro de página. `npm run build` (cliente e SSR) aprovado.
