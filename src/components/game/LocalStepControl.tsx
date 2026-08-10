import { Bookmark, Bot, ChevronLeft, ChevronRight, CircleCheck, CircleX, Crown, FastForward, GitBranch, History, LoaderCircle, Pause, Play, Radio, RotateCcw, Save, Timer, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalGodSnapshot, LocalHistory, LocalMatchStatus, LocalParticipantAdmissionReceipt, LocalReplay, StreamPhase } from '../../lib/types'
import { GodModeConsole } from './GodModeConsole'

type TickRunMode = 'idle' | 'batch' | 'auto'

const MAX_BATCH_TICKS = 100_000
const MAX_AUTO_INTERVAL_SECONDS = 3_600

export function LocalStepControl({
  tick,
  liveTick,
  phase,
  status,
  history,
  replay,
  godView,
  godSnapshot,
  onAdvance,
  onReplay,
  onReturnLive,
  onBranch,
  onGodView,
  onHumanFullVision,
  onAddParticipant,
  onSetTickLabel,
}: {
  tick: number
  liveTick: number
  phase: StreamPhase
  status: LocalMatchStatus | null
  history: LocalHistory | null
  replay: LocalReplay | null
  godView: boolean
  godSnapshot: LocalGodSnapshot | null
  onAdvance: () => Promise<unknown>
  onReplay: (matchId: string, tick: number) => Promise<unknown>
  onReturnLive: () => void
  onBranch: () => Promise<unknown>
  onGodView: (enabled: boolean) => Promise<unknown>
  onHumanFullVision: (enabled: boolean) => Promise<unknown>
  onAddParticipant: (username: string, controller: 'AGENT' | 'BOT') => Promise<LocalParticipantAdmissionReceipt>
  onSetTickLabel: (matchId: string, tick: number, label: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'advance' | 'replay' | 'branch' | 'label' | null>(null)
  const [labelText, setLabelText] = useState('')
  const [runMode, setRunMode] = useState<TickRunMode>('idle')
  const [batchTickText, setBatchTickText] = useState('10')
  const [remainingTicks, setRemainingTicks] = useState(0)
  const [autoTickSecondsText, setAutoTickSecondsText] = useState('1')
  const runnerTimerRef = useRef<number | null>(null)
  const advanceInFlightRef = useRef(false)
  const lastAdvanceKeyRef = useRef<string | null>(null)
  const nextAutoDueAtRef = useRef<number | null>(null)
  const currentStatus = status?.tick === liveTick ? status : null
  const botsReady = Boolean(currentStatus && currentStatus.bots.every((bot) => bot.ready && !bot.error))
  const botFailed = Boolean(currentStatus?.bots.some((bot) => bot.error))
  const currentTickKey = currentStatus ? `${currentStatus.match_id}:${liveTick}` : null
  const batchTicks = Number(batchTickText)
  const validBatchTicks = Number.isSafeInteger(batchTicks) && batchTicks >= 1 && batchTicks <= MAX_BATCH_TICKS
  const autoTickSeconds = Number(autoTickSecondsText)
  const validAutoTickSeconds = autoTickSecondsText.trim() !== '' && Number.isFinite(autoTickSeconds) && autoTickSeconds >= 0 && autoTickSeconds <= MAX_AUTO_INTERVAL_SECONDS
  const autoTickIntervalMs = validAutoTickSeconds ? autoTickSeconds * 1_000 : 1_000
  const runnerActive = runMode !== 'idle'
  const readyToAdvance = phase === 'open' && currentStatus?.phase === 'OPEN' && botsReady && busy === null && !replay
  const resolvingDisabled = !readyToAdvance || runnerActive
  const controlsLocked = busy !== null || runnerActive || phase === 'settling'
  const selectedMatchId = replay?.match_id ?? history?.active_match_id ?? status?.match_id ?? null
  const selectedMatch = useMemo(
    () => history?.matches.find((match) => match.id === selectedMatchId) ?? null,
    [history, selectedMatchId],
  )
  const firstTick = selectedMatch?.first_tick ?? tick
  const latestTick = selectedMatch?.latest_tick ?? liveTick
  const canStepBack = tick > firstTick
  const canStepForward = tick < latestTick
  const humanFullVision = replay?.god?.human_full_vision ?? status?.god?.human_full_vision ?? godSnapshot?.settings.human_full_vision ?? false
  const labels = history?.labels ?? []
  const currentLabel = labels.find((item) => item.tick === tick)?.label ?? ''
  const participants = replay
    ? godSnapshot?.participants ?? []
    : godSnapshot?.participants ?? status?.participants ?? []

  useEffect(() => {
    setLabelText(currentLabel)
  }, [currentLabel, selectedMatchId, tick])

  const clearRunnerTimer = useCallback(() => {
    if (runnerTimerRef.current === null) return
    window.clearTimeout(runnerTimerRef.current)
    runnerTimerRef.current = null
  }, [])

  const stopRunner = useCallback(() => {
    clearRunnerTimer()
    nextAutoDueAtRef.current = null
    setRunMode('idle')
    setRemainingTicks(0)
  }, [clearRunnerTimer])

  useEffect(() => () => clearRunnerTimer(), [clearRunnerTimer])

  useEffect(() => {
    if (runMode !== 'idle' && (replay || botFailed || status?.phase === 'STOPPED')) stopRunner()
  }, [botFailed, replay, runMode, status?.phase, stopRunner])

  const advanceOnce = useCallback(async (source: 'manual' | 'batch' | 'auto') => {
    const requestedTick = liveTick
    if (
      requestedTick <= 0
      || !readyToAdvance
      || !currentTickKey
      || busy !== null
      || advanceInFlightRef.current
      || lastAdvanceKeyRef.current === currentTickKey
    ) return

    advanceInFlightRef.current = true
    lastAdvanceKeyRef.current = currentTickKey
    setBusy('advance')
    const startedAt = performance.now()
    if (source === 'auto') nextAutoDueAtRef.current = startedAt + autoTickIntervalMs
    try {
      await onAdvance()
      if (source === 'batch') setRemainingTicks((current) => Math.max(0, current - 1))
    } catch (cause) {
      if (lastAdvanceKeyRef.current === currentTickKey) lastAdvanceKeyRef.current = null
      if (source !== 'manual') stopRunner()
      throw cause
    } finally {
      advanceInFlightRef.current = false
      setBusy(null)
    }
  }, [autoTickIntervalMs, busy, currentTickKey, liveTick, onAdvance, readyToAdvance, stopRunner])

  const advance = async () => {
    if (resolvingDisabled) return
    await advanceOnce('manual')
  }

  const startBatch = () => {
    if (!readyToAdvance || runnerActive || !validBatchTicks) return
    nextAutoDueAtRef.current = null
    setRemainingTicks(batchTicks)
    setRunMode('batch')
  }

  const startAuto = () => {
    if (!readyToAdvance || runnerActive || !validAutoTickSeconds) return
    nextAutoDueAtRef.current = performance.now() + autoTickIntervalMs
    setRunMode('auto')
  }

  const updateAutoTickSeconds = (value: string) => {
    setAutoTickSecondsText(value)
    const seconds = Number(value)
    if (runMode === 'auto' && Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_AUTO_INTERVAL_SECONDS) {
      nextAutoDueAtRef.current = performance.now() + seconds * 1_000
    }
  }

  useEffect(() => {
    clearRunnerTimer()
    if (runMode === 'idle') return
    if (runMode === 'batch' && remainingTicks <= 0) {
      setRunMode('idle')
      return
    }
    if (
      !readyToAdvance
      || !currentTickKey
      || advanceInFlightRef.current
      || lastAdvanceKeyRef.current === currentTickKey
    ) return

    const now = performance.now()
    const dueAt = runMode === 'auto'
      ? nextAutoDueAtRef.current ?? now + autoTickIntervalMs
      : now
    if (runMode === 'auto') nextAutoDueAtRef.current = dueAt
    runnerTimerRef.current = window.setTimeout(() => {
      runnerTimerRef.current = null
      void advanceOnce(runMode)
    }, Math.max(0, dueAt - now))
    return clearRunnerTimer
  }, [advanceOnce, autoTickIntervalMs, clearRunnerTimer, currentTickKey, readyToAdvance, remainingTicks, runMode])

  const showTick = async (nextTick: number, matchId = selectedMatchId) => {
    if (!matchId || busy) return
    if (matchId === history?.active_match_id && nextTick === liveTick) {
      onReturnLive()
      return
    }
    setBusy('replay')
    try {
      await onReplay(matchId, nextTick)
    } finally {
      setBusy(null)
    }
  }

  const selectMatch = async (matchId: string) => {
    const match = history?.matches.find((candidate) => candidate.id === matchId)
    if (!match) return
    await showTick(match.id === history?.active_match_id ? liveTick : match.latest_tick, match.id)
  }

  const branch = async () => {
    if (!replay || busy) return
    setBusy('branch')
    try {
      await onBranch()
    } finally {
      setBusy(null)
    }
  }

  const saveLabel = async (label = labelText.trim()) => {
    if (!selectedMatchId || busy) return
    setBusy('label')
    try {
      await onSetTickLabel(selectedMatchId, tick, label)
      setLabelText(label)
    } finally {
      setBusy(null)
    }
  }

  return <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex justify-center">
    <section className="panel pointer-events-auto w-full max-w-3xl rounded-gold px-4 py-3" aria-label={t('game.localStep')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.16em] text-cyan-signal">
            {godView ? <Crown size={12} className="text-amber-200" /> : replay ? <History size={12} /> : <Radio size={12} />}
            {godView ? t(replay ? 'game.godReplayMode' : 'game.godLiveMode') : replay ? t('game.replayMode') : t('game.localStep')} · TICK {tick}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{godView ? t('game.godViewHint') : replay ? t('game.replayHint') : t('game.localStepHint')}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <GodModeConsole godView={godView} snapshot={godSnapshot} humanFullVision={humanFullVision} replaying={Boolean(replay)} disabled={controlsLocked} participants={participants} onGodView={onGodView} onHumanFullVision={onHumanFullVision} onAddParticipant={onAddParticipant} />
          {replay ? <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onReturnLive} disabled={busy !== null} className="secondary-button flex min-h-11 items-center gap-2 px-3 text-xs">
            <RotateCcw size={14} />{t('game.returnLive', { tick: liveTick })}
          </button>
          <button type="button" onClick={() => void branch()} disabled={busy !== null} className="focus-ring flex min-h-11 items-center gap-2 rounded-gold border border-violet-cosmic/35 bg-violet-cosmic/10 px-3 text-xs font-semibold text-blue-soft hover:bg-violet-cosmic/20 disabled:opacity-50">
            {busy === 'branch' ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {t('game.branchFromTick', { tick })}
          </button>
        </div> : <button
          type="button"
          disabled={resolvingDisabled}
          onClick={() => void advance()}
          className="focus-ring flex min-h-11 items-center gap-2 rounded-gold border border-cyan-signal/35 bg-cyan-signal/10 px-4 text-xs font-semibold text-blue-soft transition hover:bg-cyan-signal/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[.03] disabled:text-zinc-600"
        >
          {busy === 'advance' || phase === 'settling' ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
          {phase === 'settling' ? t('game.settling') : t('game.resolveTick', { tick: liveTick })}
        </button>}
        </div>
      </div>

      {!replay && <div className="mt-3 grid gap-3 border-t border-white/[.07] pt-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.14em] text-zinc-300"><FastForward size={13} className="text-cyan-signal" />{t('game.tickRunner')}</p>
          <p className="mt-1 text-[10px] leading-4 text-zinc-500">{t('game.tickRunnerHint')}</p>
          {runnerActive && <p className="mt-1 font-mono text-[9px] text-cyan-signal" aria-live="polite">
            {runMode === 'batch' ? t('game.batchTickProgress', { count: remainingTicks }) : t('game.autoTickRunning', { seconds: autoTickSecondsText })}
          </p>}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <label className="grid gap-1 text-[9px] text-zinc-500">
            <span>{t('game.batchTickCount')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_BATCH_TICKS}
              step={1}
              aria-label={t('game.batchTickCount')}
              aria-invalid={!validBatchTicks}
              value={batchTickText}
              disabled={runnerActive || busy !== null}
              onChange={(event) => setBatchTickText(event.target.value)}
              className="focus-ring h-10 w-24 rounded-gold border border-white/10 bg-space-900 px-3 font-mono text-xs text-zinc-200 disabled:opacity-40"
            />
          </label>
          <button
            type="button"
            disabled={runMode === 'auto' || (runMode === 'idle' && (!readyToAdvance || !validBatchTicks))}
            onClick={runMode === 'batch' ? stopRunner : startBatch}
            className="secondary-button flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40"
          >
            {runMode === 'batch' ? <Pause size={13} /> : <FastForward size={13} />}
            {runMode === 'batch' ? t('game.stopBatchTick') : validBatchTicks ? t('game.advanceTicks', { count: batchTicks }) : t('game.advanceTicksInvalid')}
          </button>
          <label className="grid gap-1 text-[9px] text-zinc-500">
            <span>{t('game.autoTickInterval')}</span>
            <div className="relative">
              <Timer size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_AUTO_INTERVAL_SECONDS}
                step={0.1}
                aria-label={t('game.autoTickInterval')}
                aria-invalid={!validAutoTickSeconds}
                value={autoTickSecondsText}
                disabled={runMode === 'batch'}
                onChange={(event) => updateAutoTickSeconds(event.target.value)}
                className="focus-ring h-10 w-28 rounded-gold border border-white/10 bg-space-900 pl-8 pr-3 font-mono text-xs text-zinc-200 disabled:opacity-40"
              />
            </div>
          </label>
          <button
            type="button"
            disabled={runMode === 'batch' || (runMode === 'idle' && (!readyToAdvance || !validAutoTickSeconds))}
            onClick={runMode === 'auto' ? stopRunner : startAuto}
            className="focus-ring flex min-h-10 items-center gap-1.5 rounded-gold border border-violet-cosmic/35 bg-violet-cosmic/10 px-3 text-xs font-semibold text-blue-soft hover:bg-violet-cosmic/20 disabled:opacity-40"
          >
            {runMode === 'auto' ? <Pause size={13} /> : <Play size={13} />}
            {runMode === 'auto' ? t('game.stopAutoTick') : t('game.startAutoTick')}
          </button>
        </div>
      </div>}

      {history && selectedMatch && <div className="mt-3 grid gap-2 border-t border-white/[.07] pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-2">
          <select
            aria-label={t('game.replayBranch')}
            value={selectedMatch.id}
            disabled={controlsLocked}
            onChange={(event) => void selectMatch(event.target.value)}
            className="focus-ring min-h-10 max-w-48 rounded-gold border border-white/10 bg-space-900 px-2 text-[10px] text-zinc-300"
          >
            {history.matches.map((match) => <option key={match.id} value={match.id}>{match.active ? '● ' : ''}{match.label} · {match.id.slice(0, 8)}</option>)}
          </select>
          <button type="button" aria-label={t('game.previousTick')} disabled={!canStepBack || controlsLocked} onClick={() => void showTick(tick - 1)} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronLeft size={15} /></button>
          <input
            type="range"
            aria-label={t('game.replayTimeline')}
            min={firstTick}
            max={latestTick}
            value={tick}
            disabled={controlsLocked || firstTick === latestTick}
            onChange={(event) => void showTick(Number(event.target.value))}
            className="min-w-24 flex-1 accent-cyan-signal"
          />
          <button type="button" aria-label={t('game.nextTick')} disabled={!canStepForward || controlsLocked} onClick={() => void showTick(tick + 1)} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronRight size={15} /></button>
        </div>
        <span className="self-center text-right font-mono text-[9px] text-zinc-500">{firstTick} — {latestTick}</span>
      </div>}

      {history && selectedMatch && <div className="mt-3 border-t border-white/[.07] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bookmark size={13} className="shrink-0 text-amber-200" />
          <input
            aria-label={t('game.tickLabel')}
            value={labelText}
            maxLength={80}
            disabled={controlsLocked}
            onChange={(event) => setLabelText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void saveLabel() }}
            placeholder={t('game.tickLabelPlaceholder')}
            className="focus-ring min-h-10 min-w-40 flex-1 rounded-gold border border-white/10 bg-black/15 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={controlsLocked || labelText.trim() === currentLabel}
            onClick={() => void saveLabel()}
            className="secondary-button flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40"
          >
            {busy === 'label' ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{t('common.save')}
          </button>
          <button
            type="button"
            aria-label={t('game.clearTickLabel')}
            disabled={controlsLocked || (!currentLabel && !labelText)}
            onClick={() => void saveLabel('')}
            className="focus-ring grid size-10 place-items-center rounded-gold border border-white/10 text-zinc-500 hover:text-coral-hostile disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
        </div>
        {labels.length > 0 && <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1" aria-label={t('game.labeledTicks')}>
          {labels.map((item) => <button
            key={item.tick}
            type="button"
            disabled={controlsLocked}
            onClick={() => void showTick(item.tick)}
            className={`focus-ring rounded-full border px-2.5 py-1 text-[9px] ${item.tick === tick ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-white/[.025] text-zinc-400 hover:text-zinc-100'}`}
          >
            T{item.tick} · {item.label}
          </button>)}
        </div>}
      </div>}

      {!replay && <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
        {!currentStatus && <span className="flex items-center gap-1.5 rounded-full bg-white/[.04] px-3 py-1.5 text-[10px] text-zinc-500"><LoaderCircle size={12} className="animate-spin" />{t('game.checkingBots')}</span>}
        {currentStatus?.bots.map((bot) => <span
          key={bot.username}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] ${bot.error ? 'bg-coral-hostile/10 text-coral-hostile' : bot.ready ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[.04] text-zinc-500'}`}
          title={bot.error}
        >
          <Bot size={12} />
          {bot.username}
          {bot.error ? <CircleX size={12} /> : bot.ready ? <CircleCheck size={12} /> : <LoaderCircle size={12} className="animate-spin" />}
          <span>{bot.error ? t('game.botFailed') : bot.ready ? t('game.botReady') : t('game.botThinking')}</span>
        </span>)}
      </div>}
    </section>
  </div>
}
