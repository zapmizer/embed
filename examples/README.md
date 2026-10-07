# Exemplos

Curtos e completos. Os arquivos `.ts` compilam contra `src/` (`bun run typecheck:examples`, que roda na CI), e `vanilla/conversation.test.ts` roda no `bun run test`, importando o `dist/` como um app importaria. Os `.vue` e os `.php` não passam por esse typecheck.

| Pasta | O que mostra |
| --- | --- |
| [`shared/`](shared) | `openSession` e `keepAlive` com `fetch`, e um `renderState` que desenha carregando, erro e o botão de cada ação. |
| [`vanilla/`](vanilla) | Sem framework: conversa, caixa numa página sem SPA, host persistente num SPA e logout. Serve a um app legado (AngularJS, jQuery): chame `mount…`/`enterInboxScreen` ao montar e a função devolvida ao desmontar. |
| [`vue/`](vue) | Host persistente com `useInboxHost`/`useInboxSlot` e `EmbedConversation` com a receita de altura. O `App.vue` usa `vue-router`. |
| [`laravel/`](laravel) | O endpoint de sessão e o keepalive no backend. |
| [`node/`](node) | O mesmo endpoint em JavaScript puro, com `fetch`. |

Os exemplos usam `brand: 'zapmizer'` e a API em `https://app.zapmizer.com/api/`.

O contrato do backend está em [`docs/backend.md`](../docs/backend.md).
