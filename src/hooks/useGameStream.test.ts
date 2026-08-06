import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoState } from '../lib/demo'
import { useGameStream } from './useGameStream'

vi.mock('../lib/exploration', () => ({
  loadExplored: vi.fn().mockResolvedValue(new Map()),
  rememberVisible: vi.fn().mockResolvedValue(new Map()),
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
      socket.message({
        type: 'received',
        data: {
          tick: 42,
          source: 'MANUAL',
          received_at: '2026-07-26T00:00:00Z',
          plan: {
            tick: 42,
            unit_actions: {
              '00000000-0000-4000-8000-000000000002': { type: 'HARVEST' },
            },
          },
        },
      })
    })

    expect(result.current.tick).toBe(42)
    expect(result.current.state).toEqual(demoState)
    expect(result.current.phase).toBe('open')
    expect(result.current.receipts.MANUAL?.tick).toBe(42)
    expect(result.current.receipts.MANUAL?.plan.unit_actions['00000000-0000-4000-8000-000000000002']?.type).toBe('HARVEST')
    unmount()
    expect(socket.close).toHaveBeenCalledWith(1000, 'component unmounted')
  })

  it('reconnects with bounded backoff but stops on policy violations', () => {
    const { result, unmount } = renderHook(() => useGameStream(false, 'hero'))
    const first = FakeWebSocket.instances[0]
    act(() => first.serverClose(1013, 'resync'))
    expect(result.current.phase).toBe('offline')

    act(() => vi.advanceTimersByTime(249))
    expect(FakeWebSocket.instances).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(FakeWebSocket.instances).toHaveLength(2)

    const second = FakeWebSocket.instances[1]
    act(() => {
      second.open()
      second.serverClose(1013, 'resync again')
      vi.advanceTimersByTime(250)
    })
    expect(FakeWebSocket.instances).toHaveLength(3)

    const third = FakeWebSocket.instances[2]
    act(() => third.serverClose(1008, 'credential inactive'))
    expect(result.current.error).toBe('UNAUTHORIZED')
    act(() => vi.advanceTimersByTime(10_000))
    expect(FakeWebSocket.instances).toHaveLength(3)
    unmount()
  })

  it('establishes a local session before opening the step-match socket', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mode: 'step', tick: 42, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }], match_id: 'match-1', root_match_id: 'match-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [{ id: 'match-1', label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: 42, active: true }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ match_id: 'match-1', tick: 42, live: true, state: demoState, receipts: {}, explored: [{ position: [0, 0], kind: 'EMPTY' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    expect(FakeWebSocket.instances).toHaveLength(0)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.localSession?.mode).toBe('step')
    expect(FakeWebSocket.instances).toHaveLength(1)

    const socket = FakeWebSocket.instances[0]
    await act(async () => {
      socket.open()
      socket.message({ type: 'tick', data: 42 })
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    expect(result.current.localStatus?.bots[0]).toEqual({ username: 'bot', ready: true })
    expect(result.current.localHistory?.active_match_id).toBe('match-1')
    expect(result.current.explored.get('0,0')?.kind).toBe('EMPTY')
    unmount()
  })

  it('bootstraps the official proxy before its WebSocket and submits to the Agent slot', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.arenahero.io')
    localStorage.setItem('arena-hero.csrf', 'account-csrf')
    localStorage.setItem('arena-hero.csrf.local', 'local-csrf')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      if (path === '/api/official/session') {
        return Promise.resolve(new Response(JSON.stringify({ csrf_token: 'official-csrf', mode: 'official-agent' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }
      if (path === '/api/official/v1/game/commands') {
        return Promise.resolve(new Response(JSON.stringify({ accepted: true, tick: 42, source: 'AGENT', received_at: '2026-08-06T00:00:00Z' }), { status: 202, headers: { 'Content-Type': 'application/json' } }))
      }
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'official-agent', false, true))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/official/session')
    expect(FakeWebSocket.instances).toHaveLength(0)

    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(FakeWebSocket.instances).toHaveLength(1)
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe('ws://localhost:3000/api/official/v1/game/ws')

    act(() => {
      socket.open()
      socket.message({ type: 'tick', data: 42 })
      socket.message({ type: 'state', data: demoState })
    })
    expect(result.current.submissionSource).toBe('AGENT')

    await act(async () => {
      await result.current.submit({ tick: 42, unit_actions: {} })
    })
    const [path, init] = fetchMock.mock.calls[1]
    expect(path).toBe('/api/official/v1/game/commands')
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('official-csrf')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/[0-9a-f-]{36}/)
    expect(localStorage.getItem('arena-hero.csrf')).toBe('account-csrf')
    expect(localStorage.getItem('arena-hero.csrf.local')).toBe('local-csrf')
    unmount()
  })

  it('shows a read-only replay and switches to a newly created branch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      const headers = { 'Content-Type': 'application/json' }
      if (path === '/api/local/session') return Promise.resolve(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' }), { status: 200, headers }))
      if (path === '/api/local/match') return Promise.resolve(new Response(JSON.stringify({ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }], match_id: 'match-1', root_match_id: 'match-1' }), { status: 200, headers }))
      if (path.startsWith('/api/local/history')) return Promise.resolve(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [{ id: 'match-1', label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: 7, active: true }] }), { status: 200, headers }))
      if (path.includes('/api/local/replay')) {
        const tick = Number(new URL(path, 'http://localhost').searchParams.get('tick'))
        return Promise.resolve(new Response(JSON.stringify({ match_id: 'match-1', tick, live: tick === 7, state: { ...demoState, resources: tick }, receipts: {}, explored: [{ position: [tick, 0], kind: 'EMPTY' }] }), { status: 200, headers }))
      }
      if (path === '/api/local/branch') return Promise.resolve(new Response(JSON.stringify({ accepted: true, match_id: 'branch-1', tick: 4, parent_match_id: 'match-1', parent_tick: 4 }), { status: 201, headers }))
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const socket = FakeWebSocket.instances[0]
    await act(async () => {
      socket.open()
      socket.message({ type: 'tick', data: 7 })
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })

    await act(async () => { await result.current.showReplay('match-1', 4) })
    expect(result.current.tick).toBe(4)
    expect(result.current.liveTick).toBe(7)
    expect(result.current.phase).toBe('replay')
    expect(result.current.state?.resources).toBe(4)
    expect(result.current.explored.has('4,0')).toBe(true)

    await act(async () => { await result.current.branchFromReplay() })
    expect(result.current.replay).toBeNull()
    expect(result.current.localSession?.match_id).toBe('branch-1')
    expect(result.current.phase).toBe('syncing')
    unmount()
  })

  it('switches live and historical views to complete god snapshots', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const path = String(input)
      const headers = { 'Content-Type': 'application/json' }
      if (path === '/api/local/session') return Promise.resolve(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1', god_mode: true }), { status: 200, headers }))
      if (path === '/api/local/match') return Promise.resolve(new Response(JSON.stringify({ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }], match_id: 'match-1', root_match_id: 'match-1', god: { human_full_vision: false } }), { status: 200, headers }))
      if (path.startsWith('/api/local/history')) return Promise.resolve(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [{ id: 'match-1', label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: 7, active: true }] }), { status: 200, headers }))
      if (path.startsWith('/api/local/replay')) return Promise.resolve(new Response(JSON.stringify({ match_id: 'match-1', tick: 7, live: true, state: demoState, receipts: {}, explored: [], god: { human_full_vision: false } }), { status: 200, headers }))
      if (path.startsWith('/api/local/god') && init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ accepted: true, tick: 7, operation: 'SET_HUMAN_FULL_VISION', changed: true, settings: { human_full_vision: true }, record: { seq: 1, match_id: 'match-1', tick: 7, applied_at: '2026-08-06T00:00:00Z', operation: 'SET_HUMAN_FULL_VISION', payload: { enabled: true } } }), { status: 200, headers }))
      if (path.startsWith('/api/local/god')) return Promise.resolve(new Response(JSON.stringify({ match_id: 'match-1', tick: 7, live: true, contract: { api: 'v0.1', rules: 'v0.13', generator: 'local', resources: 'local', spawn: 'local' }, world_sha256: 'a'.repeat(64), settings: { human_full_vision: false }, operations: [], state: { ...demoState, view_mode: 'GOD', resources: 99 }, players: [], tracked_chunks: [[0, 0]], resource_cells: [], plans: [], explored: [{ position: [20, 20], kind: 'EMPTY' }] }), { status: 200, headers }))
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const socket = FakeWebSocket.instances[0]
    await act(async () => {
      socket.open()
      socket.message({ type: 'tick', data: 7 })
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })

    await act(async () => { await result.current.setGodObservation(true) })
    expect(result.current.godView).toBe(true)
    expect(result.current.readOnly).toBe(true)
    expect(result.current.state?.view_mode).toBe('GOD')
    expect(result.current.state?.resources).toBe(99)
    expect(result.current.explored.has('20,20')).toBe(true)
    await expect(result.current.submit({ tick: 7, unit_actions: {} })).rejects.toThrow('god observation is read-only')

    await act(async () => { await result.current.setHumanFullVision(true) })
    expect(result.current.localStatus?.god.human_full_vision).toBe(true)
    expect(result.current.godSnapshot?.operations).toHaveLength(1)
    unmount()
  })

  it('updates local participants and Tick labels without waiting for another state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const path = String(input)
      const headers = { 'Content-Type': 'application/json' }
      if (path === '/api/local/session') return Promise.resolve(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1', god_mode: true }), { status: 200, headers }))
      if (path === '/api/local/match') return Promise.resolve(new Response(JSON.stringify({ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }], participants: [{ id: 'human-1', username: 'commander', controller: 'HUMAN', status: 'ACTIVE' }], match_id: 'match-1', root_match_id: 'match-1', god: { human_full_vision: false } }), { status: 200, headers }))
      if (path.startsWith('/api/local/history')) return Promise.resolve(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [{ id: 'match-1', label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: 7, active: true }], labels: [] }), { status: 200, headers }))
      if (path.startsWith('/api/local/replay')) return Promise.resolve(new Response(JSON.stringify({ match_id: 'match-1', tick: 7, live: true, state: demoState, receipts: {}, explored: [], god: { human_full_vision: false } }), { status: 200, headers }))
      if (path === '/api/local/god' && init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ accepted: true, tick: 7, operation: 'ADD_PARTICIPANT', participant: { id: 'agent-1', username: 'late_agent', controller: 'AGENT', status: 'PENDING', activation_tick: 7, token: 'local-token' }, record: { seq: 1, match_id: 'match-1', tick: 7, applied_at: '2026-08-06T00:00:00Z', operation: 'ADD_PARTICIPANT', payload: { controller: 'AGENT', player_id: 'agent-1', username: 'late_agent' } } }), { status: 201, headers }))
      if (path === '/api/local/label') return Promise.resolve(new Response(JSON.stringify({ accepted: true, match_id: 'match-1', tick: 7, cleared: false, label: { match_id: 'match-1', tick: 7, label: 'Before battle', updated_at: '2026-08-06T00:00:00Z' }, labels: [{ match_id: 'match-1', tick: 7, label: 'Before battle', updated_at: '2026-08-06T00:00:00Z' }] }), { status: 200, headers }))
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const socket = FakeWebSocket.instances[0]
    await act(async () => {
      socket.open()
      socket.message({ type: 'tick', data: 7 })
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })

    await act(async () => { await result.current.addLocalParticipant('late_agent', 'AGENT') })
    expect(result.current.localStatus?.participants.at(-1)?.status).toBe('PENDING')
    await act(async () => { await result.current.setTickLabel('match-1', 7, 'Before battle') })
    expect(result.current.localHistory?.labels).toHaveLength(1)
    expect(result.current.localStatus?.label?.label).toBe('Before battle')
    unmount()
  })

  it('ignores a stale live god snapshot after selecting a historical Tick', async () => {
    let resolveLiveGod!: (response: Response) => void
    const liveGodResponse = new Promise<Response>((resolve) => { resolveLiveGod = resolve })
    const godSnapshot = (tick: number) => ({
      match_id: 'match-1', tick, live: tick === 7,
      contract: { api: 'v0.1', rules: 'v0.13', generator: 'local', resources: 'local', spawn: 'local' },
      world_sha256: String(tick).repeat(64), settings: { human_full_vision: false }, operations: [],
      state: { ...demoState, view_mode: 'GOD', resources: tick }, players: [], tracked_chunks: [[0, 0]], resource_cells: [], plans: [], explored: [],
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      const headers = { 'Content-Type': 'application/json' }
      if (path === '/api/local/session') return Promise.resolve(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1', god_mode: true }), { status: 200, headers }))
      if (path === '/api/local/match') return Promise.resolve(new Response(JSON.stringify({ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }], match_id: 'match-1', root_match_id: 'match-1', god: { human_full_vision: false } }), { status: 200, headers }))
      if (path.startsWith('/api/local/history')) return Promise.resolve(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [{ id: 'match-1', label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: 7, active: true }] }), { status: 200, headers }))
      if (path.startsWith('/api/local/replay')) {
        const tick = Number(new URL(path, 'http://localhost').searchParams.get('tick'))
        return Promise.resolve(new Response(JSON.stringify({ match_id: 'match-1', tick, live: tick === 7, state: { ...demoState, resources: tick }, receipts: {}, explored: [], god: { human_full_vision: false } }), { status: 200, headers }))
      }
      if (path === '/api/local/god?match_id=match-1&tick=7') return liveGodResponse
      if (path === '/api/local/god?match_id=match-1&tick=4') return Promise.resolve(new Response(JSON.stringify(godSnapshot(4)), { status: 200, headers }))
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const socket = FakeWebSocket.instances[0]
    await act(async () => {
      socket.open()
      socket.message({ type: 'tick', data: 7 })
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })

    let enablingGod!: Promise<unknown>
    act(() => { enablingGod = result.current.setGodObservation(true) })
    await act(async () => { await result.current.showReplay('match-1', 4) })
    expect(result.current.godSnapshot?.tick).toBe(4)
    expect(result.current.state?.resources).toBe(4)

    await act(async () => {
      resolveLiveGod(new Response(JSON.stringify(godSnapshot(7)), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      await enablingGod
    })
    expect(result.current.godSnapshot?.tick).toBe(4)
    expect(result.current.state?.resources).toBe(4)
    unmount()
  })

  it('does not let an old advance response overwrite the next Tick phase', async () => {
    let resolveAdvance!: (response: Response) => void
    const advanceResponse = new Promise<Response>((resolve) => { resolveAdvance = resolve })
    let statusTick = 42
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = String(input)
      const headers = { 'Content-Type': 'application/json' }
      if (path === '/api/local/session') return Promise.resolve(new Response(JSON.stringify({ csrf_token: 'local-csrf', username: 'commander', mode: 'step', match_id: 'match-1' }), { status: 200, headers }))
      if (path === '/api/local/match') return Promise.resolve(new Response(JSON.stringify({ mode: 'step', tick: statusTick, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }], match_id: 'match-1', root_match_id: 'match-1' }), { status: 200, headers }))
      if (path.startsWith('/api/local/history')) return Promise.resolve(new Response(JSON.stringify({ active_match_id: 'match-1', selected_match_id: 'match-1', matches: [{ id: 'match-1', label: 'demo', created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', root_match_id: 'match-1', parent_match_id: null, parent_tick: null, first_tick: 1, latest_tick: statusTick, active: true }] }), { status: 200, headers }))
      if (path.startsWith('/api/local/replay')) return Promise.resolve(new Response(JSON.stringify({ match_id: 'match-1', tick: statusTick, live: true, state: demoState, receipts: {}, explored: [] }), { status: 200, headers }))
      if (path === '/api/local/advance') return advanceResponse
      throw new Error(`unexpected request: ${path}`)
    })

    const { result, unmount } = renderHook(() => useGameStream(false, 'local', true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const socket = FakeWebSocket.instances[0]
    await act(async () => {
      socket.open()
      socket.message({ type: 'tick', data: 42 })
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve()
    })

    let advancing!: Promise<unknown>
    act(() => { advancing = result.current.advance() })
    expect(result.current.phase).toBe('settling')

    await act(async () => {
      socket.message({ type: 'tick', data: 43 })
      statusTick = 43
      socket.message({ type: 'state', data: demoState })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    expect(result.current.phase).toBe('open')

    await act(async () => {
      resolveAdvance(new Response(JSON.stringify({ accepted: true, tick: 42 }), { status: 202, headers: { 'Content-Type': 'application/json' } }))
      await advancing
    })
    expect(result.current.phase).toBe('open')
    unmount()
  })
})
