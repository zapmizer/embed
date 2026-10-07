import { endEmbeds, listenToLogout } from '@zapmizer/embed/logout'
import { BRAND } from '../shared/render'

// No boot de cada aba: o logout feito em outra aba fecha os embeds desta.
export function watchLogout(): () => void {
  return listenToLogout({ brand: BRAND })
}

// Antes de encerrar a sessão do app.
export async function logout(csrf: string): Promise<void> {
  endEmbeds({ brand: BRAND })
  await fetch('/logout', { method: 'POST', headers: { 'X-CSRF-TOKEN': csrf } })
  window.location.assign('/login')
}
