# Logout e multi-aba

Exemplo completo: [`examples/vanilla/logout.ts`](../examples/vanilla/logout.ts).

## Logout

```ts
import { endEmbeds, listenToLogout } from '@zapmizer/embed/logout'

// No boot de cada aba.
listenToLogout({ brand: 'zapmizer' })

async function logout() {
  endEmbeds({ brand: 'zapmizer' })
  await fetch('/logout', { method: 'POST', headers: { 'X-CSRF-TOKEN': csrf } })
}
```

`endEmbeds({ brand, storage?, broadcast? })`:

- fecha toda caixa, host e conversa do Zapmizer nesta aba (o estado vira `closed`);
- apaga toda retomada `zapmizer-inbox:*`;
- avisa as outras abas em `BroadcastChannel('zapmizer-embed-logout')`. Cada aba que chamou `listenToLogout` fecha os embeds dela e apaga a retomada;
- um embed que falha ao fechar não impede os outros: todos fecham e a retomada é apagada.

O app que já tem canal próprio entre abas passa `broadcast: false` ao `endEmbeds` e o chama no próprio handler, em cada aba.

`listenToLogout({ brand, storage? })` devolve uma função que para de ouvir.

- Sem `BroadcastChannel` no navegador, `endEmbeds` ainda fecha esta aba.
- Sem `storage`, os dois apagam a retomada só no `sessionStorage`. O app que passou outro `storage` para `createInbox`, `createInboxHost` ou `useInboxHost` (por exemplo `window.localStorage`) precisa passar o mesmo `storage` aos dois: `endEmbeds({ brand: 'zapmizer', storage: window.localStorage })` e `listenToLogout({ brand: 'zapmizer', storage: window.localStorage })`.

Em Vue, com `person` no `useInboxHost`, o logout que zera o usuário (`person` vira `null`) também fecha o host. `endEmbeds` continua necessário para apagar a retomada e avisar as outras abas.

## A caixa em várias abas

A caixa de uma pessoa fica aberta em uma aba por vez. Quando outra aba do mesmo navegador abre a caixa, a anterior recebe `session_replaced` e mostra o erro com ação `retry` ("A caixa de entrada foi aberta em outra aba deste navegador.").

- A lib nunca toma a caixa de volta sozinha, nem quando a aba volta a ficar visível.
- No clique em tentar de novo, a aba pega a caixa de volta: pede uma sessão nova, e agora é a outra aba que recebe `session_replaced`.
- Com `storage: window.localStorage`, as abas dividem a retomada. No clique, a aba que perdeu a caixa primeiro tenta a entrada que a outra aba gravou e volta para a caixa dela, sem pedir sessão nova.
- Uma caixa retomada que recebe `session_replaced` antes de ficar pronta segue, uma vez, a entrada que a outra aba gravou (com `localStorage`). Sem entrada nova, mostra o erro e esquece a própria entrada.

`sessionStorage` (o padrão) é de cada aba, então nada é dividido: cada aba retoma só a própria caixa.
