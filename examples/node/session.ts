// Endpoint de sessão em JavaScript puro: recebe o que o app já sabe e devolve a Response para o navegador.
// Funciona em qualquer servidor com Request/Response da Web (Bun, Deno, Node 18+, Hono, Next route handlers).
// Antes de chamar, o app autentica o usuário e confere o CSRF, como em qualquer POST da sessão dele.

const API = 'https://app.zapmizer.com/api/'

export type EmbedSessionInput = {
  token: string // a chave da integração com o Zapmizer, guardada no servidor do app
  parentOrigin: string // a origem da página que mostra o iframe, por exemplo https://app.seuapp.com
  user: { id: string; name: string }
  api?: string // a base da API, para apontar para staging ou para uma API falsa nos testes. Padrão: produção.
} & ({ component: 'inbox' } | { component: 'conversation'; phone: string; appearance: Appearance })

export type Appearance = { theme: 'light' | 'dark'; color_primary?: string; radius?: number; font_family?: string }

export async function openEmbedSession(input: EmbedSessionInput): Promise<Response> {
  const { token, parentOrigin, api: base = API, ...rest } = input
  let api: Response

  try {
    api = await fetch(new URL('embed/sessions', base), {
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

  // 401 da API = a chave foi revogada. Repassado como 401, a lib leria "a sessão do app caiu" e pediria reload.
  if (api.status === 401 || api.status === 419) {
    return json({ code: 'reauth_required' }, 422)
  }

  if (api.status >= 500) {
    return json({ code: 'unavailable' }, 503)
  }

  const retryAfter = api.headers.get('Retry-After')
  const headers: Record<string, string> = api.status === 429 && retryAfter !== null && /^\d+$/.test(retryAfter) ? { 'Retry-After': retryAfter } : {}

  // A API manda o motivo em `error`; a lib lê `code`.
  return json({ code: typeof body.error === 'string' ? body.error : null }, api.status, headers)
}

// O keepalive só confirma que a sessão do app está viva: 204 com o usuário logado, 401 (ou 419) quando ela caiu.
export function keepAliveResponse(loggedIn: boolean): Response {
  return new Response(null, { status: loggedIn ? 204 : 401 })
}

function webOrigin(address: string): string | null {
  try {
    const url = new URL(address)

    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
