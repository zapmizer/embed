# @zapmizer/embed

Abre a conversa e a caixa de entrada da Parli/Zapmizer num iframe e segue o protocolo do embed (eventos, reabertura, retomada, keepalive, logout) sem que o app precise conhecê-lo. Não tem dependência de runtime nem estilo visual: a lib entrega estado, e o app desenha carregando e erro.

## Instalação

O `dist/` vem commitado, porque instalar por git URL não roda o build.

```bash
bun add git+ssh://git@github.com/zapmizer/embed.git
```

Enquanto o repo só existe na máquina:

```bash
bun add git+file:///home/aqu1les/zapmizer/embed
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

## O que o app implementa

```ts
const openSession: OpenSession = async () => {
  const response = await fetch('/zapmizer/embed-session', { method: 'POST', headers: { 'X-CSRF-TOKEN': csrf } })
  const body = await response.json()

  if (!response.ok) {
    throw { status: response.status, code: body.code ?? null, retryAfter: Number(response.headers.get('Retry-After')) || undefined }
  }

  return body
}

const keepAlive: KeepAlive = async () => {
  const response = await fetch('/keepalive')

  if (!response.ok) {
    throw { status: response.status }
  }
}
```

- `openSession` resolve com `{ url, origin, resume_url?, resume_until? }`, que é a resposta do backend do app. Para recusar, rejeita com `{ status, code, retryAfter? }`; qualquer outro erro conta como falha de rede (`unavailable`). Uma resposta sem `url` http(s) na `origin` informada também vira `unavailable`.
- `keepAlive` rejeita com `{ status }`. `401` e `419` fecham a caixa e apagam toda retomada; o resto é ignorado.

## Estado

```ts
type EmbedState =
  | { status: 'opening'; frame: 'none' | 'stale' }
  | { status: 'loading'; frame: 'loading' }
  | { status: 'ready'; frame: 'live' }
  | { status: 'error'; frame: 'none' | 'loading'; code: string; action: 'retry' | 'reload' | 'reconnect' | 'checkout' | null; retryAfter?: number }
  | { status: 'closed'; frame: 'none' }
```

- `frame: 'stale'` em `opening` quer dizer que o iframe velho continua montado enquanto a sessão nova abre.
- `frame: 'loading'` em `error` é o timeout com o iframe vivo; um `ready` atrasado ainda vence.
- A `action` diz qual botão desenhar:
  - `retry` → chamar `retry()`;
  - `reload` → recarregar a página;
  - `reconnect` → levar à tela de reconectar o WhatsApp;
  - `checkout` → levar à assinatura;
  - `null` → nenhum botão.
- A reabertura automática é da lib e nunca depende da `action`.
- `defaultMessages` (de `@zapmizer/embed/errors`) traz textos pt-BR sem marca, por código. Use se quiser; o texto é do app.

## Conversa

```ts
import { createConversation } from '@zapmizer/embed/conversation'

const conversation = createConversation({
  container: document.querySelector('#conversa'),
  brand: 'parli',
  openSession,
  onState: (state) => render(state),
  onResize: (height) => (wrapper.style.height = `${Math.min(800, Math.max(320, height))}px`),
  onMessageSent: (messageId) => refreshTimeline(messageId),
  frame: { configure: (iframe) => iframe.classList.add('conversa-iframe') },
})

conversation.reopen()
conversation.retry()
conversation.destroy()
```

- `reopen()` é para quando a aparência muda (tema): abre uma sessão nova sobre o iframe velho. Em erro sem `action: 'retry'` não faz nada.
- A altura chega crua; o limite é do app.

## Caixa de entrada sem SPA

```ts
import { createInbox } from '@zapmizer/embed/inbox'

const inbox = createInbox({
  container: document.querySelector('#caixa'),
  brand: 'parli',
  person: `${user.id}:${team.id}`,
  openSession,
  keepAlive,
  onState: render,
})
```

- `person` identifica quem pode retomar a caixa nesta aba. Com `null`, a retomada fica desligada: nada é lido, gravado ou apagado.
- A retomada usa `sessionStorage` por padrão, na chave `${brand}-inbox:${person}`. Para dividir entre abas, passe `storage: window.localStorage`. Assim, a aba que perde a caixa pode voltar para a caixa da outra aba no clique, sem derrubar ninguém.

## Caixa de entrada em SPA (host persistente)

O iframe não pode mudar de lugar no DOM (mover recarrega), nem ser desmontado a cada navegação. O host é uma `div` com `position: fixed` presa ao `body`, que se sobrepõe ao espaço que a tela reserva (o slot). Sem slot, ela fica oculta (`visibility: hidden`, `pointer-events: none`, `inert`, `aria-hidden`) com o iframe vivo, e é descartada depois de 30 min oculta.

O host segue o slot por `ResizeObserver` e pelos eventos `resize` e `scroll` da janela. Se o slot muda de lugar sem mudar de tamanho (por exemplo, ao recolher uma barra lateral), o host não percebe: faça `detach`/`attach` ou dispare um `resize` na janela para recalcular.

### Vue: receita mínima

Na raiz do app, uma vez:

```ts
import { provide } from 'vue'
import { useInboxHost } from '@zapmizer/embed/vue'

const inbox = useInboxHost({
  brand: 'parli',
  openSession,
  keepAlive,
  frame: { configure: (iframe) => Object.assign(iframe.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' }) },
})

Object.assign(inbox.host.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
inbox.host.element.style.zIndex = '5'
inbox.host.element.setAttribute('role', 'region')
inbox.host.element.setAttribute('aria-label', 'Caixa de entrada do WhatsApp')

provide('inbox', inbox)
```

Na tela de atendimento:

```vue
<script setup>
import { computed, inject } from 'vue'
import { useInboxSlot } from '@zapmizer/embed/vue'

const inbox = inject('inbox')
const person = computed(() => `${user.value.id}:${user.value.current_team.id}`)
const enabled = computed(() => page.props.zapmizer_inbox === 'available')
const slot = useInboxSlot(inbox.host, { person, enabled })
</script>

<template>
  <section ref="slot" class="h-full" />
  <Teleport :to="inbox.host.overlay">
    <Carregando v-if="inbox.state.value.status === 'opening' || inbox.state.value.status === 'loading'" />
    <ErroDaCaixa v-else-if="inbox.state.value.status === 'error'" :state="inbox.state.value" @retry="inbox.retry" />
  </Teleport>
</template>
```

- A lib não estiliza o iframe nem o `overlay`. Os dois precisam de `position: absolute; inset: 0`: no iframe isso vai pelo `frame.configure`, no `overlay` direto no elemento. Ligue `pointer-events` no conteúdo que o app desenha dentro do `overlay`.
- `enabled` cobre o acesso que cai e volta sem sair da tela: com `false` o host fecha (some, sem `pointer-events`), e com `true` volta retomando a caixa.
- Com o host `closed` (logout, keepalive `401/419`, 30 min oculto) o `overlay` some junto. Para avisar que a sessão caiu, desenhe na própria página lendo `inbox.state`.

### Vue: conversa

```vue
<script setup>
import { EmbedConversation } from '@zapmizer/embed/vue'
</script>

<template>
  <EmbedConversation :key="theme" brand="parli" :open-session="openSession" />
</template>
```

- `EmbedConversation` lê `brand`, `frame` e `readyTimeoutMs` uma vez, na montagem. Para mudá-los, remonte o componente com um `key`.

### Sem framework

```ts
import { createInboxHost } from '@zapmizer/embed/host'

const host = createInboxHost({ brand: 'parli', openSession, keepAlive, onState: render })

host.attach(slotElement, person)
host.detach(slotElement)
host.close()
```

## Logout

```ts
import { endEmbeds, listenToLogout } from '@zapmizer/embed/logout'

listenToLogout({ brand: 'parli' })

async function logout() {
  endEmbeds({ brand: 'parli' })
  await fetch('/logout', { method: 'POST' })
}
```

- `endEmbeds` fecha toda caixa e conversa da marca nesta aba e apaga toda retomada `${brand}-inbox:*`. Também avisa as outras abas em `BroadcastChannel('${brand}-embed-logout')`.
- O app que já tem canal próprio passa `broadcast: false` e chama `endEmbeds` no próprio handler.

## Desenvolvimento

```bash
bun install
CLAUDECODE=1 bun test
bun run typecheck
bun run build
```

`bun run build` gera o `dist/`, que vai junto no commit. O happy-dom imprime avisos sobre o flag `allow-storage-access-by-user-activation` do `sandbox`; são inofensivos.
