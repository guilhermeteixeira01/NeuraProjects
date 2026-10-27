# Retratos do Hall

O jogador escolhe uma camisa e envia a foto. Um admin aprova a imagem em
Hall da Fama, no painel. Somente então o Durable Object chama Workers AI
com a foto e a camisa. O retrato é recortado, salvo e publicado no card.

## Configuração

O binding `AI` está em `wrangler.toml`; não precisa de chave da OpenAI.
Mantenha a conta Workers no plano **Free** para que a Cloudflare bloqueie
o uso acima da franquia gratuita. Não há fallback para outro provedor.

Além da franquia da conta, `hall-cota.js` limita o Hall a **10 tentativas
por dia**, compartilhadas entre todos os jogadores. Tentativas que falham
também contam. A reserva é atômica e idempotente por pedido/tentativa.
Pedidos aprovados além da cota aguardam a próxima virada de dia UTC
(21h de Brasília). O erro 3036 da Cloudflare também agenda o dia seguinte.
Outros erros preservam o retrato anterior e permitem até três tentativas
explícitas do admin por envio. Tentativas antigas da OpenAI não contam
para esse limite quando o pedido é aprovado novamente na Cloudflare.

Modelo: `@cf/black-forest-labs/flux-2-klein-4b`, saída 768×1152.
As duas referências são reduzidas a no máximo 480 pixels por lado e
enviadas em multipart. O fundo verde é removido no servidor, sem segunda
API. Resultado sem fundo adequado não é publicado. A IA pode variar
traços e detalhes da camisa; a qualidade depende da foto enviada.

Fotos originais ficam privadas e aparecem somente na revisão administrativa.
O retrato publicado respeita a privacidade do perfil e mantém a autenticação
nas imagens protegidas. A prévia local continua simulada e não chama a IA.

## Validação

Na raiz: `node --test site/worker/steam-login/test/*.test.mjs`.
Em `site`: `npm run build`.
Em `site/worker/steam-login`: `npx wrangler deploy --dry-run`.

Documentação oficial:
- https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
