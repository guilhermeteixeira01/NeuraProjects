# Site da Neura (React)

O site inteiro (neuraproject.com.br) é um projeto React + Vite com uma página por entrada.

| Página | Endereço | Código |
| --- | --- | --- |
| Início | `/` | `src/paginas/inicio/` |
| Launcher | `/launcher/` | `src/paginas/launcher/` |
| Pick & Ban | `/neurapick/` | `src/paginas/neurapick/` |
| Partidas | `/partidas/` | `src/paginas/partidas/` |
| Página de uma partida | `/partidas/<org>/<md>/<partida>/` | `src/paginas/partida/` |
| Ranking | `/ranking/` | `src/paginas/ranking/` |
| Perfil do jogador | `/perfil/?id=<SteamID64>` | `src/paginas/perfil/` |
| Lista de times | `/times/` | `src/paginas/times/` |
| Painel de anúncios | `/admin.html` | `src/paginas/admin/` |

Menu, rodapé, avisos de novidade e configuração (Discord, launcher...) ficam em `src/comum/`.
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

As molduras ficam em `public/assets/molduras/<coleção>/<nome>.png` (APNG 288x288, animado) com uma miniatura
parada `.webp` (144x144) ao lado, e a lista em `src/comum/molduras.js`. Para adicionar uma: coloque os dois
arquivos e uma linha na lista.

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
