import { AlertTriangle, LoaderCircle, ScrollText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AssetList } from '../components/game/AssetList'
import { MapControls } from '../components/game/MapControls'
import { OfficialReplayControl, type ReplayJump } from '../components/game/OfficialReplayControl'
import { PendingCommands } from '../components/game/PendingCommands'
import { ResourceActivity } from '../components/game/ResourceActivity'
import { WorldCanvas } from '../components/game/WorldCanvas'
import { APIError, replayApi } from '../lib/api'
import { buildCoreReplayLives, buildReplayExplorationIndex, replayExploredAt } from '../lib/captureReplay'
import type { CaptureReplayFrame, CaptureReplayManifest, GameEvent, Position, WorldObject } from '../lib/types'

const EMPTY_SET = new Set<string>()
const EMPTY_LIST: never[] = []

export function ReplayPage() {
  const { t, i18n } = useTranslation()
  const [manifest, setManifest] = useState<CaptureReplayManifest | null>(null)
  const [frames, setFrames] = useState<CaptureReplayFrame[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [intervalMs, setIntervalMs] = useState(250)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [centerPosition, setCenterPosition] = useState<Position | null>(null)
  const [centerRequest, setCenterRequest] = useState(0)
  const [zoomRequest, setZoomRequest] = useState(0)
  const currentTickRef = useRef<number | null>(null)
  const loadingRef = useRef(false)

  const loadCapture = useCallback(async (initial = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (initial) setLoading(true)
    else setRefreshing(true)
    try {
      const nextManifest = await replayApi.manifest()
      const nextFrames: CaptureReplayFrame[] = []
      let nextAfterTick: number | null | undefined
      while (nextAfterTick !== null) {
        const page = await replayApi.frames(nextAfterTick)
        nextFrames.push(...page.frames)
        nextAfterTick = page.has_more ? page.next_after_tick : null
      }
      const nextLives = buildCoreReplayLives(nextFrames, nextManifest.open_session)
      setManifest(nextManifest)
      setFrames(nextFrames)
      setIndex((previous) => {
        const currentTick = currentTickRef.current
        if (currentTick !== null) {
          const matching = nextFrames.findIndex((frame) => frame.tick === currentTick)
          if (matching >= 0 && nextLives.some((life) => matching >= life.startIndex && matching <= life.endIndex)) return matching
        }
        if (nextLives.some((life) => previous >= life.startIndex && previous <= life.endIndex)) return previous
        return nextLives[0]?.startIndex ?? Math.max(0, Math.min(previous, nextFrames.length - 1))
      })
      setError('')
    } catch (cause) {
      setError(cause instanceof APIError ? cause.code : 'REPLAY_UNAVAILABLE')
    } finally {
      loadingRef.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void loadCapture(true) }, [loadCapture])
  useEffect(() => {
    if (!manifest?.open_session) return undefined
    const timer = window.setInterval(() => { void loadCapture(false) }, 10000)
    return () => window.clearInterval(timer)
  }, [loadCapture, manifest?.open_session])

  const lives = useMemo(() => buildCoreReplayLives(frames, Boolean(manifest?.open_session)), [frames, manifest?.open_session])
  const frame = frames[index] ?? null
  const life = useMemo(() => lives.find((candidate) => index >= candidate.startIndex && index <= candidate.endIndex) ?? null, [index, lives])
  const localIndex = life ? index - life.startIndex : 0
  const explorationTimeline = useMemo(() => buildReplayExplorationIndex(frames), [frames])
  const explored = useMemo(() => replayExploredAt(explorationTimeline, index), [explorationTimeline, index])
  useEffect(() => { currentTickRef.current = frame?.tick ?? null }, [frame?.tick])
  useEffect(() => {
    if (!playing || !frame || !life) return undefined
    if (index >= life.endIndex) {
      setPlaying(false)
      return undefined
    }
    const timer = window.setTimeout(() => setIndex((current) => Math.min(current + 1, life.endIndex)), intervalMs)
    return () => window.clearTimeout(timer)
  }, [frame, index, intervalMs, life, playing])
  useEffect(() => {
    if (selectedId && !frame?.state.objects.some((object) => object.id === selectedId)) setSelectedId(null)
  }, [frame, selectedId])

  const jumps = useMemo<ReplayJump[]>(() => {
    if (!life) return []
    const lifeFrames = frames.slice(life.startIndex, life.endIndex + 1)
    const specs: Array<[string, string, (event: GameEvent) => boolean]> = [
      ['damaged', t('game.replayJumpCoreDamaged'), (event) => event.event_type === 'CORE_DAMAGED' && event.target_id === life.coreId],
      ['destroyed', t('game.replayJumpCoreDestroyed'), (event) => event.event_type === 'CORE_DESTROYED' && event.target_id === life.coreId],
      ['respawned', t('game.replayJumpCoreRespawned'), (event) => event.event_type === 'CORE_RESPAWNED' && event.target_id === life.coreId],
      ['harvest', t('game.replayJumpHarvest'), (event) => event.event_type === 'HARVEST_SUCCEEDED'],
    ]
    return specs.flatMap(([kind, label, matches]) => {
      let target = lifeFrames.findIndex((candidate) => candidate.state.events.some(matches))
      if (kind === 'destroyed' && target < 0 && life.destruction) target = life.frameCount - 1
      return target >= 0 ? [{ label, index: target }] : []
    })
  }, [frames, life, t])

  if (loading) return <ReplayLoading />
  if (error || !manifest || !frame || !life) return <ReplayError code={error || 'REPLAY_NO_CORE_LIFE'} onRetry={() => void loadCapture(true)} />

  const select = (object: WorldObject | null) => {
    setSelectedId(object?.id ?? null)
    if (object?.position) {
      setCenterPosition(object.position)
      setCenterRequest((value) => value + 1)
    }
  }
  const centerBeacon = () => {
    setCenterPosition(frame.state.champion_beacon.position)
    setCenterRequest((value) => value + 1)
  }

  return <div className="grid h-dvh min-h-[560px] grid-cols-1 overflow-hidden lg:grid-cols-[260px_1fr]">
    <AssetList state={frame.state} objects={frame.state.objects} selectedId={selectedId} onSelect={select} />
    <section className="relative min-h-0 overflow-hidden">
      <OfficialReplayControl
        manifest={manifest}
        frame={frame}
        lives={lives}
        life={life}
        index={localIndex}
        frameCount={life.frameCount}
        playing={playing}
        intervalMs={intervalMs}
        jumps={jumps}
        previousTick={localIndex > 0 ? frames[index - 1].tick : null}
        onTogglePlay={() => setPlaying((current) => !current)}
        onLifeChange={(next) => { const selectedLife = lives[next]; if (selectedLife) { setPlaying(false); setIndex(selectedLife.startIndex) } }}
        onIndexChange={(next) => { setPlaying(false); setIndex(life.startIndex + Math.max(0, Math.min(next, life.frameCount - 1))) }}
        onIntervalChange={setIntervalMs}
        onJump={(next) => { setPlaying(false); setIndex(life.startIndex + next) }}
      />
      <PendingCommands tick={frame.tick} state={frame.state} receipts={frame.receipts} />
      <WorldCanvas
        state={frame.state}
        explored={explored}
        replay
        selectedId={selectedId}
        targeting={false}
        destinationSelecting={false}
        attackPositions={EMPTY_LIST}
        targetableIds={EMPTY_SET}
        routeDestinations={EMPTY_LIST}
        moveArrows={EMPTY_LIST}
        sweepMarkers={EMPTY_LIST}
        shotMarkers={EMPTY_LIST}
        centerPosition={centerPosition}
        centerRequest={centerRequest}
        zoomRequest={zoomRequest}
        onSelect={select}
        onTarget={() => undefined}
        onAttackPosition={() => undefined}
        onMoveDestination={() => undefined}
        onCenterBeacon={centerBeacon}
        onAnchorChange={() => undefined}
      />
      <ResourceActivity events={frame.state.events} />
      <ReplayEventLog events={frame.state.events} locale={i18n.language} />
      <MapControls onCenter={() => { setCenterPosition(null); setCenterRequest((value) => value + 1) }} onZoom={(direction) => setZoomRequest((value) => direction * (Math.abs(value) + 1))} />
      {refreshing && <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 font-mono text-[9px] text-zinc-500"><LoaderCircle size={12} className="animate-spin" />{t('game.replayRefreshing')}</div>}
    </section>
  </div>
}

function ReplayLoading() {
  const { t } = useTranslation()
  return <div className="grid h-dvh place-items-center"><div className="text-center"><LoaderCircle className="mx-auto mb-3 animate-spin text-cyan-signal" size={22} /><p className="font-mono text-xs tracking-[.16em] text-zinc-500">{t('game.replayLoading')}</p></div></div>
}

function ReplayError({ code, onRetry }: { code: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return <div className="grid h-dvh place-items-center px-6"><div className="panel max-w-lg rounded-gold-lg px-6 py-7 text-center"><AlertTriangle className="mx-auto mb-3 text-coral-hostile" size={24} /><h1 className="font-display text-lg text-zinc-100">{t('game.replayUnavailable')}</h1><p role="alert" className="mt-2 font-mono text-[10px] leading-5 text-zinc-500">{code || t('game.replayNoCapture')}</p><button type="button" onClick={onRetry} className="secondary-button mt-5 min-h-11 px-4 text-xs">{t('common.retry')}</button></div></div>
}

function ReplayEventLog({ events, locale }: { events: GameEvent[]; locale: string }) {
  const { t } = useTranslation()
  if (!events.length) return null
  const formatter = new Intl.NumberFormat(locale)
  return <section className="panel pointer-events-none absolute bottom-4 right-3 z-20 w-[min(25rem,calc(100%-1.5rem))] overflow-hidden rounded-gold-lg shadow-[0_12px_30px_rgba(0,0,0,.34)]" aria-label={t('game.replayEvents')}>
    <h2 className="flex items-center gap-2 border-b border-white/[.07] px-3.5 py-2.5 font-display text-[11px] font-semibold text-zinc-200"><ScrollText size={14} className="text-amber-200" />{t('game.replayEvents')}</h2>
    <ul className="max-h-[min(34dvh,18rem)] overflow-y-auto divide-y divide-white/[.055]">
      {events.slice(0, 8).map((event) => <li key={event.event_id} className="flex min-h-10 items-start gap-2 px-3.5 py-2"><span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(253,230,138,.7)]" /><span className="min-w-0 flex-1 text-[10px] leading-4 text-zinc-300"><span className="font-mono text-[9px] text-amber-100">{event.event_type}</span>{event.reason_code && <span className="ml-1 text-zinc-500">· {event.reason_code}</span>}{event.values && <span className="ml-1 break-all font-mono text-[9px] text-zinc-500">{JSON.stringify(event.values)}</span>}</span>{event.position && <span className="shrink-0 font-mono text-[9px] text-zinc-600">[{formatter.format(event.position[0])}, {formatter.format(event.position[1])}]</span>}</li>)}
    </ul>
    {events.length > 8 && <p className="border-t border-white/[.055] px-3.5 py-2 text-[10px] text-zinc-500">{t('game.replayMoreEvents', { count: events.length - 8 })}</p>}
  </section>
}
