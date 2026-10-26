# Regressao da abertura de caixas

Com o servidor de desenvolvimento em http://127.0.0.1:5174 e uma sessao do playwright-cli aberta:

```sh
playwright-cli -s=regressao run-code --filename site/test/abertura-regressao.browser.js
```

Cobre celular, tablet e desktop; animacoes normal/rapida; respostas lentas; revelacao de faca e luva; imagens carregadas; centralizacao; bordas permanentes; altura constante e ausencia de rolagem horizontal. As respostas sao simuladas somente na API local. Capturas ficam em `.playwright-cli/revisao/`, ignoradas pelo Git.
