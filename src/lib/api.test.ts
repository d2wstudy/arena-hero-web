import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, apiURL, setCSRF } from './api'

describe('API URL', () => {
  it('keeps local development requests relative', () => {
    expect(apiURL('/api/v1/me', '')).toBe('/api/v1/me')
  })

  it('uses the production API origin without a duplicate slash', () => {
    expect(apiURL('/api/v1/me', 'https://api.arenahero.io/')).toBe('https://api.arenahero.io/api/v1/me')
  })
})

describe('manual command API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('completes OAuth sign-up through the configured API origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.arenahero.io')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ csrf_token: 'csrf', expires_at: '2026-07-27T06:00:00Z' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))

    await api.completeOAuthSignup('linux-do', 'one-time-token', 'hero')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.arenahero.io/api/v1/auth/linux-do/complete')
    expect(JSON.parse(init?.body as string)).toEqual({ signup_token: 'one-time-token', username: 'hero' })
  })

  it('loads the public leaderboard without authentication headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ beacon_ticks_held: [], damage_dealt: [], core_destruction_participations: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await api.leaderboard()

    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/v1/leaderboard')
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it('sends CSRF and a unique idempotency key with the complete plan', async () => {
    setCSRF('csrf-test')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ accepted: true, tick: 7, source: 'MANUAL', received_at: '2026-07-15T00:00:00Z' }), { status: 202, headers: { 'Content-Type': 'application/json' } }))
    const plan = { tick: 7, unit_actions: { unit: { type: 'WAIT' as const } } }
    await api.submitCommands(plan)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('X-CSRF-Token')).toBe('csrf-test')
    expect(headers.get('Idempotency-Key')).toMatch(/[0-9a-f-]{36}/)
    expect(JSON.parse(init?.body as string)).toEqual(plan)
  })

  it('starts a local session and advances the requested Tick with CSRF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, tick: 12 }), { status: 202, headers: { 'Content-Type': 'application/json' } }))

    await api.startLocalSession()
    await api.advanceLocalTick(12)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/local/session')
    const [path, init] = fetchMock.mock.calls[1]
    expect(path).toBe('/api/local/advance')
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('local-csrf')
    expect(JSON.parse(init?.body as string)).toEqual({ tick: 12 })
  })

  it('loads replay history and creates a CSRF-protected branch', async () => {
    setCSRF('local-csrf')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ match_id: 'match-1', tick: 4, live: false, state: {}, receipts: {}, explored: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, match_id: 'branch-1', tick: 4, parent_match_id: 'match-1', parent_tick: 4 }), { status: 201, headers: { 'Content-Type': 'application/json' } }))

    await api.localHistory('match-1')
    await api.localReplay('match-1', 4)
    await api.branchLocalMatch('match-1', 4)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/local/history?match_id=match-1')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/local/replay?match_id=match-1&tick=4')
    const [path, init] = fetchMock.mock.calls[2]
    expect(path).toBe('/api/local/branch')
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('local-csrf')
    expect(JSON.parse(init?.body as string)).toEqual({ match_id: 'match-1', tick: 4 })
  })

  it('loads a global snapshot and applies a CSRF-protected god operation', async () => {
    setCSRF('local-csrf')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ match_id: 'match-1', tick: 4, live: false, state: {}, players: [], tracked_chunks: [], resource_cells: [], plans: [], explored: [], operations: [], settings: { human_full_vision: false }, contract: {}, world_sha256: 'a'.repeat(64) }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, tick: 7, operation: 'SET_HUMAN_FULL_VISION', changed: true, settings: { human_full_vision: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await api.localGod('match-1', 4)
    await api.setHumanFullVision(true)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/local/god?match_id=match-1&tick=4')
    const [path, init] = fetchMock.mock.calls[1]
    expect(path).toBe('/api/local/god')
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('local-csrf')
    expect(JSON.parse(init?.body as string)).toEqual({ operation: 'SET_HUMAN_FULL_VISION', enabled: true })
  })

  it('adds a local participant and labels a Tick with CSRF', async () => {
    setCSRF('local-csrf')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, tick: 7, operation: 'ADD_PARTICIPANT', participant: { id: 'player-1', username: 'late_agent', controller: 'AGENT', status: 'PENDING', token: 'local-token' }, record: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, match_id: 'match-1', tick: 4, cleared: false, label: { match_id: 'match-1', tick: 4, label: 'First contact', updated_at: '2026-08-06T00:00:00Z' }, labels: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await api.addLocalParticipant('late_agent', 'AGENT')
    await api.setLocalTickLabel('match-1', 4, 'First contact')

    const [participantPath, participantInit] = fetchMock.mock.calls[0]
    expect(participantPath).toBe('/api/local/god')
    expect(new Headers(participantInit?.headers).get('X-CSRF-Token')).toBe('local-csrf')
    expect(JSON.parse(participantInit?.body as string)).toEqual({ operation: 'ADD_PARTICIPANT', username: 'late_agent', controller: 'AGENT' })
    const [labelPath, labelInit] = fetchMock.mock.calls[1]
    expect(labelPath).toBe('/api/local/label')
    expect(new Headers(labelInit?.headers).get('X-CSRF-Token')).toBe('local-csrf')
    expect(JSON.parse(labelInit?.body as string)).toEqual({ match_id: 'match-1', tick: 4, label: 'First contact' })
  })

  it('creates an API key without requiring a name', async () => {
    setCSRF('csrf-test')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'key-1', name: '', prefix: 'ah_live_example', key: 'ah_live_example-secret', created_at: '2026-07-15T00:00:00Z' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))

    await api.createAPIKey()

    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('X-CSRF-Token')).toBe('csrf-test')
    expect(JSON.parse(init?.body as string)).toEqual({})
  })

  it('starts GitHub linking with a CSRF-protected POST', async () => {
    setCSRF('csrf-test')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ authorization_url: 'https://github.com/login/oauth/authorize?state=opaque' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await api.startGitHubLink()

    const [path, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(path).toBe('/api/v1/auth/github/link/start')
    expect(init?.method).toBe('POST')
    expect(headers.get('X-CSRF-Token')).toBe('csrf-test')
  })
})
