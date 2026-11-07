# Regressao da abertura de caixas

Com o servidor de desenvolvimento em http://127.0.0.1:5174 e uma sessao do playwright-cli aberta:

```sh
playwright-cli -s=regressao run-code --filename site/test/abertura-regressao.browser.js
```

Cobre celular, tablet e desktop; animacoes normal/rapida; respostas lentas; revelacao de faca e luva; imagens carregadas; centralizacao; bordas permanentes; altura constante e ausencia de rolagem horizontal. As respostas sao simuladas somente na API local. Capturas ficam em `.playwright-cli/revisao/`, ignoradas pelo Git.

## Moldura Premium

Com o Vite ativo, abrir `/test/moldura-premium.html`. A página usa a arte e os estilos reais para conferir avatares de 24 a 140 px, cabeçalho do perfil, card do jogador, personalização, menu e admin. O parâmetro opcional `avatar` aceita uma URL de imagem para a revisão visual. Esta página de teste não faz parte do build de produção.

Em cada caso, a foto deve preencher a caixa do avatar, a caixa deve manter a proporção da abertura (392/356) e a camada da arte deve continuar quadrada, sem deformação.
