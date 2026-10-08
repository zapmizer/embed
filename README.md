# @zapmizer/embed

Abre a conversa e a caixa de entrada do Zapmizer num iframe e segue o protocolo do embed (eventos, reabertura, retomada, keepalive, logout) sem que o app precise conhecê-lo. Não tem dependência de runtime nem estilo visual: a lib entrega estado, e o app desenha carregando e erro.

## Instalação

O `dist/` vem commitado, porque instalar pelo GitHub não roda o build. O pacote instalado traz só o `dist/`; a doc fica no GitHub, em `docs/` da tag que você fixou. Fixe a versão pela tag:

```bash
bun add github:zapmizer/embed#v0.1.2
```

Cada módulo tem o seu caminho; não existe import da raiz.

| Caminho | O que traz |
| --- | --- |
| `@zapmizer/embed/conversation` | `createConversation` |
| `@zapmizer/embed/inbox` | `createInbox` |
| `@zapmizer/embed/host` | `createInboxHost` (caixa persistente em SPA) |
| `@zapmizer/embed/logout` | `endEmbeds`, `listenToLogout` |
| `@zapmizer/embed/errors` | `actionFor`, `codeForRefusal`, `defaultMessages` |
| `@zapmizer/embed/resume` | `ResumeStorage`, `resumeKey` |
| `@zapmizer/embed/state` | tipos: `EmbedState`, `EmbedAction`, `OpenSession`, `SessionOpened`, `SessionRefused`, `KeepAlive`, `FrameOptions`, `Clock` |
| `@zapmizer/embed/vue` | `EmbedConversation`, `useInboxHost`, `useInboxSlot` (Vue >= 3.3) |

## Em uma tela

```ts
import { createConversation } from '@zapmizer/embed/conversation'

const conversation = createConversation({
  container: document.querySelector('#conversa'),
  brand: 'zapmizer',
  openSession, // chama o endpoint de sessão do backend do app
  onState: (state) => render(state),
})
```

- O backend do app cria a sessão na API com a chave da integração e devolve `{ url, origin, resume_url?, resume_until? }`. A lib lê o erro em `code`, e `401`/`419` querem dizer que a sessão do próprio app caiu. Leia [docs/backend.md](docs/backend.md) antes de começar.
- O estado diz o que desenhar: carregando, pronto, ou erro com a ação do botão (`retry`, `reload`, `reconnect`, `checkout`). Veja [docs/estados-e-erros.md](docs/estados-e-erros.md).

## Documentação

A doc fica em [`docs/`](docs) e acompanha cada tag: pela tag que o app fixou, você lê a doc daquela versão.

- [Começando](docs/comecando.md)
- [Backend: o endpoint de sessão](docs/backend.md)
- [Conversa](docs/conversa.md)
- [Caixa de entrada](docs/caixa-de-entrada.md)
- [Caixa em SPA](docs/caixa-em-spa.md)
- [Vue](docs/vue.md)
- [Logout e multi-aba](docs/logout-e-multiaba.md)
- [Estados e erros](docs/estados-e-erros.md)
- [Testes no app](docs/testes.md)

Exemplos completos em [`examples/`](examples): sem framework (serve a apps legados), Vue, e o backend em Laravel e em JavaScript puro.

## Desenvolvimento

```bash
bun install
bun run test
bun run typecheck
bun run typecheck:examples
bun run build
```

`bun run build` gera o `dist/`, que vai junto no commit. O happy-dom imprime avisos sobre o flag `allow-storage-access-by-user-activation` do `sandbox`; são inofensivos.
