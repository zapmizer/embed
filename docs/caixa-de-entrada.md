# Caixa de entrada

A caixa de entrada é o atendimento inteiro do WhatsApp dentro do app. Esta página cobre `createInbox`, que serve a uma página sem SPA: a caixa vive enquanto a página está aberta. Num SPA, use o [host persistente](caixa-em-spa.md), que é construído sobre `createInbox` e aceita as mesmas opções. Exemplo completo: [`examples/vanilla/inbox.ts`](../examples/vanilla/inbox.ts).

```ts
import { createInbox } from '@zapmizer/embed/inbox'

const inbox = createInbox({
  container: document.querySelector('#caixa .iframe')!,
  brand: 'zapmizer',
  person: `${user.id}:${team.id}`,
  openSession,
  keepAlive,
  onState: render,
})

inbox.state
inbox.retry()
inbox.setVisible(false)
inbox.destroy()
```

## Opções

| Opção | Obrigatória | O que faz |
| --- | --- | --- |
| `container` | sim | Elemento onde o iframe é inserido. |
| `brand` | sim | `'zapmizer'`. |
| `person` | sim | Quem pode retomar a caixa nesta aba, ou `null`. Veja [Retomada](#retomada). |
| `openSession` | sim | Pede uma sessão ao backend do app. |
| `onState` | sim | Recebe cada `EmbedState`. |
| `keepAlive` | não | Pinga a sessão do app. Veja [Keepalive](#keepalive). |
| `storage` | não | Onde guardar a retomada. Padrão: `sessionStorage`. |
| `frame` | não | `{ title?, configure? }`, como na conversa. |
| `readyTimeoutMs` | não | Quanto esperar o `ready`. Padrão: 45 000. |
| `keepAliveMs` | não | Intervalo do keepalive. Padrão: 15 minutos. |
| `clock` | não | Relógio próprio, para testes. |

O iframe da caixa recebe `allow="clipboard-write; microphone; fullscreen; autoplay"` e o `sandbox` da conversa mais `allow-modals`. O título padrão é `Caixa de entrada do WhatsApp`. Como na conversa, o tamanho é do app: o iframe em `position: absolute; inset: 0` dentro de um elemento com a altura da caixa.

## Retomada

Abrir uma caixa do zero é pesado. Quando o backend devolve `resume_url` e `resume_until`, a lib guarda essa entrada assim que a caixa fica pronta e, na próxima abertura na mesma aba (um F5, por exemplo), monta o iframe direto nela, sem pedir sessão nova.

- A entrada fica na chave `zapmizer-inbox:${person}`. `person` identifica quem pode retomar; use algo como `${user.id}:${team.id}`, para que a troca de time não reabra a caixa do outro time.
- Com `person: null` (ou `''`), a retomada fica desligada: nada é lido, gravado ou apagado.
- Ao abrir, a lib apaga as entradas de outra pessoa.
- Uma entrada que vence em menos de dois minutos, ou cuja `url` não é da `origin` guardada, é ignorada.
- Se a caixa retomada responde `session_expired` antes de ficar pronta, a lib esquece a entrada e pede uma sessão nova, uma vez.
- Se a caixa retomada não fica pronta no prazo, a entrada é esquecida.
- `destroy()` mantém a entrada. O [logout](logout-e-multiaba.md) apaga todas.
- Por padrão a retomada usa o `sessionStorage`, que é de cada aba. Para dividir entre abas, passe `storage: window.localStorage`. Veja [multi-aba](logout-e-multiaba.md#a-caixa-em-várias-abas).
- Um `storage` que lança (navegador bloqueando o armazenamento) é tratado como vazio.

## Keepalive

Com a caixa pronta e visível, a lib chama `keepAlive` a cada `keepAliveMs`, para a sessão do app não vencer com o atendente parado dentro do iframe.

```ts
const keepAlive: KeepAlive = async () => {
  const response = await fetch('/atendimento/keepalive')

  if (!response.ok) {
    throw { status: response.status }
  }
}
```

- Rejeitar com `{ status: 401 }` ou `{ status: 419 }` fecha a caixa (`closed`) e apaga toda retomada.
- Qualquer outra falha é ignorada. Erro do axios funciona direto.
- Sem `keepAlive`, nada é pingado.

## Quando a sessão acaba

- `session_expired` com a caixa pronta e visível: a lib abre uma sessão nova sozinha, sobre o iframe velho. Se a última reabertura automática foi há menos de um minuto, mostra o erro `inbox_expired`, com ação `retry`.
- `session_expired` antes do `ready`: erro `session_expired`.
- `session_revoked` e `subscription_required`: erro, e o iframe sai.
- `session_replaced`: outra aba deste navegador abriu a caixa. Veja [multi-aba](logout-e-multiaba.md#a-caixa-em-várias-abas).

## `setVisible`

Com `setVisible(false)`, o iframe continua vivo, mas:

- o keepalive para;
- um `session_expired` não abre sessão nova na hora: a sessão nova é pedida quando a caixa volta a aparecer;
- uma falha ao abrir com a caixa oculta (recusa com ação `retry`, prazo do `ready` ou `session_expired` antes do `ready`) é tentada de novo sozinha quando ela volta a aparecer. `session_replaced` nunca é retomado sozinho.

O host do SPA chama `setVisible` por você.

## `retry()` e `destroy()`

`retry()` só tem efeito em `error`: tira o iframe e pede uma sessão nova. Em `session_replaced`, tenta antes a retomada (veja multi-aba).

`destroy()` tira o iframe, para o keepalive e publica `closed`.
