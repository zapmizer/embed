# Conversa

A conversa mostra o histórico de um cliente e deixa o atendente responder sem sair da tela do app. Exemplo completo: [`examples/vanilla/conversation.ts`](../examples/vanilla/conversation.ts) (sem framework) e [`examples/vue/CustomerConversation.vue`](../examples/vue/CustomerConversation.vue).

```ts
import { createConversation } from '@zapmizer/embed/conversation'

const conversation = createConversation({
  container: document.querySelector('#conversa .iframe')!,
  brand: 'zapmizer',
  openSession,
  onState: (state) => render(state),
  onResize: (height) => (wrapper.style.height = `${Math.min(800, Math.max(320, height))}px`),
  onMessageSent: (messageId) => refreshTimeline(messageId),
  frame: { configure: (iframe) => iframe.classList.add('conversa-iframe') },
})

conversation.state // o EmbedState atual
conversation.reopen()
conversation.retry()
conversation.destroy()
```

## Opções

| Opção | Obrigatória | O que faz |
| --- | --- | --- |
| `container` | sim | Elemento onde o iframe é inserido. |
| `brand` | sim | `'zapmizer'`. Veja [o `brand`](comecando.md#o-brand). |
| `openSession` | sim | Pede uma sessão ao backend do app. Veja [Backend](backend.md). |
| `onState` | sim | Recebe cada `EmbedState`. Veja [Estados e erros](estados-e-erros.md). |
| `onResize` | não | Recebe a altura do conteúdo, crua, em pixels. |
| `onMessageSent` | não | Recebe o `message_id` da mensagem que o atendente mandou. |
| `frame` | não | `{ title?, configure? }`. `configure(iframe)` roda antes do iframe entrar no DOM. |
| `readyTimeoutMs` | não | Quanto esperar o `ready` do iframe. Padrão: 45 000. |
| `clock` | não | Relógio próprio, para testes. Veja [Testes no app](testes.md). |

## O ciclo

1. Ao criar, a lib chama `openSession` e o estado é `opening`.
2. Com a sessão, monta o iframe e o estado vira `loading`.
3. Quando o iframe avisa `ready`, o estado vira `ready`.
4. Se o `ready` não chega no prazo, o estado vira `error` com `ready_timeout` e o iframe continua montado (`frame: 'loading'`). Um `ready` atrasado ainda vence.

A lib não estiliza nada. O iframe recebe só `src`, `sandbox`, `allow="clipboard-write"` e `title` (padrão: `Conversa no WhatsApp`, ou o `frame.title`). Largura, altura e borda ficam com o app, pelo `frame.configure`.

## Altura

A conversa informa a altura do conteúdo pelo `onResize`, desde o `loading`. O valor chega cru, e o limite é do app. Uma receita que funciona: um wrapper `position: relative` com a altura limitada, e o iframe em `position: absolute; inset: 0`, ocupando o wrapper inteiro.

```ts
const frame = {
  configure: (iframe: HTMLIFrameElement) =>
    Object.assign(iframe.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' }),
}
```

## Tema: `reopen()`

A aparência é escolhida quando a sessão é criada. Para trocá-la (por exemplo, o tema), chame `reopen()`: a lib pede uma sessão nova e mantém o iframe velho montado (`opening` com `frame: 'stale'`) até a nova chegar. O `openSession` precisa ler o tema na hora da chamada, não na criação.

`reopen()` funciona em `opening`, `loading`, `ready` e em `error` com ação `retry`. Em erro com outra ação, não faz nada.

## `retry()`

Só tem efeito em `error`: tira o iframe e abre uma sessão nova. Use no botão da ação `retry`.

## Mensagem enviada

`onMessageSent` é chamado quando o atendente manda uma mensagem pela conversa já pronta, com o `message_id` (texto ou número). Serve para atualizar a linha do tempo do app.

## Quando a sessão acaba

- `session_expired` com a conversa pronta: a lib abre uma sessão nova sozinha, sobre o iframe velho. Se a última reabertura automática foi há menos de um minuto, mostra o erro `session_expired`, com ação `retry`.
- `session_expired` antes do `ready`, `session_revoked` e `subscription_required`: erro, e o iframe sai.
- `session_replaced` não se aplica à conversa e é ignorado.

## `destroy()`

Tira o iframe, para de ouvir mensagens e publica `closed`. Chame ao sair da tela. O [logout](logout-e-multiaba.md) também fecha a conversa.
