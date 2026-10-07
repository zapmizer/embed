# Estados e erros

## `EmbedState`

```ts
type EmbedState =
  | { status: 'opening'; frame: 'none' | 'stale' }
  | { status: 'loading'; frame: 'loading' }
  | { status: 'ready'; frame: 'live' }
  | { status: 'error'; frame: 'none' | 'loading'; code: string; action: 'retry' | 'reload' | 'reconnect' | 'checkout' | null; retryAfter?: number }
  | { status: 'closed'; frame: 'none' }
```

| Estado | Quando | O que desenhar |
| --- | --- | --- |
| `opening` | Pedindo sessão ao backend. | Carregando. |
| `loading` | Iframe montado, esperando o `ready`. | Carregando, por cima do iframe. |
| `ready` | O iframe está pronto. | Nada. |
| `error` | Ver a tabela abaixo. | A mensagem e o botão da `action`. |
| `closed` | `destroy()`, logout, keepalive `401/419`, host fechado. | Nada, ou um aviso na página. |

`frame` diz o que está no DOM:

- `frame: 'stale'` em `opening`: o iframe velho continua montado enquanto a sessão nova abre (`reopen()` e reabertura automática).
- `frame: 'loading'` em `error`: é o `ready_timeout` com o iframe vivo; um `ready` atrasado ainda vence.

## A ação

A `action` diz qual botão desenhar:

| `action` | Botão |
| --- | --- |
| `retry` | Chamar `retry()`. |
| `reload` | Recarregar a página. |
| `reconnect` | Levar à tela de reconectar o WhatsApp. |
| `checkout` | Levar à assinatura. |
| `null` | Nenhum botão. |

A reabertura automática é da lib e nunca depende da `action`. `retryAfter`, quando vem, é o número que o backend mandou no `Retry-After` de um `429`.

## Códigos

`defaultMessages` (de `@zapmizer/embed/errors`) traz um texto pt-BR sem marca por código. Use se quiser; o texto é do app. `actionFor(code)` devolve a ação de um código.

| `code` | `action` | Texto padrão | De onde vem |
| --- | --- | --- | --- |
| `session_expired` | `retry` | A sessão expirou antes de abrir. Tente de novo. | Iframe, antes do `ready`; ou conversa expirando de novo em menos de um minuto. |
| `inbox_expired` | `retry` | A caixa de entrada expirou. Tente de novo. | Caixa pronta expirando de novo em menos de um minuto. |
| `session_revoked` | `retry` | O acesso foi encerrado. Abra de novo; se não abrir, reconecte o WhatsApp. | Iframe. |
| `session_replaced` | `retry` | A caixa de entrada foi aberta em outra aba deste navegador. | Iframe, só na caixa. Veja [multi-aba](logout-e-multiaba.md#a-caixa-em-várias-abas). |
| `subscription_required` | `checkout` | A assinatura está inativa. Assine para atender por aqui. | Iframe, ou `code` do backend. |
| `ready_timeout` | `retry` | Demorou demais para abrir. Tente de novo. | Lib: o `ready` não chegou em `readyTimeoutMs`. |
| `unavailable` | `retry` | Não foi possível abrir agora. Tente de novo. | Lib: falha de rede, resposta sem `url` válida, recusa sem `code`. |
| `rate_limited` | `retry` | Muitas aberturas seguidas. Aguarde um minuto e tente de novo. | Lib: backend respondeu `429`. |
| `app_session_expired` | `reload` | Sua sessão expirou. Recarregue a página. | Lib: backend respondeu `401` ou `419`. |
| `reauth_required` | `reconnect` | A conexão com o WhatsApp precisa ser refeita. | Backend (o `401` da API, traduzido). |
| `connection_without_number` | `reconnect` | Nenhum número de WhatsApp está conectado. | Backend. |
| `number_unavailable` | `reconnect` | O número conectado está sem conexão. | Backend. |
| `approver_without_access` | `null` | Quem aprovou a conexão perdeu o acesso a este número. Peça ao dono da conta para reconectar o WhatsApp. | Backend. |
| `official_number_unsupported` | `null` | Ainda não funciona com número oficial do WhatsApp. | Backend. |
| `origin_not_allowed` | `null` | Este endereço ainda não foi liberado. Avise o suporte. | Backend. |
| `rejected` | `null` | A abertura foi recusada. Avise o suporte. | Backend. |
| `customer_without_phone` | `null` | Cadastre um telefone para ver a conversa. | Backend do app, antes de chamar a API. |

"Backend" quer dizer o `code` que o [endpoint de sessão](backend.md) devolveu, em geral o `error` da API repassado.

Um `code` fora da tabela chega como veio, com `action: null` e sem texto em `defaultMessages`. Tenha um texto genérico para ele:

```ts
const text = defaultMessages[state.code] ?? 'Não foi possível abrir. Avise o suporte.'
```

## De recusa a código

`codeForRefusal({ status, code })` é a regra que a lib aplica à rejeição do `openSession`:

1. `status` `401` ou `419` → `app_session_expired`, qualquer que seja o `code`;
2. `status` `429` → `rate_limited`;
3. `code` preenchido → o `code`;
4. senão → `unavailable`.

Por isso o backend do app nunca deve devolver `401` para um problema da integração. Veja [os três ajustes](backend.md#os-três-ajustes).
