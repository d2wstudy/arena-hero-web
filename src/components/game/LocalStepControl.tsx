import { Bookmark, Bot, ChevronLeft, ChevronRight, CircleCheck, CircleX, Crown, Eye, FastForward, FlaskConical, GitBranch, History, LoaderCircle, Menu, Pause, Play, Radio, RotateCcw, Save, Timer, Trash2, User, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalGodSnapshot, LocalHistory, LocalMatchStatus, LocalParticipantAdmissionReceipt, LocalReplay, LocalViewSelection, StreamPhase } from '../../lib/types'
import { GodModeConsole } from './GodModeConsole'

type TickRunMode = 'idle' | 'batch' | 'auto'
type ControlTab = 'advance' | 'view' | 'history' | 'lab'

const MAX_BATCH_TICKS = 100_000
const MAX_AUTO_INTERVAL_SECONDS = 3_600

export function LocalStepControl({
  tick,
  liveTick,
  phase,
  status,
  history,
  replay,
  localView,
  observationPending,
  godSnapshot,
  onAdvance,
  onReplay,
  onReturnLive,
  onBranch,
  onObservation,
  onLoadGodDiagnostics,
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
  localView: LocalViewSelection
  observationPending: boolean
  godSnapshot: LocalGodSnapshot | null
  onAdvance: () => Promise<unknown>
  onReplay: (matchId: string, tick: number) => Promise<unknown>
  onReturnLive: () => void
  onBranch: () => Promise<unknown>
  onObservation: (view: LocalViewSelection) => Promise<unknown>
  onLoadGodDiagnostics: () => Promise<unknown>
  onHumanFullVision: (enabled: boolean) => Promise<unknown>
  onAddParticipant: (username: string, controller: 'AGENT' | 'BOT') => Promise<LocalParticipantAdmissionReceipt>
  onSetTickLabel: (matchId: string, tick: number, label: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ControlTab>('advance')
  const [busy, setBusy] = useState<'advance' | 'replay' | 'branch' | 'label' | 'view' | null>(null)
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
  const participants = status?.participants ?? godSnapshot?.participants ?? []
  const observedParticipant = localView.mode === 'PLAYER'
    ? participants.find((participant) => participant.id === localView.playerId)
    : null
  const viewLabel = localView.mode === 'GLOBAL'
    ? t('game.globalView')
    : localView.mode === 'PLAYER'
      ? observedParticipant?.username ?? t('game.robotView')
      : status?.human ?? t('game.humanView')

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
    if (!readyToAdvance || !currentTickKey || advanceInFlightRef.current || lastAdvanceKeyRef.current === currentTickKey) return

    const now = performance.now()
    const dueAt = runMode === 'auto' ? nextAutoDueAtRef.current ?? now + autoTickIntervalMs : now
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

  const selectView = async (view: LocalViewSelection) => {
    if (busy) return
    setBusy('view')
    try {
      await onObservation(view)
    } finally {
      setBusy(null)
    }
  }

  const openTab = (tab: ControlTab) => {
    setActiveTab(tab)
    setDrawerOpen(true)
  }

  const tabs: { id: ControlTab; icon: ReactNode; label: string }[] = [
    { id: 'advance', icon: <FastForward size={13} />, label: t('game.controlAdvance') },
    { id: 'view', icon: <Eye size={13} />, label: t('game.controlView') },
    { id: 'history', icon: <History size={13} />, label: t('game.controlHistory') },
    { id: 'lab', icon: <FlaskConical size={13} />, label: t('game.controlLab') },
  ]

  return <div className="pointer-events-none absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-col items-end">
    <section className="panel pointer-events-auto flex min-h-11 max-w-full items-center gap-1.5 rounded-gold p-1.5 pl-3" aria-label={t('game.localStep')}>
      <span className="flex min-w-0 items-center gap-2 pr-1 font-mono text-[9px] tracking-[.12em] text-cyan-signal">
        {replay ? <History size={12} /> : localView.mode === 'GLOBAL' ? <Crown size={12} className="text-amber-200" /> : localView.mode === 'PLAYER' ? <Eye size={12} className="text-violet-300" /> : <Radio size={12} />}
        <span className="shrink-0">TICK {tick}</span>
      </span>
      <button type="button" onClick={() => openTab('view')} className="focus-ring flex min-h-9 min-w-0 items-center gap-1.5 rounded-gold border border-white/10 bg-white/[.025] px-2.5 text-[10px] text-zinc-300 hover:bg-white/[.06]" aria-label={t('game.controlView')}>
        <Eye size={12} className="shrink-0" /><span className="max-w-28 truncate">{viewLabel}</span>{observationPending && <LoaderCircle size={11} className="shrink-0 animate-spin text-cyan-signal" />}
      </button>
      {runnerActive && <button type="button" onClick={() => openTab('advance')} className="focus-ring hidden min-h-9 items-center gap-1.5 rounded-full bg-cyan-signal/10 px-2.5 font-mono text-[9px] text-cyan-signal sm:flex">
        {runMode === 'batch' ? <FastForward size={11} /> : <Timer size={11} />}{runMode === 'batch' ? remainingTicks : `${autoTickSecondsText}s`}
      </button>}
      {replay ? <button type="button" onClick={onReturnLive} disabled={busy !== null} className="secondary-button flex min-h-9 items-center gap-1.5 px-2.5 text-[10px]"><RotateCcw size={12} />{t('game.live')}</button> : <button
        type="button"
        disabled={resolvingDisabled}
        onClick={() => void advance()}
        aria-label={t('game.resolveTick', { tick: liveTick })}
        className="focus-ring grid size-9 shrink-0 place-items-center rounded-gold border border-cyan-signal/35 bg-cyan-signal/10 text-blue-soft hover:bg-cyan-signal/20 disabled:border-white/10 disabled:bg-white/[.03] disabled:text-zinc-600"
      >
        {busy === 'advance' || phase === 'settling' ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
      </button>}
      <button type="button" aria-expanded={drawerOpen} aria-label={t(drawerOpen ? 'game.closeControlPanel' : 'game.openControlPanel')} onClick={() => setDrawerOpen((value) => !value)} className="focus-ring grid size-9 shrink-0 place-items-center rounded-gold text-zinc-400 hover:bg-white/[.06] hover:text-white">
        {drawerOpen ? <X size={15} /> : <Menu size={15} />}
      </button>
    </section>

    {drawerOpen && <section className="panel pointer-events-auto mt-2 flex max-h-[calc(100dvh-5rem)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-gold shadow-2xl max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:mt-0 max-sm:max-h-[72dvh] max-sm:w-auto" aria-label={t('game.localControlPanel')}>
      <header className="flex items-center justify-between gap-3 border-b border-white/[.07] px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-[.16em] text-cyan-signal">{t('game.localControlPanel')}</p>
          <p className="mt-1 truncate text-[10px] text-zinc-500">{replay ? t('game.replayHint') : t('game.compactControlHint')}</p>
        </div>
        <button type="button" aria-label={t('game.closeControlPanel')} onClick={() => setDrawerOpen(false)} className="focus-ring grid size-9 shrink-0 place-items-center rounded-gold text-zinc-500 hover:bg-white/[.05] hover:text-white"><X size={14} /></button>
      </header>
      <nav className="grid grid-cols-4 border-b border-white/[.07]" aria-label={t('game.localControlTabs')}>
        {tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`focus-ring flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-2 text-[10px] ${activeTab === tab.id ? 'border-cyan-signal bg-cyan-signal/[.06] text-blue-soft' : 'border-transparent text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200'}`}>{tab.icon}{tab.label}</button>)}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === 'advance' && <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-mono text-[9px] tracking-[.14em] text-zinc-300"><FastForward size={13} className="text-cyan-signal" />{t('game.tickRunner')}</p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">{t('game.tickRunnerHint')}</p>
            </div>
            {!replay && <button type="button" disabled={resolvingDisabled} onClick={() => void advance()} className="focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-gold border border-cyan-signal/35 bg-cyan-signal/10 px-3 text-xs font-semibold text-blue-soft disabled:opacity-40">
              {busy === 'advance' || phase === 'settling' ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} />}{t('game.singleTick')}
            </button>}
          </div>
          {!replay && <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1 text-[9px] text-zinc-500"><span>{t('game.batchTickCount')}</span><input type="number" inputMode="numeric" min={1} max={MAX_BATCH_TICKS} step={1} aria-label={t('game.batchTickCount')} aria-invalid={!validBatchTicks} value={batchTickText} disabled={runnerActive || busy !== null} onChange={(event) => setBatchTickText(event.target.value)} className="focus-ring h-10 min-w-0 rounded-gold border border-white/10 bg-space-900 px-3 font-mono text-xs text-zinc-200 disabled:opacity-40" /></label>
              <button type="button" disabled={runMode === 'auto' || (runMode === 'idle' && (!readyToAdvance || !validBatchTicks))} onClick={runMode === 'batch' ? stopRunner : startBatch} className="secondary-button flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40">{runMode === 'batch' ? <Pause size={13} /> : <FastForward size={13} />}{runMode === 'batch' ? t('game.stopBatchTick') : validBatchTicks ? t('game.advanceTicks', { count: batchTicks }) : t('game.advanceTicksInvalid')}</button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1 text-[9px] text-zinc-500"><span>{t('game.autoTickInterval')}</span><div className="relative"><Timer size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" /><input type="number" inputMode="decimal" min={0} max={MAX_AUTO_INTERVAL_SECONDS} step={0.1} aria-label={t('game.autoTickInterval')} aria-invalid={!validAutoTickSeconds} value={autoTickSecondsText} disabled={runMode === 'batch'} onChange={(event) => updateAutoTickSeconds(event.target.value)} className="focus-ring h-10 w-full rounded-gold border border-white/10 bg-space-900 pl-8 pr-3 font-mono text-xs text-zinc-200 disabled:opacity-40" /></div></label>
              <button type="button" disabled={runMode === 'batch' || (runMode === 'idle' && (!readyToAdvance || !validAutoTickSeconds))} onClick={runMode === 'auto' ? stopRunner : startAuto} className="focus-ring flex min-h-10 items-center gap-1.5 rounded-gold border border-violet-cosmic/35 bg-violet-cosmic/10 px-3 text-xs font-semibold text-blue-soft disabled:opacity-40">{runMode === 'auto' ? <Pause size={13} /> : <Play size={13} />}{runMode === 'auto' ? t('game.stopAutoTick') : t('game.startAutoTick')}</button>
            </div>
            {runnerActive && <p className="rounded-gold bg-cyan-signal/[.06] px-3 py-2 font-mono text-[9px] text-cyan-signal" aria-live="polite">{runMode === 'batch' ? t('game.batchTickProgress', { count: remainingTicks }) : t('game.autoTickRunning', { seconds: autoTickSecondsText })}</p>}
          </div>}
          <div className="mt-4 border-t border-white/[.07] pt-3" aria-live="polite">
            {!currentStatus && !replay && <span className="flex items-center gap-1.5 rounded-full bg-white/[.04] px-3 py-1.5 text-[10px] text-zinc-500"><LoaderCircle size={12} className="animate-spin" />{t('game.checkingBots')}</span>}
            <div className="flex flex-wrap gap-2">{currentStatus?.bots.map((bot) => <span key={bot.username} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] ${bot.error ? 'bg-coral-hostile/10 text-coral-hostile' : bot.ready ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[.04] text-zinc-500'}`} title={bot.error}><Bot size={12} />{bot.username}{bot.error ? <CircleX size={12} /> : bot.ready ? <CircleCheck size={12} /> : <LoaderCircle size={12} className="animate-spin" />}<span>{bot.error ? t('game.botFailed') : bot.ready ? t('game.botReady') : t('game.botThinking')}</span></span>)}</div>
          </div>
        </div>}

        {activeTab === 'view' && <div>
          <p className="font-mono text-[9px] tracking-[.14em] text-zinc-300">{t('game.observerView')}</p>
          <p className="mt-1 text-[10px] leading-4 text-zinc-500">{t('game.observerViewHint')}</p>
          {observationPending && <p className="mt-3 flex items-center gap-2 rounded-gold bg-cyan-signal/[.06] px-3 py-2 text-[10px] text-cyan-signal"><LoaderCircle size={12} className="animate-spin" />{t('game.observerUpdating')}</p>}
          <div className="mt-3 grid gap-2">
            <ViewChoice selected={localView.mode === 'HUMAN'} icon={<User size={15} />} title={status?.human ?? t('game.humanView')} detail={t('game.humanViewHint')} onClick={() => void selectView({ mode: 'HUMAN' })} />
            {participants.filter((participant) => participant.controller !== 'HUMAN').map((participant) => <ViewChoice key={participant.id} selected={localView.mode === 'PLAYER' && localView.playerId === participant.id} disabled={participant.status === 'PENDING'} icon={<Bot size={15} />} title={`@${participant.username}`} detail={`${t(`game.participant${participant.controller}`)} · ${t(`game.participant${participant.status}`)} · ${t('game.readOnlyView')}`} onClick={() => void selectView({ mode: 'PLAYER', playerId: participant.id })} />)}
            <ViewChoice selected={localView.mode === 'GLOBAL'} icon={<Crown size={15} />} title={t('game.globalView')} detail={t('game.globalViewHint')} accent="amber" onClick={() => void selectView({ mode: 'GLOBAL' })} />
          </div>
          {localView.mode !== 'HUMAN' && <p className="mt-3 rounded-gold border border-violet-cosmic/20 bg-violet-cosmic/[.06] px-3 py-2 text-[10px] leading-4 text-blue-soft">{t('game.observerReadOnlyNotice')}</p>}
        </div>}

        {activeTab === 'history' && <div>
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-mono text-[9px] tracking-[.14em] text-zinc-300">{t('game.controlHistory')}</p><p className="mt-1 text-[10px] text-zinc-500">{replay ? t('game.replayHint') : t('game.historyHint')}</p></div>
            {replay && <button type="button" onClick={onReturnLive} disabled={busy !== null} className="secondary-button flex min-h-10 items-center gap-1.5 px-3 text-xs"><RotateCcw size={13} />{t('game.live')}</button>}
          </div>
          {history && selectedMatch ? <>
            <div className="mt-4 grid gap-2">
              <select aria-label={t('game.replayBranch')} value={selectedMatch.id} disabled={controlsLocked} onChange={(event) => void selectMatch(event.target.value)} className="focus-ring min-h-10 w-full rounded-gold border border-white/10 bg-space-900 px-2 text-[10px] text-zinc-300">{history.matches.map((match) => <option key={match.id} value={match.id}>{match.active ? '● ' : ''}{match.label} · {match.id.slice(0, 8)}</option>)}</select>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={t('game.previousTick')} disabled={!canStepBack || controlsLocked} onClick={() => void showTick(tick - 1)} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronLeft size={15} /></button>
                <input type="range" aria-label={t('game.replayTimeline')} min={firstTick} max={latestTick} value={tick} disabled={controlsLocked || firstTick === latestTick} onChange={(event) => void showTick(Number(event.target.value))} className="min-w-24 flex-1 accent-cyan-signal" />
                <button type="button" aria-label={t('game.nextTick')} disabled={!canStepForward || controlsLocked} onClick={() => void showTick(tick + 1)} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-400 disabled:opacity-30"><ChevronRight size={15} /></button>
              </div>
              <p className="text-right font-mono text-[9px] text-zinc-500">{firstTick} — {latestTick}</p>
            </div>
            {replay && <button type="button" onClick={() => void branch()} disabled={busy !== null} className="focus-ring mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-gold border border-violet-cosmic/35 bg-violet-cosmic/10 px-3 text-xs font-semibold text-blue-soft disabled:opacity-50">{busy === 'branch' ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />}{t('game.branchFromTick', { tick })}</button>}
            <div className="mt-4 border-t border-white/[.07] pt-3">
              <div className="flex items-center gap-2"><Bookmark size={13} className="shrink-0 text-amber-200" /><input aria-label={t('game.tickLabel')} value={labelText} maxLength={80} disabled={controlsLocked} onChange={(event) => setLabelText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveLabel() }} placeholder={t('game.tickLabelPlaceholder')} className="focus-ring min-h-10 min-w-0 flex-1 rounded-gold border border-white/10 bg-black/15 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-50" /><button type="button" disabled={controlsLocked || labelText.trim() === currentLabel} onClick={() => void saveLabel()} className="secondary-button grid size-10 shrink-0 place-items-center disabled:opacity-40" aria-label={t('common.save')}>{busy === 'label' ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}</button><button type="button" aria-label={t('game.clearTickLabel')} disabled={controlsLocked || (!currentLabel && !labelText)} onClick={() => void saveLabel('')} className="focus-ring grid size-10 shrink-0 place-items-center rounded-gold border border-white/10 text-zinc-500 hover:text-coral-hostile disabled:opacity-30"><Trash2 size={13} /></button></div>
              {labels.length > 0 && <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1" aria-label={t('game.labeledTicks')}>{labels.map((item) => <button key={item.tick} type="button" disabled={controlsLocked} onClick={() => void showTick(item.tick)} className={`focus-ring rounded-full border px-2.5 py-1 text-[9px] ${item.tick === tick ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-white/[.025] text-zinc-400 hover:text-zinc-100'}`}>T{item.tick} · {item.label}</button>)}</div>}
            </div>
          </> : <p className="mt-4 rounded-gold bg-white/[.025] px-3 py-4 text-center text-[10px] text-zinc-500">{t('game.historyLoading')}</p>}
        </div>}

        {activeTab === 'lab' && <GodModeConsole snapshot={godSnapshot} humanFullVision={humanFullVision} replaying={Boolean(replay)} disabled={controlsLocked} participants={participants} onRefresh={onLoadGodDiagnostics} onHumanFullVision={onHumanFullVision} onAddParticipant={onAddParticipant} />}
      </div>
    </section>}
  </div>
}

function ViewChoice({ selected, disabled = false, icon, title, detail, accent = 'violet', onClick }: { selected: boolean; disabled?: boolean; icon: ReactNode; title: string; detail: string; accent?: 'violet' | 'amber'; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onClick} className={`focus-ring flex min-h-14 items-center gap-3 rounded-gold border px-3 text-left disabled:cursor-not-allowed disabled:opacity-35 ${selected ? accent === 'amber' ? 'border-amber-300/35 bg-amber-300/[.08]' : 'border-violet-cosmic/35 bg-violet-cosmic/[.08]' : 'border-white/10 bg-black/10 hover:bg-white/[.035]'}`}>
    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${selected ? accent === 'amber' ? 'bg-amber-300/15 text-amber-200' : 'bg-violet-cosmic/15 text-violet-300' : 'bg-white/[.04] text-zinc-500'}`}>{icon}</span>
    <span className="min-w-0"><span className="block truncate text-xs font-medium text-zinc-100">{title}</span><span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">{detail}</span></span>
    <span className={`ml-auto size-2.5 shrink-0 rounded-full border ${selected ? accent === 'amber' ? 'border-amber-200 bg-amber-300' : 'border-violet-200 bg-violet-300' : 'border-white/20'}`} />
  </button>
}
