# Começando

A lib abre a conversa e a caixa de entrada do Zapmizer num iframe e segue o protocolo do embed: eventos, reabertura, retomada, keepalive e logout. Ela não tem dependência de runtime nem estilo visual. Entrega o estado, e o app desenha carregando e erro.

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

## As três peças

1. **O endpoint de sessão, no servidor do app.** Ele chama a API com a chave da integração e devolve `{ url, origin, resume_url?, resume_until? }` ao navegador. A chave nunca vai para o front. Veja [Backend](backend.md).
2. **`openSession`, no front.** Uma função sem argumentos que chama esse endpoint e resolve com o corpo da resposta, ou rejeita com `{ status, code, retryAfter? }`.
3. **O embed.** `createConversation`, `createInbox` ou `createInboxHost` recebem o `openSession`, montam o iframe e avisam o app a cada mudança de estado.

```ts
import { createConversation } from '@zapmizer/embed/conversation'
import type { OpenSession } from '@zapmizer/embed/state'

const openSession: OpenSession = async () => {
  const response = await fetch('/customers/42/zapmizer-embed-session', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
    body: JSON.stringify({ theme: 'light' }),
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw { status: response.status, code: body.code ?? null, retryAfter: Number(response.headers.get('Retry-After')) || undefined }
  }

  return body
}

const conversation = createConversation({
  container: document.querySelector('#conversa')!,
  brand: 'zapmizer',
  openSession,
  onState: (state) => render(state),
})
```

## `openSession` em detalhe

- Resolve com `{ url, origin, resume_url?, resume_until? }`, exatamente o que o backend devolveu. Se a `url` não for http(s), ou se a origem dela não for igual à `origin`, o estado vira `unavailable`.
- Para recusar, rejeita com `{ status, code, retryAfter? }`. Qualquer outro erro conta como falha de rede (`unavailable`).
- Erro do axios funciona direto, sem conversão. Com `response`, o status vem de `response.status` e o código de `response.data.code` (o `code` do próprio erro, como `ERR_BAD_REQUEST`, é ignorado). Sem `response` (rede caída, timeout), vira `unavailable`. O `Retry-After` só é lido no formato `{ status, code, retryAfter }`.

## O `brand`

Passe `brand: 'zapmizer'` em todo embed e no logout. Ele vira o `source` esperado nas mensagens do iframe (`zapmizer-embed`), o prefixo da retomada (`zapmizer-inbox:`) e o canal de logout (`zapmizer-embed-logout`).

## Callbacks que lançam

Um `onState`, `onResize` ou `onMessageSent` que lança não quebra a lib. O estado segue, a limpeza acontece, e o erro é relançado depois, numa microtask, para aparecer no console ou no monitor de erros do app.

## Próximos passos

- [Backend](backend.md), antes de tudo.
- [Conversa](conversa.md) ou [Caixa de entrada](caixa-de-entrada.md), conforme a tela.
- [Estados e erros](estados-e-erros.md), para desenhar carregando e erro.
