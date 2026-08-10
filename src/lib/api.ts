import type { APIKeyView, AuthOptions, CaptureReplayFramesResponse, CaptureReplayManifest, CommandPlan, Leaderboard, LocalAdvanceReceipt, LocalBranchReceipt, LocalGodOperationReceipt, LocalGodSnapshot, LocalHistory, LocalMatchStatus, LocalObservation, LocalObservationMode, LocalParticipantAdmissionReceipt, LocalReplay, LocalSession, LocalTickLabelReceipt, OfficialAgentSession, PlayerStats, Receipt, Session, User } from './types'

export class APIError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message || code)
  }
}

export type CSRFScope = 'account' | 'local' | 'official'

const csrfKeys: Record<CSRFScope, string> = {
  account: 'arena-hero.csrf',
  local: 'arena-hero.csrf.local',
  official: 'arena-hero.csrf.official',
}

export const getCSRF = (scope: CSRFScope = 'account') => localStorage.getItem(csrfKeys[scope]) ?? ''
export const setCSRF = (token: string, scope: CSRFScope = 'account') => localStorage.setItem(csrfKeys[scope], token)
export const clearCSRF = (scope: CSRFScope = 'account') => localStorage.removeItem(csrfKeys[scope])

export function apiURL(path: string, baseURL = import.meta.env.VITE_API_BASE_URL ?? '') {
  return `${baseURL.trim().replace(/\/+$/, '')}${path}`
}

async function request<T>(path: string, init: RequestInit = {}, baseURL?: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(apiURL(path, baseURL), { ...init, headers, credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string }
    throw new APIError(body.error ?? 'REQUEST_FAILED', response.status, body.message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const localRequest = <T>(path: string, init: RequestInit = {}) => request<T>(path, init, '')

async function officialRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, init, '')
  } catch (cause) {
    if (cause instanceof APIError) {
      if (cause.code === 'UNAUTHORIZED') {
        throw new APIError('OFFICIAL_AGENT_UNAUTHORIZED', cause.status, cause.message)
      }
      throw cause
    }
    throw new APIError('OFFICIAL_PROXY_UNAVAILABLE', 0)
  }
}

export const api = {
  startLocalSession: async () => {
    const session = await localRequest<LocalSession>('/api/local/session', { method: 'POST' })
    setCSRF(session.csrf_token, 'local')
    return session
  },
  localMatch: (signal?: AbortSignal) => localRequest<LocalMatchStatus>('/api/local/match', { signal }),
  localHistory: (matchId?: string, signal?: AbortSignal) => localRequest<LocalHistory>(`/api/local/history${matchId ? `?match_id=${encodeURIComponent(matchId)}` : ''}`, { signal }),
  localReplay: (matchId: string, tick: number, signal?: AbortSignal) => localRequest<LocalReplay>(`/api/local/replay?match_id=${encodeURIComponent(matchId)}&tick=${tick}`, { signal }),
  localObserve: (view: LocalObservationMode, playerId?: string | null, matchId?: string | null, tick?: number | null, signal?: AbortSignal) => {
    const query = new URLSearchParams({ view })
    if (view === 'PLAYER' && playerId) query.set('player_id', playerId)
    if (matchId && tick !== null && tick !== undefined) {
      query.set('match_id', matchId)
      query.set('tick', String(tick))
    }
    return localRequest<LocalObservation>(`/api/local/observe?${query.toString()}`, { signal })
  },
  localGod: (matchId?: string | null, tick?: number | null, signal?: AbortSignal) => localRequest<LocalGodSnapshot>(matchId && tick !== null && tick !== undefined
    ? `/api/local/god?match_id=${encodeURIComponent(matchId)}&tick=${tick}`
    : '/api/local/god', { signal }),
  setHumanFullVision: (enabled: boolean) => localRequest<LocalGodOperationReceipt>('/api/local/god', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF('local') },
    body: JSON.stringify({ operation: 'SET_HUMAN_FULL_VISION', enabled }),
  }),
  addLocalParticipant: (username: string, controller: 'AGENT' | 'BOT') => localRequest<LocalParticipantAdmissionReceipt>('/api/local/god', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF('local') },
    body: JSON.stringify({ operation: 'ADD_PARTICIPANT', username, controller }),
  }),
  setLocalTickLabel: (matchId: string, tick: number, label: string) => localRequest<LocalTickLabelReceipt>('/api/local/label', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF('local') },
    body: JSON.stringify({ match_id: matchId, tick, label }),
  }),
  advanceLocalTick: (tick: number) => localRequest<LocalAdvanceReceipt>('/api/local/advance', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF('local') },
    body: JSON.stringify({ tick }),
  }),
  branchLocalMatch: (matchId: string, tick: number) => localRequest<LocalBranchReceipt>('/api/local/branch', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF('local') },
    body: JSON.stringify({ match_id: matchId, tick }),
  }),
  authOptions: () => request<AuthOptions>('/api/v1/auth/options'),
  leaderboard: () => request<Leaderboard>('/api/v1/leaderboard'),
  me: () => request<User>('/api/v1/me'),
  login: async (email: string, password: string) => {
    const session = await request<Session>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setCSRF(session.csrf_token)
    return session
  },
  register: (email: string, username: string, password: string) =>
    request<{ accepted: boolean; message: string }>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) }),
  verifyEmail: (token: string) => request<void>('/api/v1/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: (email: string) => request<{ accepted: boolean }>('/api/v1/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) => request<{ accepted: boolean }>('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<void>('/api/v1/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  completeOAuthSignup: (provider: 'github' | 'linux-do', signupToken: string, username: string) =>
    request<Session>(`/api/v1/auth/${provider}/complete`, {
      method: 'POST',
      body: JSON.stringify({ signup_token: signupToken, username }),
    }),
  startGitHubLink: () => request<{ authorization_url: string }>('/api/v1/auth/github/link/start', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF() },
  }),
  logout: async () => {
    await request<void>('/api/v1/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': getCSRF() } })
    clearCSRF()
  },
  stats: () => request<PlayerStats>('/api/v1/me/stats'),
  apiKeys: async () => (await request<{ api_keys: APIKeyView[] }>('/api/v1/me/api-keys')).api_keys,
  createAPIKey: (name?: string) => request<APIKeyView>('/api/v1/me/api-keys', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF() },
    body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}),
  }),
  revokeAPIKey: (id: string) => request<void>(`/api/v1/me/api-keys/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': getCSRF() } }),
  submitCommands: (plan: CommandPlan) => request<Receipt>('/api/v1/game/commands', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF(), 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(plan),
  }),
}

export const officialApi = {
  startSession: async () => {
    const session = await officialRequest<OfficialAgentSession>('/api/official/session', { method: 'POST' })
    setCSRF(session.csrf_token, 'official')
    return session
  },
  submitCommands: (plan: CommandPlan) => officialRequest<Receipt>('/api/official/v1/game/commands', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCSRF('official'), 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(plan),
  }),
}

export const replayApi = {
  manifest: () => localRequest<CaptureReplayManifest>('/api/replay/manifest'),
  frames: (afterTick?: number, limit = 2000) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (afterTick !== undefined) query.set('after_tick', String(afterTick))
    return localRequest<CaptureReplayFramesResponse>(`/api/replay/frames?${query.toString()}`)
  },
}
