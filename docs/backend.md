# Backend: o endpoint de sessão

O iframe só abre com uma URL de sessão de uso único, criada pela API da marca com a chave da integração. A chave fica no servidor do app. O navegador chama um endpoint do próprio app, e esse endpoint chama a API.

```
navegador ── openSession() ──▶ backend do app ── POST {API}/embed/sessions ──▶ API do Zapmizer/Parli
          ◀── { url, origin, … } ──             ◀── 201 { url, resume_url?, … } ──
```

Este é o ponto que mais confunde. A lib não fala com a API: ela lê a resposta do **backend do app**, e esse backend precisa traduzir a resposta da API em três pontos (veja [Os três ajustes](#os-três-ajustes)).

## A chamada à API

`POST {base}/embed/sessions`, com `Authorization: Bearer <chave da integração>` e `Accept: application/json`. A base é `https://app.zapmizer.com/api/` no Zapmizer e `https://app.parlichat.com/api/` na Parli.

| Campo | Caixa | Conversa |
| --- | --- | --- |
| `component` | `'inbox'` | `'conversation'` |
| `parent_origin` | origem da página que mostra o iframe | idem |
| `user` | `{ id, name }` de quem atende | idem |
| `phone` | não vai | telefone do cliente |
| `appearance` | não vai | `{ theme: 'light' \| 'dark', color_primary?, radius?, font_family? }` |

Sucesso é `201` com `{ url, expires_at, resume_url?, resume_until? }`. Recusa vem com o motivo em `error`.

## O que o backend devolve ao navegador

Sucesso: `200` com

```json
{
  "url": "https://app.zapmizer.com/embed-inbox/start/…",
  "origin": "https://app.zapmizer.com",
  "resume_url": "https://app.zapmizer.com/chats?embed_inbox=…",
  "resume_until": "2026-10-07T14:00:00+00:00"
}
```

- `url` é a da API, sem mexer.
- `origin` é a origem do app da marca, de onde o iframe manda as mensagens: `https://app.zapmizer.com`, ou `https://app.parlichat.com` na Parli. Calcule a partir da `url` (esquema, host e porta não padrão), sem fixar no código. A lib confere: se a origem da `url` não for igual a `origin`, o estado vira `unavailable`, e mensagens de outra origem são ignoradas.
- `resume_url` e `resume_until` só servem à caixa (retomada, veja [Caixa de entrada](caixa-de-entrada.md#retomada)). Sem eles, ou com `null`, a caixa funciona e só não retoma. `expires_at` não precisa ir para o front.

Recusa: o status HTTP e `{ "code": "<motivo>" }`, mais o `Retry-After` no `429`.

## Como a lib lê a recusa

A lib decide o código nesta ordem (`codeForRefusal` em `src/errors.ts`):

1. status `401` ou `419` → `app_session_expired`, ação `reload`, **qualquer que seja o `code`**;
2. status `429` → `rate_limited`, ação `retry`, com o `Retry-After` em `retryAfter`;
3. `code` preenchido → esse código;
4. senão → `unavailable`, ação `retry`.

Fora `401`, `419` e `429`, o status não muda nada. O que importa é o `code`.

## Os três ajustes

**1. `error` vira `code`.** A API manda o motivo em `error`; a lib lê `code`. Repasse com o mesmo status e, no `429`, com o `Retry-After`.

**2. `origin` vai junto.** A API não manda `origin`. O backend calcula a partir da `url`.

**3. O `401` da API não pode chegar como `401`.** No backend do app, `401` e `419` querem dizer "a sessão do próprio app caiu", e a lib pede para recarregar a página (`reload`). O `401` da API quer dizer outra coisa: a chave da integração foi revogada e a conexão precisa ser refeita. Repassado como `401`, o usuário recarregaria a página em loop. Transforme em outro status (por exemplo `422`) com `code: "reauth_required"`, que dá a ação `reconnect`.

Além disso, `5xx` ou falha de rede da API viram `503` com `code: "unavailable"` (ação `retry`).

| API | Backend do app devolve | Estado na lib |
| --- | --- | --- |
| `201` com `url` web | `200 { url, origin, resume_url, resume_until }` | abre o iframe |
| `401` | `422 { code: "reauth_required" }` | `reauth_required` / `reconnect` |
| `429` + `Retry-After` | `429 { code: "rate_limited" }` + `Retry-After` | `rate_limited` / `retry`, com `retryAfter` |
| outro `4xx` com `error` | mesmo status, `{ code: <error> }` | o código, com a ação dele |
| `5xx`, rede, `201` sem `url` web | `503 { code: "unavailable" }` | `unavailable` / `retry` |
| sessão do app vencida, CSRF | `401` ou `419` (o próprio framework) | `app_session_expired` / `reload` |

A lista de códigos e ações está em [Estados e erros](estados-e-erros.md).

## Exemplo em Laravel

O caso da Resolaris, do Linklist e do postgrain-api. Arquivos completos em [`examples/laravel`](../examples/laravel).

```php
// routes/web.php: rotas web, com a sessão e o CSRF do app.
Route::middleware('auth')->group(function () {
    Route::post('atendimento/zapmizer-embed-session', [ZapmizerEmbedSessionController::class, 'inbox'])->middleware('throttle:30,1');
    Route::post('customers/{customer}/zapmizer-embed-session', [ZapmizerEmbedSessionController::class, 'conversation'])->middleware('throttle:30,1');
    Route::get('atendimento/keepalive', fn () => response()->noContent());
});
```

```php
private function open(Request $request, array $payload): JsonResponse
{
    try {
        $response = Http::baseUrl(config('services.zapmizer.base_uri'))
            ->acceptJson()
            ->withToken($request->user()->team->zapmizer_api_key)
            ->timeout(10)
            ->post('embed/sessions', [
                ...$payload,
                'parent_origin' => $request->getSchemeAndHttpHost(),
                'user' => ['id' => (string) $request->user()->id, 'name' => $request->user()->name],
            ]);
    } catch (ConnectionException) {
        return response()->json(['code' => 'unavailable'], 503);
    }

    if ($response->status() === 201 && is_string($url = $response->json('url')) && ($origin = $this->origin($url)) !== null) {
        return response()->json([
            'url' => $url,
            'origin' => $origin,
            'resume_url' => $response->json('resume_url'),
            'resume_until' => $response->json('resume_until'),
        ]);
    }

    if ($response->status() === 401) {
        return response()->json(['code' => 'reauth_required'], 422);
    }

    if ($response->status() === 201 || $response->serverError()) {
        return response()->json(['code' => 'unavailable'], 503);
    }

    $retryAfter = $response->header('Retry-After');
    $headers = $response->status() === 429 && ctype_digit($retryAfter) ? ['Retry-After' => $retryAfter] : [];
    $error = $response->json('error');

    return response()->json(['code' => is_string($error) ? $error : null], $response->status(), $headers);
}
```

A Resolaris, além disso, trata `error` nulo e os códigos `missing_ability` e `not_a_partner_connection` como `reauth_required`, e normaliza toda recusa conhecida para `422`. As duas coisas são opcionais: para a lib, o status de uma recusa só pesa em `401`, `419` e `429`.

## Exemplo em JavaScript puro

Para Node 18+, Bun, Deno ou qualquer servidor com `Request`/`Response` da Web. Arquivo completo em [`examples/node/session.ts`](../examples/node/session.ts).

```ts
export async function openEmbedSession(input: EmbedSessionInput): Promise<Response> {
  const { token, parentOrigin, ...rest } = input
  let api: Response

  try {
    api = await fetch(new URL('embed/sessions', 'https://app.zapmizer.com/api/'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...rest, parent_origin: parentOrigin }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return json({ code: 'unavailable' }, 503)
  }

  const body = (await api.json().catch(() => null)) ?? {}

  if (api.status === 201) {
    const origin = typeof body.url === 'string' ? webOrigin(body.url) : null

    if (origin === null) {
      return json({ code: 'unavailable' }, 503)
    }

    return json({ url: body.url, origin, resume_url: body.resume_url ?? null, resume_until: body.resume_until ?? null }, 200)
  }

  if (api.status === 401 || api.status === 419) {
    return json({ code: 'reauth_required' }, 422)
  }

  if (api.status >= 500) {
    return json({ code: 'unavailable' }, 503)
  }

  const retryAfter = api.headers.get('Retry-After')
  const headers = api.status === 429 && retryAfter !== null && /^\d+$/.test(retryAfter) ? { 'Retry-After': retryAfter } : {}

  return json({ code: typeof body.error === 'string' ? body.error : null }, api.status, headers)
}
```

## O keepalive

A caixa pinga o app a cada 15 minutos enquanto está pronta e visível, para a sessão do app não vencer com o atendente parado na caixa. O endpoint só precisa responder `2xx` com o usuário logado (`204` sem corpo basta). `401` ou `419` fecham a caixa e apagam toda retomada; qualquer outra falha é ignorada.

## Pegadinhas

- **`parent_origin` atrás de proxy.** `getSchemeAndHttpHost()` (ou o equivalente) atrás de um proxy ou balanceador sem `TrustProxies` sai com `http://` ou com o host interno, e a API responde `origin_not_allowed`.
- **CSRF.** O endpoint é uma rota web autenticada, então pede CSRF. O axios do Laravel manda o `X-XSRF-TOKEN` sozinho. Com `fetch`, mande o `X-CSRF-TOKEN` do `<meta name="csrf-token">`. Sem ele, o Laravel responde `419` e a lib pede para recarregar a página.
- **Throttle.** Um limite como `throttle:30,1` protege a API. Com ele, a resposta `429` do próprio app também vira `rate_limited`.
- **Validação da aparência.** Um `422` de validação do Laravel (`{ message, errors }`, sem `code`) vira `unavailable`. Mande `color_primary` como `#rrggbb`, não `rgb()`.
- **Rota sem integração.** Um `404` antes de chamar a API vira `unavailable`, com botão de tentar de novo. Se o app sabe o motivo, devolva um `code` que ele saiba desenhar.
