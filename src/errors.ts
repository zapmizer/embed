import type { EmbedAction, EmbedErrorCode, SessionRefused } from './state'

const RETRY_CODES: ReadonlySet<string> = new Set(['session_expired', 'inbox_expired', 'session_revoked', 'session_replaced', 'ready_timeout', 'unavailable', 'rate_limited'])

const RECONNECT_CODES: ReadonlySet<string> = new Set(['reauth_required', 'connection_without_number', 'number_unavailable'])

export const defaultMessages: Record<string, string> = {
  session_expired: 'A sessão expirou antes de abrir. Tente de novo.',
  inbox_expired: 'A caixa de entrada expirou. Tente de novo.',
  session_revoked: 'O acesso foi encerrado. Abra de novo; se não abrir, reconecte o WhatsApp.',
  session_replaced: 'A caixa de entrada foi aberta em outra aba deste navegador.',
  subscription_required: 'A assinatura está inativa. Assine para atender por aqui.',
  ready_timeout: 'Demorou demais para abrir. Tente de novo.',
  unavailable: 'Não foi possível abrir agora. Tente de novo.',
  rate_limited: 'Muitas aberturas seguidas. Aguarde um minuto e tente de novo.',
  app_session_expired: 'Sua sessão expirou. Recarregue a página.',
  reauth_required: 'A conexão com o WhatsApp precisa ser refeita.',
  connection_without_number: 'Nenhum número de WhatsApp está conectado.',
  number_unavailable: 'O número conectado está sem conexão.',
  approver_without_access: 'Quem aprovou a conexão perdeu o acesso a este número. Peça ao dono da conta para reconectar o WhatsApp.',
  official_number_unsupported: 'Ainda não funciona com número oficial do WhatsApp.',
  origin_not_allowed: 'Este endereço ainda não foi liberado. Avise o suporte.',
  rejected: 'A abertura foi recusada. Avise o suporte.',
  customer_without_phone: 'Cadastre um telefone para ver a conversa.',
}

export function actionFor(code: EmbedErrorCode): EmbedAction {
  if (RETRY_CODES.has(code)) {
    return 'retry'
  }

  if (RECONNECT_CODES.has(code)) {
    return 'reconnect'
  }

  if (code === 'subscription_required') {
    return 'checkout'
  }

  if (code === 'app_session_expired') {
    return 'reload'
  }

  return null
}

export function codeForRefusal(refusal: SessionRefused): EmbedErrorCode {
  if (refusal.status === 401 || refusal.status === 419) {
    return 'app_session_expired'
  }

  if (refusal.status === 429) {
    return 'rate_limited'
  }

  if (refusal.code !== null && refusal.code !== '') {
    return refusal.code
  }

  return 'unavailable'
}

export function toRefusal(error: unknown): SessionRefused {
  if (typeof error !== 'object' || error === null) {
    return { status: null, code: null }
  }

  if ('response' in error && typeof error.response === 'object' && error.response !== null) {
    return fromResponse(error.response)
  }

  if (('isAxiosError' in error && error.isAxiosError === true) || 'request' in error) {
    return { status: null, code: null }
  }

  const status = 'status' in error && typeof error.status === 'number' ? error.status : null
  const code = 'code' in error && typeof error.code === 'string' ? error.code : null
  const retryAfter = 'retryAfter' in error && typeof error.retryAfter === 'number' && Number.isFinite(error.retryAfter) ? error.retryAfter : null

  return retryAfter === null ? { status, code } : { status, code, retryAfter }
}

function fromResponse(response: object): SessionRefused {
  const status = 'status' in response && typeof response.status === 'number' && Number.isFinite(response.status) ? response.status : null
  const data = 'data' in response && typeof response.data === 'object' && response.data !== null ? response.data : null
  const code = data !== null && 'code' in data && typeof data.code === 'string' ? data.code : null

  return { status, code }
}
