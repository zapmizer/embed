# Testes no app

A lib não fala com a rede: ela chama o `openSession` e o `keepAlive` do app e ouve `postMessage` do iframe. Num teste, o app troca os dois por funções falsas e manda as mensagens do iframe à mão, sem o Zapmizer no ar. Exemplo que roda: [`examples/vanilla/conversation.test.ts`](../examples/vanilla/conversation.test.ts).

## Ambiente

Precisa de um DOM com `iframe.contentWindow`, `MessageEvent`, `sessionStorage` e, para o host, `ResizeObserver`. A lib é testada com happy-dom, registrado num preload do `bun test`:

```toml
# bunfig.toml
[test]
preload = ["./test/dom.ts"]
```

```ts
// test/dom.ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({
  url: 'http://app.test/',
  settings: {
    fetch: {
      // O iframe carrega o `src` da sessão. Responda com uma página vazia, sem ir à rede.
      interceptor: {
        beforeAsyncRequest: async ({ window }) => new window.Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      },
    },
  },
})
```

- **Não desligue o carregamento do iframe** (`disableIframePageLoading`). Sem ele, `iframe.contentWindow` fica `null`, e a lib ignora toda mensagem do iframe sem avisar.
- **Registre o DOM antes de importar o Vue.** O `runtime-dom` lê o `document` quando carrega. O preload garante a ordem.
- O interceptor responde a **todo** `fetch` do happy-dom, inclusive o do `openSession` e do `keepAlive` do app. Num teste do front, troque o `fetch` global por um falso (como no exemplo); senão a sessão chega como `{}` e o estado vira `unavailable`, sem pista do motivo.
- O happy-dom troca `fetch`, `Response` e `AbortSignal` globais pelos dele. Um backend Bun ou Node no mesmo processo quebra sem avisar: o `Bun.serve` recusa a `Response` do happy-dom, e o `fetch` do runtime recusa o `AbortSignal.timeout` dele. O exemplo em Node pega esse erro como falha de rede e devolve `503 unavailable`. Teste o backend sem o preload (outro `bun test`, com outro `bunfig`), ou guarde os três globais antes do registro e passe-os ao backend.
- O happy-dom imprime avisos sobre o flag `allow-storage-access-by-user-activation` do `sandbox`; são inofensivos.

O exemplo [`examples/vanilla/conversation.test.ts`](../examples/vanilla/conversation.test.ts) roda com esse preload.

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

Prazos e intervalos (o `ready` em 45 s, o keepalive a cada 15 min, a caixa oculta descartada em 30 min) passam por um `Clock`, o tipo de `@zapmizer/embed/state`. Passe um relógio falso na opção `clock` para avançar o tempo sem esperar.

`now()` é em milissegundos desde a época, como `Date.now()`: a lib compara esse valor com o `resume_until` da sessão. Um relógio que começa em `0` faz toda retomada parecer válida para sempre. Comece numa data perto das sessões do teste.

```ts
import type { Clock } from '@zapmizer/embed/state'

export function fakeClock(start = Date.parse('2026-10-07T12:00:00Z')) {
  let current = start
  let nextId = 0
  const timers = new Map<number, { at: number; every: number | null; callback: () => void }>()

  const schedule = (ms: number, every: number | null, callback: () => void) => {
    const id = ++nextId

    timers.set(id, { at: current + ms, every, callback })

    return () => void timers.delete(id)
  }

  const clock: Clock = {
    now: () => current,
    after: (ms, callback) => schedule(ms, null, callback),
    every: (ms, callback) => schedule(ms, ms, callback),
  }

  // Avança o tempo, disparando os timers na ordem.
  function advance(ms: number) {
    const target = current + ms

    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort(([, a], [, b]) => a.at - b.at)[0]

      if (due === undefined) {
        break
      }

      const [id, timer] = due

      current = timer.at

      if (timer.every === null) {
        timers.delete(id)
      } else {
        timer.at += timer.every
      }

      timer.callback()
    }

    current = target
  }

  return { ...clock, advance }
}
```

## A retomada

A caixa grava a retomada no `sessionStorage` da página. Para isolar os testes, passe um `storage` em memória (qualquer objeto com `getItem`, `setItem`, `removeItem`, `key` e `length`) ou limpe o `sessionStorage` entre eles. Com `person: null`, a retomada fica desligada.

## Outra aba

O logout chega às outras abas pelo `BroadcastChannel('zapmizer-embed-logout')`, com a mensagem `'logout'`. Quem ouve não lê o conteúdo. Para simular o logout feito em outra aba, poste no canal:

```ts
const channel = new BroadcastChannel('zapmizer-embed-logout')

channel.postMessage('logout')
channel.close()
```

## Entre um teste e outro

Um embed que o teste não destruiu continua ouvindo as mensagens da janela e registrado para o logout. Chame `destroy()` em cada embed (e no host) ao fim do teste e limpe o `document.body`.
