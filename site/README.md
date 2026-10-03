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
- `../assets/data/times.json` — lista de times, editada na página `/times/`. O plugin também lê
  esse arquivo, então ele não muda de lugar.

## Deploy

Todo push na `main` (e toda partida enviada pelo plugin) roda `.github/workflows/deploy.yml`:
build do site e depois `scripts/gerar-site.mjs`, que copia os dados, gera o ranking
(`scripts/ranking.mjs`), cria a página de cada partida e escreve o HTML de todas as páginas já com
o conteúdo (bom para o Google). No navegador o React assume esse HTML.

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
| `demo` | link da demo no GitHub (ou `null`) |
