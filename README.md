# Neura Project

Site do estúdio Neura Project: **[neuraproject.com.br](https://neuraproject.com.br)**.

| Página | O que é |
| --- | --- |
| [Início](https://neuraproject.com.br/) | Apresentação do estúdio e dos projetos |
| [Pick & Ban](https://neuraproject.com.br/neurapick/) | NeuraPick: veto de mapas do CS2 (MD1, MD3, MD5) que gera o comando `css_serie` para o servidor |
| [Partidas](https://neuraproject.com.br/partidas/) | Histórico das partidas do servidor de CS2, com a página de estatísticas de cada mapa |
| [Ranking](https://neuraproject.com.br/ranking/) | Top 15 jogadores somando todas as partidas, com o CS Rating do Premier (via Leetify) |
| [Launcher](https://neuraproject.com.br/launcher/) | Neura Launcher (em breve) |
| [Times](https://neuraproject.com.br/times/) | Lista de times (nome e logo) usada pelo Pick & Ban e pelo servidor |

## Pastas

```
site/       site inteiro em React + Vite (código, imagens, scripts de build) — veja site/README.md
partidas/   dados das partidas, enviados pelo plugin BaseComp do servidor de CS2
assets/data/times.json   lista de times (editada na página /times/; o plugin também lê daqui)
.github/workflows/deploy.yml   build e publicação no GitHub Pages
```

`partidas/` e `assets/data/` são **dados**: o servidor de CS2 e a página `/times/` escrevem neles
pela API do GitHub. Não mude esses caminhos.

## Como as partidas chegam ao site

1. Um mapa termina no servidor; o plugin **BaseComp** grava as estatísticas e manda para este
   repositório (um commit por mapa):
   - `partidas/<org>/<md1|md3|md5|normal>/<partida>/partida.json` — dados do mapa
   - `partidas/partidas.json` — histórico (uma linha por mapa)
   - a demo vai como release do repositório (`demo-<partida>`)
2. O commit dispara o deploy, que gera a página de cada partida, o ranking e o resto do site.
3. As páginas de uma mesma série (MD3/MD5) se ligam: cada uma mostra o placar da série, o resultado
   e o link dos mapas já jogados, e os que faltam como "A jogar" (ou "Não jogado" se a série acabou).

## Rodar localmente

```bash
cd site
npm install
npm run dev
```

Mais detalhes (estrutura, comandos e deploy) em [site/README.md](site/README.md).
