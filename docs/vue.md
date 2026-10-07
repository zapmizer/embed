# Vue

`@zapmizer/embed/vue` embrulha o núcleo para Vue >= 3.3. Vue é `peerDependency` opcional: só este módulo o importa. Exemplo completo em [`examples/vue`](../examples/vue).

## Caixa: `useInboxHost` e `useInboxSlot`

O [host persistente](caixa-em-spa.md) nasce na raiz do app, uma vez, e cada tela de atendimento só declara o slot.

Na raiz:

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
    <Carregando v-if="inbox.state.value.status === 'opening' || inbox.state.value.status === 'loading'" style="pointer-events: auto" />
    <ErroDaCaixa v-else-if="inbox.state.value.status === 'error'" :state="inbox.state.value" style="pointer-events: auto" @retry="inbox.retry" />
  </Teleport>
</template>
```

### `useInboxHost(options)`

- Aceita as opções de `createInboxHost`, com `onState` opcional, e mais `person` e `enabled` (ref, computed ou getter).
- Devolve `{ host, state, retry }`. `state` é um `shallowRef` com o `EmbedState`.
- Fecha o host quando `enabled` vira `false` ou quando `person` muda para outra pessoa, mesmo com o usuário em outra tela, onde nenhum slot está montado: troca de time, outro usuário, logout (`person` vira `null`), acesso indisponível. A caixa é descartada sem pedir sessão nova, e a retomada fica guardada.
- Destrói o host quando o escopo que o criou acaba (o `setup` da raiz).

### `useInboxSlot(host, { person, enabled? })`

- Devolve um ref de template. Ponha-o no elemento que reserva o espaço da caixa.
- Quando o elemento aparece (inclusive depois do `mount`, atrás de um `v-if`) e `enabled` é `true`, faz `attach`. Quando some, ou a tela desmonta, faz `detach`.
- `enabled` cobre o acesso que cai e volta sem sair da tela: com `false` o host fecha, e com `true` volta retomando a caixa.
- `person` virando `null` com a tela aberta fecha o host. `person` mudando para outra pessoa abre a caixa dela.

Passe o mesmo `person` e `enabled` para os dois.

### O que desenhar

- Ligue `pointer-events` no conteúdo que o app desenha dentro do `overlay`, se o `overlay` estiver com `pointer-events: none`.
- Com o host `closed` (logout, keepalive `401/419`, 30 min oculto), o `overlay` some junto. `closed` não diz o motivo: para avisar que a sessão do app caiu, veja [Caixa em SPA](caixa-em-spa.md#close-e-destroy).

## Conversa: `EmbedConversation`

```vue
<script setup>
import { EmbedConversation } from '@zapmizer/embed/vue'
</script>

<template>
  <EmbedConversation :key="theme" brand="zapmizer" :open-session="openSession" />
</template>
```

| Prop | |
| --- | --- |
| `open-session` | Obrigatória. Chamada a cada sessão, sempre pela prop atual. |
| `brand` | Obrigatória. |
| `frame` | `{ title?, configure? }`. |
| `ready-timeout-ms` | Padrão: 45 000. |

- `brand`, `frame` e `readyTimeoutMs` são lidos uma vez, na montagem. Para mudá-los, remonte o componente com um `key`.
- `open-session` é lida a cada sessão, mas trocar a prop não abre sessão nova. Para trocar o tema ou o cliente, inclua-os no `key`: o componente remonta com um iframe novo. Para manter o iframe velho na tela enquanto a sessão nova abre, chame o `reopen` que o slot recebe (veja [`reopen()`](conversa.md#tema-reopen)).
- O slot padrão recebe `{ state, retry, reopen, height }`. `state` é o `EmbedState`, `retry` e `reopen` são os da [conversa](conversa.md), e `height` é a última altura crua que a conversa informou (`null` antes da primeira).
- O evento `message-sent` traz o `message_id` da mensagem que o atendente mandou.
- O componente não repassa atributos (`inheritAttrs: false`): `class` e `style` nele não vão a lugar nenhum. Estilize o wrapper em volta.

### Receita de altura

O componente renderiza uma `div` sem estilo para o iframe, seguida do slot. Envolva o componente num wrapper `position: relative` e desenhe no slot um espaçador com a altura limitada pelo app. O iframe vai em `position: absolute; inset: 0`, pelo `frame.configure`, e ocupa o wrapper inteiro.

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
