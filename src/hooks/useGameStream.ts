import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, APIError, apiURL, officialApi } from '../lib/api'
import { demoReceipt, demoState } from '../lib/demo'
import { isReceivedNotice, type CommandReceipts } from '../lib/commandPlans'
import { loadExplored, observedCells, rememberVisible, type ExploredCell } from '../lib/exploration'
import { positionKey } from '../lib/visibility'
import type { CommandPlan, LocalChunkViewport, LocalCompactExploration, LocalGodSnapshot, LocalHistory, LocalMatchStatus, LocalObservation, LocalReplay, LocalSession, LocalViewSelection, PlayerState, ReceivedNotice, StreamPhase } from '../lib/types'

type GameMessage =
  | { type: 'tick'; data: number }
  | { type: 'state'; data: PlayerState }
  | { type: 'received'; data: ReceivedNotice }

const reconnectBaseMs = 250
const reconnectMaxMs = 5_000

function gameWebSocketURL(path = '/api/v1/game/ws', baseURL?: string) {
  const url = new URL(apiURL(path, baseURL), window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function reconnectDelay(attempt: number) {
  const exponential = reconnectBaseMs * (2 ** Math.min(attempt, 8))
  const bounded = Math.min(reconnectMaxMs, exponential)
  return Math.round(bounded * (0.8 + Math.random() * 0.4))
}

function isAbortError(cause: unknown) {
  return cause instanceof Error && cause.name === 'AbortError'
}

function sameView(left: LocalViewSelection, right: LocalViewSelection) {
  return left.mode === right.mode
    && (left.mode !== 'PLAYER' || (right.mode === 'PLAYER' && left.playerId === right.playerId))
}

function observationMatchesView(observation: LocalObservation, view: LocalViewSelection) {
  return observation.view.mode === view.mode
    && (view.mode !== 'PLAYER' || observation.view.player_id === view.playerId)
}

function sameViewport(left: LocalChunkViewport | null, right: LocalChunkViewport) {
  return left?.min_chunk_x === right.min_chunk_x
    && left.max_chunk_x === right.max_chunk_x
    && left.min_chunk_y === right.min_chunk_y
    && left.max_chunk_y === right.max_chunk_y
}

function exploredMap(cells: ExploredCell[]) {
  return new Map(cells.map((cell) => [positionKey(cell.position), cell]))
}

function compactExploredMap(document: LocalCompactExploration) {
  const cells = new Map<string, ExploredCell>()
  for (const [y, startX, endX] of document.ranges) {
    for (let x = startX; x <= endX; x++) cells.set(positionKey([x, y]), { position: [x, y], kind: 'EMPTY' })
  }
  for (const position of document.obstacles) cells.set(positionKey(position), { position, kind: 'OBSTACLE' })
  for (const position of document.resources) cells.set(positionKey(position), { position, kind: 'RESOURCE' })
  return cells
}

export function useGameStream(demo = false, explorationNamespace = 'anonymous', localMatch = false, officialAgent = false) {
  const [liveTick, setLiveTick] = useState<number | null>(demo ? 10583 : null)
  const [liveState, setLiveState] = useState<PlayerState | null>(demo ? demoState : null)
  const [phase, setPhase] = useState<StreamPhase>(demo ? 'open' : 'connecting')
  const [stateReceivedAt, setStateReceivedAt] = useState<number | null>(() => demo ? Date.now() : null)
  const [liveReceipts, setLiveReceipts] = useState<CommandReceipts>({})
  const [explored, setExplored] = useState<Map<string, ExploredCell>>(new Map())
  const [error, setError] = useState('')
  const [localSession, setLocalSession] = useState<LocalSession | null>(null)
  const [localStatus, setLocalStatus] = useState<LocalMatchStatus | null>(null)
  const [localHistory, setLocalHistory] = useState<LocalHistory | null>(null)
  const [replay, setReplay] = useState<LocalReplay | null>(null)
  const [localView, setLocalView] = useState<LocalViewSelection>({ mode: 'HUMAN' })
  const [observation, setObservation] = useState<LocalObservation | null>(null)
  const [observationPending, setObservationPending] = useState(false)
  const [godSnapshot, setGodSnapshot] = useState<LocalGodSnapshot | null>(null)
  const tickRef = useRef<number | null>(liveTick)
  const activeMatchIdRef = useRef<string | null>(null)
  const replayRef = useRef<LocalReplay | null>(null)
  const localViewRef = useRef<LocalViewSelection>({ mode: 'HUMAN' })
  const observationViewportRef = useRef<LocalChunkViewport | null>(null)
  const historyRef = useRef<LocalHistory | null>(null)
  const humanExplorationMatchRef = useRef<string | null>(null)
  const replayRequestRef = useRef(0)
  const observationRequestRef = useRef(0)
  const godRequestRef = useRef(0)
  const localContextRequestRef = useRef(0)
  const contextAbortRef = useRef<AbortController | null>(null)
  const observationAbortRef = useRef<AbortController | null>(null)
  const replayAbortRef = useRef<AbortController | null>(null)
  const historyAbortRef = useRef<AbortController | null>(null)
  const godAbortRef = useRef<AbortController | null>(null)

  const mergeExplored = useCallback((cells: Map<string, ExploredCell>) => {
    setExplored((current) => {
      if (!current.size) return cells
      const merged = new Map(current)
      for (const [key, cell] of cells) merged.set(key, cell)
      return merged
    })
  }, [])

  const applyHistory = useCallback((history: LocalHistory) => {
    historyRef.current = history
    setLocalHistory(history)
  }, [])

  const loadHistory = useCallback(async (matchId: string) => {
    historyAbortRef.current?.abort()
    const controller = new AbortController()
    historyAbortRef.current = controller
    try {
      const history = await api.localHistory(matchId, controller.signal)
      if (historyAbortRef.current !== controller) return null
      applyHistory(history)
      return history
    } catch (cause) {
      if (isAbortError(cause)) return null
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [applyHistory])

  const requestObservation = useCallback(async (
    view: LocalViewSelection,
    matchId: string | null,
    tick: number | null,
  ) => {
    if (!localMatch) throw new Error('local observation unavailable')
    const requestId = ++observationRequestRef.current
    observationAbortRef.current?.abort()
    const controller = new AbortController()
    observationAbortRef.current = controller
    setObservationPending(true)
    try {
      const snapshot = await api.localObserve(
        view.mode,
        view.mode === 'PLAYER' ? view.playerId : null,
        matchId,
        tick,
        controller.signal,
        view.mode === 'GLOBAL' ? observationViewportRef.current : null,
      )
      if (requestId !== observationRequestRef.current || observationAbortRef.current !== controller) return null
      if (view.mode === 'HUMAN') {
        if (localViewRef.current.mode === 'HUMAN') {
          setExplored(compactExploredMap(snapshot.exploration))
          humanExplorationMatchRef.current = snapshot.match_id
        }
      } else if (sameView(localViewRef.current, view)) {
        setObservation(snapshot)
      }
      return snapshot
    } catch (cause) {
      if (isAbortError(cause)) return null
      if (requestId === observationRequestRef.current) setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    } finally {
      if (requestId === observationRequestRef.current) setObservationPending(false)
    }
  }, [localMatch])

  useEffect(() => {
    setExplored(new Map())
    if (localMatch) return
    void loadExplored(explorationNamespace).then(mergeExplored).catch(() => undefined)
  }, [explorationNamespace, localMatch, mergeExplored])

  useEffect(() => {
    if (demo) {
      setLiveState(demoState)
      void rememberVisible(explorationNamespace, demoState).then(mergeExplored).catch(() => undefined)
      return
    }
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let connecting = false
    let stopped = false

    const applyLocalSession = (session: LocalSession) => {
      if (session.observer_only) {
        if (!session.observer_player_id) throw new Error('observer-only local session is missing its observer player')
        const observerView: LocalViewSelection = { mode: 'PLAYER', playerId: session.observer_player_id }
        localViewRef.current = observerView
        setLocalView(observerView)
      } else {
        localViewRef.current = { mode: 'HUMAN' }
        setLocalView({ mode: 'HUMAN' })
        setObservation(null)
      }
      activeMatchIdRef.current = session.match_id
      setLocalSession(session)
      if (session.match_id) void loadHistory(session.match_id).catch(() => undefined)
    }

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer !== null) return
      const delay = reconnectDelay(reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const openSocket = () => {
      if (stopped) return
      const path = officialAgent ? '/api/official/v1/game/ws' : '/api/v1/game/ws'
      const next = new WebSocket(gameWebSocketURL(path, localMatch || officialAgent ? '' : undefined))
      socket = next
      next.onopen = () => {
        if (socket !== next) return
        reconnectAttempt = 0
        setError('')
        setPhase((current) => current === 'offline' ? 'connecting' : current)
      }
      next.onmessage = (event) => {
        if (socket !== next) return
        try {
          const message = JSON.parse(String(event.data)) as GameMessage
          if (message.type === 'tick') {
            if (!Number.isSafeInteger(message.data) || message.data <= 0) throw new Error('invalid tick')
            tickRef.current = message.data
            setLiveTick(message.data)
            setPhase('syncing')
            setLiveReceipts({})
            setError('')
            contextAbortRef.current?.abort()
            observationAbortRef.current?.abort()
            return
          }
          if (message.type === 'state') {
            if (!message.data || typeof message.data !== 'object') throw new Error('invalid state')
            setLiveState(message.data)
            setStateReceivedAt(Date.now())
            setPhase('open')
            if (localMatch) {
              mergeExplored(observedCells(message.data))
              const stateTick = tickRef.current
              const contextRequest = ++localContextRequestRef.current
              contextAbortRef.current?.abort()
              const controller = new AbortController()
              contextAbortRef.current = controller
              void api.localMatch(controller.signal).then((status) => {
                if (stopped || controller.signal.aborted || contextRequest !== localContextRequestRef.current) return
                setLocalStatus(status)
                const matchId = status.match_id ?? activeMatchIdRef.current
                if (!matchId || stateTick === null || tickRef.current !== stateTick) return
                activeMatchIdRef.current = matchId
                setLocalHistory((current) => {
                  if (!current) return current
                  const matches = current.matches.map((match) => match.id === matchId && match.latest_tick !== stateTick
                    ? { ...match, latest_tick: stateTick }
                    : match)
                  const nextHistory = { ...current, active_match_id: matchId, matches }
                  historyRef.current = nextHistory
                  return nextHistory
                })
                if (replayRef.current) return
                const view = localViewRef.current
                if (view.mode !== 'HUMAN') {
                  void requestObservation(view, matchId, stateTick).catch(() => undefined)
                  return
                }
                if (message.data.view_mode || humanExplorationMatchRef.current !== matchId) {
                  void requestObservation({ mode: 'HUMAN' }, matchId, stateTick).then((snapshot) => {
                    if (snapshot && tickRef.current === stateTick) humanExplorationMatchRef.current = matchId
                  }).catch(() => undefined)
                }
              }).catch((cause) => {
                if (!isAbortError(cause) && contextRequest === localContextRequestRef.current) {
                  setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
                }
              })
            } else {
              void rememberVisible(explorationNamespace, message.data).then(mergeExplored).catch(() => undefined)
            }
            return
          }
          if (message.type === 'received') {
            if (!isReceivedNotice(message.data) || message.data.tick !== tickRef.current) throw new Error('invalid receipt')
            setLiveReceipts((current) => ({ ...current, [message.data.source]: message.data }))
            return
          }
          throw new Error('unknown message')
        } catch {
          setError('STATE_INVALID')
          next.close(1002, 'invalid server message')
        }
      }
      next.onerror = () => {
        if (socket !== next) return
        setPhase('offline')
        if (officialAgent) setError('OFFICIAL_PROXY_UNAVAILABLE')
      }
      next.onclose = (event) => {
        if (socket !== next) return
        socket = null
        setPhase('offline')
        if (stopped || event.code === 1000) return
        if (event.code === 1008) {
          setError(officialAgent ? 'OFFICIAL_AGENT_UNAUTHORIZED' : 'UNAUTHORIZED')
          return
        }
        if (localMatch && event.code === 1012) {
          void api.startLocalSession().then((session) => {
            if (stopped) return
            applyLocalSession(session)
            scheduleReconnect()
          }).catch((cause) => {
            if (stopped) return
            setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
          })
          return
        }
        if (officialAgent && [1006, 1011, 1013].includes(event.code)) setError('OFFICIAL_PROXY_UNAVAILABLE')
        scheduleReconnect()
      }
    }

    const connect = () => {
      if (stopped || socket || connecting) return
      setPhase((current) => current === 'offline' ? 'connecting' : current)
      if (!officialAgent) {
        openSocket()
        return
      }
      connecting = true
      void officialApi.startSession().then(() => {
        connecting = false
        if (!stopped) openSocket()
      }).catch((cause) => {
        connecting = false
        if (stopped) return
        const code = cause instanceof APIError ? cause.code : 'OFFICIAL_PROXY_UNAVAILABLE'
        setError(code)
        setPhase('offline')
        if (code !== 'OFFICIAL_PROXY_ORIGIN_INVALID' && code !== 'OFFICIAL_AGENT_UNAUTHORIZED') scheduleReconnect()
      })
    }

    if (localMatch) {
      void api.startLocalSession().then((session) => {
        if (stopped) return
        applyLocalSession(session)
        connect()
      }).catch((cause) => {
        if (stopped) return
        setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
        setPhase('offline')
      })
    } else {
      connect()
    }
    return () => {
      stopped = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      contextAbortRef.current?.abort()
      observationAbortRef.current?.abort()
      replayAbortRef.current?.abort()
      historyAbortRef.current?.abort()
      godAbortRef.current?.abort()
      if (socket) socket.close(1000, 'component unmounted')
    }
  }, [demo, explorationNamespace, loadHistory, localMatch, mergeExplored, officialAgent, requestObservation])

  const submit = useCallback(async (plan: CommandPlan) => {
    if (replayRef.current || localViewRef.current.mode !== 'HUMAN') throw new Error('local replay or observer view is read-only')
    setError('')
    try {
      const receipt = demo
        ? { ...demoReceipt, tick: plan.tick, received_at: new Date().toISOString() }
        : officialAgent
          ? await officialApi.submitCommands(plan)
          : await api.submitCommands(plan)
      if (demo) {
        setLiveReceipts((current) => ({
          ...current,
          MANUAL: { tick: receipt.tick, source: 'MANUAL', received_at: receipt.received_at, plan },
        }))
      }
      return receipt
    } catch (cause) {
      const code = cause instanceof APIError ? cause.code : 'REQUEST_FAILED'
      if (tickRef.current === plan.tick) {
        setError(code)
        if (code === 'COMMAND_WINDOW_CLOSED' || code === 'TICK_MISMATCH') setPhase('settling')
      }
      throw cause
    }
  }, [demo, officialAgent])

  const advance = useCallback(async () => {
    const currentTick = tickRef.current
    if (!localMatch || currentTick === null || replayRef.current) throw new Error('local Tick unavailable')
    setError('')
    setPhase('settling')
    try {
      return await api.advanceLocalTick(currentTick)
    } catch (cause) {
      setPhase((current) => current === 'settling' ? 'open' : current)
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch])

  const showReplay = useCallback(async (matchId: string, tick: number) => {
    if (!localMatch) throw new Error('local replay unavailable')
    const requestId = ++replayRequestRef.current
    replayAbortRef.current?.abort()
    const controller = new AbortController()
    replayAbortRef.current = controller
    const view = localViewRef.current
    const observationRequestId = view.mode === 'HUMAN' ? null : ++observationRequestRef.current
    if (observationRequestId !== null) {
      observationAbortRef.current?.abort()
      setObservationPending(true)
    }
    setError('')
    if (historyRef.current?.selected_match_id !== matchId) void loadHistory(matchId).catch(() => undefined)
    try {
      const [nextReplay, nextObservation] = await Promise.all([
        api.localReplay(matchId, tick, controller.signal),
        view.mode === 'HUMAN'
          ? Promise.resolve(null)
          : api.localObserve(view.mode, view.mode === 'PLAYER' ? view.playerId : null, matchId, tick, controller.signal, view.mode === 'GLOBAL' ? observationViewportRef.current : null),
      ])
      if (requestId !== replayRequestRef.current || replayAbortRef.current !== controller) return nextReplay
      replayRef.current = nextReplay
      setReplay(nextReplay)
      if (nextObservation && observationRequestId === observationRequestRef.current && sameView(localViewRef.current, view)) setObservation(nextObservation)
      return nextReplay
    } catch (cause) {
      if (!isAbortError(cause) && requestId === replayRequestRef.current) setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    } finally {
      if (requestId === replayRequestRef.current && (observationRequestId === null || observationRequestId === observationRequestRef.current)) setObservationPending(false)
    }
  }, [loadHistory, localMatch])

  const returnLive = useCallback(() => {
    replayRequestRef.current += 1
    replayAbortRef.current?.abort()
    replayRef.current = null
    setReplay(null)
    setError('')
    const matchId = activeMatchIdRef.current
    const tick = tickRef.current
    if (matchId && historyRef.current?.selected_match_id !== matchId) void loadHistory(matchId).catch(() => undefined)
    const view = localViewRef.current
    if (matchId && tick !== null) void requestObservation(view, matchId, tick).catch(() => undefined)
  }, [loadHistory, requestObservation])

  const branchFromReplay = useCallback(async () => {
    const selected = replayRef.current
    if (!localMatch || !selected) throw new Error('local replay unavailable')
    localContextRequestRef.current += 1
    contextAbortRef.current?.abort()
    observationAbortRef.current?.abort()
    setError('')
    try {
      const receipt = await api.branchLocalMatch(selected.match_id, selected.tick)
      activeMatchIdRef.current = receipt.match_id
      replayRequestRef.current += 1
      replayAbortRef.current?.abort()
      replayRef.current = null
      setReplay(null)
      historyRef.current = null
      setLocalHistory(null)
      setLocalStatus(null)
      setLocalSession((current) => current ? { ...current, match_id: receipt.match_id } : current)
      setExplored(exploredMap(selected.explored))
      humanExplorationMatchRef.current = null
      setPhase('syncing')
      void loadHistory(receipt.match_id).catch(() => undefined)
      return receipt
    } catch (cause) {
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [loadHistory, localMatch])

  const setLocalObservation = useCallback(async (nextView: LocalViewSelection) => {
    if (!localMatch) throw new Error('local observation unavailable')
    const previous = localViewRef.current
    if (sameView(previous, nextView)) return null
    localViewRef.current = nextView
    setLocalView(nextView)
    setError('')
    const selected = replayRef.current
    if (nextView.mode === 'HUMAN' && selected) {
      observationRequestRef.current += 1
      observationAbortRef.current?.abort()
      setObservationPending(false)
      return null
    }
    const matchId = selected?.match_id ?? activeMatchIdRef.current
    const selectedTick = selected?.tick ?? tickRef.current
    try {
      return await requestObservation(nextView, matchId, selectedTick)
    } catch (cause) {
      localViewRef.current = previous
      setLocalView(previous)
      throw cause
    }
  }, [localMatch, requestObservation])

  const setGodObservation = useCallback((enabled: boolean) => {
    if (enabled) return setLocalObservation({ mode: 'GLOBAL' })
    if (localSession?.observer_only && localSession.observer_player_id) {
      return setLocalObservation({ mode: 'PLAYER', playerId: localSession.observer_player_id })
    }
    return setLocalObservation({ mode: 'HUMAN' })
  }, [localSession, setLocalObservation])

  const setObservationViewport = useCallback((viewport: LocalChunkViewport) => {
    if (sameViewport(observationViewportRef.current, viewport)) return
    observationViewportRef.current = viewport
    const view = localViewRef.current
    if (!localMatch || view.mode !== 'GLOBAL') return
    const selected = replayRef.current
    const matchId = selected?.match_id ?? activeMatchIdRef.current
    const selectedTick = selected?.tick ?? tickRef.current
    void requestObservation(view, matchId, selectedTick).catch(() => undefined)
  }, [localMatch, requestObservation])

  const loadGodDiagnostics = useCallback(async () => {
    if (!localMatch) throw new Error('local god mode unavailable')
    const requestId = ++godRequestRef.current
    godAbortRef.current?.abort()
    const controller = new AbortController()
    godAbortRef.current = controller
    const selected = replayRef.current
    const matchId = selected?.match_id ?? activeMatchIdRef.current
    const selectedTick = selected?.tick ?? tickRef.current
    setError('')
    try {
      const snapshot = await api.localGod(matchId, selectedTick, controller.signal)
      if (requestId === godRequestRef.current && godAbortRef.current === controller) setGodSnapshot(snapshot)
      return snapshot
    } catch (cause) {
      if (!isAbortError(cause) && requestId === godRequestRef.current) setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch])

  const setHumanFullVision = useCallback(async (enabled: boolean) => {
    if (!localMatch || replayRef.current) throw new Error('local god operation unavailable')
    setError('')
    try {
      const receipt = await api.setHumanFullVision(enabled)
      setLocalStatus((current) => current ? { ...current, god: receipt.settings } : current)
      setGodSnapshot((current) => current?.live ? {
        ...current,
        settings: receipt.settings,
        operations: receipt.record ? [...current.operations, receipt.record] : current.operations,
      } : current)
      const matchId = activeMatchIdRef.current
      const tick = tickRef.current
      if (localViewRef.current.mode === 'HUMAN' && matchId && tick !== null) {
        void requestObservation({ mode: 'HUMAN' }, matchId, tick).catch(() => undefined)
      }
      return receipt
    } catch (cause) {
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch, requestObservation])

  const addLocalParticipant = useCallback(async (username: string, controller: 'AGENT' | 'BOT') => {
    if (!localMatch || replayRef.current) throw new Error('local god operation unavailable')
    setError('')
    try {
      const receipt = await api.addLocalParticipant(username, controller)
      setLocalStatus((current) => current ? {
        ...current,
        participants: [...current.participants, receipt.participant],
      } : current)
      setGodSnapshot((current) => current?.live ? {
        ...current,
        participants: [...current.participants, receipt.participant],
        operations: [...current.operations, receipt.record],
      } : current)
      return receipt
    } catch (cause) {
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch])

  const setTickLabel = useCallback(async (matchId: string, tick: number, label: string) => {
    if (!localMatch) throw new Error('local labels unavailable')
    setError('')
    try {
      const receipt = await api.setLocalTickLabel(matchId, tick, label)
      setLocalHistory((current) => {
        if (current?.selected_match_id !== matchId) return current
        const next = { ...current, labels: receipt.labels }
        historyRef.current = next
        return next
      })
      setLocalStatus((current) => current?.match_id === matchId && current.tick === tick ? {
        ...current,
        ...(receipt.label ? { label: receipt.label } : { label: undefined }),
      } : current)
      setReplay((current) => {
        if (!current || current.match_id !== matchId || current.tick !== tick) return current
        const next = { ...current, ...(receipt.label ? { label: receipt.label } : { label: undefined }) }
        replayRef.current = next
        return next
      })
      setGodSnapshot((current) => current?.match_id === matchId && current.tick === tick ? {
        ...current,
        ...(receipt.label ? { label: receipt.label } : { label: undefined }),
      } : current)
      return receipt
    } catch (cause) {
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch])

  const replayExplored = useMemo(() => replay ? exploredMap(replay.explored) : null, [replay])
  const selectedMatchId = replay?.match_id ?? localStatus?.match_id ?? localSession?.match_id ?? null
  const activeObservation = observation
    && observation.match_id === selectedMatchId
    && observationMatchesView(observation, localView)
    ? observation
    : null
  const observationExplored = useMemo(() => activeObservation ? compactExploredMap(activeObservation.exploration) : null, [activeObservation])
  const tick = replay?.tick ?? liveTick
  const state = activeObservation?.state ?? replay?.state ?? liveState
  const receipts: CommandReceipts = replay?.receipts ?? liveReceipts
  const displayedPhase: StreamPhase = replay ? 'replay' : phase
  const godView = localView.mode === 'GLOBAL'

  return {
    tick,
    liveTick,
    state,
    phase: displayedPhase,
    stateReceivedAt: replay || localView.mode !== 'HUMAN' ? null : stateReceivedAt,
    receipts,
    explored: observationExplored ?? replayExplored ?? explored,
    error,
    submit,
    localSession,
    localStatus,
    localHistory,
    replay,
    localView,
    observation: activeObservation,
    observationPending,
    godView,
    godSnapshot,
    readOnly: Boolean(replay || localView.mode !== 'HUMAN'),
    advance,
    showReplay,
    returnLive,
    branchFromReplay,
    setLocalObservation,
    setGodObservation,
    setObservationViewport,
    loadGodDiagnostics,
    setHumanFullVision,
    addLocalParticipant,
    setTickLabel,
    submissionSource: officialAgent ? 'AGENT' as const : 'MANUAL' as const,
  }
}
