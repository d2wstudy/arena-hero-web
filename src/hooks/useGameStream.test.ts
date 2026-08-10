import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoState } from '../lib/demo'
import { useGameStream } from './useGameStream'

vi.mock('../lib/exploration', () => ({
  loadExplored: vi.fn().mockResolvedValue(new Map()),
  rememberVisible: vi.fn().mockResolvedValue(new Map()),
  observedCells: vi.fn().mockReturnValue(new Map()),
}))

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  close = vi.fn((code = 1000, reason = '') => {
    this.readyState = 3
    this.onclose?.({ code, reason } as CloseEvent)
  })

  constructor(url: string | URL) {
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent)
  }

  serverClose(code: number, reason = '') {
    this.readyState = 3
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

const headers = { 'Content-Type': 'application/json' }
const jsonResponse = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers }))

const localStatus = (tick = 7, matchId = 'match-1') => ({
  mode: 'step', tick, phase: 'OPEN', human: 'commander',
  bots: [{ username: 'bot', ready: true }],
  participants: [
    { id: 'human-1', username: 'commander', controller: 'HUMAN', status: 'ACTIVE' },
    { id: 'bot-1', username: 'bot', controller: 'BOT', status: 'ACTIVE' },
  ],
  match_id: matchId, root_match_id: 'match-1', god: { human_full_vision: false },
})

const localHistory = (tick = 7, matchId = 'match-1') => ({
  active_match_id: matchId,
  selected_match_id: matchId,
  matches: [{ id: matchId, label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: tick, active: true }],
  labels: [],
})

const observation = (mode: 'HUMAN' | 'PLAYER' | 'GLOBAL', tick: number, resources = tick, playerId?: string) => ({
  match_id: 'match-1', tick, live: tick === 7,
  view: mode === 'GLOBAL' ? { mode } : { mode, player_id: playerId ?? 'human-1', username: mode === 'PLAYER' ? 'bot' : 'commander' },
  state: { ...demoState, ...(mode === 'GLOBAL' ? { view_mode: 'GOD' as const } : {}), resources },
  exploration: { ranges: [[mode === 'GLOBAL' ? 20 : 0, tick, tick]], obstacles: [], resources: [] },
})

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useGameStream WebSocket transport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    localStorage.clear()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the WebSocket endpoint and applies authoritative messages', async () => {
    const { result, unmount } = renderHook(() => useGameStream(false, 'hero'))
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe('ws://localhost:3000/api/v1/game/ws')

    act(() => {
      socket.open()
      socket.message({ type: 'tick', data: 42 })
      socket.message({ type: 'state', data: demoState })
      socket.message({ type: 'received', data: { tick: 42, source: 'MANUAL', received_at: '2026-07-26T00:00:00Z', plan: { tick: 42, unit_actions: { '00000000-0000-4000-8000-000000000002': { type: 'HARVEST' } } } } })
    })

    expect(result.current.tick).toBe(42)
    expect(result.current.state).toEqual(demoState)
    expect(result.current.phase).toBe('open')
    expect(result.current.receipts.MANUAL?.plan.unit_actions['00000000-0000-4000-8000-000000000002']?.type).toBe('HARVEST')
    unmount()
    expect(socket.close).toHaveBeenCalledWith(1000, 'component unmounted')
  })

  it('reconnects with bounded backoff but stops on policy violations', () => {
    const { result, unmount } = renderHook(() => useGameStream(false, 'hero'))
    const first = FakeWebSocket.instances[0]
    act(() => first.serverClose(1013, 'resync'))
    expect(result.current.phase).toBe('offline')
    act(() => vi.advanceTimersByTime(250))
    expect(FakeWebSocket.instances).toHaveLength(2)
    const second = FakeWebSocket.instances[1]
    act(() => { second.open(); second.serverClose(1013, 'resync again'); vi.advanceTimersByTime(250) })
    expect(FakeWebSocket.instances).toHaveLength(3)
    act(() => FakeWebSocket.instances[2].serverClose(1008, 'credential inactive'))
    expect(result.current.error).toBe('UNAUTHORIZED')
    act(() => vi.advanceTimersByTime(10_000))
    expect(FakeWebSocket.instances).toHaveLength(3)
    unmount()
  })

  it('loads local history once and uses the lightweight observer instead of replay on every live Tick', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/local/session') return jsonResponse({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1', god_mode: true })
      if (path.startsWith('/api/local/history')) return jsonResponse(localHistory(42))
      if (path === '/api/local/match') return jsonResponse(localStatus(42))
      if (path.startsWith('/api/local/observe?view=HUMAN')) return jsonResponse({ ...observation('HUMAN', 42, 42), exploration: { ranges: [[0, 0, 0]], obstacles: [], resources: [] } })
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(flush)
    expect(FakeWebSocket.instances).toHaveLength(1)
    const socket = FakeWebSocket.instances[0]
    await act(async () => { socket.open(); socket.message({ type: 'tick', data: 42 }); socket.message({ type: 'state', data: demoState }); await flush() })

    expect(result.current.localStatus?.bots[0]).toEqual({ username: 'bot', ready: true })
    expect(result.current.localHistory?.active_match_id).toBe('match-1')
    expect(result.current.explored.get('0,0')?.kind).toBe('EMPTY')
    const paths = fetchMock.mock.calls.map(([input]) => String(input))
    expect(paths.filter((path) => path.startsWith('/api/local/history'))).toHaveLength(1)
    expect(paths.some((path) => path.startsWith('/api/local/replay'))).toBe(false)
    unmount()
  })

  it('bootstraps the official proxy before its WebSocket and submits to the Agent slot', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.arenahero.io')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/official/session') return jsonResponse({ csrf_token: 'official-csrf', mode: 'official-agent' })
      if (path === '/api/official/v1/game/commands') return jsonResponse({ accepted: true, tick: 42, source: 'AGENT', received_at: '2026-08-06T00:00:00Z' }, 202)
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'official-agent', false, true))
    await act(flush)
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe('ws://localhost:3000/api/official/v1/game/ws')
    act(() => { socket.open(); socket.message({ type: 'tick', data: 42 }); socket.message({ type: 'state', data: demoState }) })
    await act(async () => { await result.current.submit({ tick: 42, unit_actions: {} }) })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/official/v1/game/commands')
    expect(result.current.submissionSource).toBe('AGENT')
    unmount()
  })

  it('shows a read-only replay and switches to a newly created branch', async () => {
    let humanObservationRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/local/session') return jsonResponse({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' })
      if (path.startsWith('/api/local/history')) {
        const matchId = new URL(path, 'http://localhost').searchParams.get('match_id') ?? 'match-1'
        return jsonResponse(localHistory(matchId === 'branch-1' ? 4 : 7, matchId))
      }
      if (path === '/api/local/match') return jsonResponse(localStatus(7))
      if (path.startsWith('/api/local/observe?view=HUMAN')) {
        humanObservationRequests += 1
        return jsonResponse(observation('HUMAN', 7))
      }
      if (path.startsWith('/api/local/replay')) {
        const tick = Number(new URL(path, 'http://localhost').searchParams.get('tick'))
        return jsonResponse({ match_id: 'match-1', tick, live: tick === 7, state: { ...demoState, resources: tick }, receipts: {}, explored: [{ position: [tick, 0], kind: 'EMPTY' }], god: { human_full_vision: false } })
      }
      if (path === '/api/local/branch') return jsonResponse({ accepted: true, match_id: 'branch-1', tick: 4, parent_match_id: 'match-1', parent_tick: 4 }, 201)
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(flush)
    const socket = FakeWebSocket.instances[0]
    await act(async () => { socket.open(); socket.message({ type: 'tick', data: 7 }); socket.message({ type: 'state', data: demoState }); await flush() })
    await act(async () => { await result.current.showReplay('match-1', 4) })
    expect(result.current.tick).toBe(4)
    expect(result.current.phase).toBe('replay')
    expect(result.current.state?.resources).toBe(4)
    expect(result.current.readOnly).toBe(true)
    act(() => result.current.returnLive())
    await act(flush)
    expect(humanObservationRequests).toBe(2)
    await act(async () => { await result.current.showReplay('match-1', 4) })
    await act(async () => { await result.current.branchFromReplay(); await flush() })
    expect(result.current.replay).toBeNull()
    expect(result.current.localSession?.match_id).toBe('branch-1')
    expect(result.current.phase).toBe('syncing')
    unmount()
  })

  it('switches to robot/global read-only frames and loads heavy diagnostics only on demand', async () => {
    let humanObservationRequests = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/local/session') return jsonResponse({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1', god_mode: true })
      if (path.startsWith('/api/local/history')) return jsonResponse(localHistory())
      if (path === '/api/local/match') return jsonResponse(localStatus())
      if (path.startsWith('/api/local/observe?view=HUMAN')) {
        humanObservationRequests += 1
        const snapshot = observation('HUMAN', 7)
        snapshot.exploration.ranges = [[0, humanObservationRequests === 1 ? 7 : 70, humanObservationRequests === 1 ? 7 : 70]]
        return jsonResponse(snapshot)
      }
      if (path.startsWith('/api/local/observe?view=PLAYER')) return jsonResponse(observation('PLAYER', 7, 55, 'bot-1'))
      if (path.startsWith('/api/local/observe?view=GLOBAL')) return jsonResponse(observation('GLOBAL', 7, 99))
      if (path.startsWith('/api/local/god')) return jsonResponse({ match_id: 'match-1', tick: 7, live: true, contract: { api: 'v0.1', rules: 'v0.14', generator: 'local', resources: 'local', spawn: 'local' }, world_sha256: 'a'.repeat(64), settings: { human_full_vision: false }, operations: [], participants: localStatus().participants, state: { ...demoState, view_mode: 'GOD' }, players: [], tracked_chunks: [[0, 0]], resource_cells: [], plans: [], explored: [] })
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(flush)
    const socket = FakeWebSocket.instances[0]
    await act(async () => { socket.open(); socket.message({ type: 'tick', data: 7 }); socket.message({ type: 'state', data: demoState }); await flush() })

    await act(async () => { await result.current.setLocalObservation({ mode: 'PLAYER', playerId: 'bot-1' }) })
    expect(result.current.state?.resources).toBe(55)
    expect(result.current.readOnly).toBe(true)
    await act(async () => { await result.current.setLocalObservation({ mode: 'GLOBAL' }) })
    expect(result.current.state?.view_mode).toBe('GOD')
    expect(result.current.state?.resources).toBe(99)
    await expect(result.current.submit({ tick: 7, unit_actions: {} })).rejects.toThrow('observer view is read-only')
    await act(async () => { await result.current.setLocalObservation({ mode: 'HUMAN' }) })
    expect(result.current.readOnly).toBe(false)
    expect(result.current.explored.get('70,0')?.kind).toBe('EMPTY')
    expect(result.current.godSnapshot).toBeNull()
    await act(async () => { await result.current.loadGodDiagnostics() })
    expect(result.current.godSnapshot?.world_sha256).toBe('a'.repeat(64))
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/local/god'))).toHaveLength(1)
    unmount()
  })

  it('retains the previous global frame while cancelling stale Tick observations', async () => {
    let statusTick = 7
    let resolveEight!: (response: Response) => void
    let resolveNine!: (response: Response) => void
    const eight = new Promise<Response>((resolve) => { resolveEight = resolve })
    const nine = new Promise<Response>((resolve) => { resolveNine = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/local/session') return jsonResponse({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' })
      if (path.startsWith('/api/local/history')) return jsonResponse(localHistory(statusTick))
      if (path === '/api/local/match') return jsonResponse(localStatus(statusTick))
      if (path.startsWith('/api/local/observe?view=HUMAN')) return jsonResponse(observation('HUMAN', statusTick))
      if (path === '/api/local/observe?view=GLOBAL&match_id=match-1&tick=7') return jsonResponse(observation('GLOBAL', 7, 700))
      if (path === '/api/local/observe?view=GLOBAL&match_id=match-1&tick=8') return eight
      if (path === '/api/local/observe?view=GLOBAL&match_id=match-1&tick=9') return nine
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(flush)
    const socket = FakeWebSocket.instances[0]
    await act(async () => { socket.open(); socket.message({ type: 'tick', data: 7 }); socket.message({ type: 'state', data: demoState }); await flush() })
    await act(async () => { await result.current.setLocalObservation({ mode: 'GLOBAL' }) })
    expect(result.current.state?.resources).toBe(700)

    statusTick = 8
    await act(async () => { socket.message({ type: 'tick', data: 8 }); socket.message({ type: 'state', data: demoState }); await flush() })
    expect(result.current.tick).toBe(8)
    expect(result.current.state?.resources).toBe(700)
    expect(result.current.state?.view_mode).toBe('GOD')
    expect(result.current.observationPending).toBe(true)

    statusTick = 9
    await act(async () => { socket.message({ type: 'tick', data: 9 }); socket.message({ type: 'state', data: demoState }); await flush() })
    await act(async () => { resolveEight(new Response(JSON.stringify(observation('GLOBAL', 8, 800)), { status: 200, headers })); await flush() })
    expect(result.current.state?.resources).toBe(700)
    await act(async () => { resolveNine(new Response(JSON.stringify(observation('GLOBAL', 9, 900)), { status: 200, headers })); await flush() })
    expect(result.current.state?.resources).toBe(900)
    expect(result.current.observationPending).toBe(false)
    unmount()
  })

  it('updates participants and labels immediately and keeps the next Tick phase authoritative', async () => {
    let resolveAdvance!: (response: Response) => void
    const advanceResponse = new Promise<Response>((resolve) => { resolveAdvance = resolve })
    let statusTick = 42
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/local/session') return jsonResponse({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' })
      if (path.startsWith('/api/local/history')) return jsonResponse(localHistory(statusTick))
      if (path === '/api/local/match') return jsonResponse(localStatus(statusTick))
      if (path.startsWith('/api/local/observe?view=HUMAN')) return jsonResponse(observation('HUMAN', statusTick))
      if (path === '/api/local/advance') return advanceResponse
      if (path === '/api/local/god') return jsonResponse({ accepted: true, tick: statusTick, operation: 'ADD_PARTICIPANT', participant: { id: 'agent-1', username: 'late_agent', controller: 'AGENT', status: 'PENDING', activation_tick: statusTick, token: 'local-token' }, record: { seq: 1, match_id: 'match-1', tick: statusTick, applied_at: '2026-08-06T00:00:00Z', operation: 'ADD_PARTICIPANT', payload: { controller: 'AGENT', player_id: 'agent-1', username: 'late_agent' } } }, 201)
      if (path === '/api/local/label') return jsonResponse({ accepted: true, match_id: 'match-1', tick: statusTick, cleared: false, label: { match_id: 'match-1', tick: statusTick, label: 'Before battle', updated_at: '2026-08-06T00:00:00Z' }, labels: [{ match_id: 'match-1', tick: statusTick, label: 'Before battle', updated_at: '2026-08-06T00:00:00Z' }] })
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(flush)
    const socket = FakeWebSocket.instances[0]
    await act(async () => { socket.open(); socket.message({ type: 'tick', data: 42 }); socket.message({ type: 'state', data: demoState }); await flush() })
    await act(async () => { await result.current.addLocalParticipant('late_agent', 'AGENT') })
    expect(result.current.localStatus?.participants.at(-1)?.status).toBe('PENDING')
    await act(async () => { await result.current.setTickLabel('match-1', 42, 'Before battle') })
    expect(result.current.localHistory?.labels).toHaveLength(1)

    let advancing!: Promise<unknown>
    act(() => { advancing = result.current.advance() })
    expect(result.current.phase).toBe('settling')
    statusTick = 43
    await act(async () => { socket.message({ type: 'tick', data: 43 }); socket.message({ type: 'state', data: demoState }); await flush() })
    expect(result.current.phase).toBe('open')
    await act(async () => { resolveAdvance(new Response(JSON.stringify({ accepted: true, tick: 42 }), { status: 202, headers })); await advancing })
    expect(result.current.phase).toBe('open')
    unmount()
  })
})
