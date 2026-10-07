import type { KeepAlive, OpenSession } from '@zapmizer/embed/state'

// Laravel aceita o token do <meta name="csrf-token"> no X-CSRF-TOKEN. Sem ele, o POST dá 419 e a lib pede para recarregar.
const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''

// `payload` é lido a cada abertura, então um `reopen()` depois da troca de tema já manda o tema novo.
export function sessionFrom(path: string, payload: () => object = () => ({})): OpenSession {
  return async () => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify(payload()),
    })
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw { status: response.status, code: typeof body.code === 'string' ? body.code : null, retryAfter: Number(response.headers.get('Retry-After')) || undefined }
    }

    return body
  }
}

export function keepAliveAt(path: string): KeepAlive {
  return async () => {
    const response = await fetch(path, { headers: { Accept: 'application/json' } })

    if (!response.ok) {
      throw { status: response.status }
    }
  }
}
