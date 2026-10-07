import { endEmbeds, listenToLogout } from '@zapmizer/embed/logout'
import { BRAND } from '../shared/render'
import { csrfToken } from '../shared/session'

// No boot de cada aba: o logout feito em outra aba fecha os embeds desta.
export function watchLogout(): () => void {
  return listenToLogout({ brand: BRAND })
}

// Antes de encerrar a sessão do app.
export async function logout(): Promise<void> {
  endEmbeds({ brand: BRAND })
  await fetch('/logout', { method: 'POST', headers: { 'X-CSRF-TOKEN': csrfToken() } })
  window.location.assign('/login')
}
