# @zapmizer/embed

Abre a conversa e a caixa de entrada do Zapmizer num iframe e segue o protocolo do embed (eventos, reabertura, retomada, keepalive, logout) sem que o app precise conhecê-lo. Não tem dependência de runtime nem estilo visual: a lib entrega estado, e o app desenha carregando e erro.

## Instalação

O `dist/` vem commitado, porque instalar pelo GitHub não roda o build. Fixe a versão pela tag:

```bash
bun add github:zapmizer/embed#v0.1.0
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
- Erro do axios funciona direto, sem conversão: com `response`, o status vem de `response.status` e o código de `response.data.code` (o `code` do próprio erro, como `ERR_BAD_REQUEST`, é ignorado). Sem `response` (rede caída, timeout), vira falha de rede: `unavailable` com `retry`. O `Retry-After` só é lido no formato `{ status, code, retryAfter }`.
- Um `onState`, `onResize` ou `onMessageSent` que lança não quebra a lib: o estado segue, a limpeza acontece e o erro é relançado depois, numa microtask, para aparecer no console ou no monitor de erros do app.

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
  brand: 'zapmizer',
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
  brand: 'zapmizer',
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
  brand: 'zapmizer',
  openSession,
  keepAlive,
  person: () => (user.value ? `${user.value.id}:${user.value.current_team.id}` : null),
  enabled: () => page.props.zapmizer_inbox === 'available',
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
- Passe o mesmo `person` e `enabled` para o `useInboxHost` na raiz. Assim o host fecha mesmo com o usuário em outra tela, onde nenhum slot está montado: troca de time, outro usuário, logout (`person` vira `null`) ou acesso indisponível (`enabled` vira `false`). A caixa é destruída sem pedir sessão nova, e a retomada fica guardada.
- Com o host `closed` (logout, keepalive `401/419`, 30 min oculto) o `overlay` some junto. Para avisar que a sessão caiu, desenhe na própria página lendo `inbox.state`.

### Vue: conversa

```vue
<script setup>
import { EmbedConversation } from '@zapmizer/embed/vue'
</script>

<template>
  <EmbedConversation :key="theme" brand="zapmizer" :open-session="openSession" />
</template>
```

- `EmbedConversation` lê `brand`, `frame` e `readyTimeoutMs` uma vez, na montagem. Para mudá-los, remonte o componente com um `key`.
- O slot padrão recebe `{ state, retry, reopen, height }`: `state` é o `EmbedState`, `retry` e `reopen` são os da conversa, e `height` é a última altura crua que a conversa informou (`null` antes da primeira).
- O evento `message-sent` traz o `message_id` da mensagem que o atendente mandou.

Receita de altura: o componente renderiza uma `div` sem estilo para o iframe, seguida do slot. Envolva o componente num wrapper `position: relative` e dê a ele a altura limitada pelo app, desenhando no slot um espaçador com essa altura. O iframe vai em `position: absolute; inset: 0` pelo `frame.configure` e ocupa o wrapper inteiro:

```vue
<script setup>
import { EmbedConversation } from '@zapmizer/embed/vue'

const frame = { configure: (iframe) => Object.assign(iframe.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' }) }
const clamp = (height) => `${Math.min(800, Math.max(320, height ?? 480))}px`
</script>

<template>
  <div style="position: relative">
    <EmbedConversation brand="zapmizer" :open-session="openSession" :frame="frame" @message-sent="refreshTimeline">
      <template #default="{ state, retry, height }">
        <div :style="{ height: clamp(height) }" />
        <ErroDaConversa v-if="state.status === 'error'" class="absolute inset-0" :state="state" @retry="retry" />
      </template>
    </EmbedConversation>
  </div>
</template>
```

### Sem framework

```ts
import { createInboxHost } from '@zapmizer/embed/host'

const host = createInboxHost({ brand: 'zapmizer', openSession, keepAlive, onState: render })

host.attach(slotElement, person)
host.detach(slotElement)
host.close()
```

## Logout

```ts
import { endEmbeds, listenToLogout } from '@zapmizer/embed/logout'

listenToLogout({ brand: 'zapmizer' })

async function logout() {
  endEmbeds({ brand: 'zapmizer' })
  await fetch('/logout', { method: 'POST' })
}
```

- `endEmbeds` fecha toda caixa e conversa da marca nesta aba e apaga toda retomada `${brand}-inbox:*`. Também avisa as outras abas em `BroadcastChannel('${brand}-embed-logout')`.
- O app que já tem canal próprio passa `broadcast: false` e chama `endEmbeds` no próprio handler.
- Sem `storage`, `endEmbeds` e `listenToLogout` apagam a retomada só no `sessionStorage`. O app que passou outro `storage` para `createInbox`, `createInboxHost` ou `useInboxHost` (por exemplo `window.localStorage`) precisa passar o mesmo `storage` aos dois: `endEmbeds({ brand: 'zapmizer', storage: window.localStorage })` e `listenToLogout({ brand: 'zapmizer', storage: window.localStorage })`.
- Um embed que falha ao fechar não impede os outros: todos fecham e a retomada é apagada.

## Desenvolvimento

```bash
bun install
bun run test
bun run typecheck
bun run build
```

`bun run build` gera o `dist/`, que vai junto no commit. O happy-dom imprime avisos sobre o flag `allow-storage-access-by-user-activation` do `sandbox`; são inofensivos.
