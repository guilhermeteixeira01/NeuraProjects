# Teste local do lobby / fila / Pick & Ban

Roda tudo na sua máquina, sem tocar na produção: worker local (Durable Object e KV de teste), site em modo `teste`
e 10 jogadores de teste (2 são você, 8 são bots controlados por script). Os dados locais ficam em `worker/steam-login/.wrangler/`
e o segredo de teste em `.dev.vars` (os dois ficam fora do git).

Tudo dentro de `site/`, em terminais separados:

1. `npm run teste:local -- preparar`   cria o `.dev.vars`, cadastra os 10 como amigos e imprime 2 links de login
2. `npm run worker:local`              worker em http://localhost:8787
3. `npm run dev:local`                 site em http://localhost:5173 apontando para o worker local
4. Abra o link do Jogador 1 em `localhost:5173` e o do Jogador 2 em `127.0.0.1:5173` (ou numa janela anônima).
   Endereços diferentes guardam logins diferentes.
5. `npm run teste:local -- bots`       os 8 bots entram nos lobbies (4 em cada) → 5/5
6. Clique em BUSCAR PARTIDA nas duas janelas. Achou: aparece o botão ACEITAR em cada uma.
7. `npm run teste:local -- aceitar`     os bots aceitam; você aceita pelo navegador → 10 bolinhas → sala de Pick & Ban.

Com uma janela só: `npm run teste:local -- buscar2` faz o Jogador 2 buscar, e `-- veto2` joga a vez dele no veto.

Recomeçar do zero: pare o worker, `npm run teste:local -- limpar`, e repita desde o passo 1.
Se mexer em `src/amigos.js`, o `wrangler dev` recarrega sozinho; o estado do lobby é mantido (use `limpar` se travar).
