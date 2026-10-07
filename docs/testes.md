# Testes no app

A lib não fala com a rede: ela chama o `openSession` e o `keepAlive` do app e ouve `postMessage` do iframe. Num teste, o app troca os dois por funções falsas e manda as mensagens do iframe à mão, sem o Zapmizer no ar. Exemplo que roda: [`examples/vanilla/conversation.test.ts`](../examples/vanilla/conversation.test.ts).

## Ambiente

Precisa de um DOM com `iframe.contentWindow`, `MessageEvent`, `sessionStorage` e, para o host, `ResizeObserver`. A lib é testada com happy-dom. Ele imprime avisos sobre o flag `allow-storage-access-by-user-activation` do `sandbox`; são inofensivos.

O iframe recebe o `src` da sessão, e o DOM de teste pode tentar carregá-lo. Use uma URL de teste e, se o ambiente for buscar, intercepte. Veja como a lib faz com happy-dom em [`test/support/dom.ts`](../test/support/dom.ts).

## A sessão falsa

`openSession` é só uma função. Resolva com a sessão, ou rejeite com a recusa:

```ts
const openSession = async () => ({ url: 'https://app.zapmizer.com/embed/start/abc', origin: 'https://app.zapmizer.com' })
const refused = async () => Promise.reject({ status: 422, code: 'reauth_required' })
```

A lib chama o `openSession` na criação e trata a resposta de forma assíncrona. Espere antes de conferir o iframe:

```ts
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
```

Para testar o `openSession` de verdade do app (o que traduz o `fetch`), troque o `fetch` por um falso que devolve as respostas do backend: `200` com a sessão, `422` com `code`, `419` do CSRF, `429` com `Retry-After`. O exemplo faz isso.

## As mensagens do iframe

A lib só aceita uma mensagem que vem do `contentWindow` do iframe que ela montou, com a `origin` da sessão e `source: 'zapmizer-embed'`:

```ts
function fromIframe(container: HTMLElement, data: Record<string, unknown>) {
  const iframe = container.querySelector('iframe')

  window.dispatchEvent(
    new MessageEvent('message', {
      origin: 'https://app.zapmizer.com',
      source: iframe?.contentWindow ?? null,
      data: { source: 'zapmizer-embed', ...data },
    }),
  )
}

fromIframe(container, { type: 'ready' })
fromIframe(container, { type: 'resize', height: 640 })
fromIframe(container, { type: 'message_sent', message_id: 123 })
fromIframe(container, { type: 'session_expired' })
```

| `type` | Campos | Efeito |
| --- | --- | --- |
| `ready` | | `loading` → `ready`. |
| `resize` | `height` (número) | `onResize` na conversa. A caixa ignora. |
| `message_sent` | `message_id` (texto ou número) | `onMessageSent` na conversa pronta. A caixa ignora. |
| `session_expired` | | Reabertura ou erro. Veja [Conversa](conversa.md#quando-a-sessão-acaba) e [Caixa](caixa-de-entrada.md#quando-a-sessão-acaba). |
| `session_revoked` | | Erro `session_revoked`. |
| `subscription_required` | | Erro `subscription_required`. |
| `session_replaced` | | Erro `session_replaced` na caixa. A conversa ignora. |

Mensagem de outro `source`, de outra origem ou de outro iframe é ignorada.

## O relógio

Prazos e intervalos (o `ready` em 45 s, o keepalive a cada 15 min, a caixa oculta descartada em 30 min) passam por um `Clock`. Passe um relógio falso na opção `clock` para avançar o tempo sem esperar:

```ts
// O tipo `Clock`, de @zapmizer/embed/state.
type Clock = {
  now(): number
  after(ms: number, callback: () => void): () => void // devolve o cancelamento
  every(ms: number, callback: () => void): () => void
}
```

A lib usa um em [`test/support/clock.ts`](../test/support/clock.ts), com `advance(ms)`.

## A retomada

A caixa grava a retomada no `sessionStorage` da página. Para isolar os testes, passe um `storage` em memória (qualquer objeto com `getItem`, `setItem`, `removeItem`, `key` e `length`) ou limpe o `sessionStorage` entre eles. Com `person: null`, a retomada fica desligada.

## Entre um teste e outro

Um embed que o teste não destruiu continua ouvindo as mensagens da janela e registrado para o logout. Chame `destroy()` em cada embed (e no host) ao fim do teste e limpe o `document.body`.
