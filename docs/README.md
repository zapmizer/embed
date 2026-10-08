# Documentação do @zapmizer/embed

Esta pasta vai junto com o código. Ao abrir pela tag que o app fixou (por exemplo `v0.1.1`), você lê a doc daquela versão.

1. [Começando](comecando.md): instalação, módulos e o primeiro iframe.
2. [Backend: o endpoint de sessão](backend.md): o contrato que o servidor do app cumpre, com exemplos em Laravel e em JavaScript puro.
3. [Conversa](conversa.md): `createConversation`, altura, tema e `message_sent`.
4. [Caixa de entrada](caixa-de-entrada.md): `createInbox` numa página sem SPA, keepalive e retomada.
5. [Caixa em SPA](caixa-em-spa.md): `createInboxHost`, o host persistente que sobrevive à navegação.
6. [Vue](vue.md): `EmbedConversation`, `useInboxHost` e `useInboxSlot`.
7. [Logout e multi-aba](logout-e-multiaba.md): `endEmbeds`, `listenToLogout` e a caixa disputada entre abas.
8. [Estados e erros](estados-e-erros.md): `EmbedState`, e a tabela de código, ação e texto padrão.
9. [Testes no app](testes.md): como testar a integração sem o Zapmizer no ar.

Exemplos completos ficam em [`examples/`](../examples).
