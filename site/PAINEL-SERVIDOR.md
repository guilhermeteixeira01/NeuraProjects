# Painel do servidor de CS2 (aba "Servidor" em /admin/)

Só o dono vê a aba. O navegador fala com o worker; o worker fala com o agente da VPS (`public/vps/painel.js`) usando um token que nunca sai do worker.

```
navegador ──login Steam──▶ worker (Cloudflare) ──HTTPS + Bearer token──▶ Cloudflare Tunnel ──▶ agente (127.0.0.1:8080) ──▶ CS2
```

## 1. Na VPS

1. Gere o token (guarde: vai na VPS e no worker):
   ```
   openssl rand -hex 32
   ```
2. Copie `public/vps/painel.js` para a VPS (ex.: `/home/steam/painel/painel.js`). Node 18+, sem `npm install`.
3. Crie `/etc/systemd/system/painel-cs2.service` (o modelo completo está no topo do `painel.js`). Pontos principais:
   ```
   Environment=PAINEL_TOKEN=<o token>
   Environment=PAINEL_HOST=127.0.0.1
   Environment=PAINEL_PORTA=8080
   ```
   Depois: `sudo systemctl daemon-reload && sudo systemctl enable --now painel-cs2`
4. Confira (na própria VPS):
   ```
   curl -s -H "Authorization: Bearer <o token>" http://127.0.0.1:8080/api/status
   ```

## 2. Deixar o worker alcançar o agente (Cloudflare Tunnel)

O worker não tem IP fixo, então liberar um IP no `ufw` não funciona, e ele também não chama IP puro com porta. Use um **Cloudflare Tunnel**: a VPS faz uma conexão de saída, sem abrir porta nenhuma.

1. Instale o `cloudflared` na VPS e rode `cloudflared tunnel login`.
2. `cloudflared tunnel create cs2-agente`
3. Crie `/etc/cloudflared/config.yml`:
   ```
   tunnel: cs2-agente
   credentials-file: /root/.cloudflared/<id>.json
   ingress:
     - hostname: cs2-agente.neuraproject.com.br
       service: http://127.0.0.1:8080
     - service: http_status:404
   ```
4. `cloudflared tunnel route dns cs2-agente cs2-agente.neuraproject.com.br`
5. `sudo cloudflared service install` (sobe junto com a VPS).
6. A porta 8080 não precisa estar aberta no firewall (o agente só escuta em 127.0.0.1).

Alternativa: Caddy/Nginx com HTTPS na porta 443. Funciona, mas a porta fica aberta para o mundo e o token é a única proteção.

## 3. No worker

Dentro de `worker/steam-login`:

```
npx wrangler secret put CS2_AGENTE_URL      # https://cs2-agente.neuraproject.com.br
npx wrangler secret put CS2_AGENTE_TOKEN    # o mesmo token da VPS
npx wrangler deploy
```

Para testar local (`npm run dev`), coloque as duas linhas em `.dev.vars` (modelo: `.dev.vars.example`).

## 4. No site

Publique o site normalmente. Entre com a Steam do dono em `/admin/` e abra a aba **Servidor**.

## Plugins depois de atualizar o CS2

A atualização do CS2 (SteamCMD) devolve o `gameinfo.gi` da Valve, sem a linha do Metamod, e os plugins deixam de carregar. O agente corrige sozinho: antes de cada início ele confere o arquivo e, se faltar, põe `Game csgo/addons/metamod` logo acima de `Game csgo` (a cópia original fica em `gameinfo.gi.original-valve`). O botão **Corrigir plugins** da aba Servidor faz a mesma conferência na hora; a correção vale na próxima vez que o servidor abrir (reinicie se ele já estava rodando). Se a pasta `game/csgo/addons/metamod` não existir, o agente avisa no console e não mexe no arquivo.

## Console em tempo real e respostas dos comandos

O CS2, quando a saída vai para um "pipe", junta as mensagens num bloco e só entrega quando o bloco enche ou quando ele fecha: o console do painel ficava parado e comandos como `css_plugins list` pareciam não responder. O agente agora abre o CS2 dentro de um terminal de mentira (pelo programa `script`, que já vem no Ubuntu), e o CS2 passa a escrever linha por linha, na hora. Se o `script` não existir na VPS, o agente volta ao modo antigo (e avisa no console); `Environment=CS2_PTY=0` no serviço desliga o terminal de mentira de propósito. Depois de atualizar o `painel.js`, **reinicie o CS2** pelo painel (o terminal de mentira só vale para o CS2 aberto pelo agente novo).

O painel pinta o texto: níveis (`[ERROR]`, `[WARN]`, `[INFO]`), `[#1:LOADED]` dos plugins, textos entre aspas, arquivos de config (`core.json`), versões e as linhas `chave = valor` das configs. Se o programa mandar cores próprias (códigos ANSI), elas são respeitadas.

## Erros que a aba mostra

| Mensagem | Causa |
|---|---|
| "O worker ainda não tem CS2_AGENTE_URL…" | faltam os secrets do passo 3 |
| "Não consegui falar com a VPS" | agente parado, Tunnel fora do ar ou URL errada |
| "A VPS não respondeu em 10 segundos" | timeout do proxy |
| "A VPS recusou o token" | `CS2_AGENTE_TOKEN` diferente de `PAINEL_TOKEN` |
| "O servidor está …" (409) | a ação não vale no estado atual (ex.: iniciar com o servidor rodando) |

## Segurança

- Trocar o token: gere outro, atualize `PAINEL_TOKEN` na VPS (`systemctl restart painel-cs2`) e o secret no worker.
- Iniciar, parar, reiniciar e comandos aparecem na aba Logs (do comando só a primeira palavra é registrada).
- `public/vps/painel.js` é servido publicamente pelo site (não tem segredo nenhum). Se preferir, tire a pasta `vps` de `public/`.
