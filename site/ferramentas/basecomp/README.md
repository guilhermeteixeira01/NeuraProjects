# Coletor de missões — BaseComp 1.9.0

O site concede as conquistas com base em partidas encerradas e dados confirmados. Para novas partidas, instale o coletor atualizado no servidor CS2. As seis demos históricas disponíveis foram processadas separadamente pelo script `../demos/missoes-das-demos.mjs`.

## Código-fonte

Na pasta do código-fonte do BaseComp 1.8.2, aplique `integracao-missoes.patch` com `git apply --check` e depois `git apply`. Copie também `Missoes.cs` para a mesma pasta do projeto. Compile com `dotnet build -c Release`. O patch integra os contadores ao relatório e atualiza a versão para 1.9.0; não modifica credenciais ou configurações do servidor.

## Instalação

Com o servidor parado, faça uma cópia do DLL anterior e substitua `addons/counterstrikesharp/plugins/BaseComp/BaseComp.dll` pelo DLL 1.9.0. Preserve os arquivos de configuração existentes e reinicie o servidor. O pacote foi compilado com CounterStrikeSharp.API 1.0.376 e .NET 10; confirme que o servidor usa versões compatíveis. A compilação foi verificada; a execução dentro do CS2 precisa ser conferida no servidor.

Configurações opcionais: `MissoesModo` (`auto`, `wingman`, `corrida-armada`, `rush`) e `MissoesTreino` (padrão `false`). No modo automático, 5v5 exige série oficial. Ative `MissoesTreino` em servidores de treino para impedir progresso. Não há coleta por tick; os contadores usam eventos do jogo.

## Administração do site

Em **Admin → Usuários → Missões**, ajuste metas por mapa e os períodos anuais. Os eventos usam Brasília e concedem as insígnias da coleção 2026 depois do encerramento do período iniciado em 2026 (Ano Novo e Verão terminam em 2027). Eventos sem calendário e o mapa Complex Rush sem identificador configurado ficam pendentes, sem conceder indevidamente.

O progresso retroativo utiliza apenas estatísticas verificadas; campos ausentes não são estimados. A entrega no perfil e a notificação têm registro persistente para permitir novas tentativas sem duplicação.
