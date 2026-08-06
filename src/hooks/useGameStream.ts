import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, APIError, apiURL } from '../lib/api'
import { demoReceipt, demoState } from '../lib/demo'
import { isReceivedNotice, type CommandReceipts } from '../lib/commandPlans'
import { loadExplored, rememberVisible, type ExploredCell } from '../lib/exploration'
import { positionKey } from '../lib/visibility'
import type { CommandPlan, LocalHistory, LocalMatchStatus, LocalReplay, LocalSession, PlayerState, ReceivedNotice, StreamPhase } from '../lib/types'

type GameMessage =
  | { type: 'tick'; data: number }
  | { type: 'state'; data: PlayerState }
  | { type: 'received'; data: ReceivedNotice }

const reconnectBaseMs = 250
const reconnectMaxMs = 5_000

function gameWebSocketURL() {
  const url = new URL(apiURL('/api/v1/game/ws'), window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function reconnectDelay(attempt: number) {
  const exponential = reconnectBaseMs * (2 ** Math.min(attempt, 8))
  const bounded = Math.min(reconnectMaxMs, exponential)
  return Math.round(bounded * (0.8 + Math.random() * 0.4))
}

export function useGameStream(demo = false, explorationNamespace = 'anonymous', localMatch = false) {
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
  const tickRef = useRef<number | null>(liveTick)
  const activeMatchIdRef = useRef<string | null>(null)
  const replayRef = useRef<LocalReplay | null>(null)
  const replayRequestRef = useRef(0)
  const localContextRequestRef = useRef(0)
  const mergeExplored = useCallback((cells: Map<string, ExploredCell>) => {
    setExplored((current) => {
      if (!current.size) return cells
      const merged = new Map(current)
      for (const [key, cell] of cells) merged.set(key, cell)
      return merged
    })
  }, [])

  useEffect(() => {
    setExplored(new Map())
    if (localMatch) return
    void loadExplored(explorationNamespace).then(mergeExplored).catch(() => undefined)
  }, [explorationNamespace, localMatch, mergeExplored])
  useEffect(() => {
    if (demo) { setLiveState(demoState); void rememberVisible(explorationNamespace, demoState).then(mergeExplored).catch(() => undefined); return }
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let stopped = false

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer !== null) return
      const delay = reconnectDelay(reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (stopped) return
      setPhase((current) => current === 'offline' ? 'connecting' : current)
      const next = new WebSocket(gameWebSocketURL())
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
            if (!Number.isSafeInteger(message.data) || message.data < 0) throw new Error('invalid tick')
            tickRef.current = message.data; setLiveTick(message.data); setPhase('syncing'); setLiveReceipts({}); setLocalStatus(null); setError('')
            return
          }
          if (message.type === 'state') {
            if (!message.data || typeof message.data !== 'object') throw new Error('invalid state')
            setLiveState(message.data); setStateReceivedAt(Date.now()); setPhase('open')
            if (localMatch) {
              const stateTick = tickRef.current
              const contextRequest = ++localContextRequestRef.current
              void api.localMatch().then(async (status) => {
                if (stopped || contextRequest !== localContextRequestRef.current) return
                setLocalStatus(status)
                const matchId = status.match_id ?? activeMatchIdRef.current
                if (!matchId || stateTick === null) return
                activeMatchIdRef.current = matchId
                const [history, liveReplay] = await Promise.all([
                  api.localHistory(matchId),
                  api.localReplay(matchId, stateTick),
                ])
                if (stopped || contextRequest !== localContextRequestRef.current || activeMatchIdRef.current !== matchId || tickRef.current !== stateTick) return
                setLocalHistory(history)
                setExplored(new Map(liveReplay.explored.map((cell) => [positionKey(cell.position), cell])))
              }).catch((cause) => {
                setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
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
        if (socket === next) setPhase('offline')
      }
      next.onclose = (event) => {
        if (socket !== next) return
        socket = null
        setPhase('offline')
        if (stopped || event.code === 1000) return
        if (event.code === 1008) {
          setError('UNAUTHORIZED')
          return
        }
        scheduleReconnect()
      }
    }

    if (localMatch) {
      void api.startLocalSession().then((session) => {
        if (stopped) return
        activeMatchIdRef.current = session.match_id
        setLocalSession(session)
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
      if (socket) socket.close(1000, 'component unmounted')
    }
  }, [demo, explorationNamespace, localMatch, mergeExplored])

  const submit = useCallback(async (plan: CommandPlan) => {
    if (replayRef.current) throw new Error('local replay is read-only')
    setError('')
    try {
      const receipt = demo ? { ...demoReceipt, tick: plan.tick, received_at: new Date().toISOString() } : await api.submitCommands(plan)
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
  }, [demo])

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
    setError('')
    try {
      const [nextReplay, history] = await Promise.all([
        api.localReplay(matchId, tick),
        api.localHistory(matchId),
      ])
      if (requestId !== replayRequestRef.current) return nextReplay
      replayRef.current = nextReplay
      setReplay(nextReplay)
      setLocalHistory(history)
      return nextReplay
    } catch (cause) {
      if (requestId === replayRequestRef.current) setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch])

  const returnLive = useCallback(() => {
    replayRequestRef.current += 1
    replayRef.current = null
    setReplay(null)
    setError('')
  }, [])

  const branchFromReplay = useCallback(async () => {
    const selected = replayRef.current
    if (!localMatch || !selected) throw new Error('local replay unavailable')
    localContextRequestRef.current += 1
    setError('')
    try {
      const receipt = await api.branchLocalMatch(selected.match_id, selected.tick)
      activeMatchIdRef.current = receipt.match_id
      replayRequestRef.current += 1
      replayRef.current = null
      setReplay(null)
      setLocalHistory(null)
      setLocalStatus(null)
      setLocalSession((current) => current ? { ...current, match_id: receipt.match_id } : current)
      setExplored(new Map())
      setPhase('syncing')
      return receipt
    } catch (cause) {
      setError(cause instanceof APIError ? cause.code : 'REQUEST_FAILED')
      throw cause
    }
  }, [localMatch])

  const replayExplored = useMemo(() => replay
    ? new Map(replay.explored.map((cell) => [positionKey(cell.position), cell]))
    : null, [replay])
  const tick = replay?.tick ?? liveTick
  const state = replay?.state ?? liveState
  const receipts: CommandReceipts = replay?.receipts ?? liveReceipts
  const displayedPhase: StreamPhase = replay ? 'replay' : phase

  return {
    tick,
    liveTick,
    state,
    phase: displayedPhase,
    stateReceivedAt: replay ? null : stateReceivedAt,
    receipts,
    explored: replayExplored ?? explored,
    error,
    submit,
    localSession,
    localStatus,
    localHistory,
    replay,
    advance,
    showReplay,
    returnLive,
    branchFromReplay,
  }
}
