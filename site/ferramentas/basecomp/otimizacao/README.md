# BaseComp 1.9.1 — aplicação de skins

- Consulta em segundo plano, com o mesmo intervalo configurado (padrão 45 s).
- Revisões calculadas por item fora da thread do jogo: mudar adesivo, etiqueta ou pintura não reaplica luvas, agente e as outras armas.
- Fila executa uma operação por tick e substitui operações antigas da mesma chave pela revisão mais recente.
- Novos jogadores aguardam na fila de consulta quando já existe uma busca ativa. Respostas da sessão/mapa anterior são descartadas.
- Aplicações de agente e luvas são deduplicadas por pawn/revisão. O procedimento nativo das luvas, incluindo `lastinv`, permanece para mudanças reais e respawns; não é disparado por mudanças em outras partes do inventário.
- Callbacks verificam conexão, vida, pawn, mapa, lado e posse da arma antes de alterar entidades.
- O painel do espectador usa cache por item, libera blocos próprios ao desconectar e no unload após remover o hook. O cache permanece válido durante a troca de mapa para não liberar referências ainda usadas pelo jogo.
- Se o unhook falhar, o plugin registra o erro e preserva os blocos em vez de liberar ponteiros que possam estar em uso.

O gerenciamento dos blocos próprios segue o ciclo usado pelo [Inventory Simulator](https://github.com/ianlucas/cs2-css-inventory-simulator/blob/main/source/InventorySimulator/Models/CCSPlayerControllerState.cs). Nenhum ponteiro original do jogo é liberado pelo plugin.

## Fontes e instalação

O código original do BaseComp já está atualizado. Este diretório guarda as fontes revisadas e um instalador que só aceita os hashes da versão de origem inspecionada, ou da versão já instalada. Se houver outras alterações locais, ele para sem gravar arquivos.

`python aplicar.py "CAMINHO_BASECOMP" "PASTA_BACKUP"`

Compile com `dotnet build -c Release`. Instale o DLL com o servidor parado em `addons/counterstrikesharp/plugins/BaseComp/BaseComp.dll` e reinicie. Os arquivos de gamedata e de configuração existentes permanecem os mesmos.

## Verificação

Na raiz do repositório do site:

`dotnet run --project site/ferramentas/basecomp/testes/Skins.Testes.csproj -c Release -p:PluginProject="CAMINHO_ABSOLUTO/BaseComp.csproj"`

Os testes executam o código real de comparação do DLL, fila/coalescimento e liberação única de blocos (com liberador simulado). Incluem 1.000 ciclos de alocar/liberar, ordem diferente no JSON, alteração isolada de arma, adesivo, StatTrak, desgaste, etiqueta, chaveiro, faca, luva e agente.

Esses testes e a compilação não substituem a validação das assinaturas e do comportamento visual dentro de uma partida no CS2. Ainda não há medição de redução de latência no servidor.
