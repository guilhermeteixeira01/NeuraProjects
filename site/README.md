# Site da Neura (React)

O site inteiro (neuraproject.com.br) é um projeto React + Vite com uma página por entrada.

| Página | Endereço | Código |
| --- | --- | --- |
| Início | `/` | `src/paginas/inicio/` |
| Pick & Ban | `/neurapick/` | `src/paginas/neurapick/` |
| Partidas | `/partidas/` | `src/paginas/partidas/` |
| Página de uma partida | `/partidas/<org>/<md>/<partida>/` | `src/paginas/partida/` |
| Ranking | `/ranking/` | `src/paginas/ranking/` |
| Perfil do jogador | `/perfil/?id=<SteamID64>` | `src/paginas/perfil/` |
| Lista de times | `/times/` | `src/paginas/times/` |
| Painel de administrador | `/admin/` | `src/paginas/admin/` |

Menu, rodapé, avisos de novidade e configuração (comunidade na Kivo, login...) ficam em `src/comum/`.
Cada página tem um único CSS, que começa importando a base do site (`src/comum/site.css` e `paginas.css`).

## Comandos (dentro de `site/`)

```bash
npm install      # primeira vez
npm run dev      # site local em http://localhost:5173 (usa as partidas e a lista de times do repositório)
npm run build    # build das páginas + versão para gerar o HTML
npm run gerar    # monta o site completo em dist-final/ (igual ao deploy)
npm run preview  # abre o dist-final/ no navegador
```

## De onde vêm os dados

- `../partidas/` — o plugin BaseComp do servidor de CS2 manda, a cada mapa, o `partida.json`
  (dados do mapa) e atualiza o `partidas.json` (histórico). O formato está em `PartidaDados`
  (RelatorioPagina.cs do plugin).
- `../partidas/series.json` — séries anunciadas pelo plugin: entram no `css_serie` como "iniciando", viram
  "andamento" (com `mapaAtual`) quando cada mapa começa valendo e "cancelada" no `css_seriecancelar`. A lista
  de partidas mostra a série antes do primeiro mapa terminar e o mapa "AO VIVO"; o deploy manda push quando uma
  série começa.
- `../assets/data/times.json` — lista de times, editada na página `/times/`. O plugin também lê
  esse arquivo, então ele não muda de lugar.
- `../assets/data/twitch.json` — área "Ao vivo" da página inicial (`src/paginas/inicio/LiveTwitch.jsx`):
  `{ "canais": ["nome-do-canal"], "chat": true }` (nome ou link do canal). O player da Twitch diz se está ao vivo
  (sem chave de API); com vários canais mostra o primeiro ao vivo e confere a lista de novo a cada 90 s.
  Ninguém ao vivo: aparece a capa "Offline" com o link do canal. Lista vazia: a área não aparece.
  O site lê o arquivo ao abrir a página, então trocar o canal não precisa de deploy do código, só do arquivo.

## Deploy

Todo push na `main` (e toda partida enviada pelo plugin) roda `.github/workflows/deploy.yml`:
build do site e depois `scripts/gerar-site.mjs`, que copia os dados, gera o ranking
(`scripts/ranking.mjs`), cria a página de cada partida e escreve o HTML de todas as páginas já com
o conteúdo (bom para o Google). No navegador o React assume esse HTML.

## Login pela Steam e perfil

A página `/perfil/?id=<SteamID64>` mostra os números do jogador (do `ranking.json`), o gráfico de rating por
mapa e o histórico completo (`perfil/historico/<SteamID64>.json`, gerado no deploy pelo `scripts/ranking.mjs`).
Os nomes no ranking e na página da partida levam para ela.

O login é opcional: com ele aparece o botão **Entrar** no menu, "Meu perfil", o destaque "VOCÊ" no ranking e a
posição do jogador quando ele está fora do top 15. Como o site é estático, quem confirma o login com a Steam é um
Cloudflare Worker gratuito (`worker/steam-login/`). Para ligar:

1. Crie uma conta grátis em https://dash.cloudflare.com e, dentro de `site/worker/steam-login/`, rode
   `npx wrangler login` e depois `npx wrangler deploy`. O endereço do worker aparece no fim
   (ex.: `https://neura-steam-login.<sua-conta>.workers.dev`).
2. `npx wrangler secret put SEGREDO`: cole um texto aleatório longo (assina os tokens).
3. Opcional: `npx wrangler secret put STEAM_API_KEY` com a chave de https://steamcommunity.com/dev/apikey
   (sem ela o login funciona, mas o menu mostra as iniciais em vez do avatar e do nome da Steam).
4. Em `src/comum/config.js`, coloque o endereço do worker em `loginSteam` e faça o push.

O token fica só no navegador (`localStorage`, 30 dias). O site não confia nele para nada sensível; ele só serve
para mostrar quem está logado.

### Personalizar perfil (moldura e time)

No próprio perfil, quem está logado vê **Personalizar**: na aba **Moldura** escolhe uma moldura animada para o
avatar e na aba **Time** um time da lista de `/times/` (aparece no top 15 e no perfil). A escolha vai para o
worker (`POST /perfil`, que confere o login) e fica no KV `MOLDURAS` da Cloudflare (`{ steamId: { moldura, time } }`);
todas as páginas que mostram o avatar ou o time leem `GET /perfis` ao abrir (as rotas antigas `/molduras` e
`/moldura` continuam funcionando). Quem troca vê na hora; os outros ao abrir ou recarregar a página.

As molduras ficam em `public/assets/molduras/<coleção>/<nome>.png` (APNG animado; o avatar ocupa o círculo
central e a moldura é 120% dele) com uma miniatura parada `.webp` (144x144) ao lado, e a lista em
`src/comum/molduras.js`. Para adicionar uma: coloque os dois arquivos e uma linha na lista.

De onde vêm (campo `fonte` na lista):
- **Neura** (`fonte: 'neura'`): feitas por nós, desenhadas por código em `ferramentas/molduras/neura.mjs`
  (anel neon, plasma, fogo, raio, radar, mira, glitch, órbita, hexágonos, coroa, C4, aurora).
- **Steam** (Loja de Pontos) e **Decor** (decorações da comunidade): a lista escolhida fica em
  `ferramentas/molduras/escolhidas.json` e `baixar.mjs` baixa, recomprime as pesadas (acima de 1,2 MB) e grava.
  A arte é dos autores/jogos de origem.
- Molduras quadradas (`forma: 'quadrada'`, as da Steam): o avatar fica quadrado e a moldura fica por cima da foto,
  com `escala` própria (a borda de dentro de cada uma fica num lugar diferente; a escala põe a borda um pouco por cima
  da beirada da foto). As que cobriam a foto com névoa/fumaça ou animavam travado foram tiradas.
- "Melhorar desempenho" ligado: as molduras ficam paradas (usa o `.webp` no lugar do `.png` animado).
- As decorações do Discord foram tiradas do site (arte licenciada). Quem estava com uma delas fica sem moldura até
  escolher outra; a moldura salva que não existe mais na lista é simplesmente ignorada.

Ferramentas (fora do build do site, com dependências próprias):

```bash
cd ferramentas/molduras
npm install
node neura.mjs              # gera a coleção Neura (ou: node neura.mjs radar c4)
node baixar.mjs             # baixa as da escolhidas.json e imprime as linhas para o molduras.js
node paradas.mjs            # refaz as imagens paradas (.webp) de todas, a partir das animadas
node buscar-steam.mjs       # procura mais na Steam: mede todas e monta folhas em cache/ para escolher no olho
```

Como achar mais molduras da Steam: `buscar-steam.mjs` baixa as candidatas (tira nomes de personagem/fofura/memes) e
só deixa passar as que animam liso (>= 15 quadros por segundo), não tapam a foto, têm a borda de dentro na mesma
proporção das outras (72% a 93%) e não pesam demais. Para usar uma: copie a linha dela de `cache/candidatas.json`
para `escolhidas.json` (com `nome`, `colecao` e `pasta`) e rode `node baixar.mjs` (baixa só as que ainda não estão
no site e imprime as linhas para o `molduras.js`, já com a `escala` medida por `medir.mjs`).

```bash
```

## Níveis (XP)

Funciona como o Elo da FACEIT (`src/comum/niveis.js`, a mesma tabela no deploy, no site e no worker): cada mapa
**vitória ganha XP e derrota perde XP**, e o desempenho aumenta o ganho ou diminui a perda.

- Base: vitória +100, derrota −60 (empate não mexe).
- Rating no mapa: 1.5+ +40 · 1.2+ +25 · 1.0+ +10 · 0.8+ 0 · abaixo −10. MVP da partida +20.
- Vitória rende pelo menos +50 e derrota tira pelo menos −10 (vitória: +50 a +160; derrota: −10 a −70).
- O XP total nunca fica abaixo de 0; o nível pode cair. 10 níveis (cores da FACEIT) com o XP mínimo em `NIVEIS`.

O deploy calcula tudo em ordem de data (`scripts/ranking.mjs`): o XP total no `ranking.json`, o ganho/perda de cada
mapa no histórico do perfil e, em cada página de partida (`d.xp`), a coluna **NÍVEL** com o selo e o +XP/−XP de cada
jogador. O admin pode somar ou tirar XP pelo painel (ajuste guardado no worker e somado no site). Aparece no ranking
(métrica XP), no perfil (selo + barra até o próximo nível), nas partidas e no painel.

## Painel de administrador (`/admin/`)

A aba **Admin** aparece no menu só para administradores, mas quem decide é o worker: toda chamada `/admin/...`
confere o login e se a pessoa é admin. O dono é o `DONO` do `worker/steam-login/wrangler.toml` (SteamID64 do
Te1xe1ra) e só ele promove ou remove outros admins.

- **Usuários:** todo mundo do ranking e quem já entrou com a Steam (o worker registra cada login), com busca e
  filtros. Editar: ajuste de XP, moldura (qualquer uma, sem trava de nível), time, bloquear a personalização
  (o jogador não troca mais sozinho) ou limpar o perfil.
- **Molduras:** liga "liberar molduras por nível" e escolhe o nível de cada moldura (ou da coleção inteira).
  Ligado, o Personalizar mostra as molduras acima do nível com cadeado e o worker recusa salvar
  (ele lê o XP do `ranking.json` publicado + o ajuste).
- **Cargos:** cria cargos (Premium, VIP...) com nome e cor. O admin dá/tira cargos em Usuários → Editar; o cargo vira
  selo no perfil e no ranking. Na aba Molduras, cada moldura (ou coleção) pode ser **exclusiva de um cargo**: o
  Personalizar mostra essas numa seção própria ("Exclusivas · Premium"), travadas para quem não tem o cargo, e o worker
  recusa salvar. Vale junto com a regra de nível (precisa das duas). Admins não têm trava.
  Cargo **automático** ("Automático: top N"): os N primeiros do ranking (rating, a ordem do top 15) ganham o cargo
  e perdem sozinhos ao sair do top N; não fica gravado no perfil, é recalculado do ranking no site e no worker. Moldura
  exclusiva de um cargo que a pessoa perdeu deixa de aparecer (volta se ela recuperar); moldura posta por um admin
  aparece sempre.
- **Admins:** lista de administradores.

## Configurações ⚙ (idioma, tema e desempenho)

O botão ⚙ no topo (`src/comum/Configuracoes.jsx`) abre o painel com **Idioma**, **Tema** e **Melhorar desempenho**.
Tudo fica no navegador e é aplicado pelo script do `<head>` de cada HTML antes de desenhar (sem piscar).
Com login, as três também ficam na conta (perfil do worker: `tema`, `idioma`, `desempenho`) e valem em qualquer
aparelho em que a pessoa entrar; a conta vence o navegador (`src/comum/preferencias.js`). São preferências de quem
olha: continuam livres para conta bloqueada, e o "Limpar perfil" do admin não apaga.

- **Melhorar desempenho** (`src/comum/desempenho.js`, `localStorage np_desempenho`, `html[data-desempenho]`): desliga
  animações, transições, partículas, brilhos, desfoque, luz do cursor e contadores animados. CSS no fim de `site.css`.

## Idiomas (i18n)

Português (padrão), inglês e espanhol, no ⚙ do topo e no seletor do rodapé (`localStorage np_idioma`).
`src/comum/i18n.js` tem o `useT()`; a **chave é o próprio texto em português**:

```jsx
const t = useT()
t('Ver ranking')                                     // texto simples
t('faltam {xp} para o nível {n}', { xp, n })         // com variáveis
v.toLocaleString(t.local)                            // números/datas no formato do idioma
```

As traduções ficam em `src/comum/idiomas/en.js` e `es.js` (`'texto em português': 'tradução'`). Texto sem tradução
aparece em português. Texto novo na tela: passe por `t()` e acrescente a linha nos dois arquivos (as `{variáveis}`
ficam iguais). Não são traduzidos: nomes de mapas, molduras, times e jogadores, e os avisos das notificações push
(`novidades.js`). O HTML gerado no deploy sai em português; com outro idioma guardado, o `<head>` esconde a página
(`html.i18n-trocando`), o React troca o texto e mostra (no máximo 2,5 s escondida, se algo falhar).

## Temas (⚙ Configurações → Tema)

Três temas, para todas as páginas: **Padrão do site** (o de sempre), **Escuro otimizado** e **Claro otimizado**. Os
otimizados não têm os efeitos pesados (partículas, brilhos do topo, desfoque de fundo, grade decorativa, luz do
cursor e inclinação 3D). O tema fica no navegador (`localStorage np_tema`, aplicado por um script no `<head>` de cada
HTML antes de desenhar, sem piscar) e, com login, no perfil do worker (`tema`), então vale nos outros aparelhos.

As cores vêm de variáveis em `src/comum/site.css` (`html[data-tema='claro']` e `'escuro'`), inclusive
`--tinta` (reflexos/divisórias), `--fundo` (véus), `--borda-rgb` e `--cartao-1/2`. Cor nova no CSS: use as
variáveis (não `rgba(255,255,255,x)` nem fundos escuros fixos), senão ela não muda no tema claro. Cartões com imagem
de mapa por trás (`.summary-item`, `.map-card`, `.pool-item`) continuam escuros no claro ("ilhas escuras").

## Séries (MD3/MD5)

Cada página de mapa recebe, no deploy, os outros mapas da mesma série (`serieJogos`, tirado do
`partidas.json`) e, ao abrir, ainda confere o histórico. Assim a seção "Série" fica sempre atual:

- mapa jogado: resultado + link para a página dele;
- mapa que falta com a série rolando: "A jogar" com os pontinhos animados (`comum/Carregando.jsx`);
- mapa que falta com a série decidida: "Não jogado";
- série cancelada no servidor (`css_seriecancelar`): o plugin marca `serieCancelada` nos mapas já
  jogados; o site mostra o selo "CANCELADA" e os mapas que faltavam como "Cancelado".

A lista `/partidas/` segue a mesma regra nos cards dos mapas que faltam.

## Formato do partida.json

Definido pelo plugin (classe `PartidaDados` em `RelatorioPagina.cs`, `versao: 1`) e lido por
`src/paginas/partida/Partida.jsx` e `scripts/ranking.mjs`. Os principais campos:

| Campo | Conteúdo |
| --- | --- |
| `mapa`, `inicio`, `duracaoMin` | mapa (`de_mirage`), início (`yyyy-MM-dd HH:mm`) e duração |
| `timeA`, `timeB`, `placarA`, `placarB`, `logoA`, `logoB` | times, placar e logos |
| `serie` | formato, índice do mapa (`atual`), vitórias e lista de mapas (lado/faca), ou `null` |
| `rounds` | um item por round: time que ganhou, lado (`CT`/`TR`) e motivo (1 bomba, 7 desarme, 12 tempo) |
| `jogadores` | steamId, nome, foto, time e estatísticas (kills, dano, KAST, multi-kills, rating HLTV 1.0) |
| `jogadores[].util` | utilitários: granadas lançadas por tipo, não usadas, dano de HE/fogo (nos inimigos, recebido, em aliados), inimigos/aliados cegos e o tempo, flash assists (partidas antigas não têm; a aba "Utilitários" só aparece quando tem) |
| `demo` | link da demo no GitHub (ou `null`) |
