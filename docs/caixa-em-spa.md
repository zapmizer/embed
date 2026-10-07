# Caixa em SPA (host persistente)

Num SPA, a tela de atendimento monta e desmonta a cada navegação. A caixa não pode acompanhar esse ciclo, por dois motivos: mover um iframe de lugar no DOM recarrega o iframe, e desmontá-lo joga fora uma caixa que leva segundos para abrir.

O host resolve isso. Ele é uma `div` com `position: fixed`, presa ao `body` e fora da árvore da página, que se sobrepõe ao espaço que a tela reserva (o **slot**). A tela só diz onde fica o slot. Exemplo completo: [`examples/vanilla/host.ts`](../examples/vanilla/host.ts). Ele também serve para um framework legado, como AngularJS. Em Vue, use [`useInboxHost` e `useInboxSlot`](vue.md).

```ts
import { createInboxHost } from '@zapmizer/embed/host'

// Uma vez, no boot do app.
const host = createInboxHost({ brand: 'zapmizer', openSession, keepAlive, onState: render })

// Na tela de atendimento.
host.attach(slotElement, person) // ao entrar
host.detach(slotElement) // ao sair

host.retry()
host.close()
host.destroy()
```

## Opções

As mesmas de [`createInbox`](caixa-de-entrada.md#opções), sem `container` e `person` (o `person` vai no `attach`), mais:

| Opção | O que faz |
| --- | --- |
| `idleMs` | Quanto tempo a caixa oculta fica viva. Padrão: 30 minutos. |

## O que o host expõe

| | |
| --- | --- |
| `element` | A `div` fixa. Contém o container do iframe e o `overlay`. |
| `overlay` | Uma `div` depois do iframe, para o app desenhar carregando e erro por cima dele. |
| `state` | O `EmbedState` atual. Antes do primeiro `attach`, `closed`; o `onState` não é chamado na criação. |
| `person` | A pessoa da caixa atual. |

A lib não estiliza o iframe nem o `overlay`. Os dois precisam de `position: absolute; inset: 0`: no iframe, pelo `frame.configure`; no `overlay`, direto no elemento. `role`, `aria-label` e `z-index` também ficam com o app.

```ts
Object.assign(host.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
host.element.style.zIndex = '5'
host.element.setAttribute('role', 'region')
host.element.setAttribute('aria-label', 'Caixa de entrada do WhatsApp')
```

Com `pointer-events: none` no `overlay`, ligue `pointer-events` no conteúdo que o app desenha dentro dele.

## `attach` e `detach`

- A caixa só abre no primeiro `attach`.
- `attach(slot, person)` mostra o host sobre o slot e marca a caixa como visível. Se a caixa já existe para a mesma pessoa, ela volta pronta, sem sessão nova.
- `attach` com outra `person` descarta a caixa anterior e abre uma para a pessoa nova.
- `detach(slot)` esconde o host (`visibility: hidden`, `pointer-events: none`, `inert`, `aria-hidden`) com o iframe vivo, e marca a caixa como oculta (veja [`setVisible`](caixa-de-entrada.md#setvisible)). Um `detach` de um slot que não é o atual é ignorado.
- Depois de `idleMs` oculta, a caixa é descartada e o host publica `closed`. A retomada fica guardada, então a próxima visita volta sem sessão nova enquanto ela valer.

## Seguindo o slot

O host segue o slot por `ResizeObserver` e pelos eventos `resize` e `scroll` da janela. Se o slot muda de lugar sem mudar de tamanho (por exemplo, ao recolher uma barra lateral), o host não percebe: faça `detach`/`attach` ou dispare um `resize` na janela para recalcular.

## `close` e `destroy`

- `close()` descarta a caixa e publica `closed`, mantendo a retomada. Um `attach` depois abre de novo. Use quando o acesso some (troca de time, usuário sem permissão) com o usuário em outra tela.
- Um keepalive `401/419` ou o [logout](logout-e-multiaba.md) também fecham o host, e esses apagam a retomada.
- `destroy()` fecha, tira o `element` do `body` e para de ouvir a janela. Chamadas depois dele são ignoradas.

Com o host `closed`, o `overlay` some junto. O estado `closed` é o mesmo para todo motivo (logout, keepalive `401/419`, 30 min oculto, `close()`). Para avisar que a sessão do app caiu, guarde essa informação no `keepAlive` e desenhe o aviso na própria página:

```ts
let appSessionLost = false

const keepAlive: KeepAlive = async () => {
  const response = await fetch('/atendimento/keepalive')

  if (!response.ok) {
    appSessionLost = response.status === 401 || response.status === 419
    throw { status: response.status }
  }
}
```

O aviso vale para o keepalive. Um `401/419` do `openSession` não fecha nada: vira o erro `app_session_expired`, com o botão de recarregar. Depois de um novo login sem recarregar a página, zere a marca.
